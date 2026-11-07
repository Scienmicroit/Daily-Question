import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'

const root=await mkdtemp(join(tmpdir(),'dq-attempt-binding-'))
const service=new DailyQuestionService({get:()=>undefined});service.store=new Store(root)
try {
  await service.store.update(d=>{for(const id of ['q','other'])d.questions[id]={id,type:'solution',stem:'测试题目',currentAnswer:{answer:'答案'}}})
  const a=await service.reveal({qid:'q',mode:'done',attemptId:'tab-a'})
  const b=await service.reveal({qid:'q',mode:'done',attemptId:'tab-b'})
  assert.equal(a.question.lastAttempt.id,'tab-a');assert.equal(b.question.lastAttempt.id,'tab-b')
  const result=await service.judge({qid:'q',attemptId:'tab-a',verdict:'correct'})
  assert.equal(result.question.lastAttempt.id,'tab-a');assert.equal(result.question.lastAttempt.result,'correct')
  assert.equal((await service.data()).attempts.find(a=>a.id==='tab-b').result,'pending')
  assert((await service.judge({qid:'q',attemptId:'tab-a',verdict:'correct'})).duplicated)
  for(const args of [{qid:'q',verdict:'wrong'},{qid:'q',attemptId:'tab-a',verdict:'wrong'},
    {qid:'other',attemptId:'tab-b',verdict:'correct'},{qid:'q',attemptId:'missing',verdict:'correct'}])await assert.rejects(service.judge(args))
  assert.equal((await service.judge({qid:'q',attemptId:'tab-b',verdict:'wrong'})).question.lastAttempt.id,'tab-b')
  await service.store.update((draft) => {
    draft.questions.choice = { id: 'choice', type: 'single', stem: '测试选项提交',
      options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }], currentAnswer: { answer: 'A', answerKey: 'A' } }
  })
  const original = { qid: 'choice', choice: 'A', attemptId: 'lost-response' }
  await service.reveal(original)
  await service.reveal({ ...original, choice: 'B', attemptId: 'other-tab' })
  assert((await service.reveal(original)).duplicated)
  await assert.rejects(service.reveal({ ...original, choice: 'B' }), { code: 'ATTEMPT_CONFLICT' })
  await assert.rejects(service.reveal({ ...original, mode: 'giveup' }), { code: 'ATTEMPT_CONFLICT' })
  const readback = (await service.getQuestion(original)).question
  assert.equal(readback.lastAttempt.id, original.attemptId)
  assert.equal(readback.lastAttempt.choice, 'A')
  assert.equal(readback.attemptCount, 2)
  assert.equal((await service.getQuestion({ ...original, attemptId: 'unknown' })).question.lastAttempt, null)
  console.log('ok   判分绑定作答ID：双标签隔离、自己的结果、幂等重试及拒绝缺ID/串题/改判')
} finally {await rm(root,{recursive:true,force:true})}
