import assert from 'node:assert/strict'
import { createUpdateChecker, newerVersion, PLUGIN_VERSION, UPDATE_INTERVAL } from '../lib/updates.js'
import { registerRoutes } from '../lib/routes.js'
import { apply } from '../index.js'

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

const registrations = new Map()
let received
const dispose = registerRoutes({ fetch: { register(route) {
  registrations.set(route.path, route)
  return async () => { registrations.delete(route.path) }
} } }, { checkUpdates: async (args) => { received = args; return first[1] } }, { info() {} })
const path = '/api/daily-question/rpc'
const rpcRoute = registrations.get(path)
assert.deepEqual(rpcRoute.methods, ['POST'])
assert.equal(rpcRoute.requestBody, 'streaming')
const post = (body, headers) => rpcRoute.fetch(new Request('http://localhost' + path, { method: 'POST', body, headers }))
const response = await post(JSON.stringify({ op: 'checkUpdates', args: { force: true } }))
assert.equal(response.status, 200)
assert.deepEqual(received, { force: true })
assert.equal((await response.json()).result.latestVersion, '2.1.0')
assert.equal((await post('{')).status, 400)
assert.equal((await post('{"op":"constructor"}')).status, 400)
assert.equal((await post('{}', { 'content-length': String(61 * 1024 * 1024) })).status, 413)
const chunk = new Uint8Array(1024 * 1024)
let chunksSent = 0
const oversized = new ReadableStream({ pull(controller) {
  if (chunksSent++ < 61) controller.enqueue(chunk)
  else controller.close()
} })
assert.equal((await rpcRoute.fetch(new Request('http://localhost' + path, {
  method: 'POST', body: oversized, duplex: 'half',
}))).status, 413)
for (const asset of ['tex-svg.js', 'a11y/assistive-mml.js', 'newcm/svg/dynamic/arabic.js', 'input/tex/extensions/mathtools.js']) {
  const assetPath = '/api/daily-question/vendor/mathjax-4.1.3/' + asset
  const route = registrations.get(assetPath)
  const head = await route.fetch(new Request('http://localhost' + assetPath, { method: 'HEAD' }))
  assert.equal(head.status, 200)
  assert(head.headers.get('content-length') > 0)
  assert.equal(await head.text(), '')
}
await dispose()
assert.equal(registrations.size, 0)
let injected
apply({ logger: () => ({ info() {}, warn() {} }), effect() {}, inject(services) { injected = services } })
assert.deepEqual(injected, ['connection'], '插件只经宿主鉴权通道注册接口')
console.log('ok   npm更新：语义版本、预发布、缓存、并发、手动重查、过期、异常恢复及RPC入口')
