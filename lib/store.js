import { mkdir, readFile, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { todayISO, yearOptions } from './exam-dates.js'
import { RETIRED_SUBJECTS, migrateSubjectReference } from './subjects.js'

/** Bump when the persisted shape changes incompatibly. */
export const DATA_VERSION = 1

/**
 * Resolve the directory that owns this user's study data.
 *
 * The file lives outside the session workspace on purpose: it must survive
 * plugin reinstalls, workspace switches and session deletion, and it must not
 * be rewritten by agent tools. `DSH_DAILY_QUESTION_DATA_DIR` overrides the
 * location.
 */
export function resolveDataDir() {
  if (process.env.DSH_DAILY_QUESTION_DATA_DIR) return process.env.DSH_DAILY_QUESTION_DATA_DIR
  if (process.env.DSH_PROFILE_DIR) return path.join(process.env.DSH_PROFILE_DIR, 'daily-question')
  return path.join(process.env.DSH_HOME || path.join(homedir(), '.dsh'), 'daily-question')
}

export function emptyData() {
  const now = new Date().toISOString()
  return {
    version: DATA_VERSION,
    createdAt: now,
    updatedAt: now,
    settings: {
      /** 目标考研年份（入学年份），例如 2028 表示 2028 年入学。 */
      targetYear: yearOptions()[0],
      /** 已启用科目 id，按用户顺序排列。 */
      subjects: [],
      deletedSubjects: [],
      /** 科目 id -> 'online' | 'bank' | 'auto' */
      subjectSource: {},
      dailySchedule: {},
      dailySkippedDates: [],
      memoryEnabled: false,
      memoryReinforce: false,
      /** 上次查看的科目。 */
      activeSubject: null,
    },
    /** 用户自定义科目的定义（可选扩展）。 */
    customSubjects: [],
    /** qid -> Question（只保存已经正式出过的题）。 */
    questions: {},
    /** `${date}|${subjectId}` -> 今日题目分配记录。 */
    daily: {},
    /** 作答记录（题目与作答分离，支持一题多次作答）。 */
    attempts: [],
    studyMemory: {},
    /** qid -> { threadId, messages: Message[], updatedAt } */
    threads: {},
    /** 导入的题库。 */
    banks: [],
    /** 科目 id -> 用户导入的大纲正文和文件信息。 */
    syllabuses: {},
    /** 用户按科目及年份导入的真题。 */
    pastPapers: [],
    /** 年份 -> 经核验/估算的考试日期记录。 */
    examDates: {},
    /** 旧版联网资料，保留供数据兼容。 */
    examReferences: {},
    /** 生成失败、需要用户重试的科目 -> 原因。 */
    failures: {},
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Fill in fields added by a newer plugin version without touching user data. */
function normalize(raw) {
  if (!isPlainObject(raw)) throw new Error('数据文件格式不正确，根节点应为对象')
  if (Object.hasOwn(raw, 'version')) {
    if (!Number.isSafeInteger(raw.version) || raw.version < 1) throw new Error('数据文件的格式版本无效')
    if (raw.version > DATA_VERSION) {
      throw Object.assign(new Error(`数据文件版本 ${raw.version} 高于当前支持的版本 ${DATA_VERSION}，请升级插件后重试`),
        { code: 'DATA_VERSION_UNSUPPORTED' })
    }
  }
  const base = emptyData()
  const data = { ...base, ...raw }
  for (const key of ['settings', 'questions', 'daily', 'threads', 'examDates', 'examReferences', 'syllabuses', 'failures', 'studyMemory']) {
    if (!isPlainObject(data[key])) throw new Error(`数据字段 ${key} 应为对象`)
  }
  for (const key of ['customSubjects', 'attempts', 'banks', 'pastPapers']) {
    if (!Array.isArray(data[key])) throw new Error(`数据字段 ${key} 应为数组`)
  }
  data.settings = { ...base.settings, ...data.settings }
  for (const key of ['subjects', 'deletedSubjects']) {
    if (!Array.isArray(data.settings[key])) throw new Error(`数据字段 settings.${key} 应为数组`)
  }
  if (!isPlainObject(data.settings.subjectSource)) throw new Error('数据字段 settings.subjectSource 应为对象')
  if (!isPlainObject(data.settings.dailySchedule)) throw new Error('数据字段 settings.dailySchedule 应为对象')
  if (!Object.hasOwn(raw.settings || {}, 'dailySkippedDates')) {
    data.settings.dailySkippedDates = [...new Set(Object.values(data.settings.dailySchedule)
      .flatMap((schedule) => Array.isArray(schedule?.skippedDates) ? schedule.skippedDates : []))]
  }
  if (!Array.isArray(data.settings.dailySkippedDates)) throw new Error('数据字段 settings.dailySkippedDates 应为数组')
  for (const schedule of Object.values(data.settings.dailySchedule)) {
    if (isPlainObject(schedule)) delete schedule.skippedDates
  }
  data.settings.subjects = data.settings.subjects.filter((id) => !RETIRED_SUBJECTS.has(id))
  if (RETIRED_SUBJECTS.has(data.settings.activeSubject)) {
    data.settings.activeSubject = data.settings.subjects[0] || null
  }
  data.customSubjects = data.customSubjects.map(migrateSubjectReference)
  if (!Number.isFinite(raw.settings?.targetYear)) data.settings.targetYear = yearOptions(todayISO(), data.examDates)[0]
  data.version = DATA_VERSION
  return data
}

/**
 * Single-file JSON store with serialized, atomic (write + rename) persistence.
 *
 * Every mutation goes through `update()` so a concurrent reader never observes
 * a half-written file, and a failed write surfaces to the caller instead of
 * being swallowed.
 */
export class Store {
  constructor(dir = resolveDataDir()) {
    this.dir = dir
    this.file = path.join(dir, 'data.json')
    this.data = emptyData()
    this.raw = undefined
    this.snapshotVersion = undefined
    this.pendingRead = null
    this.lock = path.join(dir, '.write-lock')
    this.queue = Promise.resolve()
  }

  async fileVersion(file = this.file) {
    try {
      const { dev, ino, size, mtimeNs, ctimeNs } = await stat(file, { bigint: true })
      return `${dev}:${ino}:${size}:${mtimeNs}:${ctimeNs}`
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw new Error(`暂时无法读取学习数据：${error.message}。请检查文件权限或占用情况后重试。`, { cause: error })
    }
  }

  async load() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const version = await this.fileVersion()
      if (version === this.snapshotVersion) return this.data
      const pending = this.pendingRead?.version === version ? this.pendingRead
        : (this.pendingRead = { version, promise: this.readSnapshot(version) })
      try {
        const data = await pending.promise
        if (data) return data
      } finally {
        if (this.pendingRead === pending) this.pendingRead = null
      }
    }
    throw Object.assign(new Error('学习数据正在更新，请稍后重试'), { code: 'DATA_BUSY' })
  }

  async readSnapshot(version) {
    let text
    try { text = await this.readRaw() }
    catch (error) {
      throw new Error(`暂时无法读取学习数据：${error.message}。请检查文件权限或占用情况后重试。`, { cause: error })
    }
    // 另一实例可能在读取过程中原子替换文件，版本与内容必须对应。
    if (version !== await this.fileVersion()) return null
    try {
      const data = text === this.raw ? this.data : text === null ? emptyData() : normalize(JSON.parse(text))
      this.raw = text
      this.data = data
      this.snapshotVersion = version
      return data
    } catch (error) {
      if (error.code === 'DATA_VERSION_UNSUPPORTED') throw error
      throw Object.assign(new Error(`学习数据格式有误，已保留原文件：${this.file}。请检查文件或从备份恢复。`,
        { cause: error }), { code: 'DATA_INVALID' })
    }
  }

  read() {
    return this.load()
  }

  async readRaw(file = this.file) {
    try { return await readFile(file, 'utf8') }
    catch (error) { if (error.code === 'ENOENT') return null; throw error }
  }

  transaction(run) {
    const locked = async () => {
      await mkdir(this.dir, { recursive: true })
      const deadline = Date.now() + 3000
      while (true) {
        try { await mkdir(this.lock); break }
        catch (error) {
          if (error.code !== 'EEXIST') throw error
          if (Date.now() >= deadline) {
            throw Object.assign(new Error(`学习数据正在被占用，请稍后重试。若所有宿主都已关闭且仍无法保存，请检查写入锁：${this.lock}`),
              { code: 'DATA_BUSY' })
          }
          await new Promise((resolve) => setTimeout(resolve, 40))
        }
      }
      try { return await run() }
      finally { await rmdir(this.lock) }
    }
    this.queue = this.queue.then(locked, locked)
    return this.queue
  }

  /**
   * Run one mutation and persist it before resolving.
   *
   * The callback works on a deep copy, so a throw leaves both the in-memory
   * state and the file untouched. Mutations are serialized: the next one
   * starts only after the previous write settles.
   */
  update(mutate, { backupBefore } = {}) {
    return this.transaction(async () => {
      const data = await this.read()
      const draft = structuredClone(data)
      const result = await mutate(draft)
      draft.updatedAt = new Date().toISOString()
      if (backupBefore?.(data, draft)) await this.persist(JSON.stringify(data, null, 2), this.backupFile('before-delete'))
      const text = JSON.stringify(draft, null, 2)
      this.snapshotVersion = await this.persist(text)
      this.data = draft
      this.raw = text
      return result
    })
  }

  write(data) {
    const expected = this.raw
    return this.transaction(async () => {
      await this.load()
      if (this.raw !== null && expected !== this.raw) throw new Error('学习数据已被另一个实例修改，请重新读取后再保存')
      const text = JSON.stringify(data ?? this.data, null, 2)
      await this.persist(text)
      this.raw = undefined
      this.snapshotVersion = undefined
    })
  }

  backupFile(kind) {
    if (!['before-delete', 'before-restore'].includes(kind)) throw new Error('未知的恢复点')
    return path.join(this.dir, `${kind}.json`)
  }

  async recoveryPoints() {
    const points = await Promise.all(['before-delete', 'before-restore'].map(async (kind) => {
      try {
        const info = await stat(this.backupFile(kind))
        return { kind, at: info.mtime.toISOString() }
      } catch (error) { if (error.code !== 'ENOENT') throw error; return null }
    }))
    return points.filter(Boolean)
  }

  async restore(text, kind) {
    return this.transaction(async () => {
      const contents = kind ? await this.readRaw(this.backupFile(kind)) : text
      if (typeof contents !== 'string') throw new Error('没有可用的备份文件')
      let data
      try {
        const input = JSON.parse(contents)
        if (!isPlainObject(input) || !Object.hasOwn(input, 'version') || !Object.hasOwn(input, 'settings')
            || !Object.hasOwn(input, 'questions') || !Object.hasOwn(input, 'attempts')) throw new Error('缺少学习数据字段')
        data = normalize(input)
        if (!Object.entries(data.questions).every(([id, q]) => isPlainObject(q) && q.id === id && typeof q.stem === 'string'
            && (q.options === undefined || Array.isArray(q.options) && q.options.every(isPlainObject))
            && (q.knowledge === undefined || Array.isArray(q.knowledge))
            && (q.answerVersions === undefined || Array.isArray(q.answerVersions) && q.answerVersions.every(isPlainObject)))
            || !data.attempts.every((a) => isPlainObject(a) && typeof a.questionId === 'string')
            || !data.banks.every((b) => isPlainObject(b) && Array.isArray(b.items) && b.items.every(isPlainObject))
            || !data.pastPapers.every((p) => isPlainObject(p) && typeof p.text === 'string')
            || !Object.values(data.syllabuses).every((s) => isPlainObject(s) && typeof s.text === 'string')
            || !Object.values(data.threads).every((t) => isPlainObject(t) && Array.isArray(t.messages)
              && t.messages.every(isPlainObject))) {
          throw new Error('备份中的题目、作答、题库、资料或追问格式无效')
        }
      } catch (error) {
        throw new Error(`无法恢复学习数据：${error.message}`, { cause: error })
      }
      const previous = await this.readRaw()
      data.restoreToken = randomUUID()
      // 已恢复的追问快照可能曾在另一窗口生成。使迟到的回复失效。
      for (const thread of Object.values(data.threads)) {
        thread.generation = randomUUID()
        for (const message of thread.messages) if (message?.status === 'pending') message.status = 'failed'
      }
      const checkpoint = this.backupFile('before-restore')
      // 恢复源就是这个恢复点时，等正式文件写入成功后再轮换它。
      const nextCheckpoint = kind === 'before-restore' && previous !== null
        ? path.join(this.dir, `before-restore-${randomUUID()}.json`) : null
      if (previous !== null) await this.persist(previous, nextCheckpoint || checkpoint)
      const updated = JSON.stringify(data, null, 2)
      try { this.snapshotVersion = await this.persist(updated) }
      catch (error) {
        if (nextCheckpoint) await unlink(nextCheckpoint).catch(() => {})
        throw error
      }
      this.data = data
      this.raw = updated
      if (nextCheckpoint) {
        try { await rename(nextCheckpoint, checkpoint) }
        catch { return { warning: `学习数据已恢复，恢复前的文件保存在：${nextCheckpoint}` } }
      }
      return {}
    })
  }

  async persist(text, file = this.file) {
    const tmp = `${file}.${randomUUID()}.tmp`
    try {
      await writeFile(tmp, text, { encoding: 'utf8', flag: 'wx', flush: true })
      const version = file === this.file ? await this.fileVersion(tmp).catch(() => undefined) : undefined
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(tmp, file)
          break
        } catch (error) {
          // On Windows a concurrent reader can briefly prevent replacing the file.
          if (process.platform !== 'win32' || attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error
          await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)))
        }
      }
      return version ?? undefined
    } catch (error) {
      await unlink(tmp).catch(() => {})
      throw error
    }
  }
}
