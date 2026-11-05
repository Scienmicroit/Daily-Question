import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'
import { todayISO } from '../lib/exam-dates.js'

const root=await mkdtemp(join(tmpdir(),'dq-daily-attempt-'))
const service=new DailyQuestionService({get:()=>undefined});service.store=new Store(root)
const today=todayISO(),yesterday=todayISO(new Date(Date.now()-86400000))
try {
  await service.store.update(d=>{
    d.settings.subjects=['math1']
    d.questions.q={id:'q',subjectId:'math1',type:'solution',stem:'重复分配的题目',assignedDate:yesterday,currentAnswer:{answer:'历史答案',explanation:'历史解析',firstShownAt:yesterday}}
    d.daily[`${today}|math1`]={questionId:'q'}
    d.attempts.push({id:'old',questionId:'q',at:yesterday+'T00:00:00',result:'correct',mode:'done'})
  })
  let result=await service.ensureDaily('math1')
  assert.equal(result.question.answerState,'locked');assert.equal(result.question.answer,null)
  assert.equal(result.question.lastAttempt,null);assert.equal(result.question.todayAttemptCount,0)
  assert.equal(result.question.assignedDate,today);assert.equal(result.question.attemptCount,1,'历史作答保留')
  assert.equal((await service.getQuestion({qid:'q'})).question.answerState,'locked','列表进入今日重复题也不能提前显示历史答案')
  result=await service.reveal({qid:'q',mode:'done',attemptId:'today'})
  assert.equal(result.question.answerState,'revealed');assert.equal(result.question.lastAttempt.id,'today')
  assert.equal(result.question.todayAttemptCount,1);assert.equal((await service.data()).attempts.at(-1).practiceDate,today)
  const reopened=new DailyQuestionService({get:()=>undefined});reopened.store=new Store(root)
  assert.equal((await reopened.ensureDaily('math1')).question.answerState,'revealed','同一天重启保留已查看答案')
  await service.store.update(d=>{d.attempts=d.attempts.filter(a=>a.id!=='today');d.attempts.push({id:'legacy-today',questionId:'q',at:new Date().toISOString(),result:'correct'})})
  assert.equal((await service.ensureDaily('math1')).question.answerState,'revealed','兼容旧格式的当天作答，按宿主时区判断')
  const tomorrow=todayISO(new Date(Date.now()+86400000))
  await service.store.update(d=>{d.daily[`${tomorrow}|math1`]={questionId:'q'}})
  const nextDay=await service.data()
  assert.equal(service.questionView(nextDay,nextDay.questions.q,{date:tomorrow}).answerState,'locked','新一天再次分配同题，不继承今天的完成状态')
  await service.store.update(d=>{delete d.daily[`${today}|math1`]})
  assert.equal((await service.getQuestion({qid:'q'})).question.attemptCount,2,'历史详情保留全部作答记录')
  console.log('ok   今日重复题按练习日锁定答案，旧记录兼容、当日完成持久保留、历史记录不丢失')
} finally {await rm(root,{recursive:true,force:true})}
