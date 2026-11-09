import { QUESTION_TYPE_LABEL } from './subjects.js'

const aliases = {
  single: ['单选题','单项选择','选择题'],
  multiple: ['多选题','多项选择','不定项选择题'],
  cloze: ['英语知识运用','完形填空','Use of English'],
  reading: ['阅读理解题','阅读理解','Reading Comprehension'],
  fill: ['填空'],
  solution: ['计算题','证明题','解答'],
  translation: ['翻译题','英译汉','Translation'],
  writing: ['写作','Writing'],
}

export function typeLabel(type) {
  return Object.hasOwn(QUESTION_TYPE_LABEL,type) ? QUESTION_TYPE_LABEL[type] : type
}

// Match section headings and the headings emitted for complete OCR questions.
// Mentions of a type in an article title or in the middle of a question are not evidence.
export function paperTextForType(text, type, types = []) {
  const labels = (key) => [typeLabel(key), ...(Object.hasOwn(aliases,key) ? aliases[key] : [])]
  const requested = new Set(labels(type).map((label) => label.toLowerCase()))
  const headings = [...new Set([...Object.keys(QUESTION_TYPE_LABEL),...types,type].flatMap(labels))]
    .sort((a,b) => b.length-a.length)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')
  const sections = [...text.matchAll(new RegExp(`(?:^|(?<=[\\n。；;])|[一二三四五六七八九十]+[、．.])\\s*(?:#{1,6}\\s+|\\*\\*)?(?:[一二三四五六七八九十]+[、．.]\\s*|Section\\s+[IVX]+\\s+)?(${headings})(?=\\s|[:：、（(]|\\*\\*|$)`, 'gi'))]
  const excerpts = sections.flatMap((section,i) => {
    if (!requested.has(section[1].toLowerCase())) return []
    const start = section.index + section[0].lastIndexOf(section[1])
    const body = text.slice(start,sections[i+1]?.index).trim()
    return body.length >= section[1].length + 15 ? [body] : []
  })
  return excerpts.join('\n').slice(0,12000)
}

export function papersForType(papers, type, types) {
  const byYear = new Map()
  for (const paper of papers) {
    if (byYear.has(paper.year)) continue
    const text = paperTextForType(paper.text,type,types)
    if (text) {
      const { contentEvidence, ...provenance } = paper.provenance || {}
      byYear.set(paper.year,{...paper,text,...(paper.provenance ? {provenance} : {})})
    }
  }
  return [...byYear.values()].slice(0,3)
}
