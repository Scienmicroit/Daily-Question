import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { liveHost } from './live-host.mjs'
import { createVerifiedQuestion, verifyQuestion } from '../lib/generate.js'
import { findSubject, REFERENCE_EXAMS } from '../lib/subjects.js'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'
import { dailyExamReferences } from '../lib/reference-cache.js'

const [subjectId = 'math1', outlineFile, ...paperFiles] = process.argv.slice(2)
assert(['math1','cs408'].includes(subjectId),'联网验收科目只支持 math1 或 cs408')
assert(paperFiles.length === 0 || paperFiles.length === 2, '请提供两份不同年份的单选题真题，格式为 年份:文件路径')
const reference=REFERENCE_EXAMS.find((s)=>s.id===subjectId)
const subject=subjectId==='math1' ? findSubject(subjectId) : {id:'custom_live_cs408',name:reference.name,
  types:['single','solution'],outline:[],guidance:'',custom:true,referenceSubjectId:subjectId}
const studyFile = (file) => {
  const fileName = basename(file)
  return /\.pdf$/i.test(fileName) ? { fileName, kind:'pdf', base64:readFileSync(file).toString('base64') }
    : { fileName, kind:'md', text:readFileSync(file,'utf8') }
}
const host = await liveHost()
const service = new DailyQuestionService(host.ctx)
service.store = new Store(join(host.directory, 'data'))
const report = {at:new Date().toISOString(),subject:{id:subject.id,name:subject.name,referenceSubjectId:subject.referenceSubjectId || subject.id},model:host.ctx.get('agentDefaultModel').currentSelection(),checks:{}}
try {
  await service.saveSettings({subjects:[subject.id], customSubjects:subject.custom ? [subject] : []})
  if (outlineFile) await service.importSyllabus({subjectId:subject.id, ...studyFile(outlineFile)})
  const years = new Set()
  for (const entry of paperFiles) {
    const match = /^(\d{4}):(.+)$/.exec(entry)
    assert(match, '真题参数格式为 年份:文件路径')
    const year = Number(match[1])
    assert(!years.has(year), '两份真题必须来自不同年份')
    years.add(year)
    await service.importPastPaper({subjectId:subject.id, year, type:'single', ...studyFile(match[2])})
  }
  const data = await service.data()
  const examInfo={year:data.settings.targetYear}
  const localReferences = dailyExamReferences(subject, examInfo, data.pastPapers, data.syllabuses[subject.id])
  const generated=await createVerifiedQuestion({ctx:host.ctx,subject,examInfo,localReferences,preferredType:'single',signal:AbortSignal.timeout(600000)})
  assert.equal(generated.verification.status,'passed')
  assert.equal(generated.question.examAlignment.status,paperFiles.length ? 'passed' : 'difficulty-unverified')
  if (outlineFile) assert.equal(generated.question.examAlignment.scopeBasis,'imported')
  assert.deepEqual(new Set(generated.question.examAlignment.sources.filter((s)=>s.kind==='paper').map((s)=>s.year)),years)
  report.checks.generation={passed:true,...generated}
  writeFileSync(join(host.directory,'generated.json'),JSON.stringify(generated,null,2))
  // 人工注入错误候选答案，真实调用盲解、比对和主裁，确保分歧分支也经过联网验收。
  const q=generated.question,wrong=q.options.find((o)=>o.key!==q.answerKey).key
  const candidate={...q,answer:wrong,answerKey:wrong,explanation:q.explanation+`\n因此应选${wrong}。`}
  const arbitration=await verifyQuestion({ctx:host.ctx,subject,examInfo,candidate,signal:AbortSignal.timeout(300000)})
  report.checks.arbitration=arbitration
  assert(arbitration.pass)
  assert(arbitration.trail.some((s)=>s.stage==='arbitration'&&s.passed&&s.winner==='solver'))
  assert.equal(arbitration.candidate.answerKey,q.answerKey)
  report.passed=true
  console.log('完整联网验收通过',host.directory)
} catch(error) {
  report.passed=false;report.error=error.message;report.details=error.details
  console.error('联网验收失败',host.directory,error.message);process.exitCode=1
} finally {
  service.dispose()
  report.calls=host.calls.map(({text,...metadata})=>metadata)
  writeFileSync(join(host.directory,'report.json'),JSON.stringify(report,null,2))
}
