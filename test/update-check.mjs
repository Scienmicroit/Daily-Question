import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createUpdateChecker, newerVersion, PLUGIN_VERSION, UPDATE_INTERVAL } from '../lib/updates.js'
import { registerRoutes } from '../lib/routes.js'

for(const [latest,current,expected] of [
  ['2.0.1','2.0.0',true],['2.10.0','2.9.0',true],['2.0.0','2.0.0',false],['1.9.0','2.0.0',false],
  ['2.0.0','2.0.0-rc.1',true],['2.0.0-beta','2.0.0',false],['2.0.0-rc.10','2.0.0-rc.2',true],
  ['2.0.0-rc.1','2.0.0-rc',true],['2.0.0-1','2.0.0-alpha',false],['2.0.0+build.2','2.0.0+build.1',false],
])assert.equal(newerVersion(latest,current),expected,`${latest} > ${current}`)
for(const version of ['latest','2.0','02.0.0','2.0.0-01','https://evil.org',null])assert.throws(()=>newerVersion(version,PLUGIN_VERSION))

let at=0,calls=0,mode='ok'
const checker=createUpdateChecker({currentVersion:'2.0.0',now:()=>at,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://registry.npmjs.org/daily-question/latest');assert(options.signal);assert.equal(options.redirect,'error')
  await new Promise(resolve=>setTimeout(resolve,1))
  if(mode==='network')throw new TypeError('fetch failed')
  return {ok:mode!=='http',status:503,json:async()=>mode==='wrong'?{name:'other',version:'9.0.0'}:{name:'daily-question',version:mode==='invalid'?'???':'2.1.0'}}
}})
const first=await Promise.all([checker(),checker({force:true})])
assert.equal(calls,1);assert(first[0].updateAvailable);assert.equal(first[0].currentVersion,'2.0.0')
first[0].latestVersion='tampered';assert.equal((await checker()).latestVersion,'2.1.0');assert.equal(calls,1)
await checker({force:true});assert.equal(calls,2)
at+=UPDATE_INTERVAL;await checker();assert.equal(calls,3)
for(mode of ['network','http','wrong','invalid'])await assert.rejects(checker({force:true}),/检查更新失败/)
mode='ok';assert((await checker({force:true})).ok)

const registrations=[];let received
registerRoutes({register:route=>{registrations.push(route);return ()=>{}}},{checkUpdates:async args=>{received=args;return first[1]}},{info(){}})
const request=Readable.from([Buffer.from(JSON.stringify({op:'checkUpdates',args:{force:true}}))]);request.method='POST';request.headers={host:'localhost',origin:'http://localhost'}
let status,body
await registrations.find(r=>r.path.endsWith('/rpc')).handler(request,{writeHead(code){status=code},end(value){body=JSON.parse(value)}})
assert.equal(status,200);assert.deepEqual(received,{force:true});assert.equal(body.result.latestVersion,'2.1.0')
console.log('ok   npm更新：语义版本、预发布、缓存、并发、手动重查、过期、异常恢复及RPC入口')
