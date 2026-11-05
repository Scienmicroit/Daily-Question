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
assert(files.every(file=>file.startsWith('package/')&&!file.includes('..')&&!/\/(?:test|dist|data\.json|\.env|\.npmrc)(?:\/|$)/.test(file)))
for(const file of files) {
  const content=spawnSync('tar',['-xOf',archive,file],{maxBuffer:8*1024*1024})
  assert.equal(content.status,0)
  assert.deepEqual(content.stdout,await fs.readFile(file.slice(8)),file+'与当前源码不一致')
}
for(const file of ['lib/pdf-worker.js','lib/generation-history.js','lib/research.js','lib/updates.js','CHANGELOG.md'])assert(files.includes('package/'+file))
const root=await fs.mkdtemp(path.join(os.tmpdir(),'dq-release-check-'))
try {
  assert.equal(spawnSync('tar',['-xf',archive,'-C',root]).status,0)
  const packageRoot=path.join(root,'package')
  await fs.cp('test',path.join(packageRoot,'test'),{recursive:true})
  const packed=JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8'))
  assert.equal(packed.version,pkg.version)
  let passed=0
  for(const command of packed.scripts.test.split(' && ')) {
    assert(/^node test\/[a-z0-9-]+\.mjs$/.test(command))
    const result=spawnSync(process.execPath,[command.slice(5)],{cwd:packageRoot,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024})
    if(result.status!==0)throw new Error(command+'\n'+result.stdout.slice(-4000)+'\n'+result.stderr.slice(-2000))
    passed++
  }
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
