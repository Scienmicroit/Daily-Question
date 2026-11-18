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
  assert.deepEqual((await store.recoveryPoints()).map((point) => point.kind), ['before-delete'])
  await assert.rejects(service.restoreBackup({ data: exported }), /确认/)
  await assert.rejects(service.restoreBackup({ data: { ...exported, questions: { q: null } }, confirmed: true }), /格式无效/)
  await assert.rejects(service.restoreBackup({ data: { ...exported, version: 99 }, confirmed: true }), /高于/)
  assert.equal((await service.data()).questions.q, undefined)

  await service.restoreBackup({ kind: 'before-delete', confirmed: true })
  assert.equal((await service.data()).attempts[0].id, 'a')
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
} finally {
  service.dispose()
  assert.equal(dirname(resolve(root)), temp)
  assert(basename(root).startsWith('dq-backup-'))
  await rm(root, { recursive: true, force: true })
}
