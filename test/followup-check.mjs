import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const root=await mkdtemp(join(tmpdir(),'dq-followup-check-'))
let calls=0,gate,started,fail=false
const prompts = []
const reply = '这是独立的测试回复'
const suggestions = ['这个结论可否用反证法证明？', '如果换一个条件，还能沿用这个方法吗？']
let modelText = reply + '\n<<<追问建议>>>\n' + JSON.stringify({ suggestions })
const ctx={get(name){return name==='agentDefaultModel'?{currentSelection:()=>({provider:'test',model:'test'})}:name==='llm'?{
  async *stream({ messages }) {
    calls++
    prompts.push(messages[0].content[0].text)
    started?.resolve()
    if (gate) await gate.promise
    if (fail) throw new Error('模拟断网')
    yield { type: 'text-delta', text: modelText }
  },
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
  const response = await service.followup({...args,clientMessageId:'interrupted'})
  assert.equal(calls,1);assert.equal((await service.data()).threads.q.messages.length,2)
  assert.equal(response.thread.messages[1].text, reply)
  assert.equal(response.thread.suggestions.length, 3)
  assert.deepEqual(response.thread.suggestions.slice(0, 2), suggestions)
  assert.deepEqual((await service.getQuestion({ qid: 'q' })).thread.suggestions, response.thread.suggestions)
  assert.deepEqual((await service.clearThread({qid:'q'})).thread.suggestions, [])
  gate=deferred();started=deferred()
  const first=service.followup(args),second=service.followup(args)
  await started.promise;assert.equal(calls,2,'同一消息并发只调用一次模型')
  const another = new DailyQuestionService(ctx)
  another.store = new Store(root)
  await another.init()
  assert.equal((await another.getQuestion({ qid: 'q' })).thread.messages[0].status, 'pending', '另一实例启动不改动进行中的追问')
  another.dispose()
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
  modelText = '### 选用定理\n这是下一轮回复。\n<<<追问建议>>>\n{'
  const next = await service.followup({ ...args, message: suggestions[0], clientMessageId: 'suggested' })
  assert(next.thread.messages.at(-1).text.endsWith('这是下一轮回复。'))
  assert.equal(next.thread.suggestions.length, 3)
  assert(next.thread.suggestions[0].includes('选用定理'))
  assert(prompts.at(-1).includes(`【老师】${reply}`))
  assert(prompts.at(-1).includes(`【学生】${args.message}`))
  assert(!prompts.at(-1).includes(suggestions[1]))
  console.log('ok   后续建议随回复生成并持久化，清空后丢弃，建议格式异常时保留正文')
  console.log('ok   追问生命周期：重启恢复、并发去重、成功幂等、失败重试及清空后迟到回复丢弃')
} finally {await rm(root,{recursive:true,force:true})}
