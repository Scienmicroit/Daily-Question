import assert from 'node:assert/strict'
import { loadExamReferences, reviewExamFit } from '../lib/references.js'
import { createVerifiedQuestion } from '../lib/generate.js'
import { referenceWeb, referencePages, referenceYear, fitResponse, fillQuotes, outlineQuote, paperQuote1, paperQuote2, generateWithResearch } from './reference-fixture.mjs'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'
import { pdfDocument, stream, twoPages } from './pdf-fixture.mjs'
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
await assert.rejects(generateWithResearch({ ctx:modelContext, subject }), /已阻止发布/)
assert.equal(generated,2); assert.equal(reviews,2)
console.log('ok   即使答案一致，范围难度不合格仍重新命题，两轮不合格则不发布')

const choiceOnly = referencePages.slice(1).map((page) => ({...page,text:page.text.split('\n二、填空题：')[0]}))
const fillOnly = referencePages.slice(1).map((page,i) => ({...page,url:page.url+'-full',
  text:page.text.split('\n')[0]+'\n二、填空题：'+fillQuotes[i]}))
function typedRun({initial,extra=[],outlines=[referencePages[0]],fitOverride,scopeOverride,stemPrefix='本轮第'}={}) {
  const calls = [], searches = []
  const allPages = [...outlines,...initial,...extra]
  const web = referenceWeb(allPages)
  const ctx = { get(name) {
    if (name==='web') return {...web, search:async ({query}) => {
      searches.push(query)
      return {sources:(query.includes('完整试卷') ? extra : [...outlines,...initial]).map(({title,url})=>({title,url}))}
    }}
    if (name==='agentDefaultModel') return { currentSelection:() => ({provider:'test',model:'test'}) }
    if (name==='llm') return { async *stream({system,messages}) {
      const prompt = messages[0].content[0].text
      let reply
      if (system.includes('范围与难度评审员')) {
        const payload = JSON.parse(prompt)
        calls.push({role:'difficulty',payload})
        const type = payload.question.type
        const response = fitResponse(type)
        response.paperEvidence = payload.references.sources.filter((s)=>s.kind==='paper').map((source,i) => ({
          sourceId:source.id,quote:response.paperEvidence[i].quote,
        }))
        reply = {...response,coverageMatched:true,...fitOverride}
      } else if (system.includes('考研范围评审员')) {
        const payload = JSON.parse(prompt)
        calls.push({role:'scope',payload})
        const local = payload.references.sources.find((source)=>source.local)
        reply = {...fitResponse(),coverageMatched:true,...(local ? {outlineEvidence:[{sourceId:local.id,quote:local.text.split('\n')[0]}]} : {}),...scopeOverride}
      } else if (system.includes('独立解题专家')) {
        calls.push({role:'solve',payload:JSON.parse(prompt)})
        reply = {...candidate,solvable:true,issues:[]}
      } else if (system.includes('答案比对专家')) {
        reply = {agree:true,writerValid:true,solverValid:true,issues:[]}
      } else {
        const type = /"targetType":"([^"]+)"/.exec(prompt)[1]
        calls.push({role:'writer',type})
        reply = {...candidate,type,stem:stemPrefix+calls.filter((call)=>call.role==='writer').length+'题：'+candidate.stem}
      }
      yield {type:'text-delta',text:JSON.stringify(reply)}
    }}
  }}
  return {run:() => generateWithResearch({ctx,subject:{...subject,types:['single','fill']},preferredType:'fill'}),ctx,calls,searches}
}
const supplemented = typedRun({initial:choiceOnly,extra:fillOnly})
const filled = await supplemented.run()
assert(supplemented.searches.filter((q)=>q.includes('真题')).every((q)=>q.includes('填空题')))
assert(supplemented.searches.some((q)=>q.includes('完整试卷')))
assert.equal(filled.question.type,'fill')
assert.equal(filled.question.examAlignment.status,'passed')
const checked = supplemented.calls.find((call)=>call.role==='difficulty').payload.references.sources.filter((s)=>s.kind==='paper')
assert.deepEqual(checked.map((s)=>s.year),[referenceYear-1,referenceYear-2])
assert(checked.every((source)=>source.text.includes('填空题')&&!source.text.includes('选择题')))
assert.deepEqual(Object.keys(supplemented.calls.find((call)=>call.role==='solve').payload).sort(),['options','stem'])
const switched = typedRun({initial:choiceOnly,extra:[fillOnly[0],{...fillOnly[0],url:fillOnly[0].url+'-mirror'}]})
const changed = await switched.run()
assert.equal(changed.question.type,'fill','真题不足时仍按原计划题型出题')
assert.equal(changed.question.examAlignment.status,'difficulty-unverified','同一年两个来源不能支持难度校验')
const sparse = typedRun({initial:[choiceOnly[0]]})
const downgraded = await sparse.run()
assert.equal(downgraded.question.type,'fill')
assert.equal(downgraded.question.examAlignment.status,'difficulty-unverified')
assert.match(downgraded.question.examAlignment.note,/未进行真题难度校验/)
assert.deepEqual(downgraded.question.examAlignment.paperEvidence,[])
assert(!sparse.calls.some((call)=>call.role==='difficulty'))
assert(sparse.calls.find((call)=>call.role==='scope').payload.references.sources.every((s)=>s.kind==='outline'))
const incomplete = typedRun({initial:referencePages.slice(1),fitOverride:{inScope:true,examComparable:false,difficultyUnavailable:true,issues:['真实题干缺页']}})
assert.equal((await incomplete.run()).question.examAlignment.status,'difficulty-unverified')
assert(incomplete.calls.some((call)=>call.role==='scope'))
await assert.rejects(typedRun({initial:[choiceOnly[0]],scopeOverride:{inScope:false,issues:['超出大纲']}}).run(),/已阻止发布/)
console.log('ok   定向检索和补检、同题型两年对照、证据不足标记及大纲失败拦截')

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
  await service.store.update((data)=>{ data.questions.q.examAlignment=downgraded.question.examAlignment })
  assert.equal((await service.getQuestion({qid:'q'})).question.examAlignment.status,'difficulty-unverified')
  assert.equal((await service.listQuestions({subjectId:'math1'})).items[0].difficultyUnverified,true)
  console.log('ok   保存来源供检查，但未作答时不泄露可能含答案的评审依据')
} finally {
  assert(resolve(temp).startsWith(resolve(tmpdir())+sep)); await rm(temp,{recursive:true,force:true})
}

const cacheDir=await mkdtemp(join(tmpdir(),'daily-question-manual-references-'))
let dailyService
try {
  const initial=typedRun({initial:referencePages.slice(1)})
  dailyService=new DailyQuestionService(initial.ctx,{taskTimeoutMs:1000})
  dailyService.store=new Store(cacheDir)
  await dailyService.saveSettings({subjects:['math1'],subjectSource:{math1:'online'}})
  await dailyService.store.update((data)=>{
    data.examReferences[JSON.stringify(['math1','数学一','301'])]={snapshot:{sources:[
      {...oldOutline,kind:'outline'},...referencePages.slice(1).map((paper,i)=>({...paper,kind:'paper',year:referenceYear-1-i})),
    ]}}
  })
  const first=await dailyService.ensureDaily('math1')
  assert(first.created)
  assert.equal(first.question.examAlignment.scopeBasis,'built-in')
  assert.equal(first.question.examAlignment.status,'difficulty-unverified')
  assert.equal((await dailyService.listQuestions({subjectId:'math1'})).items[0].difficultyUnverified,true)
  assert.match(first.question.examAlignment.note,/未进行考试大纲校验/)
  assert(!first.question.examAlignment.sources.some((source)=>source.url),'旧联网大纲和真题不可用于出题')
  assert.deepEqual(initial.searches,[])
  await dailyService.importSyllabus({subjectId:'math1',kind:'md',fileName:'我的数学一.md',text:outlineQuote})
  await assert.rejects(dailyService.importSyllabus({subjectId:'math1',kind:'md',fileName:'空文件.txt',text:' '}),/未读取/)
  assert.equal((await dailyService.bootstrap()).syllabuses[0].fileName,'我的数学一.md')
  assert(!Object.hasOwn((await dailyService.bootstrap()).syllabuses[0],'text'))
  const importPaper=(year,text,subjectId='math1',fileName=`${year}.txt`,type='')=>dailyService.importPastPaper({subjectId,year,text,kind:'md',fileName,type})
  const year1=referenceYear-1,year2=referenceYear-2
  await importPaper(year1,choiceOnly[0].text)
  await assert.rejects(importPaper(year2,choiceOnly[0].text),/相同正文已导入/)
  await importPaper(year2,fillOnly[1].text)
  await importPaper(year2,choiceOnly[1].text,'math2')
  const mixed=await dailyService.createDaily(subject,'2090-01-02','2090-01-02|math1')
  assert.equal((await dailyService.getQuestion({qid:mixed.questionId})).question.examAlignment.status,'difficulty-unverified',
    '其他题型和其他科目的同题型真题都不可凑足年份')
  assert(!initial.calls.some((call)=>call.role==='difficulty'))
  await importPaper(year2,choiceOnly[1].text,'math1','新版试卷.txt')
  dailyService.dispose()

  const newer=typedRun({initial:referencePages.slice(1),outlines:[oldOutline,notice],stemPrefix:'第二阶段第'})
  dailyService=new DailyQuestionService(newer.ctx);dailyService.store=new Store(cacheDir)
  const second=await dailyService.createDaily(subject,'2090-01-03','2090-01-03|math1')
  const cached=(await dailyService.getQuestion({qid:second.questionId})).question
  assert.equal(cached.examAlignment.scopeBasis,'imported','重启后使用手动导入的大纲')
  assert.match(cached.examAlignment.note,/我的数学一/)
  assert.equal(cached.examAlignment.status,'passed','已有同题型两年真题时仍进行独立难度校验')
  assert.equal(newer.calls.find((call)=>call.role==='difficulty').payload.references.sources[0].text,outlineQuote)
  const comparedPapers=cached.examAlignment.sources.filter((source)=>source.kind==='paper')
  assert.deepEqual(comparedPapers.map((source)=>source.year),[year1,year2])
  assert(comparedPapers.every((source)=>source.manual && !source.url))
  assert.deepEqual(newer.searches,[])
  const savedPapers=(await dailyService.bootstrap()).pastPapers.filter((paper)=>paper.subjectId==='math1')
  assert.equal(savedPapers.length,2)
  assert.equal(savedPapers.find((paper)=>paper.year===year2).fileName,'新版试卷.txt')
  assert(savedPapers.every((paper)=>!Object.hasOwn(paper,'text')))
  await dailyService.removePastPaper({subjectId:'math1',year:year2})
  assert.equal((await dailyService.bootstrap()).pastPapers.filter((paper)=>paper.subjectId==='math1').length,1)

  const pdfObjects=twoPages()
  pdfObjects.set(4,stream('BT /F1 12 Tf 10 100 Td (Functions limits and derivatives) Tj ET'))
  await dailyService.importSyllabus({subjectId:'math1',kind:'pdf',fileName:'范围.pdf',base64:pdfDocument(pdfObjects).toString('base64')})
  assert.equal((await dailyService.bootstrap()).syllabuses[0].fileName,'范围.pdf')
  await dailyService.removeSyllabus({subjectId:'math1'})
  assert.deepEqual((await dailyService.bootstrap()).syllabuses,[])
  assert.equal((await dailyService.getQuestion({qid:second.questionId})).question.examAlignment.scopeBasis,'imported','已出题目保留当时采用的依据')

  const noScope=typedRun({initial:[]})
  const custom={id:'custom_without_scope',name:'新专业课',types:['single'],outline:[],custom:true,referenceSubjectId:'auto'}
  const noSyllabus=await createVerifiedQuestion({ctx:noScope.ctx,subject:custom,examInfo:{year:referenceYear}})
  assert.equal(noSyllabus.question.examAlignment.scopeBasis,'subject-only')
  assert.equal(noSyllabus.verification.status,'passed')
  assert.deepEqual(noScope.searches,[])
  assert(!noScope.calls.some((call)=>['scope','difficulty'].includes(call.role)))
  await dailyService.saveSettings({subjects:['math1',custom.id],customSubjects:[custom]})
  await importPaper(year1,paperQuote1,custom.id,'单选一.txt','single')
  await importPaper(year2,paperQuote2,custom.id,'单选二.txt','single')
  const customDaily=await dailyService.createDaily(custom,'2090-01-03',`2090-01-03|${custom.id}`)
  const calibrated=(await dailyService.getQuestion({qid:customDaily.questionId})).question.examAlignment
  assert.equal(calibrated.scopeBasis,'subject-only')
  assert.equal(calibrated.status,'passed','无大纲时两年同型真题仍可以独立对照难度')
  assert.deepEqual(calibrated.sources.map((source)=>source.year),[year1,year2])
  assert.equal(newer.calls.filter((call)=>call.role==='difficulty').at(-1).payload.hasScope,false)
  console.log('ok   手动导入真题按科目、年份和题型隔离，跨重启校验，无联网搜索')
} finally {
  dailyService?.dispose()
  await rm(cacheDir,{recursive:true,force:true})
}
console.log('全部通过')
