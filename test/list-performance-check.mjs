import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'

const root=await mkdtemp(join(tmpdir(),'dq-list-performance-'))
const service=new DailyQuestionService({get:()=>undefined});service.store=new Store(root)
try {
  await service.store.update(d=>{
    d.settings.subjects=['math1']
    for(let i=0;i<5000;i++) {
      const id='q'+i
      d.questions[id]={id,subjectId:'math1',stem:('带公式 $x^2$ 的题干正文。').repeat(100),type:'single',favoriteAt:i%2===0?'yes':null,assignedDate:'2026-11-05'}
      for(let j=0;j<3;j++)d.attempts.push({id:`${id}-${j}`,questionId:id,result:i%5===0?'wrong':'correct'})
    }
    d.questions.q0.wrongBookRemoved=true;d.questions.q1.wrongBookAdded=true
  })
  const snapshot=await service.data(),attempts=snapshot.attempts
  let scans=0,summaries=0
  const iterator=attempts[Symbol.iterator].bind(attempts)
  Object.defineProperty(attempts,Symbol.iterator,{configurable:true,value:function*(){scans++;yield*iterator()}})
  const summary=service.summaryView.bind(service)
  service.summaryView=(...args)=>{summaries++;return summary(...args)}
  const start=performance.now(),counts=service.counts(snapshot)
  assert.deepEqual(counts.math1,{all:5000,favorite:2500,wrong:1000})
  const first=await service.listQuestions({subjectId:'math1'}),second=await service.listQuestions({subjectId:'math1',page:2})
  assert.equal(first.items.length,50);assert.equal(first.totalPages,100);assert.equal(first.total,5000)
  assert.equal(summaries,100);assert.equal(scans,1,'同一数据快照只扫描一次全部作答')
  assert(!first.items.some(item=>second.items.some(other=>item.id===other.id)))
  assert.equal(JSON.stringify(first).length<JSON.stringify(snapshot.questions).length/20,true,'响应不再下发全部题干')
  const ids=await service.listQuestions({subjectId:'math1',kind:'favorite',idsOnly:true})
  assert.equal(ids.ids.length,2500);assert(!('items'in ids))
  assert.equal((await service.listQuestions({subjectId:'math1',kind:'wrong'})).total,1000)
  assert.equal((await service.listQuestions({subjectId:'math1',page:1000})).page,100)
  for(const args of [{page:0},{pageSize:101},{page:NaN},{kind:'invalid'}])await assert.rejects(service.listQuestions({subjectId:'math1',...args}))
  const elapsed=Math.round(performance.now()-start)
  delete attempts[Symbol.iterator]
  const saveStart=performance.now()
  await service.store.update(d=>{d.attempts.push({id:'new',questionId:'q2',result:'wrong'})})
  const saveElapsed=Math.round(performance.now()-saveStart)
  assert.equal(service.counts(await service.data()).math1.wrong,1001,'写入后刷新索引')
  assert.equal(service.counts(snapshot).math1.wrong,1000,'旧快照仍保持原结果')
  console.log(`ok   5000题/15000次作答：索引一次构建、分页与全栏目ID选择、快照失效；统计和多次查询 ${elapsed}ms，原子保存 ${saveElapsed}ms`)
} finally {await rm(root,{recursive:true,force:true})}
