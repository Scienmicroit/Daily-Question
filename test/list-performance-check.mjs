import assert from 'node:assert/strict'
import { mkdtemp,rm,stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'
import { todayISO } from '../lib/exam-dates.js'

const root=await mkdtemp(join(tmpdir(),'dq-list-performance-'))
const service=new DailyQuestionService({get:()=>undefined});service.store=new Store(root)
try {
  await service.store.update(d=>{
    d.settings.subjects=['math1']
    d.settings.activeSubject='math1'
    d.daily[todayISO()+'|math1']={ subjectId:'math1', questionId:'q1', date:todayISO() }
    for(let i=0;i<5000;i++) {
      const id='q'+i
      d.questions[id]={id,subjectId:'math1',stem:('带公式 $x^2$ 的题干正文。').repeat(100),type:'single',favoriteAt:i%2===0?'yes':null,assignedDate:'2026-11-05'}
      for(let j=0;j<3;j++)d.attempts.push({id:`${id}-${j}`,questionId:id,result:i%5===0?'wrong':'correct'})
    }
    d.banks=[{id:'benchmark',items:Array.from({length:3000},(_,i)=>({
      id:'bank-'+i,type:'fill',stem:'导入题库中的完整练习题及公式 $x^2$。'.repeat(30),
      explanation:'请从定义和题设条件出发，逐步推导。'.repeat(15),
    }))}]
    d.questions.q0.wrongBookRemoved=true;d.questions.q1.wrongBookAdded=true
  })
  const snapshot=await service.data(),attempts=snapshot.attempts
  let scans=0,summaries=0
  const iterator=attempts[Symbol.iterator].bind(attempts)
  Object.defineProperty(attempts,Symbol.iterator,{configurable:true,value:function*(){scans++;yield*iterator()}})
  const summary=service.summaryView.bind(service)
  service.summaryView=(...args)=>{summaries++;return summary(...args)}
  const start=performance.now(),counts=service.counts(snapshot)
  assert.deepEqual(counts.math1,{all:5000,favorite:2500,wrong:1000,review:1000})
  const first=await service.listQuestions({subjectId:'math1'}),second=await service.listQuestions({subjectId:'math1',page:2})
  assert.equal(first.items.length,50);assert.equal(first.totalPages,100);assert.equal(first.total,5000)
  assert.equal(summaries,100);assert.equal(scans,1,'同一数据快照只扫描一次全部作答')
  assert(!first.items.some(item=>second.items.some(other=>item.id===other.id)))
  assert.equal(JSON.stringify(first).length<JSON.stringify(snapshot.questions).length/20,true,'响应不再下发全部题干')
  const anchorId = second.items.at(-1).id
  const located = await service.listQuestions({ subjectId: 'math1', page: 1, anchorId, query: '带公式', type: 'single' })
  assert.equal(located.page, 2, '依据题目定位到当前结果页')
  assert(located.items.some((item) => item.id === anchorId))
  const removed = await service.listQuestions({ subjectId: 'math1', kind: 'favorite', page: 3, anchorId: 'q1' })
  assert.equal(removed.page, 3, '题目退出收藏时保留原来的页码')
  assert(!removed.items.some((item) => item.id === 'q1'))
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
  if (process.argv.includes('--benchmark')) {
    const medianTime = async (run) => {
      await run()
      const times = []
      for (let i = 0; i < 9; i++) {
        const start = performance.now()
        await run()
        times.push(performance.now() - start)
      }
      return Number(times.sort((a, b) => a - b)[4].toFixed(2))
    }
    const operations = {
      startup: async () => {
        const boot = await service.bootstrap({ practiceOnly: true, includeToday: true })
        if (!boot.todayQuestion) {
          await service.ensureDaily(boot.settings.activeSubject)
          await service.bootstrap({ practiceOnly: true })
        }
      },
      detail: () => service.getQuestion({ qid: 'q1' }),
      page: () => service.listQuestions({ subjectId: 'math1', page: 2 }),
      search: () => service.listQuestions({ subjectId: 'math1', query: '带公式' }),
    }
    const milliseconds = {}
    for (const [key, run] of Object.entries(operations)) milliseconds[key] = await medianTime(run)
    const bytes = (await stat(service.store.file)).size
    console.log(JSON.stringify({ fixture: { questions: 5000, attempts: 15001, imported: 3000, bytes }, medianMs: milliseconds }))
  }
} finally {await rm(root,{recursive:true,force:true})}
