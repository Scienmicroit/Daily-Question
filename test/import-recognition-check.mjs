import assert from 'node:assert/strict'
import { recognizeBankImport, recognizeStudyImport } from '../lib/import-recognition.js'
import { papersForType } from '../lib/paper-types.js'

const subject = { name: '测试科目', types: ['single', '证明与推导'] }
const passage = '设某函数在闭区间上连续且在开区间内可导，说明如何证明其零点唯一。'
const scope = '考生须掌握闭区间上连续函数的基本定理及其适用条件。'
const source = `附录标题和格式不能用来判断正文。\n${scope}\n${passage}\n术语随笔\n题一的答案及解释：B`
let reply
const ctx = { get(name) {
  if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'dsh', model: 'test' }) }
  if (name === 'llm') return { async *stream({ messages }) {
    assert.equal(JSON.parse(messages[0].content[0].text).source, source, '模型收到了完整原文')
    yield { type: 'text-delta', text: JSON.stringify(reply) }
  } }
} }
reply = { complete: true, items: [
  { type: 'single', stem: '题干相同也只依据原文件标注答案', options: [{key:'A',text:'第一个'},{key:'B',text:'第二个'}],
    answer: 'B', answerKey: 'B', answerEvidence: '题一的答案及解释：B' },
  { type: '证明与推导', stem: passage, answer: '杜撰答案', answerEvidence: '不在原文的引用' },
  { type: 'unsupported', stem: '该行不能作为有效题型保存' },
] }
const bank = await recognizeBankImport(ctx, source, { subject, filename: '非模板.txt' })
assert.equal(bank.usable, 2)
assert.equal(bank.items[0].answerKey, 'B')
assert.equal(bank.items[1].type, '证明与推导')
assert.equal(bank.items[1].answer, '', '禁止保存无法在原文核对的答案')

reply = { complete: true, excerpts: [scope, '原文没有的章节说明'] }
const syllabus = await recognizeStudyImport(ctx, source, { document: 'syllabus', subject })
assert.equal(syllabus.scopeText, scope)
assert.equal(syllabus.warnings.length, 1)

reply = { complete: true, sections: [{ type: '证明与推导', quote: passage }, { type: 'single', quote: '模型补写的题目正文' }] }
const paper = await recognizeStudyImport(ctx, source, { document: 'pastPaper', subject, year: 2025, type: 'single' })
assert.deepEqual(paper.typeExcerpts, { 证明与推导: passage })
const references = [{ year: 2025, text: '单项选择题\n这里的模板片段不能覆盖已经保存的模型识别结果。', ...paper }]
assert.equal(papersForType(references, 'single', subject.types).length, 0)
assert.equal(papersForType(references, '证明与推导', subject.types)[0].text, passage)

reply = { complete: false, warnings: ['页面不完整'] }
await assert.rejects(recognizeBankImport(ctx, source, { subject }), /页面不完整/)
await assert.rejects(recognizeBankImport({}, source, { subject }), /配置默认模型/)
