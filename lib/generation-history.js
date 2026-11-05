import { QUESTION_TYPE_LABEL } from './subjects.js'
import { createHash } from 'node:crypto'

const WINDOW=30
const canonical=(value)=>String(value||'').normalize('NFKC').replace(/\\(?:left|right|displaystyle|textstyle)\b/g,'')
  .replace(/\\(?:quad\b|qquad\b|[,;!])/g,'').replace(/[\s$`]/g,'')
const body=(q)=>canonical(q.stem)+'\n'+JSON.stringify((q.options||[]).map(o=>canonical(o.text)).sort())
const fingerprint=(text)=>createHash('sha256').update(text).digest('hex')
const grams=(text)=>{
  const result=new Set()
  // shortcut: 近似检查只取前2万字符；需识别长试卷尾部的语义重复时再增加分段检查。
  for(let i=0;i<Math.min(text.length,20000)-2;i++)result.add(text.slice(i,i+3))
  return result
}
const recentFirst=(history)=>[...history].sort((a,b)=>String(b.lastAssignedDate||b.assignedDate||b.createdAt||'').localeCompare(String(a.lastAssignedDate||a.assignedDate||a.createdAt||''))
  ||String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(b.id||'').localeCompare(String(a.id||'')))

export function indexQuestionHistory(history) {
  const sorted=recentFirst(history)
  return {exact:new Set(sorted.map(q=>fingerprint(body(q)))),stems:new Set(sorted.flatMap(q=>{const stem=canonical(q.stem);return stem.length>=40?[fingerprint(stem)]:[]})),
    recent:sorted.slice(0,WINDOW).map(q=>{const text=body(q);return {id:q.id,length:text.length,grams:grams(text)}})}
}

export function findQuestionRepeat(question,index) {
  const text=body(question)
  if(index.exact.has(fingerprint(text)))return '与历史题目相同（忽略空白、公式排版及选项顺序）'
  if(index.stems.has(fingerprint(canonical(question.stem))))return '题干与历史题目一致，不能仅更换题型或选项'
  if(text.length<40)return ''
  const candidate=grams(text)
  for(const old of index.recent) {
    if(old.length<40||Math.min(text.length,old.length)/Math.max(text.length,old.length)<0.85)continue
    let shared=0
    for(const gram of candidate)if(old.grams.has(gram))shared++
    if(2*shared/(candidate.size+old.grams.size)>=0.9)return '与近期题目高度相似：'+(old.id||'已出题目')
  }
  return ''
}

function outlineTopics(subject,references) {
  const outlines=references.sources.filter(source=>source.kind==='outline').map(source=>source.text)
  const text=canonical(outlines.join('\n'))
  const labels=outlines.flatMap(outline=>outline.split(/\r?\n/).map(line=>
    /^\s*(?:#{1,6}\s+|\*{1,6}\s+|第[^\s]{1,12}[章节篇]\s*|[一二三四五六七八九十]+[、.．]\s*|[（(][一二三四五六七八九十\d]+[）)]\s*)(.{2,80})$/.exec(line)?.[1]).filter(Boolean))
  const hints=(subject.outline||[]).map(line=>line.split(/[：:（(]/)[0].trim()).filter(label=>label.length>=2&&text.includes(canonical(label)))
  const typeLabels=new Set(subject.types.flatMap(type=>[type,(QUESTION_TYPE_LABEL[type]||type).split(/[（(]/)[0]]))
  const administrative=/^(?:(?:考试|考查|考核)(?:性质|内容|要求|目标|形式|时间|范围|方式|说明)(?:[及与和].*)?|试卷(?:结构|形式|题型|满分|内容结构)|参考书(?:目)?|目录|附录|前言|后记|出版说明|编写说明|版权页|使用说明)$/
  return [...new Set([...hints,...labels].map(label=>label.replace(/[*#]/g,'').trim()))]
    .filter(label=>label.length>=2&&label.length<=80&&!administrative.test(label)&&!/考试大纲|^20\d{2}/.test(label)&&!typeLabels.has(label)).slice(0,40)
}

export function generationPlan({subject,references,history=[],preferredType}) {
  const recent=recentFirst(history).slice(0,WINDOW),typeCounts=Object.fromEntries(subject.types.map(type=>[type,0])),knowledgeCounts=Object.create(null)
  for(const q of recent) {
    if(Object.hasOwn(typeCounts,q.type))typeCounts[q.type]++
    for(const tag of new Set(q.knowledge||[]))knowledgeCounts[tag]=(Object.hasOwn(knowledgeCounts,tag)?knowledgeCounts[tag]:0)+1
  }
  const type=subject.types.includes(preferredType)?preferredType:subject.types.reduce((best,next)=>typeCounts[next]<typeCounts[best]?next:best)
  const topics=outlineTopics(subject,references).map(topic=>({topic,count:recent.filter(q=>q.coverageTopic===topic
    ||(q.knowledge||[]).some(tag=>canonical(tag).length>=2&&(canonical(topic).includes(canonical(tag))||canonical(tag).includes(canonical(topic))))
    ||canonical(q.stem).includes(canonical(topic))).length}))
  const pairCount=(topic)=>recent.filter(q=>q.type===type&&q.coverageTopic===topic).length
  const topic=[...topics].sort((a,b)=>a.count-b.count||pairCount(a.topic)-pairCount(b.topic))[0]?.topic||''
  return {type,topic,typeCounts,knowledgeCounts,topicCounts:topics,historyCount:history.length,
    recent:recent.slice(0,20).map(q=>({id:q.id,type:q.type,stem:String(q.stem||'').slice(0,600),
      options:(q.options||[]).map(option=>({key:option.key,text:String(option.text||'').slice(0,200)})),knowledge:q.knowledge||[]})),
    index:indexQuestionHistory(history)}
}
