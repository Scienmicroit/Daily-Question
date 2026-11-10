import { createVerifiedQuestion } from '../lib/generate.js'
import { rankQuestionTypes } from '../lib/generation-history.js'
import { loadExamReferences } from '../lib/references.js'

export async function generateWithResearch(options) {
  const { subject, history = [], preferredType } = options
  const plannedType = rankQuestionTypes(subject,history,preferredType)[0]
  const localReferences = await loadExamReferences({...options,plannedType})
  return createVerifiedQuestion({...options,localReferences})
}

export const referenceYear = new Date().getFullYear() + 1
export const outlineQuote = '函数极限与连续性：掌握极限的定义、性质以及基本计算方法，理解连续与可导之间的关系。'
export const paperQuote1 = '设函数在零点连续，求极限并根据条件判断参数的取值，选出正确答案。'
export const paperQuote2 = '根据函数定义计算极限，选择正确的取值，并核对所使用定理的适用条件。'
export const fillQuotes = ['设函数在零点连续且可导，则其导数在零点的取值为____。','已知函数在原点的极限存在，则参数的取值为____。']
export const referencePages = [
  { title: `${referenceYear}年全国硕士研究生招生考试数学一考试大纲`, url: 'https://www.neea.edu.cn/test-outline',
    text: `数学一 301 ${referenceYear}年全国硕士研究生招生考试大纲。考试内容：${outlineQuote} 考试要求：理解并掌握基本概念，能够在明确条件下运用基本定理。` + '大纲正文的其他条目用于测试资料读取，不作为难度评审的引用。'.repeat(12) },
  { title: `${referenceYear-1}年考研数学一真题`, url: 'https://www.neea.edu.cn/test-paper-one',
    text: `数学一 301 ${referenceYear-1}年全国硕士研究生招生考试试题。\n一、选择题：${paperQuote1} A. 1 B. 2 C. 3 D. 4\n二、填空题：${fillQuotes[0]}\n` + '本段用于模拟试卷其他题目的正文内容。'.repeat(20) },
  { title: `${referenceYear-2}年考研数学一真题`, url: 'https://www.eol.cn/test-paper-two',
    text: `数学一 301 ${referenceYear-2}年全国硕士研究生招生考试真题转载。\n一、选择题：${paperQuote2} A. 0 B. 1 C. 2 D. 3\n二、填空题：${fillQuotes[1]}\n` + '本段用于模拟试卷其他题目的正文内容。'.repeat(20) },
]
export function referenceWeb(pages = referencePages) {
  return { search: async () => ({ sources: pages.map(({ title, url }) => ({ title, url })) }),
    fetch: async ({ url }) => { const page = pages.find((p) => p.url === url); return { url, title: page.title, body: { kind: 'text', content: page.text } } } }
}
export function fitResponse(type) {
  return { inScope: true, examComparable: true, difficulty: 3, rationale: '参考大纲极限条目与两个年份试题的概念、步骤和运算负担，评为中等综合题。', issues: [],
    outlineEvidence: [{ sourceId: 'ref-1', quote: outlineQuote }],
    paperEvidence: (type === 'fill' ? fillQuotes : [paperQuote1,paperQuote2]).map((quote,index) => ({sourceId:'ref-'+(index+2),quote})) }
}
