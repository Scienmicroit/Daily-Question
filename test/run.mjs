import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const directory = new URL('./', import.meta.url)
const manual = new Set(['live-check.mjs', 'pdf-check.mjs', 'release-check.mjs'])
const files = readdirSync(directory).filter((name) =>
  (name === 'check.mjs' || name.endsWith('-check.mjs')) && !manual.has(name))
const cwd = fileURLToPath(new URL('../', directory))
for (const name of files) {
  test(name, () => {
    // 独立启动脚本，避免 PDF 工作线程继承 Node 测试运行器的内部参数。
    const file = fileURLToPath(new URL(name, directory))
    const result = spawnSync(process.execPath, [file], { cwd, encoding: 'utf8', timeout: 120_000 })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'))
  })
}
