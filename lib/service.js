import { randomUUID } from 'node:crypto'
import { findSubject, allSubjects, QUESTION_TYPE_LABEL, CHOICE_TYPES, hasChoiceOptions, validChoiceKey, subjectTypes, REFERENCE_EXAMS, migrateSubjectReference } from './subjects.js'
import { computeCountdown, resolveExamDate, todayISO, verifyExamDateOnline, yearOptions } from './exam-dates.js'
import { createVerifiedQuestion, QuestionGenerationError, reviseAnswer } from './generate.js'
import { answerFollowup } from './tutor.js'
import { parseBankText, extractBankPdf, isUsableBankItem } from './bank.js'
import { Store, resolveDataDir } from './store.js'
import { createUpdateChecker, PLUGIN_VERSION } from './updates.js'
import { withTimeout } from './async.js'
import { indexQuestionHistory,findQuestionRepeat } from './generation-history.js'
import { dailyExamReferences } from './reference-cache.js'
import { paperTextForType } from './paper-types.js'

const MAX_STEM_SUMMARY = 140
const IMPORT_TTL_MS = 30 * 60 * 1000
const MAX_STUDY_DOCUMENT_CHARS = 100_000
const MAX_STUDY_DOCUMENT_PDF_BYTES = 16 * 1024 * 1024

async function readStudyDocument({kind, text, base64}) {
  if (kind === 'pdf') {
    if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_STUDY_DOCUMENT_PDF_BYTES / 3) * 4) {
      throw new Error('请选择不超过 16 MB 的文本型 PDF')
    }
    const bytes = Buffer.from(base64,'base64')
    if (bytes.length > MAX_STUDY_DOCUMENT_PDF_BYTES || !bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) {
      throw new Error('请选择不超过 16 MB 的文本型 PDF')
    }
    const result = await extractBankPdf(bytes)
    if (result.warnings.length) throw new Error('无法完整提取 PDF 正文，请转成 TXT 或 Markdown 后重试')
    text = result.text
  } else if (kind !== 'md') {
    throw new Error('支持文本型 PDF、TXT 和 Markdown')
  }
  const content = typeof text === 'string' ? text.trim() : ''
  if (content.length < 12 || !/[\p{L}\p{N}]/u.test(content)) throw new Error('未读取到有效正文')
  if (content.length > MAX_STUDY_DOCUMENT_CHARS) throw new Error('文件正文超过 10 万字，请精简后重试')
  return content
}

function nowISO() {
  return new Date().toISOString()
}

function attemptDate(attempt) {
  if(/^\d{4}-\d{2}-\d{2}$/.test(attempt.practiceDate||''))return attempt.practiceDate
  const date=new Date(attempt.revealedAt||attempt.at||'')
  return Number.isFinite(date.getTime())?todayISO(date):''
}

/**
 * 自定义科目的题型：内置键（single/multiple/fill/solution…）和用户自填的文字
 * 都允许，只做去空、去重、限长限量。
 */
function normalizeCustomTypes(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const type = raw.trim().slice(0, 24)
    if (!type || out.includes(type)) continue
    out.push(type)
  }
  return out.slice(0, 8)
}

function summariseStem(stem) {
  const plain = String(stem || '')
    .replace(/```[\s\S]*?```/g, ' [代码] ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' [公式] ')
    .replace(/\$[^$\n]*\$/g, ' [公式] ')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > MAX_STEM_SUMMARY ? `${plain.slice(0, MAX_STEM_SUMMARY)}…` : plain
}

function normalizeChoice(value, question) {
  const upper = String(value || '').toUpperCase().replace(/[^A-H]/g, '')
  if (!upper) throw new Error('请先选择一个选项')
  const keys = (question.options || []).map((option) => option.key)
  for (const letter of upper) {
    if (!keys.includes(letter)) throw new Error(`选项 ${letter} 不在本题选项中`)
  }
  if (question.type !== 'multiple' && upper.length !== 1) throw new Error('本题只能选择一个选项')
  if (new Set(upper).size !== upper.length) throw new Error('选项不能重复')
  return upper.split('').sort().join('')
}

function sortLetters(value) {
  return String(value || '').toUpperCase().replace(/[^A-H]/g, '').split('').sort().join('')
}

function purgeQuestionRecords(draft, ids, subjects = new Set()) {
  for (const id of ids) {
    delete draft.questions[id]
    delete draft.threads[id]
  }
  draft.attempts = draft.attempts.filter((attempt) => !ids.has(attempt.questionId))
  for (const [key, record] of Object.entries(draft.daily)) {
    if (ids.has(record.questionId) || subjects.has(record.subjectId)) delete draft.daily[key]
  }
}

/**
 * 考研每日一题的业务服务。
 *
 * 提供方：Host。所有状态写入 Store（单文件 JSON，原子写），
 * Client 通过 /api/daily-question/rpc 调用同一批方法，因此界面操作与
 * 后续可能的 Agent 工具共享同一套业务逻辑。
 */
export class DailyQuestionService {
  constructor(ctx, { taskTimeoutMs } = {}) {
    this.ctx = ctx
    this.store = new Store(resolveDataDir())
    this.inflightDaily = new Map()
    this.inflightFollowups = new Map()
    this.recovery = null
    this.attemptIndexes = new WeakMap()
    this.tasks = new Map()
    this.taskTimeoutMs = taskTimeoutMs
    this.imports = new Map()
    this.checkUpdates = createUpdateChecker()
  }

  async init() {
    await this.data()
  }

  runTask(key, details, run) {
    if (this.tasks.has(key)) return this.tasks.get(key).promise
    const job = { ...details, controller: new AbortController() }
    job.promise = withTimeout(run, { signal: job.controller.signal,
      timeoutMs: this.taskTimeoutMs ?? (details.kind === 'daily' ? 15*60*1000 : details.kind === 'revise' ? 10*60*1000 : 5*60*1000),
      message: '任务超时，已停止本次生成，可以重试',
    }).finally(() => { if (this.tasks.get(key) === job) this.tasks.delete(key) })
    this.tasks.set(key, job)
    return job.promise
  }

  async cancelTask({ kind, subjectId, qid, clientMessageId }) {
    if (!['daily','revise','followup'].includes(kind)) throw new Error('不支持取消此类任务')
    const jobs = [...this.tasks.values()].filter((job) => job.kind === kind && (kind === 'daily'
      ? Boolean(subjectId) && job.subjectId === subjectId
      : Boolean(qid) && job.qid === qid && (kind !== 'followup' || !clientMessageId || job.clientMessageId === clientMessageId)))
    for (const job of jobs) job.controller.abort(Object.assign(new Error('任务已取消，可以重试'), { code:'TASK_CANCELLED' }))
    await Promise.allSettled(jobs.map((job) => job.promise))
    return { ok: true, cancelled: jobs.length }
  }

  dispose() {
    for (const job of this.tasks.values()) job.controller.abort(new Error('插件已停止，本次任务已取消'))
  }

  /* ------------------------------ 读取与状态 ------------------------------ */

  async data() {
    if (!this.recovery) {
      this.recovery = (async () => {
        const data = await this.store.read()
        if (Object.values(data.threads).some((thread) => thread.messages?.some((message) => message.status === 'pending'))) {
          await this.store.update((draft) => {
            for (const thread of Object.values(draft.threads)) {
              for (const message of thread.messages || []) if (message.status === 'pending') message.status = 'failed'
            }
          })
        }
      })().catch((error) => { this.recovery = null; throw error })
    }
    await this.recovery
    return this.store.read()
  }

  async examState(year) {
    const data = await this.data()
    const targetYear = Number(year || data.settings.targetYear)
    const examInfo = resolveExamDate(targetYear, data.examDates)
    const countdown = computeCountdown(targetYear, examInfo)
    return { examInfo, countdown }
  }

  async bootstrap() {
    const now = new Date()
    const today = todayISO(now)
    const nextDayAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
    let data = await this.data()
    const options = yearOptions(today, data.examDates)
    // 旧设置可能落在窗口外（它的初试早已结束）：自动收敛到可选的最早一年
    if (!options.includes(data.settings.targetYear)) {
      await this.store.update((draft) => {
        draft.settings.targetYear = options[0]
        return draft
      }).catch(() => {})
      data = await this.data()
    }
    const examInfo = resolveExamDate(data.settings.targetYear, data.examDates)
    const countdown = computeCountdown(data.settings.targetYear, examInfo, today)
    const todayMap = {}
    for (const subjectId of data.settings.subjects) {
      const record = data.daily[`${today}|${subjectId}`]
      todayMap[subjectId] = record && data.questions[record.questionId]
        ? { questionId: record.questionId }
        : null
    }
    return {
      ok: true,
      dataFile: this.store.file,
      pluginVersion: PLUGIN_VERSION,
      dataError: this.store.lastError,
      today,
      now: now.toISOString(),
      nextDayAt,
      yearOptions: options,
      settings: data.settings,
      customSubjects: data.customSubjects,
      referenceExams: REFERENCE_EXAMS,
      examInfo,
      countdown,
      subjects: this.subjectViews(data),
      banks: this.bankViews(data),
      syllabuses: this.syllabusViews(data),
      pastPapers: this.pastPaperViews(data),
      todayMap,
      failures: data.failures,
      counts: this.counts(data),
    }
  }

  subjectViews(data) {
    const enabled = new Set(data.settings.subjects)
    const deleted = new Set(data.settings.deletedSubjects)
    return allSubjects(data.customSubjects).filter((subject) => !deleted.has(subject.id)).map((subject) => {
      const allowed = new Set(subjectTypes(subject.id, data.customSubjects))
      const usableBanks = data.banks.filter((bank) => !bank.subjectId || bank.subjectId === subject.id)
      return {
        id: subject.id,
        name: subject.name,
        code: subject.code || '',
        types: subject.types,
        typeLabels: subject.types.map((type) => QUESTION_TYPE_LABEL[type] || type),
        custom: Boolean(subject.custom),
        referenceSubjectId: subject.referenceSubjectId || '',
        referenceExamName: subject.referenceExamName || '',
        referenceExamCode: subject.referenceExamCode || '',
        enabled: enabled.has(subject.id),
        source: data.settings.subjectSource[subject.id] || 'auto',
        bankItemCount: usableBanks.reduce((total, bank) => total
          + bank.items.filter((item) => isUsableBankItem(item) && (!item.type || allowed.has(item.type))).length, 0),
      }
    })
  }

  bankViews(data) {
    return data.banks.map((bank) => ({
      id: bank.id,
      name: bank.name,
      kind: bank.kind,
      fileName: bank.fileName,
      subjectId: bank.subjectId || '',
      importedAt: bank.importedAt,
      itemCount: bank.items.length,
      usable: bank.items.filter(isUsableBankItem).length,
      pendingAnswers: bank.items.filter((item) => item.answerStatus !== 'verified').length,
    }))
  }

  counts(data) {
    const result = Object.create(null)
    for (const id of data.settings.subjects) result[id] = { all: 0, favorite: 0, wrong: 0 }
    for(const question of Object.values(data.questions)) {
      if (!question.subjectId) continue
      const count = result[question.subjectId] ??= { all: 0, favorite: 0, wrong: 0 }
      count.all++
      if(question.favoriteAt)count.favorite++
      if(this.isWrong(question,this.attemptsOf(data,question.id)))count.wrong++
    }
    return { ...result }
  }

  isWrong(question, attempts) {
    if (question.wrongBookRemoved) return false
    if (question.wrongBookAdded) return true
    return attempts.some((attempt) => attempt.questionId === question.id && attempt.result === 'wrong')
  }

  attemptsOf(data, qid) {
    let index=this.attemptIndexes.get(data)
    if(!index||index.source!==data.attempts||index.length!==data.attempts.length) {
      const byQuestion=new Map()
      for(const attempt of data.attempts) {
        if(!byQuestion.has(attempt.questionId))byQuestion.set(attempt.questionId,[])
        byQuestion.get(attempt.questionId).push(attempt)
      }
      index={source:data.attempts,length:data.attempts.length,byQuestion}
      this.attemptIndexes.set(data,index)
    }
    return index.byQuestion.get(qid)||[]
  }

  /* ------------------------------ 设置 ------------------------------ */

  async saveSettings(patch = {}) {
    const requested = patch.deleteSubjectIds === undefined ? [] : patch.deleteSubjectIds
    if (!Array.isArray(requested) || requested.some((id) => typeof id !== 'string' || !id)) throw new Error('待删除科目无效')
    const data = await this.store.update((draft) => {
      const deleted = new Set(draft.settings.deletedSubjects)
      const removing = new Set(requested.filter((id) => !deleted.has(id)))
      for (const id of removing) {
        const subject = findSubject(id, draft.customSubjects)
        if (!subject) throw new Error('待删除科目不存在，请刷新科目管理')
        deleted.add(id)
        delete draft.settings.subjectSource[id]
        delete draft.failures[id]
        delete draft.syllabuses[id]
        if (subject.custom) {
          const prefixes = ['auto_', 'independent_'].map((mode) => '['+JSON.stringify(mode+id)+',')
          for (const key of Object.keys(draft.examReferences)) {
            if (prefixes.some((prefix) => key.startsWith(prefix))) delete draft.examReferences[key]
          }
        }
      }
      if (removing.size) {
        draft.pastPapers = draft.pastPapers.filter((paper) => !removing.has(paper.subjectId))
        const ids = new Set(Object.values(draft.questions).filter((q) => removing.has(q.subjectId)).map((q) => q.id))
        purgeQuestionRecords(draft,ids,removing)
      }
      draft.settings.deletedSubjects = [...deleted]
      // 先落自定义科目，后面的 enabled 校验才能识别到它们。
      if (Array.isArray(patch.customSubjects)) {
        if (patch.customSubjects.some((item) => item?.referenceSubjectId === 'independent' && !(typeof item.referenceExamName === 'string' && item.referenceExamName.trim()))) {
          throw new Error('独立参考考试请填写准确的考试名称（院校自命题请包含院校名称）')
        }
        draft.customSubjects = patch.customSubjects
          .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
          .map(migrateSubjectReference)
          .map((item) => ({
            id: item.id.slice(0, 60),
            name: item.name.slice(0, 60),
            code: typeof item.code === 'string' ? item.code.slice(0, 20) : '',
            types: normalizeCustomTypes(item.types),
            outline: Array.isArray(item.outline) ? item.outline.filter((line) => typeof line === 'string')
              .map((line) => line.trim().slice(0,120)).filter(Boolean).slice(0,20) : [],
            guidance: typeof item.guidance === 'string' ? item.guidance : '',
            referenceSubjectId: ['independent','auto'].includes(item.referenceSubjectId) ? item.referenceSubjectId : REFERENCE_EXAMS.find((exam) => exam.id === item.referenceSubjectId)?.id || '',
            referenceExamName: typeof item.referenceExamName === 'string' ? item.referenceExamName.trim().slice(0,100) : '',
            referenceExamCode: typeof item.referenceExamCode === 'string' ? item.referenceExamCode.trim().slice(0,20) : '',
          }))
      }
      if (patch.targetYear !== undefined) {
        const year = Math.trunc(Number(patch.targetYear))
        const allowed = yearOptions(todayISO(), draft.examDates)
        if (!Number.isFinite(year) || !allowed.includes(year)) {
          throw new Error(`考研年份只能选 ${allowed[0]}、${allowed[1]}、${allowed[2]}（初试已结束的年份不再提供）`)
        }
        draft.settings.targetYear = year
      }
      draft.customSubjects = draft.customSubjects.filter((subject) => !deleted.has(subject.id))
      const known = new Set(allSubjects(draft.customSubjects).map((subject) => subject.id).filter((id) => !deleted.has(id)))
      const enabled = Array.isArray(patch.subjects) ? patch.subjects : draft.settings.subjects
      draft.settings.subjects = [...new Set(enabled.filter((id) => known.has(id)))]
      if (patch.subjectSource && typeof patch.subjectSource === 'object') {
        for (const [id, value] of Object.entries(patch.subjectSource)) {
          if (!known.has(id) || !['online', 'bank', 'auto'].includes(value)) continue
          draft.settings.subjectSource[id] = value
        }
      }
      if (patch.activeSubject !== undefined) {
        draft.settings.activeSubject = typeof patch.activeSubject === 'string' ? patch.activeSubject : null
      }
      if (!draft.settings.subjects.includes(draft.settings.activeSubject)) {
        draft.settings.activeSubject = draft.settings.subjects[0] || null
      }
      return draft
    })
    const { examInfo, countdown } = await this.examState()
    return {
      ok: true,
      settings: data.settings,
      customSubjects: data.customSubjects,
      subjects: this.subjectViews(data),
      counts: this.counts(data),
      examInfo,
      countdown,
    }
  }

  /* ------------------------------ 每日出题 ------------------------------ */

  async ensureDaily(subjectId) {
    const data = await this.data()
    const subject = findSubject(subjectId, data.customSubjects)
    if (!subject) throw new Error(`未知科目：${subjectId}`)
    if (!data.settings.subjects.includes(subjectId)) throw new Error('该科目尚未启用')

    const date = todayISO()
    const key = `${date}|${subjectId}`
    const existing = data.daily[key]
    if (existing?.questionId && data.questions[existing.questionId]) {
      const question = data.questions[existing.questionId]
      if (question.subjectId === subjectId) {
        return { ok: true, question: this.questionView(data, question), thread: this.threadView(data, question.id), created: false }
      }
    }

    if (this.inflightDaily.has(key)) {
      const result = await this.inflightDaily.get(key)
      const fresh = await this.data()
      return { ok: true, question: this.questionView(fresh, fresh.questions[result.questionId]), thread: this.threadView(fresh, result.questionId), created: result.created }
    }

    const task = this.runTask('daily:'+key, {kind:'daily',subjectId:subject.id},
      (signal) => this.createDaily(subject, date, key, signal)).finally(() => this.inflightDaily.delete(key))
    this.inflightDaily.set(key, task)
    const result = await task
    const fresh = await this.data()
    return { ok: true, question: this.questionView(fresh, fresh.questions[result.questionId]), thread: this.threadView(fresh, result.questionId), created: result.created }
  }

  async createDaily(subject, date, key, signal) {
    const data = await this.data()
    const source = data.settings.subjectSource[subject.id] || 'auto'
    const examInfo = resolveExamDate(data.settings.targetYear, data.examDates)

    try {
      if (source !== 'online') {
        const picked = this.pickFromBank(data, subject, date)
        if (picked) return await this.publishBankQuestion(picked, subject, date, key, signal)
        if (source === 'bank') {
          throw new Error('题库中没有符合该科目要求的可用题目：请先导入题库，或把该科目的出题来源切换为在线出题')
        }
      }

      const history = Object.values(data.questions).filter((question) => question.subjectId === subject.id)
      const { question: generated, verification } = await createVerifiedQuestion({
        ctx: this.ctx,
        subject,
        examInfo,
        signal,
        history,
        localReferences: dailyExamReferences(subject,examInfo,data.pastPapers,
          Object.hasOwn(data.syllabuses,subject.id) ? data.syllabuses[subject.id] : undefined),
      })
      const qid = `q_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
      const stamp = nowISO()
      const record = {
        id: qid,
        subjectId: subject.id,
        subjectName: subject.name,
        type: generated.type,
        stem: generated.stem,
        options: generated.options,
        knowledge: generated.knowledge,
        coverageTopic:generated.coverageTopic,
        difficulty: generated.difficulty,
        examAlignment: generated.examAlignment,
        syllabusCheck: generated.syllabusCheck || '',
        source: {
          kind: 'online',
          label: '在线出题（模型生成 + 独立校验）',
          url: '',
          model: verification.model || '',
        },
        assignedDate: date,
        createdAt: stamp,
        updatedAt: stamp,
        assignedCount: 1,
        lastAssignedDate: date,
        seenDates: [date],
        favoriteAt: null,
        answerStatusRaw: 'verified',
        publishVerification: verification,
        currentAnswer: {
          versionId: `v_${randomUUID().slice(0, 8)}`,
          answer: generated.answer,
          answerKey: generated.answerKey,
          explanation: generated.explanation,
          verified: true,
          basis: 'generated',
          verification,
          createdAt: stamp,
          firstShownAt: null,
          source: { kind: 'generated', label: '在线出题' },
        },
        answerVersions: [],
      }

      await this.store.update((draft) => {
        signal?.throwIfAborted()
        if (!draft.settings.subjects.includes(subject.id)) throw new Error('该科目已停用')
        const history=Object.values(draft.questions).filter(question=>question.subjectId===subject.id)
        if(findQuestionRepeat(generated,indexQuestionHistory(history)))throw new Error('题目与已发布题目重复，已阻止发布，请重试生成新题')
        draft.questions[qid] = record
        draft.daily[key] = { date, subjectId: subject.id, questionId: qid, status: 'ready', createdAt: stamp }
        delete draft.failures[subject.id]
        return draft
      })
      return { questionId: qid, created: true }
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      const message = error instanceof QuestionGenerationError
        ? error.message
        : `在线出题失败：${error?.message || error}`
      await this.store.update((draft) => {
        if (draft.settings.subjects.includes(subject.id)) draft.failures[subject.id] = { at: nowISO(), message }
      }).catch(() => {})
      throw new Error(message)
    }
  }

  /** 从题库里挑一道近期没出过的题；只有一道可选时允许重复并标记。 */
  pickFromBank(data, subject, date) {
    const candidates = []
    for (const bank of data.banks) {
      if (bank.subjectId && bank.subjectId !== subject.id) continue
      for (const item of bank.items) {
        if (!isUsableBankItem(item)) continue
        const qid = bankQuestionId(bank.id, item.id)
        const existing = data.questions[qid]
        if (existing && existing.subjectId !== subject.id) continue
        if (item.type && !subjectTypes(subject.id, data.customSubjects).includes(item.type)) continue
        candidates.push({ bank, item, qid, lastAssignedDate: existing?.lastAssignedDate || '' })
      }
    }
    if (!candidates.length) return null
    candidates.sort((a, b) => String(a.lastAssignedDate).localeCompare(String(b.lastAssignedDate)))
    const pool = candidates.filter((candidate) => candidate.lastAssignedDate === candidates[0].lastAssignedDate)
    const chosen = pool[Math.floor(Math.random() * pool.length)]
    const repeated = Boolean(chosen.lastAssignedDate)
    return { ...chosen, repeated }
  }

  async publishBankQuestion(picked, subject, date, key, signal) {
    const { bank, item, qid, repeated } = picked
    const stamp = nowISO()
    await this.store.update((draft) => {
      signal?.throwIfAborted()
      if (!draft.settings.subjects.includes(subject.id)) throw new Error('该科目已停用')
      const existing = draft.questions[qid]
      if (existing) {
        existing.assignedCount = (existing.assignedCount || 1) + 1
        existing.lastAssignedDate = date
        existing.seenDates = Array.isArray(existing.seenDates) ? [...new Set([...existing.seenDates, date])] : [date]
        existing.updatedAt = stamp
        existing.repeated = repeated || existing.seenDates.length > 1
      } else {
        draft.questions[qid] = {
          id: qid,
          subjectId: subject.id,
          subjectName: subject.name,
          type: item.type,
          stem: item.stem,
          options: item.options || [],
          knowledge: item.knowledge || [],
          difficulty: item.difficulty || 3,
          source: {
            kind: 'bank',
            label: `题库《${bank.name}》`,
            bankId: bank.id,
            fileName: bank.fileName || '',
            itemId: item.id,
          },
          assignedDate: date,
          createdAt: stamp,
          updatedAt: stamp,
          assignedCount: 1,
          lastAssignedDate: date,
          seenDates: [date],
          repeated: false,
          favoriteAt: null,
          answerStatusRaw: item.answerStatus === 'missing' ? 'missing' : 'unverified',
          publishVerification: {
            status: item.answerStatus === 'missing' ? 'missing' : 'unverified',
            at: bank.importedAt,
            method: 'import-parse',
            summary: item.answerStatus === 'missing'
              ? '导入题库中没有这道题的参考答案，需要用户补充'
              : '答案来自导入题库，尚未独立核验',
            issues: item.issues || [],
          },
          currentAnswer: {
            versionId: `v_${randomUUID().slice(0, 8)}`,
            answer: item.answer || '',
            answerKey: item.answerKey || '',
            explanation: item.explanation || '',
            verified: false,
            basis: 'imported',
            verification: {
              status: item.answerStatus === 'missing' ? 'missing' : 'unverified',
              at: bank.importedAt,
              method: 'import-parse',
              summary: '导入题库的原始答案与解析，未经独立核验',
              issues: item.issues || [],
            },
            createdAt: stamp,
            firstShownAt: null,
            source: { kind: 'imported', label: `题库《${bank.name}》` },
          },
          answerVersions: [],
        }
      }
      draft.daily[key] = { date, subjectId: subject.id, questionId: qid, status: 'ready', createdAt: stamp }
      delete draft.failures[subject.id]
      return draft
    })
    return { questionId: qid, created: true, repeated }
  }

  /* ------------------------------ 题目视图 ------------------------------ */

  questionView(data, question, { attemptId, date = todayISO() } = {}) {
    const attempts = this.attemptsOf(data, question.id)
    const isToday=data.daily[`${date}|${question.subjectId}`]?.questionId===question.id
    const currentAttempts=isToday?attempts.filter(attempt=>attemptDate(attempt)===date):attempts
    const revealed = currentAttempts.length > 0
    const last = (attemptId ? currentAttempts.find((attempt) => attempt.id === attemptId) : currentAttempts[currentAttempts.length - 1]) || null
    const answer = question.currentAnswer
    const isChoice = CHOICE_TYPES.has(question.type)
    const canSelect = isChoice && hasChoiceOptions(question.options)
    return {
      id: question.id,
      subjectId: question.subjectId,
      subjectName: question.subjectName,
      type: question.type,
      typeLabel: QUESTION_TYPE_LABEL[question.type] || question.type,
      /** 完形填空 / 阅读理解按选择题判分，前端据此渲染选项而不是“作答完毕”。 */
      isChoice,
      canSelect,
      stem: question.stem,
      options: question.options || [],
      knowledge: question.knowledge || [],
      difficulty: question.difficulty || 3,
      examAlignment: question.examAlignment ? {
        ...question.examAlignment,
        rationale: revealed ? question.examAlignment.rationale : '',
        warnings: revealed ? question.examAlignment.warnings || [] : [],
        outlineEvidence: revealed ? question.examAlignment.outlineEvidence : [],
        paperEvidence: revealed ? question.examAlignment.paperEvidence : [],
      } : null,
      source: question.source,
      assignedDate: isToday ? date : question.lastAssignedDate || question.assignedDate,
      practiceDate:isToday?date:null,
      todayAttemptCount:isToday?currentAttempts.length:0,
      createdAt: question.createdAt,
      assignedCount: question.assignedCount || 1,
      repeated: Boolean(question.repeated),
      favorite: Boolean(question.favoriteAt),
      favoriteAt: question.favoriteAt || null,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        at: attempt.at,
        result: attempt.result,
        mode: attempt.mode,
        choice: attempt.choice || '',
        judgedAt: attempt.judgedAt || null,
        practiceDate:attemptDate(attempt),
      })),
      attemptCount: attempts.length,
      lastAttempt: last ? { id: last.id, at: last.at, result: last.result, mode: last.mode, choice: last.choice || '' } : null,
      answerState: revealed ? 'revealed' : 'locked',
      answerStatus: question.answerStatusRaw || 'verified',
      // 校验结论里通常写着答案与关键推导：未作答前只下发状态，不下发结论。
      publishVerification: question.publishVerification
        ? {
          status: question.publishVerification.status,
          at: question.publishVerification.at,
          method: question.publishVerification.method,
          summary: revealed ? (question.publishVerification.summary || '') : '',
          issues: revealed ? (question.publishVerification.issues || []) : [],
          trail: revealed ? (question.publishVerification.trail || []) : [],
        }
        : null,
      answer: revealed && answer
        ? {
          versionId: answer.versionId,
          answer: answer.answer,
          answerKey: canSelect && validChoiceKey(question.type, answer.answerKey, question.options) ? answer.answerKey : '',
          explanation: answer.explanation,
          verified: Boolean(answer.verified),
          basis: answer.basis,
          verification: answer.verification,
          createdAt: answer.createdAt,
          firstShownAt: answer.firstShownAt,
          superseded: (question.answerVersions || []).length,
        }
        : null,
      wrongEver: this.isWrong(question, attempts),
      mastered: last ? last.result === 'correct' : false,
      pendingRevision: question.pendingRevision
        ? {
          candidateId: question.pendingRevision.candidateId,
          createdAt: question.pendingRevision.createdAt,
          reason: question.pendingRevision.reason || '',
          verification: question.pendingRevision.verification,
          answer: question.pendingRevision.answer,
          explanation: question.pendingRevision.explanation,
        }
        : null,
      threadId: question.id,
    }
  }

  summaryView(data, question) {
    const attempts = this.attemptsOf(data, question.id)
    const last = attempts[attempts.length - 1]
    return {
      id: question.id,
      subjectId: question.subjectId,
      type: question.type,
      typeLabel: QUESTION_TYPE_LABEL[question.type] || question.type,
      summary: summariseStem(question.stem),
      stem: question.stem,
      assignedDate: question.lastAssignedDate || question.assignedDate,
      attemptCount: attempts.length,
      favorite: Boolean(question.favoriteAt),
      wrongEver: this.isWrong(question, attempts),
      mastered: last ? last.result === 'correct' : false,
      difficulty: question.difficulty || 3,
      difficultyUnverified: question.examAlignment?.status === 'difficulty-unverified',
      knowledge: question.knowledge || [],
      answerStatus: question.answerStatusRaw || 'verified',
    }
  }

  async listQuestions({ subjectId, kind = 'all', page = 1, pageSize = 50, idsOnly = false } = {}) {
    const data = await this.data()
    if (!subjectId) throw new Error('缺少科目')
    if(!['all','favorite','wrong','today'].includes(kind))throw new Error('未知题目栏目')
    if(!Number.isInteger(page)||page<1||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new Error('分页参数无效，每页最多100道题')
    let questions = Object.values(data.questions).filter((question) => question.subjectId === subjectId)
    if (kind === 'favorite') questions = questions.filter((question) => question.favoriteAt)
    if (kind === 'wrong') {
      questions = questions.filter((question) => {
        const attempts = this.attemptsOf(data, question.id)
        return this.isWrong(question, attempts)
      })
    }
    if (kind === 'today') {
      const record = data.daily[`${todayISO()}|${subjectId}`]
      questions = questions.filter((question) => question.id === record?.questionId)
    }
    questions.sort((a, b) => String(b.lastAssignedDate || b.assignedDate).localeCompare(String(a.lastAssignedDate || a.assignedDate))
      || String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id)))
    const total=questions.length,totalPages=Math.max(1,Math.ceil(total/pageSize))
    if(idsOnly===true)return {ok:true,kind,subjectId,total,ids:questions.map(q=>q.id)}
    page=Math.min(page,totalPages)
    return {
      ok: true,
      kind,
      subjectId,
      total,page,pageSize,totalPages,
      items: questions.slice((page-1)*pageSize,page*pageSize).map((question) => this.summaryView(data, question)),
    }
  }

  async getQuestion({ qid, attemptId }) {
    const data = await this.data()
    const question = data.questions[qid]
    if (!question) throw new Error('题目不存在或已删除')
    const thread = this.threadView(data, qid)
    const date=todayISO()
    const isToday = data.daily[`${date}|${question.subjectId}`]?.questionId === qid
    return { ok: true, question: this.questionView(data, question, { date, attemptId }), thread, isToday }
  }

  threadView(data, qid) {
    const thread = data.threads[qid]
    return {
      threadId: qid,
      questionId: qid,
      messages: thread?.messages || [],
      updatedAt: thread?.updatedAt || null,
    }
  }

  /* ------------------------------ 作答 ------------------------------ */

  async reveal({ qid, mode = 'submit', choice = '', attemptId }) {
    const id = attemptId || randomUUID()
    const duplicated = await this.store.update((draft) => {
      const question = draft.questions[qid]
      if (!question) throw new Error('题目不存在')
      const existing = draft.attempts.find((item) => item.id === id)
      if (existing) {
        if (existing.questionId !== qid) throw new Error('作答 ID 已用于其他题目')
        if (existing.mode !== mode || (existing.choice || '') !== (mode === 'submit' ? sortLetters(choice) : '')) {
          throw Object.assign(new Error('本轮已保存另一份作答，请查看已保存的结果'), { code: 'ATTEMPT_CONFLICT' })
        }
        return true
      }
      let result = 'pending'
      let normalizedChoice = ''
      if (mode === 'submit') {
        if (!CHOICE_TYPES.has(question.type)) throw new Error('主观题不支持提交选项')
        if (!hasChoiceOptions(question.options)) throw new Error('选项不完整，请使用“作答完毕”查看答案')
        normalizedChoice = normalizeChoice(choice, question)
        const key = question.currentAnswer?.answerKey
        if (validChoiceKey(question.type, key, question.options)) result = normalizedChoice === sortLetters(key) ? 'correct' : 'wrong'
      } else if (mode === 'giveup') {
        result = 'wrong'
      } else if (mode !== 'done') {
        throw new Error(`未知的作答方式：${mode}`)
      }
      const stamp = nowISO()
      draft.attempts.push({
        id, questionId: qid, at: stamp, practiceDate: todayISO(new Date(stamp)),
        type: question.type, mode, choice: normalizedChoice, result,
        revealedAt: stamp, judgedAt: result === 'pending' ? null : stamp,
      })
      if (question.currentAnswer && !question.currentAnswer.firstShownAt) {
        question.currentAnswer.firstShownAt = stamp
      }
      question.updatedAt = stamp
      return false
    })
    const fresh = await this.data()
    if (!fresh.questions[qid]) throw new Error('题目已删除')
    return { ok: true, question: this.questionView(fresh, fresh.questions[qid], { attemptId: id }), duplicated }
  }

  async judge({ qid, verdict, attemptId }) {
    if (!['correct', 'wrong'].includes(verdict)) throw new Error('判定结果不合法')
    if (typeof attemptId !== 'string' || !attemptId) throw new Error('缺少本次作答ID，请重新打开题目后判定')
    const duplicated=await this.store.update((draft) => {
      if (!draft.questions[qid]) throw new Error('题目不存在')
      const target = draft.attempts.find((attempt) => attempt.id === attemptId && attempt.questionId === qid)
      if (!target) throw new Error('本次作答不存在或不属于这道题')
      if (target.result !== 'pending' || target.judgedAt) {
        if (target.result === verdict && target.judgedAt) return true
        throw new Error('本次作答已判定，不能覆盖或改判其他作答')
      }
      target.result = verdict
      target.judgedAt = nowISO()
      const question = draft.questions[qid]
      if (question) question.updatedAt = nowISO()
      return false
    })
    const data = await this.data()
    return { ok: true, question: this.questionView(data, data.questions[qid], {attemptId}), duplicated }
  }

  async favorite({ qid, value }) {
    await this.store.update((draft) => {
      const question = draft.questions[qid]
      if (!question) throw new Error('题目不存在')
      question.favoriteAt = value ? nowISO() : null
      question.updatedAt = nowISO()
      return draft
    })
    const data = await this.data()
    return { ok: true, question: this.questionView(data, data.questions[qid]), counts: this.counts(data) }
  }

  async removeFromWrongBook({ qid }) {
    await this.store.update((draft) => {
      const question = draft.questions[qid]
      if (!question) throw new Error('题目不存在')
      question.wrongBookRemoved = true
      question.updatedAt = nowISO()
      return draft
    })
    const data = await this.data()
    return { ok: true, question: this.questionView(data, data.questions[qid]), counts: this.counts(data) }
  }

  async bulkQuestions({ qids, action, confirmProtected = false }) {
    if (!Array.isArray(qids) || !qids.length || qids.some((id) => typeof id !== 'string' || !id)) {
      throw new Error('请选择需要管理的题目')
    }
    if (!['delete', 'favorite', 'unfavorite', 'wrong', 'unwrong'].includes(action)) throw new Error('未知的批量操作')
    const ids = new Set(qids)
    const result = await this.store.update((draft) => {
      const questions = [...ids].map((id) => {
        if (!Object.hasOwn(draft.questions, id)) throw new Error('部分题目已不存在，请刷新列表后重试')
        return draft.questions[id]
      })
      const protectedCount = questions.filter((q) => q.favoriteAt || this.isWrong(q, this.attemptsOf(draft,q.id))).length
      if (action === 'delete' && protectedCount && confirmProtected !== true) {
        return { requiresConfirmation: true, protectedCount }
      }
      const stamp = nowISO()
      if (action === 'delete') purgeQuestionRecords(draft,ids)
      else {
        for (const q of questions) {
          if (action === 'favorite') q.favoriteAt = stamp
          if (action === 'unfavorite') q.favoriteAt = null
          if (action === 'wrong' || action === 'unwrong') {
            q.wrongBookAdded = action === 'wrong'
            q.wrongBookRemoved = action === 'unwrong'
          }
          q.updatedAt = stamp
        }
      }
      return { affected: ids.size }
    })
    return { ok: true, ...result, counts: this.counts(await this.data()) }
  }

  /* ------------------------------ 答案修订 ------------------------------ */

  async revise({ qid, reason = '' }) {
    return this.runTask('revise:'+qid, {kind:'revise',qid}, (signal) => this.createRevision({qid,reason}, signal))
  }

  async createRevision({ qid, reason }, signal) {
    const data = await this.data()
    const question = data.questions[qid]
    if (!question) throw new Error('题目不存在')
    const subject = findSubject(question.subjectId, data.customSubjects)
    const examInfo = resolveExamDate(data.settings.targetYear, data.examDates)
    const result = await reviseAnswer({
      ctx: this.ctx,
      subject,
      examInfo,
      question,
      currentAnswer: question.currentAnswer,
      reason,
      signal,
    })
    const candidate = {
      candidateId: `c_${randomUUID().slice(0, 8)}`,
      answer: result.candidate.answer,
      answerKey: result.candidate.answerKey,
      explanation: result.candidate.explanation,
      verification: result.verification,
      createdAt: nowISO(),
      reason,
    }
    await this.store.update((draft) => {
      const target = draft.questions[qid]
      signal.throwIfAborted()
      if (!target) throw new Error('题目不存在')
      target.pendingRevision = candidate
      return draft
    })
    const fresh = await this.data()
    return { ok: true, question: this.questionView(fresh, fresh.questions[qid]) }
  }

  async confirmRevision({ qid, candidateId }) {
    const stamp = nowISO()
    await this.store.update((draft) => {
      const question = draft.questions[qid]
      if (!question) throw new Error('题目不存在')
      const candidate = question.pendingRevision
      if (!candidate || (candidateId && candidate.candidateId !== candidateId)) {
        throw new Error('候选修订版本不存在或已失效')
      }
      if (!candidate.verification || candidate.verification.status !== 'passed') {
        throw new Error('候选修订版本没有通过独立校验，不能替换正式答案')
      }
      question.answerVersions = Array.isArray(question.answerVersions) ? question.answerVersions : []
      question.answerVersions.push({
        ...question.currentAnswer,
        replacedAt: stamp,
        replacedBy: candidate.candidateId,
        reason: candidate.reason || '',
      })
      question.currentAnswer = {
        versionId: `v_${randomUUID().slice(0, 8)}`,
        answer: candidate.answer,
        answerKey: candidate.answerKey || '',
        explanation: candidate.explanation,
        verified: true,
        basis: 'revised',
        verification: candidate.verification,
        createdAt: stamp,
        firstShownAt: question.currentAnswer?.firstShownAt || null,
        source: { kind: 'revised', label: '用户请求修订并通过独立校验' },
      }
      question.pendingRevision = null
      question.answerStatusRaw = 'verified'
      question.updatedAt = stamp
      return draft
    })
    const data = await this.data()
    return { ok: true, question: this.questionView(data, data.questions[qid]) }
  }

  async discardRevision({ qid }) {
    await this.store.update((draft) => {
      const question = draft.questions[qid]
      if (!question) throw new Error('题目不存在')
      question.pendingRevision = null
      return draft
    })
    const data = await this.data()
    return { ok: true, question: this.questionView(data, data.questions[qid]) }
  }

  /* ------------------------------ 追问 ------------------------------ */

  async followup({ qid, message, clientMessageId }) {
    const messageId = clientMessageId || randomUUID()
    const key = JSON.stringify([qid, messageId])
    if (this.inflightFollowups.has(key)) return this.inflightFollowups.get(key)
    const executionId = randomUUID()
    const task = this.runTask('followup:'+key, {kind:'followup',qid,clientMessageId:messageId},
      (signal) => this.createFollowup({ qid, message, clientMessageId: messageId, executionId }, signal))
      .catch(async (error) => {
        await this.store.update((draft) => {
          const target = draft.threads[qid]?.messages.find((item) => item.id === messageId)
          if (target?.executionId === executionId && target.status === 'pending') target.status = 'failed'
        }).catch(() => {})
        throw error
      }).finally(() => this.inflightFollowups.delete(key))
    this.inflightFollowups.set(key, task)
    return task
  }

  async createFollowup({ qid, message, clientMessageId, executionId }, signal) {
    const text = String(message || '').trim()
    if (!text) throw new Error('追问内容不能为空')
    if (text.length > 4000) throw new Error('追问内容过长，请精简后再发送')
    const data = await this.data()
    const question = data.questions[qid]
    if (!question) throw new Error('题目不存在')

    const existingMessages = data.threads[qid]?.messages || []
    const failed = clientMessageId ? existingMessages.find((item) => item.id === clientMessageId) : null
    if (failed && failed.status !== 'failed') {
      // 同一条消息已经成功入队/作答过：不重复插入。
      return { ok: true, thread: this.threadView(data, qid), duplicated: true }
    }

    const stamp = nowISO()
    const messageId = failed ? failed.id : (clientMessageId || randomUUID())

    // 先落盘用户消息：即使回复失败，用户输入也不会丢，并且可以按同一 id 重试。
    const queued = await this.store.update((draft) => {
      signal.throwIfAborted()
      if (!draft.questions[qid]) throw new Error('题目已删除')
      if (!draft.threads[qid]) {
        draft.threads[qid] = { threadId: qid, questionId: qid, generation: randomUUID(), messages: [], updatedAt: stamp }
      }
      const thread = draft.threads[qid]
      if (!thread.generation) thread.generation = randomUUID()
      const target = thread.messages.find((item) => item.id === messageId)
      if (target) {
        if (target.status !== 'failed') return { duplicated: true, generation: thread.generation }
        target.text = text
        target.status = 'pending'
        target.executionId = executionId
      } else {
        thread.messages.push({
          id: messageId,
          threadId: qid,
          questionId: qid,
          role: 'user',
          text,
          createdAt: stamp,
          status: 'pending',
          executionId,
        })
      }
      thread.updatedAt = stamp
      return { duplicated: false, generation: thread.generation }
    })
    if (queued.duplicated) return { ok: true, thread: this.threadView(await this.data(), qid), duplicated: true }

    const history = (await this.data()).threads[qid]?.messages || []
    const setStatus = async (status) => {
      await this.store.update((draft) => {
        const target = draft.threads[qid]?.messages.find((item) => item.id === messageId)
        if (target?.executionId === executionId) target.status = status
        return draft
      }).catch(() => {})
    }

    try {
      const answer = await answerFollowup({
        ctx: this.ctx,
        question,
        answerDetail: question.currentAnswer,
        history: history.filter((item) => item.id !== messageId),
        message: text,
        signal,
      })
      const assistantMessage = {
        id: randomUUID(),
        threadId: qid,
        questionId: qid,
        role: 'assistant',
        text: answer,
        createdAt: nowISO(),
        status: 'sent',
      }
      await this.store.update((draft) => {
        signal.throwIfAborted()
        if (!draft.questions[qid]) throw new Error('题目已删除')
        const thread = draft.threads[qid]
        const target = thread?.messages.find((item) => item.id === messageId)
        if (!thread || thread.generation !== queued.generation || !target || target.executionId !== executionId || target.status !== 'pending') throw new Error('本次追问已清空或失效，已丢弃迟到的回复')
        target.status = 'sent'
        thread.messages.push(assistantMessage)
        thread.updatedAt = assistantMessage.createdAt
        return draft
      })
      const fresh = await this.data()
      return { ok: true, thread: this.threadView(fresh, qid) }
    } catch (error) {
      await setStatus('failed')
      throw new Error(`回复生成失败：${error?.message || error}`)
    }
  }

  async clearThread({ qid }) {
    await this.store.update((draft) => {
      if (draft.threads[qid]) {
        draft.threads[qid].messages = []
        draft.threads[qid].generation = randomUUID()
        draft.threads[qid].updatedAt = nowISO()
      }
      return draft
    })
    await this.cancelTask({kind:'followup',qid})
    const data = await this.data()
    return { ok: true, thread: this.threadView(data, qid) }
  }

  /* ------------------------------ 大纲 ------------------------------ */

  syllabusViews(data) {
    return Object.entries(data.syllabuses).map(([subjectId, {fileName,importedAt,text}]) => ({
      subjectId,fileName,importedAt,characters:text.length,
    }))
  }

  async importSyllabus({ subjectId, fileName, kind, text, base64 }) {
    if (typeof subjectId !== 'string' || typeof fileName !== 'string' || !fileName.trim()) throw new Error('请选择科目和大纲文件')
    const content = await readStudyDocument({kind,text,base64})
    const data = await this.store.update((draft) => {
      if (!findSubject(subjectId,draft.customSubjects) || draft.settings.deletedSubjects.includes(subjectId)) throw new Error('科目不存在或已删除')
      draft.syllabuses = {...draft.syllabuses,[subjectId]:{fileName:fileName.trim().slice(0,160),importedAt:nowISO(),text:content}}
      return draft
    })
    return {ok:true,syllabuses:this.syllabusViews(data)}
  }

  async removeSyllabus({ subjectId }) {
    const data = await this.store.update((draft) => {
      if (typeof subjectId !== 'string' || !Object.hasOwn(draft.syllabuses,subjectId)) throw new Error('该科目尚未导入大纲')
      delete draft.syllabuses[subjectId]
      return draft
    })
    return {ok:true,syllabuses:this.syllabusViews(data)}
  }

  pastPaperViews(data) {
    return data.pastPapers.map(({subjectId,year,fileName,importedAt,type,types}) => ({
      subjectId,year,fileName,importedAt,type,types,
    })).sort((a,b) => b.year-a.year)
  }

  async importPastPaper({subjectId, year, type = '', fileName, kind, text, base64}) {
    if (typeof subjectId !== 'string' || typeof fileName !== 'string' || !fileName.trim()) throw new Error('请选择科目和真题文件')
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()+1) throw new Error('请填写有效的真题年份')
    const content = await readStudyDocument({kind,text,base64})
    const data = await this.store.update((draft) => {
      const subject = findSubject(subjectId,draft.customSubjects)
      if (!subject || draft.settings.deletedSubjects.includes(subjectId)) throw new Error('科目不存在或已删除')
      if (type !== '' && !subject.types.includes(type)) throw new Error('所选题型不在该科目的题型列表中')
      const normalized = content.replace(/\s+/g,'')
      const duplicate = draft.pastPapers.find((paper) => paper.subjectId === subjectId && paper.year !== year
        && paper.text.replace(/\s+/g,'') === normalized)
      if (duplicate) throw new Error(`相同正文已导入为 ${duplicate.year} 年，请核对试卷年份`)
      const types = subject.types.filter((value) => paperTextForType(content,value,subject.types,type))
      draft.pastPapers = draft.pastPapers.filter((paper) => paper.subjectId !== subjectId || paper.year !== year)
      draft.pastPapers.push({subjectId,year,type,types,fileName:fileName.trim().slice(0,160),importedAt:nowISO(),text:content})
      return draft
    })
    return {ok:true,pastPapers:this.pastPaperViews(data)}
  }

  async removePastPaper({subjectId, year}) {
    const data = await this.store.update((draft) => {
      draft.pastPapers = draft.pastPapers.filter((paper) => paper.subjectId !== subjectId || paper.year !== year)
      return draft
    })
    return {ok:true,pastPapers:this.pastPaperViews(data)}
  }

  /* ------------------------------ 题库 ------------------------------ */

  async importBank({ name, kind, text, base64, fileName, subjectId }) {
    let content = ''
    let warnings = []
    if (kind === 'pdf') {
      if (!base64) throw new Error('缺少 PDF 文件内容')
      const bytes = Buffer.from(String(base64), 'base64')
      if (bytes.length > 40 * 1024 * 1024) throw new Error('PDF 文件过大（上限 40MB）')
      const extracted = await extractBankPdf(bytes, fileName || name || '')
      content = extracted.text
      warnings = extracted.warnings
    } else {
      content = String(text || '')
      if (content.length > 6 * 1024 * 1024) throw new Error('Markdown 文件过大（上限 6MB）')
    }

    const parsed = parseBankText(content, { filename: fileName || name || '' })
    const importId = `imp_${randomUUID().slice(0, 8)}`
    this.imports.set(importId, {
      importId,
      name: name || fileName || '未命名题库',
      kind,
      fileName: fileName || '',
      subjectId: subjectId || '',
      createdAt: Date.now(),
      items: parsed.items,
      warnings: [...warnings, ...parsed.warnings],
    })
    this.sweepImports()
    const allWarnings = [...new Set([...warnings, ...parsed.warnings])]
    return {
      ok: true,
      importId,
      name: name || fileName || '未命名题库',
      kind,
      usable: parsed.usable,
      warnings: allWarnings,
      items: parsed.items.map((item) => ({
        index: item.index,
        type: item.type,
        typeLabel: item.typeLabel,
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        answerKey: item.answerKey,
        explanation: item.explanation,
        knowledge: item.knowledge,
        difficulty: item.difficulty,
        issues: item.issues,
        usable: isUsableBankItem(item),
        answerStatus: item.answerStatus,
      })),
      stats: {
        total: parsed.items.length,
        withAnswer: parsed.items.filter((item) => item.answer).length,
        blocked: parsed.items.length - parsed.usable,
      },
    }
  }

  sweepImports() {
    const cutoff = Date.now() - IMPORT_TTL_MS
    for (const [key, value] of this.imports) {
      if (value.createdAt < cutoff) this.imports.delete(key)
    }
  }

  async commitBank({ importId, name, subjectId, excludedIndexes = [] }) {
    const pending = this.imports.get(importId)
    if (!pending) throw new Error('导入结果已过期，请重新选择文件导入')
    if (!Array.isArray(excludedIndexes) || excludedIndexes.some((index) => !Number.isInteger(index) || index < 1 || index > pending.items.length)) {
      throw new Error('导入勾选有误，请重新选择题目')
    }
    const excluded = new Set(excludedIndexes)
    const usable = pending.items.filter((item) => !excluded.has(item.index) && isUsableBankItem(item))
    if (!usable.length) throw new Error('没有可用的题目可以入库：请检查文件结构后重新导入')
    const bankId = `bank_${randomUUID().slice(0, 8)}`
    const bank = {
      id: bankId,
      name: String(name || pending.name || '未命名题库').slice(0, 120),
      kind: pending.kind,
      fileName: pending.fileName || '',
      subjectId: subjectId || pending.subjectId || '',
      importedAt: nowISO(),
      items: usable.map((item, index) => ({
        id: String(index + 1),
        type: item.type,
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        answerKey: item.answerKey,
        explanation: item.explanation,
        knowledge: item.knowledge,
        difficulty: item.difficulty,
        issues: item.issues,
        answerStatus: item.answer ? 'unverified' : 'missing',
      })),
    }
    this.imports.delete(importId)
    try {
      await this.store.update((draft) => {
        if (draft.settings.deletedSubjects.includes(bank.subjectId)) throw new Error('科目已删除，请重新选择题库关联科目')
        draft.banks.push(bank)
      })
    } catch (error) {
      this.imports.set(importId, pending)
      throw error
    }
    const data = await this.data()
    return { ok: true, bank: this.bankViews(data).find((item) => item.id === bankId), banks: this.bankViews(data), subjects: this.subjectViews(data) }
  }

  async deleteBank({ bankId }) {
    const data = await this.data()
    const bank = data.banks.find((item) => item.id === bankId)
    if (!bank) throw new Error('题库不存在')
    const keptQuestions = Object.values(data.questions).filter((question) => question.source?.bankId === bankId).length
    await this.store.update((draft) => {
      draft.banks = draft.banks.filter((item) => item.id !== bankId)
      return draft
    })
    const fresh = await this.data()
    return {
      ok: true,
      banks: this.bankViews(fresh),
      subjects: this.subjectViews(fresh),
      keptQuestions,
      message: `题库《${bank.name}》已删除；已出过的 ${keptQuestions} 道题目及其作答记录、收藏和追问都已保留。`,
    }
  }

  /* ------------------------------ 考试日期 ------------------------------ */

  async refreshExamDate({ year }) {
    const data = await this.data()
    const targetYear = Number(year || data.settings.targetYear)
    const web = this.ctx.get?.('web')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25_000)
    try {
      const result = await verifyExamDateOnline({ year: targetYear, web, signal: controller.signal })
      if (!result.ok) {
        return { ok: false, reason: result.reason, checked: result.checked || [], examInfo: resolveExamDate(targetYear, data.examDates) }
      }
      await this.store.update((draft) => {
        draft.examDates[String(targetYear)] = result.record
        return draft
      })
      const fresh = await this.data()
      const examInfo = resolveExamDate(targetYear, fresh.examDates)
      return {
        ok: true,
        checked: result.checked || [],
        examInfo,
        countdown: computeCountdown(targetYear, examInfo),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /* ------------------------------ 科目 ------------------------------ */

  async addSubject({ subjectId, source }) {
    const data = await this.data()
    const subject = findSubject(subjectId, data.customSubjects)
    if (!subject || data.settings.deletedSubjects.includes(subjectId)) throw new Error(`科目不存在：${subjectId}`)
    const subjects = data.settings.subjects.includes(subjectId)
      ? data.settings.subjects
      : [...data.settings.subjects, subjectId]
    return this.saveSettings({
      subjects,
      activeSubject: subjectId,
      subjectSource: source ? { [subjectId]: source } : undefined,
    })
  }

  async removeSubject({ subjectId }) {
    const data = await this.data()
    if (!data.settings.subjects.includes(subjectId)) throw new Error('该科目未启用')
    const remaining = data.settings.subjects.filter((id) => id !== subjectId)
    const kept = Object.values(data.questions).filter((question) => question.subjectId === subjectId).length
    const result = await this.saveSettings({
      subjects: remaining,
    })
    return {
      ...result,
      message: `科目已停用，保留 ${kept} 道题目及其作答记录。可在科目管理中重新启用。`,
    }
  }
}

export function bankQuestionId(bankId, itemId) {
  return `bank:${bankId}:${itemId}`
}
