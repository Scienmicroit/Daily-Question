import { readFile } from 'node:fs/promises'
import { extractPdfText } from '../lib/pdf.js'
import { parseBankText } from '../lib/bank.js'

const target = process.argv[2]
if (!target) {
  console.error('用法: node pdf-check.mjs <pdf 路径>')
  process.exit(2)
}

const bytes = await readFile(target)
console.log(`文件字节数：${bytes.length}`)
const started = Date.now()
let extracted
try {
  extracted = extractPdfText(bytes)
} catch (error) {
  console.log(`提取失败：${error.message}`)
  process.exit(0)
}
console.log(`提取耗时：${Date.now() - started}ms，页数：${extracted.pages}，字符数：${extracted.text.length}`)
console.log(`警告：${JSON.stringify(extracted.warnings)}`)
console.log('\n--- 文本前 700 字 ---')
console.log(extracted.text.slice(0, 700))

const parsed = parseBankText(extracted.text, { filename: target.split(/[\\/]/).pop() })
console.log(`\n解析出 ${parsed.items.length} 道题，可用 ${parsed.usable} 道`)
console.log(`警告：${JSON.stringify(parsed.warnings.slice(0, 6))}`)
for (const item of parsed.items.slice(0, 3)) {
  console.log('\n=== 第', item.index, '题 ===')
  console.log('类型：', item.typeLabel, '| 答案状态：', item.answerStatus, '| 问题：', item.issues)
  console.log('题干：', item.stem.slice(0, 220).replace(/\n/g, ' / '))
  console.log('选项：', item.options.map((option) => `${option.key}.${option.text.slice(0, 40)}`).join(' | '))
  console.log('答案：', item.answer.slice(0, 80))
  console.log('解析：', item.explanation.slice(0, 120).replace(/\n/g, ' / '))
}
