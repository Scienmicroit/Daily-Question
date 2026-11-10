import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { DATA_VERSION, Store } from '../lib/store.js'
import { DailyQuestionService } from '../lib/service.js'

const temp = resolve(tmpdir())
const root = await fs.mkdtemp(join(temp, 'dq-store-recovery-'))
const store = new Store(root)
const service = new DailyQuestionService({})
service.store = store
const originalRead = fs.readFile
const existing = JSON.stringify({ version: DATA_VERSION, attempts: [{ questionId: 'kept' }] })

try {
  const bootstrap = () => service.bootstrap()
  const rejectUpdate = (error) => assert.rejects(store.update(() => {
    assert.fail('未成功读取数据时不能进入保存事务')
  }), error)

  await fs.writeFile(store.file, existing)
  fs.readFile = async (file, ...args) => {
    if (file === store.file) throw Object.assign(new Error('模拟临时权限错误'), { code: 'EACCES' })
    return originalRead(file, ...args)
  }
  syncBuiltinESMExports()
  await assert.rejects(bootstrap(), /暂时无法读取学习数据/)
  await rejectUpdate(/暂时无法读取学习数据/)
  fs.readFile = originalRead
  syncBuiltinESMExports()
  assert.equal(await originalRead(store.file, 'utf8'), existing)
  assert.deepEqual(await fs.readdir(root), ['data.json'])

  for (const [content, code] of [
    ['{', 'DATA_INVALID'],
    ['[]', 'DATA_INVALID'],
    ['{"attempts":{}}', 'DATA_INVALID'],
    ['{"version":"1"}', 'DATA_INVALID'],
    [JSON.stringify({ version: DATA_VERSION + 1, attempts: { newFormat: true } }), 'DATA_VERSION_UNSUPPORTED'],
  ]) {
    await fs.writeFile(store.file, content)
    await assert.rejects(bootstrap(), { code })
    await rejectUpdate({ code })
    await assert.rejects(store.write({}), { code })
    assert.equal(await originalRead(store.file, 'utf8'), content)
    assert.deepEqual(await fs.readdir(root), ['data.json'])
  }

  await fs.writeFile(store.file, existing)
  assert.equal((await bootstrap()).ok, true)
  await store.update((draft) => { draft.settings.activeSubject = 'math2' })
  assert.deepEqual((await new Store(root).read()).attempts, [{ questionId: 'kept' }])
  console.log('ok   学习数据读取、格式和版本错误阻止覆盖；原文件恢复后可在同一实例重新加载')
} finally {
  fs.readFile = originalRead
  syncBuiltinESMExports()
  service.dispose()
  assert.equal(dirname(resolve(root)), temp)
  assert(basename(root).startsWith('dq-store-recovery-'))
  await fs.rm(root, { recursive: true, force: true })
}
