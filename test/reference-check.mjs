import assert from 'node:assert/strict'
import { loadExamReferences, reviewExamFit } from '../lib/references.js'
import { createVerifiedQuestion } from '../lib/generate.js'
import { referenceWeb, referencePages, referenceYear, fitResponse } from './reference-fixture.mjs'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'
import { SUBJECT_CATALOG, REFERENCE_EXAMS, referenceExamFor } from '../lib/subjects.js'
import { CS408_PAPERS } from '../lib/reference-sources.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const subject = { id: 'math1', name: '数学一', code: '301', types: ['single'], outline: [], guidance: '' }
const now = new Date(`${referenceYear-1}-11-05T00:00:00Z`)
const context = (pages) => ({ get: (name) => name === 'web' ? referenceWeb(pages) : undefined })
const load = (pages) => loadExamReferences({ ctx: context(pages), subject, examInfo: { year: referenceYear+1 }, now })
const oldOutline = { ...referencePages[0], url: 'https://www.neea.edu.cn/old-outline',
  title: referencePages[0].title.replace(String(referenceYear),String(referenceYear-1)), text: referencePages[0].text.replaceAll(String(referenceYear),String(referenceYear-1)) }
const references = await load([oldOutline,...referencePages])
assert.equal(references.outlineYear,referenceYear)
assert.equal(references.targetYear,referenceYear+1)
assert.equal(references.sources.length,3)
assert.equal(references.sources[2].official,false)
assert(references.note.includes('不表示已确认'))
console.log('ok   选取读取到的最新大纲，保留年份差异和真题转载身份')

assert(REFERENCE_EXAMS.some((s)=>s.id==='cs408'&&s.code==='408'))
assert(!SUBJECT_CATALOG.some((s)=>s.code==='408'))
const csSubject={...subject,id:'custom_cs',name:'数据结构专项',custom:true,referenceSubjectId:'cs408'}
assert.equal(referenceExamFor(csSubject).code,'408')
const csPages=referencePages.map((p)=>({...p,title:p.title.replaceAll('数学一','计算机学科专业基础'),text:p.text.replaceAll('数学一','计算机学科专业基础').replaceAll('301','408')}))
const queries=[]
const csWeb=referenceWeb(csPages)
const csRefs=await loadExamReferences({ctx:{get:n=>n==='web'?{...csWeb,search:async(req)=>{queries.push(req.query);return csWeb.search(req)}}:undefined},subject:csSubject,now})
assert.equal(csRefs.basisSubject.code,'408');assert.equal(csRefs.basisSubject.name,'计算机学科专业基础')
assert(queries.every((q)=>q.includes('计算机学科专业基础')&&!q.includes('数学一')))
const seededPages=[csPages[0],...CS408_PAPERS.map((p,i)=>({...p,text:csPages[i+1].text.replaceAll(String(referenceYear-i-1),String(p.year))}))]
const seededWeb=referenceWeb(seededPages)
const seededRefs=await loadExamReferences({ctx:{get:n=>n==='web'?{...seededWeb,search:async()=>({sources:[{title:csPages[0].title,url:csPages[0].url}]})}:undefined},subject:csSubject,now})
assert.deepEqual(seededRefs.sources.filter((s)=>s.kind==='paper').map((s)=>s.year),[2024,2023])
const independent={...csSubject,referenceSubjectId:'independent',referenceExamName:'示例大学数据结构',referenceExamCode:'801'}
const independentPages=csPages.map((p)=>({...p,title:p.title.replaceAll('计算机学科专业基础','示例大学数据结构'),text:p.text.replaceAll('计算机学科专业基础','示例大学数据结构').replaceAll('408','801')}))
assert.equal(referenceExamFor(independent).name,'示例大学数据结构')
await assert.rejects(loadExamReferences({ctx:context(independentPages),subject:independent,now}),/自主资料检索/)
const otherSchool=independentPages.map((p)=>({...p,title:p.title.replaceAll('示例大学','其他大学'),text:p.text.replaceAll('示例大学','其他大学')}))
await assert.rejects(loadExamReferences({ctx:context(otherSchool),subject:independent,now}),/自主资料检索/)
assert.equal(referenceExamFor({...independent,referenceExamName:''}),undefined)
console.log('ok   参考目录独立于学习科目，408和独立考试使用自身名称代码检索，不混用其他院校同代码资料')

await assert.rejects(load(referencePages.filter((p) => !p.title.includes('大纲'))), /官方大纲/)
await assert.rejects(load([referencePages[0],referencePages[1]]), /两个年份/)
const sameYear = { ...referencePages[2], title: referencePages[1].title, text: referencePages[1].text }
await assert.rejects(load([referencePages[0],referencePages[1],sameYear]), /两个年份/)
const notice = { ...referencePages[0], text: `数学一 ${referenceYear}年考试大纲出版通知。` + '请购买考试大纲。'.repeat(100) }
await assert.rejects(load([notice,...referencePages.slice(1)]), /官方大纲/)
await assert.rejects(load([oldOutline,notice,...referencePages.slice(1)]), /不能用旧大纲替代/)
const crowded = Array.from({length:8},(_,i)=>({ ...referencePages[1],url:`https://www.neea.edu.cn/same-year-${i}` }))
assert.equal((await load([referencePages[0],...crowded,referencePages[2]])).sources.length,3)
const wrongSubject = referencePages.map((p) => ({ ...p, title: p.title.replaceAll('数学一','数学二'), text: p.text.replaceAll('数学一','数学二').replaceAll('301','302') }))
await assert.rejects(load(wrongSubject), /官方大纲/)
await assert.rejects(load([{ ...referencePages[0], text:oldOutline.text },...referencePages.slice(1)]), /官方大纲/)
const wrongTitle = { ...referencePages[0], title:referencePages[0].title.replace('数学一','数学二') }
await assert.rejects(load([wrongTitle,...referencePages.slice(1)]), /官方大纲/)
const falseOfficial = { ...referencePages[0], url: 'https://www.neea.edu.cn.fake.example/outline' }
await assert.rejects(load([falseOfficial,...referencePages.slice(1)]), /官方大纲/)
const mirroredOutline = { ...referencePages[0], url: 'https://www.eol.cn/outline' }
await assert.rejects(load([mirroredOutline,...referencePages.slice(1)]), /官方大纲/)
await assert.rejects(loadExamReferences({ ctx: { get() {} }, subject, now }), /web 服务/)
await assert.rejects(loadExamReferences({ ctx: context(referencePages), subject: { ...subject, custom: true }, now }), /自主资料检索/)
const controller = new AbortController()
const hanging = loadExamReferences({ subject, now, signal:controller.signal,
  ctx:{ get:()=>({ search:()=>new Promise(()=>{}), fetch:async()=>{} }) } })
controller.abort(new Error('test-cancel'))
await assert.rejects(hanging,/test-cancel/)
console.log('ok   通知、错科目、伪造域名、非官方大纲、单年份真题及缺失 web 均不能作为完整依据')

const candidate = { type: 'single', stem: '计算给定函数在零点的极限，选出正确答案。', options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }],
  answer: 'A', answerKey: 'A', explanation: '从极限定义及已知条件出发，逐步运用极限的性质得到结果，并核对各项条件。', difficulty: 5 }
let lastOptions
function gradingCtx(reply) {
  return { get(name) {
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'test', model: 'test' }) }
    if (name === 'llm') return { async *stream(options) { lastOptions = options; yield { type: 'text-delta', text: JSON.stringify(reply) } } }
  } }
}
const grade = (reply) => reviewExamFit({ ctx: gradingCtx(reply), subject, candidate, references })
assert.equal((await grade(fitResponse())).difficulty,3)
assert.deepEqual((await grade({...fitResponse(),warnings:['已披露的转载身份；本题的范围引用和两年真题对照均已核对']})).warnings,['已披露的转载身份；本题的范围引用和两年真题对照均已核对'])
assert.equal((await grade({...fitResponse(),issues:['资料无法核实'],warnings:['一般提示']})).passed,false)
const payload = JSON.parse(lastOptions.messages[0].content[0].text)
assert(!Object.hasOwn(payload.question,'difficulty'))
assert(!Object.hasOwn(payload.question,'syllabusCheck'))
assert.equal(payload.references.sources.length,3)
for (const mutate of [
  (v) => { v.difficulty=6 }, (v) => { v.difficulty=2.5 }, (v) => { v.examComparable=false }, (v) => { v.inScope=false },
  (v) => { v.rationale='' }, (v) => { v.issues='格式错误' },
  (v) => { v.outlineEvidence[0].quote='模型编造的不存在于大纲中的引用内容' },
  (v) => { v.paperEvidence[0].sourceId='invented-id' },
  (v) => { v.paperEvidence=[v.paperEvidence[0],v.paperEvidence[0]] }, (v) => { v.paperEvidence='invalid' },
]) {
  const bad=fitResponse(); mutate(bad)
  assert.equal((await grade(bad)).passed,false)
}
console.log('ok   独立评分不接收命题自评分；虚构引用、单年份对照、超范围或无依据评分被拒绝')

let generated = 0, reviews = 0
const modelContext = { get(name) {
  if (name === 'web') return referenceWeb()
  if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'test', model: 'test' }) }
  if (name === 'llm') return { async *stream(options) {
    let reply
    if (options.system.includes('独立的考研范围与难度评审员')) { reviews++; reply={ ...fitResponse(), examComparable:false, issues:['技巧与计算负担明显偏离所引真题'] } }
    else if (options.system.includes('独立解题专家')) reply={ ...candidate, solvable:true, issues:[] }
    else if (options.system.includes('答案比对专家')) reply={ agree:true, writerValid:true, solverValid:true, issues:[] }
    else { generated++; reply={ ...candidate, stem:`第${generated}道：`+candidate.stem } }
    yield { type:'text-delta', text:JSON.stringify(reply) }
  } }
} }
await assert.rejects(createVerifiedQuestion({ ctx:modelContext, subject }), /已阻止发布/)
assert.equal(generated,2); assert.equal(reviews,2)
console.log('ok   即使答案一致，范围难度不合格仍重新命题，两轮不合格则不发布')

const temp=await mkdtemp(join(tmpdir(),'daily-question-fit-'))
try {
  const service=new DailyQuestionService({ get() {} }); service.store=new Store(temp)
  await service.store.update((data)=>{ data.questions.q={ ...candidate,id:'q',subjectId:'math1',currentAnswer:{ answer:'A',answerKey:'A',explanation:candidate.explanation },
    examAlignment:{ status:'passed',difficulty:3,rationale:'SECRET_REASON',warnings:['SECRET_WARNING'],outlineEvidence:[{quote:'SECRET_QUOTE'}],paperEvidence:[],
      sources:references.sources.map(({text,...source})=>source) } } })
  const locked=await service.getQuestion({qid:'q'})
  assert(!JSON.stringify(locked).includes('SECRET'))
  assert.equal(locked.question.examAlignment.sources.length,3)
  const shown=await service.reveal({qid:'q',choice:'A',attemptId:'fit-attempt'})
  assert.equal(shown.question.examAlignment.rationale,'SECRET_REASON')
  assert.deepEqual(shown.question.examAlignment.warnings,['SECRET_WARNING'])
  console.log('ok   保存来源供检查，但未作答时不泄露可能含答案的评审依据')
} finally {
  assert(resolve(temp).startsWith(resolve(tmpdir())+sep)); await rm(temp,{recursive:true,force:true})
}
console.log('全部通过')
