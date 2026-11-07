import { CHOICE_TYPES, QUESTION_TYPE_LABEL, hasChoiceOptions, validChoiceKey } from './subjects.js'
import { extractPdfTextAsync } from './pdf.js'

/**
 * 题库解析：把 Markdown 文本或 PDF 提取出的文本切成题目条目。
 *
 * 原则：识别不确定时宁可标记问题，也不把残缺内容当成有效题目。
 * 每条题目都带 issues 与 answerStatus，导入前必须由用户预览确认。
 */

const OPTION_LINE = /^\s*(?:[（(]\s*([A-H])\s*[)）]|([A-H])\s*[.、．:：)）])\s*(.+)$/
const QUESTION_START = /^\s*((?:#{1,6}\s*)?(?:第\s*)?)(\d{1,4})\s*(题|[.、．)）])\s*(.*)$/
const LABEL_LINE = /^\s*(?:【?\s*(答案|参考答案|正确答案|解析|详解|答案详解|【解析】|分析|知识点|考点|难度|题型|答|解)\s*】?\s*[:：]\s*)(.*)$/
const HARD_SEPARATOR = /^\s*(?:-{3,}|\*{3,}|={3,})\s*$/
const BRACKET_MARK = /^\s*【\s*(题目|题干|问题)\s*】\s*(.*)$/
const TYPE_WORDS = [
  ['cloze', ['完形填空', '英语知识运用']],
  ['reading', ['阅读理解']],
  ['multiple', ['多项选择', '多选']],
  ['single', ['单项选择', '单选', '选择题']],
  ['fill', ['填空']],
  ['solution', ['解答', '计算', '证明', '综合应用', '算法设计', '综合题']],
  ['analysis', ['分析题', '材料分析']],
  ['translation', ['翻译', '英译汉']],
  ['writing', ['写作', '作文']],
  ['shortanswer', ['简答']],
]

function answerSection(name) {
  if (/解析|详解|^(分析|解)$/.test(name)) return 'explanation'
  if (/答案|^答$/.test(name)) return 'answer'
  return null
}

/** 判断一行是否处于 ``` 代码围栏内，用于避免在代码块里切分题目。 */
function fenceTracker() {
  let inside = false
  return (line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inside = !inside
      return true
    }
    return inside
  }
}

function splitBlocks(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const isFenced = fenceTracker()
  const blocks = []
  let current = []
  let inAnswer = false
  let questionNumber = null
  let blankBefore = false
  const push = () => {
    const body = current.join('\n').trim()
    if (body) blocks.push(body)
    current = []
    inAnswer = false
    questionNumber = null
  }
  for (const line of lines) {
    const fenced = isFenced(line)
    const bracket = fenced ? null : BRACKET_MARK.exec(line)
    if (bracket || (!fenced && HARD_SEPARATOR.test(line))) {
      push()
      if (bracket?.[2]) current.push(bracket[2])
      blankBefore = false
      continue
    }
    const numbered = fenced ? null : QUESTION_START.exec(line)
    if (numbered) {
      const [, prefix, digits, suffix, stem] = numbered
      const number = Number(digits)
      const explicit = prefix || suffix === '题'
      // shortcut: 裸数字题号与解析步骤有歧义，低置信度时请用“第 N 题”或分隔线。
      const nextQuestion = blankBefore && number === questionNumber + 1
        && (/^(?:已知|设|下列|试问|证明[:：]|计算[:：])/.test(stem) || /[?？]$/.test(stem))
      if (explicit || !inAnswer || nextQuestion) {
        push()
        questionNumber = number
      }
    }
    const label = fenced ? null : LABEL_LINE.exec(line)
    if (label && answerSection(label[1].replace(/[【】]/g, ''))) inAnswer = true
    current.push(line)
    blankBefore = !line.trim()
  }
  push()
  return blocks
}

function detectType(text) {
  const explicit = /(?:题型|类型)\s*[:：]\s*([^\n]+)/.exec(text)
  if (explicit) {
    const label = explicit[1]
    for (const [type, words] of TYPE_WORDS) {
      if (words.some((word) => label.includes(word))) return type
    }
  }
  return null
}

function parseOptions(lines) {
  const options = []
  for (const line of lines) {
    const match = OPTION_LINE.exec(line)
    if (!match) continue
    const key = (match[1] || match[2]).toUpperCase()
    const text = match[3].trim()
    if (text) options.push({ key, text })
  }
  return options
}

function lettersOf(value) {
  const upper = String(value || '').toUpperCase()
  const direct = upper.replace(/[^A-H]/g, '')
  return direct
}

/**
 * 解析单个题目块。
 * @returns 条目对象（包含 issues 与 answerStatus）
 */
export function parseBlock(block, index) {
  const lines = block.split('\n')
  const sections = { stem: [], answer: [], explanation: [] }
  let section = 'stem'
  let knowledge = []
  let difficulty = null
  let typeHint = null
  let inFence = false

  for (const line of lines) {
    const isFenceLine = /^\s*(```|~~~)/.test(line)
    const fenced = inFence || isFenceLine
    if (isFenceLine) inFence = !inFence
    const entry = { text: line, fenced }

    const label = fenced ? null : LABEL_LINE.exec(line)
    if (label) {
      const name = label[1].replace(/[【】]/g, '')
      const rest = label[2].trim()
      const contentSection = answerSection(name)
      if (contentSection) {
        section = contentSection
        if (rest) sections[section].push({ ...entry, text: rest })
        continue
      }
      if (name === '知识点' || name === '考点') {
        knowledge = rest.split(/[,，、;；\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8)
        section = 'stem'
        continue
      }
      if (name === '难度') {
        const digit = /([1-5])/.exec(rest)
        const cn = /([一二三四五])/.exec(rest)
        if (digit) difficulty = Number(digit[1])
        else if (cn) difficulty = '一二三四五'.indexOf(cn[1]) + 1
        section = 'stem'
        continue
      }
      if (name === '题型') {
        typeHint = detectType(line)
        section = 'stem'
        continue
      }
    }
    sections[section].push(entry)
  }

  const stemEntries = sections.stem.map((entry, index) => ({
    ...entry,
    text: index === 0 && !entry.fenced ? entry.text.replace(QUESTION_START, '$4').trim() : entry.text,
  }))
  const optionLines = stemEntries.filter((entry) => !entry.fenced && OPTION_LINE.test(entry.text))
  const stemBody = stemEntries.filter((entry) => entry.fenced || !OPTION_LINE.test(entry.text))
    .map((entry) => entry.text)
    .join('\n')
    .trim()
  const options = parseOptions(optionLines.map((entry) => entry.text))

  const answerRaw = sections.answer.map((entry) => entry.text).join('\n').trim()
    .replace(/^(?:答|答案|参考答案|正确答案)\s*[:：]\s*/, '')
  const explanation = sections.explanation.map((entry) => entry.text).join('\n').trim()
    .replace(/^(?:解析|详解|答|解)\s*[:：]\s*/, '')

  let type = typeHint
  if (!type) {
    if (options.length >= 2) {
      const letters = lettersOf(answerRaw).replace(/[^A-H]/g, '')
      type = letters.length > 1 ? 'multiple' : 'single'
    } else if (/_{3,}|＿{2,}|\(\s*\)\s*$/.test(stemBody)) {
      type = 'fill'
    } else {
      type = 'solution'
    }
  }

  const issues = []
  if (!stemBody) issues.push('未识别到题干')
  else if (stemBody.length < 6) issues.push('题干过短，可能识别不完整')
  if (CHOICE_TYPES.has(type) && !hasChoiceOptions(options)) issues.push('选择题需要至少两个不同且有效的选项')
  if (!answerRaw) issues.push('没有参考答案（标记为缺少参考答案）')
  if (!explanation) issues.push('没有解析（可稍后补充）')
  if (optionLines.length && !options.length) issues.push('选项行格式无法识别')

  let answerKey = ''
  const answerLetters = CHOICE_TYPES.has(type) ? lettersOf(answerRaw) : ''
  if (answerLetters) {
    if (validChoiceKey(type, answerLetters, options)) answerKey = [...answerLetters].sort().join('')
    else issues.push('参考答案与题型或选项不匹配，将由用户自行判定')
  }

  return {
    index,
    type,
    typeLabel: QUESTION_TYPE_LABEL[type] || type,
    stem: stemBody,
    options,
    answer: answerRaw,
    answerKey,
    explanation,
    knowledge,
    difficulty: difficulty || 3,
    issues,
    answerStatus: answerRaw ? 'unverified' : 'missing',
    explanationStatus: explanation ? 'present' : 'missing',
    raw: block,
  }
}

export function isUsableBankItem(item) {
  return typeof item.stem === 'string' && item.stem.trim().length >= 6
    && (!CHOICE_TYPES.has(item.type) || hasChoiceOptions(item.options))
}

/** 像标题、说明或分隔块的片段：不含选项/答案/解析，且不像一道题。 */
function isHeaderBlock(item) {
  if (item.options.length || item.answer || item.explanation || item.knowledge.length) return false
  const lines = item.stem.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length > 2) return false
  const text = lines.join(' ').replace(/^#+\s*/, '')
  if (text.length > 40) return false
  const looksLikeHeading = /^[一二三四五六七八九十]+[、.]/.test(text)
    || /^第\s*[一二三四五六七八九十\d]+\s*[章节讲部分]/.test(text)
    || /题库|目录|汇总|答案与解析|每日一题|参考答案$/.test(text)
  if (looksLikeHeading) return true
  return !/[？?]|求|证明|计算|下列|已知|设|选择|判断|解释|简述|什么|论述|区别|联系|为什么|如何/.test(text)
}

/**
 * 解析整份文本。
 * @returns {{items: object[], warnings: string[], usable: number}}
 */
export function parseBankText(text, { filename = '' } = {}) {
  const source = String(text || '')
  const warnings = []
  if (!source.trim()) {
    throw new Error('文件内容为空，没有可解析的题目')
  }
  if (source.length > 4_000_000) {
    warnings.push('文件较大，已截断到前 400 万字符进行解析')
  }
  let blocks = splitBlocks(source.slice(0, 4_000_000))
  if (!blocks.length) throw new Error('没有识别出任何题目结构')
  const parsedBlocks = blocks.map((block, index) => parseBlock(block, index + 1))
  const headers = parsedBlocks.filter((item) => isHeaderBlock(item))
  const items = parsedBlocks
    .filter((item) => !isHeaderBlock(item))
    .map((item, index) => ({ ...item, index: index + 1 }))
  if (headers.length) {
    warnings.push(`已跳过 ${headers.length} 个疑似标题/说明块：${headers.map((item) => item.stem.replace(/^#+\s*/, '').slice(0, 20)).join('、')}`)
  }
  if (items.length === 1) {
    warnings.push('只识别到 1 道题：如果这是多题题库，请用“题号 / --- / 【题目】”等分隔符分开每道题')
  }
  const usable = items.filter(isUsableBankItem).length
  if (!usable) warnings.push('没有可用题目：请检查题干及选择题选项是否完整')
  if (filename) warnings.push(`来源文件：${filename}`)
  return { items, warnings, usable }
}

/** PDF 字节 -> 文本。 */
export async function extractBankPdf(bytes, filename = '') {
  const result = await extractPdfTextAsync(bytes)
  const warnings = [...result.warnings]
  if (filename) warnings.push(`来源文件：${filename}（共 ${result.pages} 页）`)
  return { text: result.text, warnings }
}
