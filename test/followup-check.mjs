import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const root=await mkdtemp(join(tmpdir(),'dq-followup-check-'))
let calls=0,gate,started,fail=false
const ctx={get(name){return name==='agentDefaultModel'?{currentSelection:()=>({provider:'test',model:'test'})}:name==='llm'?{
  async *stream(){calls++;started?.resolve();if(gate)await gate.promise;if(fail)throw new Error('模拟断网');yield {type:'text-delta',text:'这是独立的测试回复'}},
}:undefined}}
const service=new DailyQuestionService(ctx);service.store=new Store(root)
const args={qid:'q',message:'请解释这道题',clientMessageId:'message'}
try {
  await service.store.update(d=>{
    d.questions.q={id:'q',stem:'测试题干',options:[],currentAnswer:{answer:'答案',explanation:'解析'}}
    d.threads.q={messages:[{id:'interrupted',role:'user',text:'重启中断的提问',status:'pending'}]}
  })
  await service.init()
  assert.equal((await service.getQuestion({qid:'q'})).thread.messages[0].status,'failed','重启遗留任务显示为可重试')
  await service.followup({...args,clientMessageId:'interrupted'})
  assert.equal(calls,1);assert.equal((await service.data()).threads.q.messages.length,2)
  await service.clearThread({qid:'q'})
  gate=deferred();started=deferred()
  const first=service.followup(args),second=service.followup(args)
  await started.promise;assert.equal(calls,2,'同一消息并发只调用一次模型')
  gate.resolve();await Promise.all([first,second])
  assert.equal((await service.data()).threads.q.messages.filter(m=>m.role==='assistant').length,1)
  assert((await service.followup(args)).duplicated);assert.equal(calls,2)

  await service.clearThread({qid:'q'});gate=deferred();started=deferred()
  const late=service.followup({...args,clientMessageId:'late'}).then(()=>false,()=>true)
  await started.promise;await service.clearThread({qid:'q'});gate.resolve()
  assert(await late,'清空后迟到回复必须失效')
  assert.deepEqual((await service.data()).threads.q.messages,[])
  assert.equal(service.inflightFollowups.size,0)

  gate=null;fail=true
  await assert.rejects(service.followup(args),/模拟断网/)
  assert.equal((await service.data()).threads.q.messages[0].status,'failed')
  fail=false;await service.followup(args)
  const messages=(await service.data()).threads.q.messages
  assert.equal(messages.length,2);assert.equal(messages[0].status,'sent')
  console.log('ok   追问生命周期：重启恢复、并发去重、成功幂等、失败重试及清空后迟到回复丢弃')
} finally {await rm(root,{recursive:true,force:true})}
