import { randomUUID } from 'node:crypto'
import { findSubject, allSubjects, QUESTION_TYPE_LABEL, CHOICE_TYPES, subjectTypes } from './subjects.js'
import { computeCountdown, resolveExamDate, todayISO, verifyExamDateOnline, yearOptions } from './exam-dates.js'
import { createVerifiedQuestion, QuestionGenerationError, reviseAnswer } from './generate.js'
import { answerFollowup } from './tutor.js'
import { parseBankText, extractBankPdf } from './bank.js'
import { Store, resolveDataDir } from './store.js'

const MAX_STEM_SUMMARY = 140
const IMPORT_TTL_MS = 30 * 60 * 1000

function nowISO() {
  return new Date().toISOString()
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
  return upper.split('').sort().join('')
}

function sortLetters(value) {
  return String(value || '').toUpperCase().replace(/[^A-H]/g, '').split('').sort().join('')
}

/**
 * 考研每日一题的业务服务。
 *
 * 提供方：Host。所有状态写入 Store（单文件 JSON，原子写），
 * Client 通过 /api/daily-question/rpc 调用同一批方法，因此界面操作与
 * 后续可能的 Agent 工具共享同一套业务逻辑。
 */
export class DailyQuestionService {
  constructor(ctx) {
    this.ctx = ctx
    this.store = new Store(resolveDataDir())
    this.inflightDaily = new Map()
    this.imports = new Map()
    this.log = typeof ctx.logger === 'function' ? ctx.logger('daily-question') : (ctx.logger || console)
  }

  async init() {
    await this.store.load()
  }

  /* ------------------------------ 读取与状态 ------------------------------ */

  async data() {
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
    const data = await this.data()
    const { examInfo, countdown } = await this.examState()
    const today = todayISO()
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
      dataError: this.store.lastError,
      today,
      now: nowISO(),
      yearOptions: yearOptions(today),
      settings: data.settings,
      customSubjects: data.customSubjects,
      examInfo,
      countdown,
      subjects: this.subjectViews(data),
      banks: this.bankViews(data),
      todayMap,
      failures: data.failures,
      counts: this.counts(data),
    }
  }

  subjectViews(data) {
    const enabled = new Set(data.settings.subjects)
    return allSubjects(data.customSubjects).map((subject) => {
      const allowed = new Set(subjectTypes(subject.id, data.customSubjects))
      const usableBanks = data.banks.filter((bank) => !bank.subjectId || bank.subjectId === subject.id)
      return {
        id: subject.id,
        name: subject.name,
        code: subject.code || '',
        types: subject.types,
        typeLabels: subject.types.map((type) => QUESTION_TYPE_LABEL[type] || type),
        custom: Boolean(subject.custom),
        enabled: enabled.has(subject.id),
        source: data.settings.subjectSource[subject.id] || 'auto',
        bankItemCount: usableBanks.reduce((total, bank) => total
          + bank.items.filter((item) => item.stem && (!item.type || allowed.has(item.type))).length, 0),
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
      usable: bank.items.filter((item) => item.stem).length,
      pendingAnswers: bank.items.filter((item) => item.answerStatus !== 'verified').length,
    }))
  }

  counts(data) {
    const result = {}
    for (const subjectId of data.settings.subjects) {
      const questions = Object.values(data.questions).filter((question) => question.subjectId === subjectId)
      const ids = new Set(questions.map((question) => question.id))
      const attempts = data.attempts.filter((attempt) => ids.has(attempt.questionId))
      result[subjectId] = {
        all: questions.length,
        favorite: questions.filter((question) => question.favoriteAt).length,
        wrong: questions.filter((question) => this.isWrong(question, attempts)).length,
      }
    }
    return result
  }

  isWrong(question, attempts) {
    if (question.wrongBookRemoved) return false
    const own = attempts.filter((attempt) => attempt.questionId === question.id)
    return own.some((attempt) => attempt.result === 'wrong')
  }

  attemptsOf(data, qid) {
    return data.attempts.filter((attempt) => attempt.questionId === qid)
  }

  /* ------------------------------ 设置 ------------------------------ */

  async saveSettings(patch = {}) {
    const data = await this.store.update((draft) => {
      // 先落自定义科目，后面的 enabled 校验才能识别到它们。
      if (Array.isArray(patch.customSubjects)) {
        draft.customSubjects = patch.customSubjects
          .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
          .map((item) => ({
            id: item.id.slice(0, 60),
            name: item.name.slice(0, 60),
            code: typeof item.code === 'string' ? item.code.slice(0, 20) : '',
            types: normalizeCustomTypes(item.types),
            outline: Array.isArray(item.outline) ? item.outline.filter((line) => typeof line === 'string').slice(0, 20) : [],
            guidance: typeof item.guidance === 'string' ? item.guidance : '',
          }))
      }
      if (patch.targetYear !== undefined) {
        const year = Number(patch.targetYear)
        if (!Number.isFinite(year) || year < 2000 || year > 2100) throw new Error('考研年份不合法')
        draft.settings.targetYear = Math.trunc(year)
      }
      if (Array.isArray(patch.subjects)) {
        const known = new Set(allSubjects(draft.customSubjects).map((subject) => subject.id))
        const unique = []
        for (const id of patch.subjects) {
          if (typeof id !== 'string' || !known.has(id) || unique.includes(id)) continue
          unique.push(id)
        }
        draft.settings.subjects = unique
      }
      if (patch.subjectSource && typeof patch.subjectSource === 'object') {
        const known = new Set(allSubjects(draft.customSubjects).map((subject) => subject.id))
        for (const [id, value] of Object.entries(patch.subjectSource)) {
          if (!known.has(id) || !['online', 'bank', 'auto'].includes(value)) continue
          draft.settings.subjectSource[id] = value
        }
      }
      if (patch.activeSubject !== undefined) {
        draft.settings.activeSubject = typeof patch.activeSubject === 'string' ? patch.activeSubject : null
      }
      return draft
    })
    const { examInfo, countdown } = await this.examState()
    return {
      ok: true,
      settings: data.settings,
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

    const task = this.createDaily(subject, date, key).finally(() => this.inflightDaily.delete(key))
    this.inflightDaily.set(key, task)
    const result = await task
    const fresh = await this.data()
    return { ok: true, question: this.questionView(fresh, fresh.questions[result.questionId]), thread: this.threadView(fresh, result.questionId), created: result.created }
  }

  async createDaily(subject, date, key) {
    const data = await this.data()
    const source = data.settings.subjectSource[subject.id] || 'auto'
    const examInfo = resolveExamDate(data.settings.targetYear, data.examDates)

    try {
      if (source !== 'online') {
        const picked = this.pickFromBank(data, subject, date)
        if (picked) return await this.publishBankQuestion(picked, subject, date, key)
        if (source === 'bank') {
          throw new Error('题库中没有符合该科目要求的可用题目：请先导入题库，或把该科目的出题来源切换为在线出题')
        }
      }

      const { question: generated, verification } = await createVerifiedQuestion({
        ctx: this.ctx,
        subject,
        examInfo,
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
        difficulty: generated.difficulty,
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
        draft.questions[qid] = record
        draft.daily[key] = { date, subjectId: subject.id, questionId: qid, status: 'ready', createdAt: stamp }
        delete draft.failures[subject.id]
        return draft
      })
      return { questionId: qid, created: true }
    } catch (error) {
      const message = error instanceof QuestionGenerationError
        ? error.message
        : `在线出题失败：${error?.message || error}`
      await this.store.update((draft) => {
        draft.failures[subject.id] = { at: nowISO(), message }
        return draft
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
        if (!item.stem) continue
        const qid = bankQuestionId(bank.id, item.id)
        const existing = data.questions[qid]
        if (existing && existing.subjectId !== subject.id) continue
        if (item.type && !subjectTypes(subject.id, data.customSubjects).includes(item.type)) continue
        candidates.push({ bank, item, qid, lastAssignedDate: existing?.lastAssignedDate || '' })
      }
    }
    if (!candidates.length) return null
    candidates.sort((a, b) => String(a.lastAssignedDate).localeCompare(String(b.lastAssignedDate)))
    const fresh = candidates.filter((candidate) => candidate.lastAssignedDate !== date)
    const pool = fresh.length ? fresh : candidates
    const chosen = pool[Math.floor(Math.random() * pool.length)]
    const repeated = Boolean(chosen.lastAssignedDate)
    return { ...chosen, repeated }
  }

  async publishBankQuestion(picked, subject, date, key) {
    const { bank, item, qid, repeated } = picked
    const stamp = nowISO()
    await this.store.update((draft) => {
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

  questionView(data, question) {
    const attempts = this.attemptsOf(data, question.id)
    const revealed = attempts.length > 0
    const last = attempts[attempts.length - 1] || null
    const answer = question.currentAnswer
    return {
      id: question.id,
      subjectId: question.subjectId,
      subjectName: question.subjectName,
      type: question.type,
      typeLabel: QUESTION_TYPE_LABEL[question.type] || question.type,
      /** 完形填空 / 阅读理解按选择题判分，前端据此渲染选项而不是“作答完毕”。 */
      isChoice: CHOICE_TYPES.has(question.type),
      stem: question.stem,
      options: question.options || [],
      knowledge: question.knowledge || [],
      difficulty: question.difficulty || 3,
      source: question.source,
      assignedDate: question.assignedDate,
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
          answerKey: answer.answerKey || '',
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
      assignedDate: question.assignedDate,
      attemptCount: attempts.length,
      favorite: Boolean(question.favoriteAt),
      wrongEver: this.isWrong(question, attempts),
      mastered: last ? last.result === 'correct' : false,
      difficulty: question.difficulty || 3,
      knowledge: question.knowledge || [],
      answerStatus: question.answerStatusRaw || 'verified',
    }
  }

  async listQuestions({ subjectId, kind = 'all' } = {}) {
    const data = await this.data()
    if (!subjectId) throw new Error('缺少科目')
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
    questions.sort((a, b) => String(b.assignedDate).localeCompare(String(a.assignedDate))
      || String(b.createdAt).localeCompare(String(a.createdAt)))
    return {
      ok: true,
      kind,
      subjectId,
      items: questions.map((question) => this.summaryView(data, question)),
    }
  }

  async getQuestion({ qid }) {
    const data = await this.data()
    const question = data.questions[qid]
    if (!question) throw new Error('题目不存在（可能已随题库删除而失效）')
    const thread = this.threadView(data, qid)
    return { ok: true, question: this.questionView(data, question), thread }
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
    const data = await this.data()
    const question = data.questions[qid]
    if (!question) throw new Error('题目不存在')
    if (attemptId) {
      const existing = data.attempts.find((attempt) => attempt.id === attemptId)
      if (existing) {
        return { ok: true, question: this.questionView(await this.data(), question), duplicated: true }
      }
    }
    const isChoice = CHOICE_TYPES.has(question.type)
    let result = 'pending'
    let normalizedChoice = ''
    if (mode === 'submit') {
      if (!isChoice) throw new Error('主观题不支持提交选项')
      normalizedChoice = normalizeChoice(choice, question)
      const key = sortLetters(question.currentAnswer?.answerKey)
      result = key && normalizedChoice === key ? 'correct' : 'wrong'
    } else if (mode === 'giveup') {
      result = 'wrong'
    } else if (mode === 'done') {
      result = 'pending'
    } else {
      throw new Error(`未知的作答方式：${mode}`)
    }

    const stamp = nowISO()
    const attempt = {
      id: attemptId || randomUUID(),
      questionId: qid,
      at: stamp,
      type: question.type,
      mode,
      choice: normalizedChoice,
      result,
      revealedAt: stamp,
      judgedAt: mode === 'done' ? null : stamp,
    }

    await this.store.update((draft) => {
      const target = draft.questions[qid]
      if (!target) throw new Error('题目不存在')
      draft.attempts.push(attempt)
      if (target.currentAnswer && !target.currentAnswer.firstShownAt) {
        target.currentAnswer.firstShownAt = stamp
      }
      target.updatedAt = stamp
      return draft
    })
    const fresh = await this.data()
    return { ok: true, question: this.questionView(fresh, fresh.questions[qid] || question) }
  }

  async judge({ qid, verdict }) {
    if (!['correct', 'wrong'].includes(verdict)) throw new Error('判定结果不合法')
    await this.store.update((draft) => {
      const attempts = draft.attempts.filter((attempt) => attempt.questionId === qid)
      const target = [...attempts].reverse().find((attempt) => attempt.result === 'pending' && !attempt.judgedAt)
      if (!target) throw new Error('当前没有待判定的作答')
      target.result = verdict
      target.judgedAt = nowISO()
      const question = draft.questions[qid]
      if (question) question.updatedAt = nowISO()
      return draft
    })
    const data = await this.data()
    return { ok: true, question: this.questionView(data, data.questions[qid]) }
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

  /* ------------------------------ 答案修订 ------------------------------ */

  async revise({ qid, reason = '' }) {
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
    await this.store.update((draft) => {
      if (!draft.threads[qid]) {
        draft.threads[qid] = { threadId: qid, questionId: qid, messages: [], updatedAt: stamp }
      }
      const thread = draft.threads[qid]
      const target = thread.messages.find((item) => item.id === messageId)
      if (target) {
        target.text = text
        target.status = 'pending'
      } else {
        thread.messages.push({
          id: messageId,
          threadId: qid,
          questionId: qid,
          role: 'user',
          text,
          createdAt: stamp,
          status: 'pending',
        })
      }
      thread.updatedAt = stamp
      return draft
    })

    const history = (await this.data()).threads[qid]?.messages || []
    const setStatus = async (status) => {
      await this.store.update((draft) => {
        const target = draft.threads[qid]?.messages.find((item) => item.id === messageId)
        if (target) target.status = status
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
        if (!draft.threads[qid]) draft.threads[qid] = { threadId: qid, questionId: qid, messages: [], updatedAt: nowISO() }
        const thread = draft.threads[qid]
        const target = thread.messages.find((item) => item.id === messageId)
        if (target) target.status = 'sent'
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
      if (draft.threads[qid]) draft.threads[qid].messages = []
      return draft
    })
    const data = await this.data()
    return { ok: true, thread: this.threadView(data, qid) }
  }

  /* ------------------------------ 题库 ------------------------------ */

  async importBank({ name, kind, text, base64, fileName, subjectId }) {
    let content = ''
    let warnings = []
    if (kind === 'pdf') {
      if (!base64) throw new Error('缺少 PDF 文件内容')
      const bytes = Buffer.from(String(base64), 'base64')
      if (bytes.length > 40 * 1024 * 1024) throw new Error('PDF 文件过大（上限 40MB）')
      const extracted = extractBankPdf(bytes, fileName || name || '')
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
        answerStatus: item.answerStatus,
      })),
      stats: {
        total: parsed.items.length,
        withAnswer: parsed.items.filter((item) => item.answer).length,
        blocked: parsed.items.filter((item) => !item.stem).length,
      },
    }
  }

  sweepImports() {
    const cutoff = Date.now() - IMPORT_TTL_MS
    for (const [key, value] of this.imports) {
      if (value.createdAt < cutoff) this.imports.delete(key)
    }
  }

  async commitBank({ importId, name, subjectId }) {
    const pending = this.imports.get(importId)
    if (!pending) throw new Error('导入结果已过期，请重新选择文件导入')
    const usable = pending.items.filter((item) => item.stem && item.stem.length >= 4)
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
    await this.store.update((draft) => {
      draft.banks.push(bank)
      return draft
    })
    this.imports.delete(importId)
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
    if (!subject) throw new Error(`未知科目：${subjectId}`)
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
      activeSubject: data.settings.activeSubject === subjectId ? (remaining[0] || null) : data.settings.activeSubject,
    })
    return {
      ...result,
      message: `科目已移出每日出题，历史数据保留：${kept} 道题目及其作答记录仍可在“全部”中查看。`,
    }
  }
}

export function bankQuestionId(bankId, itemId) {
  return `bank:${bankId}:${itemId}`
}
