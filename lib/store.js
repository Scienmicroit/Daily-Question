import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
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
  for (const key of ['settings', 'questions', 'daily', 'threads', 'examDates', 'examReferences', 'syllabuses', 'failures']) {
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
    this.ready = null
    this.queue = Promise.resolve()
  }

  async load() {
    if (this.ready) return this.ready
    this.ready = (async () => {
      let text
      try {
        text = await readFile(this.file, 'utf8')
      } catch (error) {
        if (error.code === 'ENOENT') return this.data
        throw new Error(`暂时无法读取学习数据：${error.message}。请检查文件权限或占用情况后重试。`,
          { cause: error })
      }
      try {
        this.data = normalize(JSON.parse(text))
      } catch (error) {
        if (error.code === 'DATA_VERSION_UNSUPPORTED') throw error
        throw Object.assign(new Error(`学习数据格式有误，已保留原文件：${this.file}。请检查文件或从备份恢复。`,
          { cause: error }), { code: 'DATA_INVALID' })
      }
      return this.data
    })().catch((error) => {
      this.ready = null
      throw error
    })
    return this.ready
  }

  async read() {
    await this.load()
    return this.data
  }

  /**
   * Run one mutation and persist it before resolving.
   *
   * The callback works on a deep copy, so a throw leaves both the in-memory
   * state and the file untouched. Mutations are serialized: the next one
   * starts only after the previous write settles.
   */
  update(mutate) {
    const run = async () => {
      const data = await this.read()
      const draft = structuredClone(data)
      const result = await mutate(draft)
      draft.updatedAt = new Date().toISOString()
      await this.write(draft)
      this.data = draft
      return result
    }
    this.queue = this.queue.then(run, run)
    return this.queue
  }

  async write(data) {
    await this.load()
    await mkdir(this.dir, { recursive: true })
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(data ?? this.data, null, 2), 'utf8')
    await rename(tmp, this.file)
  }
}
