import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

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
      targetYear: defaultTargetYear(),
      /** 已启用科目 id，按用户顺序排列。 */
      subjects: [],
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
    /** 年份 -> 经核验/估算的考试日期记录。 */
    examDates: {},
    /** 生成失败、需要用户重试的科目 -> 原因。 */
    failures: {},
  }
}

/** 默认目标年份：若 12 月考试尚未过去则取今年入学，否则取明年。 */
function defaultTargetYear() {
  const now = new Date()
  return now.getMonth() >= 11 ? now.getFullYear() + 2 : now.getFullYear() + 1
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Fill in fields added by a newer plugin version without touching user data. */
function normalize(raw) {
  const base = emptyData()
  if (!isPlainObject(raw)) return base
  const data = { ...base, ...raw }
  data.settings = { ...base.settings, ...(isPlainObject(raw.settings) ? raw.settings : {}) }
  for (const key of ['customSubjects']) {
    if (!Array.isArray(data[key])) data[key] = []
  }
  for (const key of ['questions', 'daily', 'threads', 'examDates', 'failures']) {
    if (!isPlainObject(data[key])) data[key] = {}
  }
  for (const key of ['attempts', 'banks']) {
    if (!Array.isArray(data[key])) data[key] = []
  }
  for (const key of ['subjects', 'subjectSource']) {
    const value = data.settings[key]
    if (key === 'subjects' ? !Array.isArray(value) : !isPlainObject(value)) {
      data.settings[key] = base.settings[key]
    }
  }
  if (!Number.isFinite(data.settings.targetYear)) data.settings.targetYear = base.settings.targetYear
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
    this.lastError = null
  }

  async load() {
    if (this.ready) return this.ready
    this.ready = (async () => {
      try {
        const text = await readFile(this.file, 'utf8')
        this.data = normalize(JSON.parse(text))
      } catch (error) {
        if (error && error.code !== 'ENOENT') {
          // 保留一份坏文件的旁路副本，避免下一次写入把它覆盖成空数据。
          this.lastError = `读取数据文件失败：${error.message}`
          try {
            await mkdir(this.dir, { recursive: true })
            await rename(this.file, `${this.file}.corrupt-${Date.now()}`)
          } catch { /* 旁路备份失败时继续用空数据启动 */ }
        }
        this.data = emptyData()
      }
      return this.data
    })()
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
      this.data = draft
      await this.write()
      return result
    }
    this.queue = this.queue.then(run, run)
    return this.queue
  }

  async write() {
    await mkdir(this.dir, { recursive: true })
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    await rename(tmp, this.file)
  }
}
