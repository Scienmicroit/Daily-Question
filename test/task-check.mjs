import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateText } from '../lib/llm-json.js'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'
import { referenceWeb,fitResponse } from './reference-fixture.mjs'

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
let mode='hang',started,gate,modelSignal
const candidate={type:'single',stem:'设函数f(x)=x，求其在零点的导数。',options:[{key:'A',text:'0'},{key:'B',text:'1'}],answer:'B',answerKey:'B',explanation:'依据导数的定义计算差商，线性函数的斜率恒为一，因此在零点的导数也是一。',knowledge:[]}
const ctx={get(name){return name==='web'?referenceWeb():name==='agentDefaultModel'?{currentSelection:()=>({provider:'test',model:'test'})}:name==='llm'?{
  async *stream(options){
    modelSignal=options.signal;started?.resolve()
    if(mode==='hang')await gate.promise
    const response=options.system.includes('范围与难度评审员')?fitResponse():options.system.includes('独立解题专家')?{...candidate,solvable:true,issues:[]}
      :options.system.includes('答案比对专家')?{agree:true,writerValid:true,solverValid:true,issues:[]}:
        {...candidate,type:/"targetType":"([^"]+)"/.exec(options.messages[0].content[0].text)?.[1]||candidate.type}
    yield {type:'text-delta',text:JSON.stringify(response)}
  },
}:undefined}}
gate=deferred()
await assert.rejects(generateText(ctx,{system:'测试不响应取消的模型',prompt:'测试',timeoutMs:20}),/模型调用超时/)
assert(modelSignal.aborted)
const preAborted=new AbortController();preAborted.abort(new Error('预先取消'))
await assert.rejects(generateText(ctx,{system:'测试',prompt:'测试',signal:preAborted.signal}),/预先取消/)

const root=await mkdtemp(join(tmpdir(),'dq-task-check-'))
const service=new DailyQuestionService(ctx,{taskTimeoutMs:100})
service.store=new Store(root)
try {
  await service.store.update(d=>{d.settings.subjects=['math1'];d.settings.subjectSource.math1='online';d.questions.q={...candidate,stem:'已有的其他题目用于验证答案修订，与本次生成题目不同。',id:'q',subjectId:'math1',currentAnswer:{...candidate,verified:true}}})
  for(const kind of ['daily','revise','followup']) {
    mode='hang';gate=deferred();started=deferred()
    const operation=kind==='daily'?service.ensureDaily('math1'):kind==='revise'?service.revise({qid:'q'}):service.followup({qid:'q',message:'解释',clientMessageId:'timeout'})
    const rejected=assert.rejects(operation,/超时/)
    await started.promise;await rejected
    assert.equal(service.tasks.size,0);assert.equal(service.inflightDaily.size,0);assert.equal(service.inflightFollowups.size,0)
    assert(modelSignal.aborted)
    if(kind==='followup')assert.equal((await service.data()).threads.q.messages.at(-1).status,'failed')
    gate.resolve()
  }
  service.taskTimeoutMs=10000
  for(const kind of ['daily','revise','followup']) {
    mode='hang';gate=deferred();started=deferred()
    const operation=kind==='daily'?service.ensureDaily('math1'):kind==='revise'?service.revise({qid:'q'}):service.followup({qid:'q',message:'解释',clientMessageId:'cancel'})
    const rejected=assert.rejects(operation,/取消/)
    await started.promise
    assert.equal((await service.cancelTask({kind,subjectId:'math1',qid:'q',clientMessageId:'cancel'})).cancelled,1)
    await rejected;assert.equal(service.tasks.size,0)
    mode='ok'
    if(kind==='daily')assert((await service.ensureDaily('math1')).created)
    if(kind==='revise')assert((await service.revise({qid:'q'})).question.pendingRevision)
    if(kind==='followup')await service.followup({qid:'q',message:'解释',clientMessageId:'cancel'})
    gate.resolve();await new Promise(r=>setImmediate(r))
    if(kind==='daily')assert.equal(Object.keys((await service.data()).questions).length,2,'取消后的旧模型输出不能发布第二题')
  }
  mode='hang';gate=deferred();started=deferred()
  const stopped=assert.rejects(service.followup({qid:'q',message:'卸载',clientMessageId:'dispose'}),/插件已停止/)
  await started.promise;service.dispose();await stopped;gate.resolve()
  console.log('ok   任务超时与取消：忽略信号的模型、出题/修订/追问总时限、释放占用、重试和卸载终止')
} finally {service.dispose();await rm(root,{recursive:true,force:true})}
