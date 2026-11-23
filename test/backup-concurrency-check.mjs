import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Store } from '../lib/store.js'
import { DailyQuestionService } from '../lib/service.js'
import { recognizeFixtureBank } from './bank-parser-fixture.mjs'

const temp = resolve(tmpdir())
const root = await mkdtemp(join(temp, 'dq-backup-'))
const service = new DailyQuestionService({}, { recognizeBank: recognizeFixtureBank })
const store = service.store = new Store(root)
let childCheck
try {
  await service.saveSettings({ subjects: ['math1'] })
  const viewer = new DailyQuestionService({})
  viewer.store = new Store(root)
  const readRaw = viewer.store.readRaw.bind(viewer.store)
  let fullReads = 0
  viewer.store.readRaw = async (...args) => {
    fullReads++
    return readRaw(...args)
  }
  await Promise.all(Array.from({ length: 8 }, () => viewer.store.read()))
  assert.equal(fullReads, 1, '同一版本的并行读取只读取一次完整文件')
  const childCode = `
    import { Store } from ${JSON.stringify(new URL('../lib/store.js', import.meta.url).href)}
    const store = new Store(process.argv[1])
    await store.read()
    console.log('ready')
    await store.update((draft) => { draft.settings.childSaved = true })
  `
  await store.update(async (draft) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', childCode, root], { windowsHide: true })
    child.stdout.resume()
    child.stderr.resume()
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    await Promise.race([
      new Promise((resolve) => child.stdout.once('data', resolve)),
      closed.then((code) => { throw new Error(`子进程提前退出：${code}`) }),
    ])
    childCheck = closed
    draft.questions.q = { id: 'q', subjectId: 'math1', type: 'solution', stem: '保留的题干' }
    draft.attempts.push({ id: 'a', questionId: 'q', result: 'wrong' })
  })
  assert.equal(await childCheck, 0)
  assert.equal((await viewer.data()).settings.childSaved, true, '其他窗口保存后读到最新设置')
  assert.equal((await viewer.data()).attempts[0].id, 'a', '先前的作答与随后保存的设置同时存在')
  const racingReader = new Store(root)
  const readBeforeSave = racingReader.readRaw.bind(racingReader)
  let release, captured
  const pause = new Promise((resolve) => { release = resolve })
  const readStarted = new Promise((resolve) => { captured = resolve })
  racingReader.readRaw = async (...args) => {
    const text = await readBeforeSave(...args)
    captured()
    await pause
    return text
  }
  const pendingRead = racingReader.read()
  await readStarted
  await store.update((draft) => { draft.settings.savedDuringRead = true })
  release()
  assert.equal((await pendingRead).settings.savedDuringRead, true, '读取期间发生原子替换会重新读取')
  const exported = (await service.exportBackup()).data
  assert.equal(exported.settings.childSaved, true)
  assert.equal(exported.attempts[0].id, 'a', '后保存的实例必须保留先保存的作答')

  const imported = await service.importBank({ kind: 'md', subjectId: 'math1',
    text: '## 第 1 题\n本题要求说明函数在给定区间内何时连续。\n\n答案：当左右极限等于函数值。' })
  await service.commitBank({ importId: imported.importId, subjectId: 'math1' })
  await service.saveSettings({ subjectSource: { math1: 'bank' } })
  const other = new DailyQuestionService({})
  other.store = new Store(root)
  try {
    const daily = await Promise.all([service.ensureDaily('math1', { manual: true }), other.ensureDaily('math1', { manual: true })])
    assert.equal(daily[0].question.id, daily[1].question.id)
    assert.equal(daily.filter((result) => result.created).length, 1)
    assert.equal((await service.data()).questions[daily[0].question.id].assignedCount, 1)
  } finally { other.dispose() }

  await service.saveSettings({ deleteSubjectIds: ['math1'] })
  await service.saveSettings({ deleteSubjectIds: ['math1'] })
  assert.equal((await service.data()).questions.q, undefined)
  assert.equal((await viewer.data()).questions.q, undefined, '另一个窗口刷新时读到删除')
  assert.deepEqual((await store.recoveryPoints()).map((point) => point.kind), ['before-delete'])
  await assert.rejects(service.restoreBackup({ data: exported }), /确认/)
  await assert.rejects(service.restoreBackup({ data: { ...exported, questions: { q: null } }, confirmed: true }), /格式无效/)
  await assert.rejects(service.restoreBackup({ data: { ...exported, version: 99 }, confirmed: true }), /高于/)
  assert.equal((await service.data()).questions.q, undefined)

  await service.restoreBackup({ kind: 'before-delete', confirmed: true })
  assert.equal((await service.data()).attempts[0].id, 'a')
  assert.equal((await viewer.getQuestion({ qid: 'q' })).question.id, 'q', '另一个窗口读到恢复的题目')
  assert.equal((await viewer.bootstrap()).counts.math1.all, (await service.bootstrap()).counts.math1.all)
  assert((await store.recoveryPoints()).some((point) => point.kind === 'before-restore'))
  const previous = await readFile(store.backupFile('before-restore'), 'utf8')
  const write = store.persist
  store.persist = async function (text, file) {
    if (!file) throw new Error('模拟正式文件写入失败')
    return write.call(this, text, file)
  }
  try {
    await assert.rejects(service.restoreBackup({ kind: 'before-restore', confirmed: true }), /写入失败/)
    assert.equal(await readFile(store.backupFile('before-restore'), 'utf8'), previous)
    assert.equal((await service.data()).attempts[0].id, 'a')
  } finally { store.persist = write }
  await writeFile(store.file, '{damaged', 'utf8')
  await assert.rejects(service.bootstrap(), { code: 'DATA_INVALID' })
  await service.restoreBackup({ data: exported, confirmed: true })
  assert.equal(await readFile(store.backupFile('before-restore'), 'utf8'), '{damaged')
  assert.equal((await service.bootstrap()).counts.math1.all, 1)
  assert.equal((await viewer.bootstrap()).counts.math1.all, 1, '从文件恢复后另一个窗口刷新计数')
} finally {
  service.dispose()
  assert.equal(dirname(resolve(root)), temp)
  assert(basename(root).startsWith('dq-backup-'))
  await rm(root, { recursive: true, force: true })
}
