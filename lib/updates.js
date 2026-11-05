import { readFileSync } from 'node:fs'

export const PLUGIN_VERSION=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version
export const UPDATE_INTERVAL=6*60*60*1000
const REGISTRY='https://registry.npmjs.org/daily-question/latest'

function versionParts(value) {
  if(typeof value!=='string')throw new Error('npm 返回的版本号无效')
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(value)
  if(!match||match[4]?.split('.').some((p)=>/^0\d+$/.test(p)))throw new Error('npm 返回的版本号无效')
  return {numbers:match.slice(1,4).map(BigInt),pre:match[4]?.split('.')}
}

export function newerVersion(latest,current) {
  const a=versionParts(latest),b=versionParts(current)
  for(let i=0;i<3;i++)if(a.numbers[i]!==b.numbers[i])return a.numbers[i]>b.numbers[i]
  if(!a.pre||!b.pre)return Boolean(!a.pre&&b.pre)
  for(let i=0;i<Math.max(a.pre.length,b.pre.length);i++) {
    const x=a.pre[i],y=b.pre[i]
    if(x===y)continue
    if(x===undefined||y===undefined)return y===undefined
    const nx=/^\d+$/.test(x),ny=/^\d+$/.test(y)
    return nx&&ny?BigInt(x)>BigInt(y):nx!==ny?!nx:x>y
  }
  return false
}

export function createUpdateChecker({fetchImpl=globalThis.fetch,currentVersion=PLUGIN_VERSION,now=Date.now}={}) {
  let cached,pending
  return async ({force=false}={})=>{
    if(pending)return {...await pending}
    if(force!==true&&cached&&now()-cached.at>=0&&now()-cached.at<UPDATE_INTERVAL)return {...cached.result}
    pending=(async()=>{
      try {
        const response=await fetchImpl(REGISTRY,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{accept:'application/json'}})
        if(!response.ok)throw new Error(`npm 服务返回 ${response.status}`)
        const metadata=await response.json()
        if(metadata?.name!=='daily-question')throw new Error('npm 返回的包信息不匹配')
        const updateAvailable=newerVersion(metadata.version,currentVersion)
        const at=now(),result={ok:true,currentVersion,latestVersion:metadata.version,updateAvailable,checkedAt:new Date(at).toISOString(),packageUrl:'https://www.npmjs.com/package/daily-question'}
        cached={at,result}
        return {...result}
      } catch(error) {
        throw new Error(`检查更新失败：${error.name==='TimeoutError'?'连接 npm 超时，请稍后重试':error.message}`)
      }
    })()
    try{return {...await pending}}finally{pending=null}
  }
}
