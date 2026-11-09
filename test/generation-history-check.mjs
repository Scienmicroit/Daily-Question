import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generationPlan,indexQuestionHistory,findQuestionRepeat } from '../lib/generation-history.js'
import { createVerifiedQuestion } from '../lib/generate.js'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'
import { referenceWeb,referencePages,fitResponse } from './reference-fixture.mjs'

const subject={id:'math1',name:'数学一',types:['single','fill','solution'],outline:['函数极限','矩阵秩'],guidance:''}
const old={id:'old',subjectId:'math1',type:'single',stem:'设一元函数满足指定条件，利用函数极限的定义计算其极限并说明参数的取值范围。',
  options:[{key:'A',text:'$1$'},{key:'B',text:'$2$'}],knowledge:['函数极限'],coverageTopic:'函数极限',answer:'HISTORY SECRET',explanation:'HISTORY SECRET'}
const fresh={type:'single',stem:'一个三阶矩阵经过初等行变换得到两个非零行，求该矩阵的秩并选择对应结论。',
  options:[{key:'A',text:'1'},{key:'B',text:'2'}],answer:'B',answerKey:'B',knowledge:['矩阵秩'],
  explanation:'初等行变换不改变矩阵的秩，行阶梯形矩阵中的非零行数就是矩阵的秩，因此本题的秩为二。'}
const references={sources:[{kind:'outline',text:'# 函数极限\n# 矩阵秩\n考试内容与要求。'}]}
const plan=generationPlan({subject,references,history:[old]})
assert.equal(plan.type,'fill');assert.equal(plan.topic,'矩阵秩');assert.equal(plan.knowledgeCounts['函数极限'],1)
assert(!JSON.stringify(plan.recent).includes('HISTORY SECRET'))
assert.equal(generationPlan({subject,references,history:[old],preferredType:'solution'}).type,'solution')
assert(findQuestionRepeat({...old,stem:'  '+old.stem+'\n',options:[{key:'A',text:'2'},{key:'B',text:'1'}]},plan.index))
assert(!findQuestionRepeat(fresh,plan.index))
const longStem={...old,stem:old.stem+'并详细说明每一步推导的理由。'}
assert(findQuestionRepeat({...longStem,type:'fill',options:[]},indexQuestionHistory([longStem])),'长题干不能通过换题型绕过去重')
const english=generationPlan({subject:{id:'english',types:['translation'],outline:['翻译']},references:{sources:[{kind:'outline',text:'翻译考试内容'}]},history:[]})
assert.equal(english.topic,'','题型名称不会被当作知识模块强行覆盖')
const administrative=generationPlan({subject:{...subject,outline:[]},references:{sources:[{kind:'outline',text:'# 考试性质\n# 试卷结构\n# 2027年数学考试大纲\n# 函数极限\n# 矩阵秩'}]},history:[old]})
assert.equal(administrative.topic,'矩阵秩','大纲的目录和行政性章节不作为命题知识目标')
assert(!findQuestionRepeat({stem:'选择正确描述。',options:[{text:'香蕉'},{text:'桃子'}]},indexQuestionHistory([{stem:'选择正确描述。',options:[{text:'苹果'},{text:'梨子'}]}])))
const long={stem:'设某复杂函数满足下列连续性与可导性条件，需要从给定的关系式中求出指定参数n=10的值，并且说明相关推导中使用的定理以及适用条件。'}
assert(findQuestionRepeat({...long,stem:long.stem.replace('10','11')},indexQuestionHistory([long])),'仅换参数的高度相似题被拦截')
const large={stem:long.stem+Array.from({length:30000},(_,i)=>String.fromCharCode(0x4e00+i%20000)+String.fromCharCode(0x3400+Math.floor(i/20000))).join('')}
const largeIndex=indexQuestionHistory([large])
assert(largeIndex.recent[0].grams.size<=20000,'长题近似特征数量有界')
assert(findQuestionRepeat(large,largeIndex),'超长题仍有完整精确去重')
assert(!findQuestionRepeat({stem:'判断正确描述。',options:[{text:'a'},{text:'b|c'}]},indexQuestionHistory([{stem:'判断正确描述。',options:[{text:'a|b'},{text:'c'}]}])),'包含竖线的选项不会因拼接分隔符碰撞而误判')
const historical=[{...old,id:'oldest',assignedDate:'2000-01-01'},...Array.from({length:35},(_,i)=>({id:'n'+i,assignedDate:'2026-01-'+String(i+1).padStart(2,'0'),stem:'不同的题目'+i,type:'fill',knowledge:['矩阵秩']}))]
const oldPlan=generationPlan({subject,references,history:historical})
assert.equal(oldPlan.typeCounts.fill,30);assert(findQuestionRepeat(old,oldPlan.index),'超过近期窗口的原题仍可精确去重')
assert.equal(oldPlan.recent.length,20)

function context({coverage=false,matched=true,duplicateFirst=false,onFit,forceWrongType=false}={}) {
  let writers=0,solvers=0,fits=0
  const calls=[]
  const pages=referencePages.map((p,i)=>i===0&&coverage?{...p,text:p.text+'\n# 函数极限\n# 矩阵秩'}:p)
  const ctx={get(name){return name==='web'?referenceWeb(pages):name==='agentDefaultModel'?{currentSelection:()=>({provider:'test',model:'test'})}:name==='llm'?{
    async *stream(options){
      const system=options.system,prompt=options.messages[0].content[0].text
      calls.push({system,prompt})
      let result
      if(system.includes('范围与难度评审员')) {fits++;await onFit?.();result={...fitResponse(JSON.parse(prompt).question.type),coverageMatched:matched};if(coverage)assert.equal(JSON.parse(prompt).coverageTarget,'矩阵秩')}
      else if(system.includes('独立解题专家')){solvers++;assert.deepEqual(Object.keys(JSON.parse(prompt)).sort(),['options','stem']);result={...fresh,solvable:true,issues:[]}}
      else if(system.includes('答案比对专家'))result={agree:true,writerValid:true,solverValid:true,issues:[]}
      else {writers++;assert(!prompt.includes('HISTORY SECRET'));result=duplicateFirst&&writers===1?{...old,answer:'B',answerKey:'B',explanation:fresh.explanation}
        :{...fresh,stem:matched?fresh.stem:fresh.stem+`第${writers}版`,type:forceWrongType?'single':/"targetType":"([^"]+)"/.exec(prompt)?.[1]||'single'}}
      yield {type:'text-delta',text:JSON.stringify(result)}
    },
  }:undefined}}
  return {ctx,calls,counts:()=>({writers,solvers,fits})}
}
let run=context({duplicateFirst:true})
let result=await createVerifiedQuestion({ctx:run.ctx,subject:{...subject,outline:[]},preferredType:'single',history:[old]})
assert.equal(run.counts().writers,2);assert.equal(run.counts().solvers,1,'重复题在盲解前拒绝')
assert.equal(result.verification.attempts,2);assert.equal(result.verification.coverage.historyCount,1)
run=context({coverage:true})
result=await createVerifiedQuestion({ctx:run.ctx,subject,history:[old]})
assert.equal(result.question.type,'fill');assert.equal(result.question.coverageTopic,'矩阵秩')
run=context({coverage:true,matched:false})
await assert.rejects(createVerifiedQuestion({ctx:run.ctx,subject,history:[old]}),/覆盖本轮目标/)
assert.equal(run.counts().fits,2)
run=context({forceWrongType:true})
await assert.rejects(createVerifiedQuestion({ctx:run.ctx,subject,history:[old]}),/指定题型/)
assert.equal(run.counts().solvers,0)

const root=await mkdtemp(join(tmpdir(),'dq-generation-history-'))
let service
try {
  run=context({onFit:async()=>{await service.store.update(d=>{d.questions.race={...fresh,id:'race',subjectId:'math1'}})}})
  service=new DailyQuestionService(run.ctx);service.store=new Store(root)
  await service.store.update(d=>{d.settings.subjects=['math1'];d.settings.subjectSource.math1='online'})
  await assert.rejects(service.createDaily({...subject,types:['single'],outline:[]},'2026-11-05','2026-11-05|math1'),/重复/)
  assert.deepEqual(Object.keys((await service.data()).questions),['race'])
  assert.equal(Object.keys((await service.data()).daily).length,0,'发布事务再次检查最新历史，拦截并发重复')
  service.dispose()
  run=context({coverage:true});service=new DailyQuestionService(run.ctx);service.store=new Store(join(root,'published'))
  await service.store.update(d=>{d.settings.subjects=['math1'];d.settings.subjectSource.math1='online';d.questions.old=old})
  const published=await service.createDaily(subject,'2026-11-06','2026-11-06|math1')
  const question=(await service.data()).questions[published.questionId]
  assert.equal(question.type,'fill');assert.equal(question.coverageTopic,'矩阵秩')
  assert.equal(question.publishVerification.coverage.historyCount,1,'正式保存本轮覆盖目标和历史统计依据')
  service.dispose()
  run = context({ onFit: () => service.saveSettings({ subjects: [] }) })
  service = new DailyQuestionService(run.ctx); service.store = new Store(join(root, 'disabled'))
  await service.saveSettings({ subjects: ['math1'], subjectSource: { math1: 'online' } })
  await assert.rejects(service.createDaily(subject, '2026-11-06', '2026-11-06|math1'), /已停用/)
  assert.deepEqual(Object.keys((await service.data()).questions), [], '停用后阻止进行中的出题发布')
} finally {service?.dispose();await rm(root,{recursive:true,force:true})}
console.log('ok   历史去重与覆盖：全历史精确/近期相似去重、题型和主题频次、独立覆盖评审、盲解隔离及发布前复检')
