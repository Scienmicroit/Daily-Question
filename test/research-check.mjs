import assert from 'node:assert/strict'
import { discoverExamReferences, validateResearchAudit } from '../lib/research.js'
import { referenceExamFor } from '../lib/subjects.js'
import { createVerifiedQuestion } from '../lib/generate.js'
import { publicResearchUrl, referenceLinks } from '../lib/reference-reader.js'

const now=new Date('2026-11-05T00:00:00Z'),examInfo={year:2027}
const subject={id:'custom_research',name:'示例大学数据结构',code:'801',types:['single'],outline:[],guidance:'',custom:true,referenceSubjectId:'auto'}
const basis=referenceExamFor(subject)
const scope='考试内容与考查要求：掌握线性表、树与图的存储结构和基本算法，能够分析时间复杂度与空间复杂度。'
const paper='顺序存储的线性表按下标访问元素，求基本操作的时间复杂度并选择正确答案。 A. O(1) B. O(n) C. O(n²) D. O(log n)'
const docs=[
  {id:'doc-1',url:'https://exam.study.edu.cn/outline',title:'示例大学2027年801数据结构考试大纲',identity:'示例大学2027年801数据结构考试大纲正文',content:scope},
  {id:'doc-2',url:'https://exam.study.edu.cn/2025-paper',title:'示例大学2025年801数据结构真题',identity:'示例大学2025年801数据结构考试真题正文',content:paper},
  {id:'doc-3',url:'https://exam.study.edu.cn/2024-paper',title:'示例大学2024年801数据结构真题',identity:'示例大学2024年801数据结构考试真题正文',content:paper},
].map((d,i)=>({...d,text:d.identity+'\n'+(i?'一、单项选择题：':'')+d.content+'\n'+d.content.repeat(5),extraction:'web-text'}))
function audit() {return {identityVerified:true,needsClarification:'',issues:[],warnings:[],
  identity:{name:'数据结构',examCode:'801',institution:'示例大学',institutionUserText:'示例大学',nationalUnified:false,evidence:{sourceId:'doc-1',quote:docs[0].identity}},
  sources:docs.map((d,i)=>({sourceId:d.id,kind:i?'paper':'outline',year:i?2027-i-1:2027,fullText:true,primarySource:true,identityEvidence:d.identity,contentEvidence:d.content,corroboration:[]}))}}
const validate=(value,documents=docs,exam=basis)=>validateResearchAudit(value,{documents,basis:exam,now,latestYear:2027})
assert.equal(validate(audit()).sources.length,3)
for(const change of [
  (r)=>{r.identityVerified=false},(r)=>{r.issues=['学校不匹配']},(r)=>{r.identity.examCode='802'},
  (r)=>{r.identity.institutionUserText='其他大学'},(r)=>{r.identity.institution='其他大学'},(r)=>{r.identity.evidence.quote='这是一段模型编造的、不在实际读取资料中的身份说明'},
  (r)=>{r.sources[0].contentEvidence='这是一段模型编造的、无法在正文逐字核对的考试范围'},
  (r)=>{r.sources[0].sourceId='invented'},(r)=>{r.sources[2].year=2025},(r)=>{r.sources[0].fullText=false},
  (r)=>{r.sources[0].primarySource=false},(r)=>{r.identity.nationalUnified=true},
]) {const r=audit();change(r);assert.throws(()=>validate(r))}
assert.throws(()=>validate(audit(),docs,{...basis,code:'081200',name:'计算机科学与技术'}),/院校|专业代码/)
const notice={...docs[0],id:'doc-4',title:'示例大学2027年801数据结构新版大纲发布通知',identity:'示例大学2027年801数据结构新版大纲发布通知',text:'示例大学2027年801数据结构新版大纲发布通知。请阅读新版正文。'}
const old=docs.map((d,i)=>i?d:{...d,title:d.title.replace('2027','2026'),identity:d.identity.replace('2027','2026'),text:d.text.replaceAll('2027','2026')})
const oldReview=audit();oldReview.identity.evidence.quote=old[0].identity;oldReview.sources[0].year=2026;oldReview.sources[0].identityEvidence=old[0].identity
oldReview.sources.push({sourceId:'doc-4',kind:'notice',year:2027,identityEvidence:notice.identity})
assert.throws(()=>validate(oldReview,[...old,notice]),/新版/)
const omittedNotice=structuredClone(oldReview)
omittedNotice.sources=omittedNotice.sources.filter(s=>s.sourceId!=='doc-4')
assert.throws(()=>validate(omittedNotice,[...old,notice]),/新版/,'模型漏选已读新版通知仍须拒绝旧大纲')
assert.equal(validate(omittedNotice,[...old,{...notice,title:notice.title.replaceAll('示例大学','其他大学'),text:notice.text.replaceAll('示例大学','其他大学')}]).outlineYear,2026,'其他院校同名考试公告不会误拦截')

const mirror={...docs[0],id:'doc-4',url:'https://archive.exam.org/outline'}
const mirrored=audit();mirrored.sources[0].primarySource=false;mirrored.sources[0].corroboration=[{sourceId:'doc-4',quote:scope}]
mirrored.sources.push({...mirrored.sources[0],sourceId:'doc-4',corroboration:[]})
assert.equal(validate(mirrored,[...docs,mirror]).sources[0].official,false)
assert.throws(()=>validate(mirrored,[...docs,{...mirror,url:'https://other.study.edu.cn/mirror'}]),/交叉依据/)
for(const url of ['http://exam.edu.cn/a','https://127.0.0.1/','https://2130706433/','https://user:pass@exam.edu.cn/','https://exam.local/a','file:///a'])assert.equal(publicResearchUrl(url),false)
assert(publicResearchUrl('https://yjs.university.edu.cn/new-syllabus.pdf'))
assert.deepEqual(referenceLinks('<main><a href="./paper.pdf">试卷附件</a><a href="http://127.0.0.1/private">恶意</a></main>','https://exam.study.edu.cn/notice').map((s)=>s.url),['https://exam.study.edu.cn/paper.pdf'])
console.log('ok   身份、专业代码、逐字证据、真实年份、原始来源/转载交叉与公网地址边界')

function fixture({planner,auditor,results=docs,readPage}={}) {
  let turns=0,searches=0,reads=0,calls=0
  const ctx={get(name){
    if(name==='agentDefaultModel')return {currentSelection:()=>({provider:'test',model:'test'})}
    if(name==='web')return {search:async()=>{searches++;return {sources:results.map(({url,title})=>({url,title}))}}}
    if(name==='llm')return {async *stream(options){calls++;let reply
      if(options.system.includes('自主检索规划员')) {turns++;reply=planner?planner(turns,options):turns%2?{searches:['示例大学801考试大纲与真题'],reads:[],done:false}:{searches:[],reads:docs.map((d,i)=>({url:d.url,kind:i?'paper':'outline'})),done:true}}
      else if(options.system.includes('独立考试资料审查员'))reply=auditor?auditor():audit()
      else if(options.system.includes('独立解题专家')){assert.deepEqual(Object.keys(JSON.parse(options.messages[0].content[0].text)).sort(),['options','stem']);reply={solvable:true,answer:'A',answerKey:'A',explanation:'顺序表的元素地址可以通过首地址和下标直接计算，不需要随表长遍历，因此基本操作时间为常数。',issues:[]}}
      else if(options.system.includes('答案比对专家'))reply={agree:true,writerValid:true,solverValid:true,issues:[]}
      else if(options.system.includes('范围与难度评审员'))reply={inScope:true,examComparable:true,difficulty:1,rationale:'按大纲的线性表条目与两年顺序存储访问题对照，属于基本概念与一步直接运算。',issues:[],outlineEvidence:[{sourceId:'ref-1',quote:scope}],paperEvidence:[{sourceId:'ref-2',quote:paper},{sourceId:'ref-3',quote:paper}]}
      else reply={type:'single',stem:'长度为n的顺序表，按已知下标直接访问元素的时间复杂度为？',options:[{key:'A',text:'O(1)'},{key:'B',text:'O(n)'}],answer:'A',answerKey:'A',explanation:'顺序存储支持通过首地址和下标一次计算元素地址，无需逐个扫描，因此访问时间与表长无关。'}
      yield {type:'text-delta',text:JSON.stringify(reply)}
    }}
  }}
  const reader=async({source,discoveredUrls})=>{reads++;assert(discoveredUrls.has(source.url));if(readPage)return readPage(source);const doc=docs.find((d)=>d.url===source.url);return {...doc,links:[]}}
  return {ctx,reader,counts:()=>({turns,searches,reads,calls})}
}
const f=fixture()
const first=await discoverExamReferences({ctx:f.ctx,basis,examInfo,now,readPage:f.reader})
assert.equal(first.research.rounds,2);assert.equal(first.research.reads,3)
assert.equal(first.sources[0].official,true)
const count=f.counts().calls
first.sources[0].text='changed outside cache'
const second=await discoverExamReferences({ctx:f.ctx,basis,examInfo,now:new Date(now.getTime()+1000),readPage:f.reader})
assert(second.fromCache);assert.notEqual(second.sources[0].text,'changed outside cache');assert.equal(f.counts().calls,count)
const typed=await discoverExamReferences({ctx:f.ctx,basis,examInfo,now:new Date(),readPage:f.reader,plannedType:'single'})
assert(!typed.fromCache,'定向真题检索与通用资料缓存分开')
const generated=await createVerifiedQuestion({ctx:f.ctx,subject,examInfo,preferredType:'single'})
assert.equal(generated.verification.status,'passed');assert.equal(generated.question.examAlignment.difficulty,1)
await discoverExamReferences({ctx:f.ctx,basis,examInfo,now:new Date(Date.now()+7*3600000),readPage:f.reader})
assert(f.counts().calls>count+4)
const ambiguous=fixture({planner:()=>({needsClarification:'请补充目标院校，081200不能唯一确定考试科目'})})
await assert.rejects(discoverExamReferences({ctx:ambiguous.ctx,basis:{...basis,code:'081200'},examInfo,now,readPage:ambiguous.reader}),e=>e.code==='REFERENCE_IDENTITY_REQUIRED')
assert.equal(ambiguous.counts().searches,0)
const noClarification=fixture({auditor:()=>({...audit(),needsClarification:'无'})})
assert.equal((await discoverExamReferences({ctx:noClarification.ctx,basis,examInfo,now,readPage:noClarification.reader})).sources.length,3)
const invented=fixture({planner:()=>({searches:[],reads:[{url:'https://invented.exam.org/fake',kind:'outline'}],done:true})})
await assert.rejects(discoverExamReferences({ctx:invented.ctx,basis,examInfo,now,readPage:invented.reader}),/未取得/)
assert.equal(invented.counts().reads,0);assert.equal(invented.counts().turns,6)
const insufficient=fixture({auditor:()=>({...audit(),issues:['需要另一年真实试卷，不能用摘要代替']})})
await assert.rejects(discoverExamReferences({ctx:insufficient.ctx,basis,examInfo,now,readPage:insufficient.reader}),/另一年/)
assert(insufficient.counts().searches<=6&&insufficient.counts().reads<=8&&insufficient.counts().turns<=6)
const outlineOnly=fixture({results:[docs[0]],planner:(turn,options)=>{
  const request=JSON.parse(options.messages[0].content[0].text)
  assert.equal(request.plannedType,'填空题')
  if(turn>2)assert.match(request.independentAuditIssues[0],/补检/)
  return turn===1?{searches:['示例大学801考试大纲和填空题真题'],reads:[]}
    :{searches:[],reads:[{url:docs[0].url,kind:'outline'}],done:true}
},auditor:()=>({...audit(),sources:audit().sources.slice(0,1)})})
const partial=await discoverExamReferences({ctx:outlineOnly.ctx,basis,examInfo,now,readPage:outlineOnly.reader,plannedType:'fill'})
assert.deepEqual(partial.sources.map((source)=>source.kind),['outline'])
assert.equal(partial.research.audits,2)
assert.throws(()=>validate({...audit(),sources:audit().sources.slice(0,1)}),/两个年份/)
const shortNotice=fixture({readPage:(source)=>source.url===docs[0].url?{...notice,url:source.url}:docs.find(d=>d.url===source.url)})
await assert.rejects(discoverExamReferences({ctx:shortNotice.ctx,basis,examInfo,now,readPage:shortNotice.reader}),error=>
  error.details.documents.some(doc=>doc.title===notice.title&&doc.chars<100),'简短新版公告不能因不足100字而从已读资料中丢失')
const controller=new AbortController()
const hung=fixture({readPage:()=>new Promise(()=>{})})
const pending=discoverExamReferences({ctx:hung.ctx,basis,examInfo,now,readPage:hung.reader,signal:controller.signal})
await new Promise((resolve)=>setTimeout(resolve,10));controller.abort(new Error('test abort'))
await assert.rejects(pending,/test abort/)
console.log('ok   自主规划、真实URL账本、独立审查反馈、缓存隔离/过期、盲解串联、预算与取消')

assert.deepEqual(referenceLinks('[试卷](./2025.pdf) [原文](https://github.com/user/exam/blob/main/2024.md)','https://raw.githubusercontent.com/user/exam/main/README.md').map(s=>s.url),['https://raw.githubusercontent.com/user/exam/main/2025.pdf','https://github.com/user/exam/blob/main/2024.md','https://raw.githubusercontent.com/user/exam/main/2024.md'])

assert(referenceLinks(Array.from({length:18},(_,i)=>`<a href="${2009+i}.pdf">真题附件</a>`).join(''),'https://archive.study.edu.cn/')[0].url.endsWith('/2026.pdf'))
