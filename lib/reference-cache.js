import { findSubject, referenceExamFor } from './subjects.js'

export function dailyExamReferences(subject, examInfo, pastPapers = [], syllabus) {
  const configured = (subject.outline || []).filter((item) => typeof item === 'string' && item.trim())
  const basis = referenceExamFor(subject)
  const inherited = subject.custom && basis ? findSubject(basis.id) : null
  const builtIn = inherited?.outline || basis?.outline || []
  const items = configured.length ? configured : builtIn
  const custom = subject.custom && configured.length > 0
  const scopeLabel = syllabus ? '手动导入的大纲' : custom ? '自定义范围' : items.length ? '内置科目范围' : '科目名称'
  const title = custom ? subject.name : (inherited?.name || basis?.name || subject.name)
  const scope = syllabus ? [{kind:'outline',manual:true,title:syllabus.fileName,text:syllabus.text}]
    : items.length ? [{kind:'outline',local:true,title:scopeLabel,text:items.join('\n')}] : []
  const papers = pastPapers.filter((paper) => paper.subjectId === subject.id)
    .sort((a,b) => b.year-a.year)
    .map(({year,fileName,text,type}) => ({kind:'paper',manual:true,year,title:fileName,text,type}))
  return { targetYear:examInfo?.year, scopeBasis:syllabus ? 'imported' : custom ? 'custom' : items.length ? 'built-in' : 'subject-only', scopeLabel,
    basisSubject:{name:syllabus ? subject.name : title},
    note:syllabus ? `本题按导入文件《${syllabus.fileName}》的范围生成。`
      : `本题按${title}的${scopeLabel}生成。未进行考试大纲校验，题目可能与正式大纲范围有差异。`,
    sources:[...scope,...papers].map((source,index) => ({...source,id:'ref-'+(index+1)})) }
}
