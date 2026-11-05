export function abortable(run,signal) {
  if(!signal)return Promise.resolve().then(run)
  signal.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const stop=()=>reject(signal.reason)
    signal.addEventListener('abort',stop,{once:true})
    Promise.resolve().then(()=>{signal.throwIfAborted();return run()}).then(resolve,reject)
      .finally(()=>signal.removeEventListener('abort',stop))
  })
}

export async function withTimeout(run,{signal,timeoutMs,message='任务超时，请重试'}) {
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(Object.assign(new Error(message),{code:'TASK_TIMEOUT'})),timeoutMs)
  const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal
  try{return await abortable(()=>run(combined),combined)}finally{clearTimeout(timer)}
}
