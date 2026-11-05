import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { liveHost } from './live-host.mjs'
import { createVerifiedQuestion, verifyQuestion } from '../lib/generate.js'
import { findSubject, REFERENCE_EXAMS } from '../lib/subjects.js'
import { readReferencePage } from '../lib/reference-reader.js'

const subjectId=process.argv[2] || 'math1'
assert(['math1','cs408','auto408'].includes(subjectId),'联网验收科目只支持 math1、cs408 或 auto408')
const reference=REFERENCE_EXAMS.find((s)=>s.id===(subjectId==='auto408'?'cs408':subjectId))
const subject=subjectId==='math1' ? findSubject(subjectId) : {id:'custom_live_'+subjectId,name:reference.name,code:subjectId==='auto408'?'408':'',types:['single','solution'],outline:[],guidance:'',custom:true,referenceSubjectId:subjectId==='auto408'?'auto':subjectId}
const host = await liveHost()
const report = {at:new Date().toISOString(),subject:{id:subject.id,name:subject.name,referenceSubjectId:subject.referenceSubjectId || subject.id},model:host.ctx.get('agentDefaultModel').currentSelection(),checks:{}}
try {
  const pdf = await readReferencePage({ctx:host.ctx,source:{url:'https://www.neea.edu.cn/res/Home/2308/1dc2cadc9383c5d8bd16dfb3166e63cf.pdf',title:'教育综合考试大纲，仅测试PDF读取，不参与命题'},signal:AbortSignal.timeout(60000)})
  assert.equal(pdf.extraction,'pdf-text');assert(pdf.text.includes('教育综合考试大纲'));assert(pdf.text.length>1000)
  report.checks.pdf={passed:true,coverage:pdf.coverage,chars:pdf.text.length,warnings:pdf.warnings}
  const examInfo={year:2027}
  const generated=await createVerifiedQuestion({ctx:host.ctx,subject,examInfo,preferredType:'single',signal:AbortSignal.timeout(600000)})
  assert.equal(generated.verification.status,'passed')
  assert.equal(generated.question.examAlignment.status,'passed')
  assert(new Set(generated.question.examAlignment.sources.filter((s)=>s.kind==='paper').map((s)=>s.year)).size>=2)
  if (subjectId === 'cs408') {
    const sources=generated.question.examAlignment.sources
    assert(sources.filter((s)=>s.kind==='paper').every((s)=>s.extraction==='vision'&&s.imageUrls.length===9),'408验收必须覆盖两年试卷全部9张图片')
    const outline=sources.find((s)=>s.kind==='outline')
    assert.equal(outline.extraction,'cross-checked-transcription')
    assert.equal(outline.provenance.publisherOriginalVerified,false,'转载核对不得冒充原书认证')
  }
  if(subjectId==='auto408') {
    assert(generated.question.examAlignment.research?.rounds>=1)
    assert(generated.question.examAlignment.sources.every((s)=>s.provenance?.method==='autonomous-research-independent-audit'),'自主流程不能偷偷使用人工预置来源跳过审查')
  }
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
  report.searches=host.searches
  report.fetches=host.fetches
  report.calls=host.calls.map(({text,...metadata})=>metadata)
  writeFileSync(join(host.directory,'report.json'),JSON.stringify(report,null,2))
}
