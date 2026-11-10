import { QUESTION_TYPE_LABEL } from './subjects.js'

const aliases = {
  single: ['单选题','单项选择','选择题'],
  multiple: ['多选题','多项选择','不定项选择题'],
  cloze: ['英语知识运用','完形填空','Use of English'],
  reading: ['阅读理解题','阅读理解','Reading Comprehension'],
  fill: ['填空'],
  solution: ['计算题','证明题','解答','综合应用题'],
  translation: ['翻译题','英译汉','Translation'],
  writing: ['写作','Writing'],
}

export function typeLabel(type) {
  return Object.hasOwn(QUESTION_TYPE_LABEL,type) ? QUESTION_TYPE_LABEL[type] : type
}

// Match section headings and the headings emitted for complete OCR questions.
// Mentions of a type in an article title or in the middle of a question are not evidence.
const answerHeadings = ['参考答案及解析','参考答案与解析','答案与解析','参考答案','试题答案','答案解析']

export function paperTextForType(text, type, types = [], declaredType = '') {
  const labels = (key) => [typeLabel(key), ...(Object.hasOwn(aliases,key) ? aliases[key] : [])]
  const requested = new Set(labels(type).map((label) => label.toLowerCase()))
  const typeHeadings = [...new Set([...Object.keys(QUESTION_TYPE_LABEL),...types,type].flatMap(labels))]
  const headings = [...typeHeadings,'非选择题',...answerHeadings]
    .sort((a,b) => b.length-a.length)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')
  const sections = [...text.matchAll(new RegExp(`(?:^|(?<=[\\n。；;])|[一二三四五六七八九十]+[、．.])\\s*(?:#{1,6}\\s+|\\*\\*)?(?:[一二三四五六七八九十]+[、．.]\\s*|Section\\s+[IVX]+\\s+)?(${headings})(?=\\s|[:：、（(]|\\*\\*|$)`, 'gi'))]
  const answerStart = sections.findIndex((section) => answerHeadings.includes(section[1]))
  const questionSections = answerStart < 0 ? sections : sections.slice(0,answerStart)
  const excerpts = questionSections.flatMap((section,i) => {
    if (!requested.has(section[1].toLowerCase())) return []
    const start = section.index + section[0].lastIndexOf(section[1])
    const body = text.slice(start,sections[i+1]?.index).trim()
    return body.length >= section[1].length + 15 ? [body] : []
  })
  if (!excerpts.length && declaredType === type && !questionSections.some((section) =>
    typeHeadings.some((heading) => heading.toLowerCase() === section[1].toLowerCase()))) {
    const body = text.slice(0,answerStart < 0 ? undefined : sections[answerStart].index).trim()
    if (body.length >= 15) return body.slice(0,12000)
  }
  return excerpts.join('\n').slice(0,12000)
}

export function papersForType(papers, type, types) {
  const byYear = new Map()
  for (const paper of papers) {
    if (byYear.has(paper.year)) continue
    const text = paperTextForType(paper.text,type,types,paper.manual ? paper.type : '')
    if (text) {
      const { contentEvidence, ...provenance } = paper.provenance || {}
      byYear.set(paper.year,{...paper,text,...(paper.provenance ? {provenance} : {})})
    }
  }
  return [...byYear.values()].slice(0,3)
}
