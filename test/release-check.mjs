import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const pkg=JSON.parse(await fs.readFile('package.json','utf8'))
const archive=path.resolve(process.argv[2]||`dist/daily-question-${pkg.version}.tgz`)
const listing=spawnSync('tar',['-tf',archive],{encoding:'utf8'})
assert.equal(listing.status,0)
const files=listing.stdout.trim().split(/\r?\n/)
assert(files.every(file=>file.startsWith('package/')&&!file.includes('..')&&!/\/(?:test|dist|ui|scripts|docs|data\.json|\.env|\.npmrc)(?:\/|$)/.test(file)))
for(const file of files) {
  const content=spawnSync('tar',['-xOf',archive,file],{maxBuffer:8*1024*1024})
  assert.equal(content.status,0)
  assert.deepEqual(content.stdout,await fs.readFile(file.slice(8)),file+'与当前源码不一致')
}
for(const file of ['lib/pdf-worker.js','lib/generation-history.js','lib/references.js','lib/reference-cache.js','lib/updates.js','CHANGELOG.md'])assert(files.includes('package/'+file))
for(const file of ['lib/research.js','lib/reference-reader.js','lib/reference-sources.js']) assert(!files.includes('package/'+file))
const root=await fs.mkdtemp(path.join(os.tmpdir(),'dq-release-check-'))
try {
  assert.equal(spawnSync('tar',['-xf',archive,'-C',root]).status,0)
  const packageRoot=path.join(root,'package')
  await fs.cp('test',path.join(packageRoot,'test'),{recursive:true})
  await fs.cp('ui',path.join(packageRoot,'ui'),{recursive:true})
  const packed=JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8'))
  assert.equal(packed.version,pkg.version)
  const result=spawnSync(process.execPath,['--test','--test-reporter=tap','test/run.mjs'],{cwd:packageRoot,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024})
  if(result.error)throw result.error
  if(result.status!==0)throw new Error(result.stdout.slice(-4000)+'\n'+result.stderr.slice(-2000))
  const passed=Number(/^# tests (\d+)$/m.exec(result.stdout)?.[1])
  assert(passed>0,'安装包回归测试没有运行')
  const bytes=await fs.readFile(archive)
  const report={version:pkg.version,files:files.length,bytes:bytes.length,archiveTestsPassed:passed,
    sha256:createHash('sha256').update(bytes).digest('hex'),integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64'),
    checkedAt:new Date().toISOString()}
  await fs.writeFile(archive.replace(/\.tgz$/,'.release.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report))
} finally {
  const resolved=path.resolve(root)
  assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('dq-release-check-'))
  await fs.rm(resolved,{recursive:true,force:true})
}
