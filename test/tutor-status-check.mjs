import assert from 'node:assert/strict'
import { describeQuestionContext,answerFollowup } from '../lib/tutor.js'

const q={id:'q',stem:'测试题目',type:'solution'}
const unverified=describeQuestionContext(q,{answer:'导入答案',explanation:'导入解析',verified:false})
assert(unverified.includes('尚未独立核验'));assert(!unverified.includes('已校验的正式版本'))
const verified=describeQuestionContext(q,{answer:'复核答案',verified:true})
assert(verified.includes('已通过独立校验'));assert(verified.includes('仍非官方认证'))
for(const answer of [null,{}, {answer:'',verified:true},{answer:'   ',verified:false}]) {
  const text=describeQuestionContext(q,answer)
  assert(text.includes('尚未生成'));assert(!text.includes('已通过独立校验'))
}
let prompt,system
await answerFollowup({ctx:{get:n=>n==='agentDefaultModel'?{currentSelection:()=>({provider:'test',model:'test'})}:n==='llm'?{
  async *stream(options){prompt=options.messages[0].content[0].text;system=options.system;yield{type:'text-delta',text:'测试回复'}},
}:undefined},question:q,answerDetail:{answer:'导入答案',verified:false},history:[],message:'是否正确？'})
assert(prompt.includes('尚未独立核验'));assert(system.includes('都不能称为“官方答案”'))
console.log('ok   追问上下文区分已核验、未核验及缺失答案，不将模型结果称为官方答案')
