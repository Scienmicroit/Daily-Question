import { referenceWeb, fitResponse } from './reference-fixture.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveExamDate, computeCountdown, calendarDiff, daysBetween, addYears, addDays, yearOptions, verifyExamDateOnline } from '../lib/exam-dates.js'
import { parseBankText } from '../lib/bank.js'
import { emptyData, Store } from '../lib/store.js'
import { CHOICE_TYPES, findSubject, subjectTypes } from '../lib/subjects.js'
import { normalizeCandidate, structuralProblems, createVerifiedQuestion, reviseAnswer } from '../lib/generate.js'
import { parseJsonLoose } from '../lib/llm-json.js'

let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log(`ok   ${name}`)
  else { failures += 1; console.log(`FAIL ${name} ${detail}`) }
}

// ---- 考试日期 ----
const y2027 = resolveExamDate(2027)
check('2027 官方日期', y2027.status === 'official' && y2027.date === '2026-12-19', JSON.stringify(y2027))
const y2028 = resolveExamDate(2028)
check('2028 估算日期 +1 年', y2028.status === 'estimated' && y2028.date === '2027-12-19', JSON.stringify(y2028))

const cd = computeCountdown(2028, y2028, '2026-11-03')
console.log('   countdown:', JSON.stringify(cd.lines), 'days=', cd.days, 'calendar=', cd.calendar)
check('倒计时天数 411', cd.days === 411, String(cd.days))
check('三行都带“约”', cd.lines.primary.includes('约') && cd.lines.secondary.includes('约') && cd.lines.target.includes('约'))
check('日历差 1年1个月16天', cd.calendar.years === 1 && cd.calendar.months === 1 && cd.calendar.days === 16, JSON.stringify(cd.calendar))
check('天数与日历差一致', daysBetween('2026-11-03', '2027-11-03') + 46 === 411)
for (const [remaining, expected] of [[0, ''], [29, ''], [30, ''], [31, '1个月1天'], [59, '1个月29天'],
  [90, '3个月'], [113, '3个月23天'], [364, '12个月4天'], [365, '1年'], [366, '1年1天'],
  [388, '1年23天'], [395, '1年1个月'], [415, '1年1个月20天'], [730, '2年']]) {
  for (const status of ['official', 'estimated']) {
    const countdown = computeCountdown(2029, { date: addDays('2028-01-01', remaining), status }, '2028-01-01')
    check(`剩余 ${remaining} 天 ${status} 的精简时长`, countdown.lines.secondary === (expected && (status === 'estimated' ? '约' : '') + expected), countdown.lines.secondary)
  }
}

// ---- 可选年份窗口 ----
check('初试前：今年+1 起三年', JSON.stringify(yearOptions('2026-11-04')) === JSON.stringify([2027, 2028, 2029]),
  JSON.stringify(yearOptions('2026-11-04')))
check('初试当天仍保留当前场次', yearOptions('2026-12-19')[0] === 2027, JSON.stringify(yearOptions('2026-12-19')))
check('初试最后一天仍保留当前场次', yearOptions('2026-12-20')[0] === 2027)
check('初试结束次日整体后移一年', yearOptions('2026-12-21')[0] === 2028)
const verifiedDates = { 2027: { date: '2026-12-26', endDate: '2026-12-27', status: 'official' } }
check('年份窗口使用核验后的结束日期', yearOptions('2026-12-27', verifiedDates)[0] === 2027
  && yearOptions('2026-12-28', verifiedDates)[0] === 2028)
check('跨年后窗口连续', JSON.stringify(yearOptions('2027-01-05')) === JSON.stringify([2028, 2029, 2030]),
  JSON.stringify(yearOptions('2027-01-05')))
check('任何时刻都只有 3 个选项', yearOptions('2027-06-01').length === 3 && yearOptions('2030-12-25').length === 3)
check('窗口内每个年份的初试都还没结束', yearOptions('2026-11-04')
  .every((year) => daysBetween('2026-11-04', resolveExamDate(year).date) >= 0),
  JSON.stringify(yearOptions('2026-11-04').map((year) => [year, resolveExamDate(year).date])))

const SystemDate = Date
for (const [day, expected] of [[1, 2027], [20, 2027], [21, 2028]]) {
  globalThis.Date = class extends SystemDate {
    constructor(...args) { super(...(args.length ? args : [2026, 11, day, 12])) }
  }
  try {
    check(`12 月 ${day} 日初始化默认 ${expected} 考研`, emptyData().settings.targetYear === expected)
  } finally {
    globalThis.Date = SystemDate
  }
}

const cd2027 = computeCountdown(2027, y2027, '2026-11-03')
check('2027 正式日期不带“约”', !cd2027.lines.primary.includes('约'), cd2027.lines.primary)

const expired = computeCountdown(2030, resolveExamDate(2030, { 2030: { date: '2026-01-10', status: 'official' } }), '2026-11-03')
check('过期时不再显示正向倒计时', expired.expired === true && expired.lines.primary.includes('已过'), JSON.stringify(expired.lines))

const unverified = resolveExamDate(2001)
check('无依据时标记未核实', unverified.status === 'unverified', JSON.stringify(unverified))

check('跨月借位', JSON.stringify(calendarDiff('2026-01-31', '2026-03-01')) === JSON.stringify({ years: 0, months: 1, days: 1 }), JSON.stringify(calendarDiff('2026-01-31', '2026-03-01')))
check('跨年借位', JSON.stringify(calendarDiff('2026-12-31', '2027-01-01')) === JSON.stringify({ years: 0, months: 0, days: 1 }), JSON.stringify(calendarDiff('2026-12-31', '2027-01-01')))
check('闰年 2/29 退化', addYears('2024-02-29', 1) === '2025-02-28')

// ---- 联网核验：搜索结果只用于定位公告，日期必须来自公告正文 ----
const examPage = 'https://www.moe.gov.cn/notice'
const mirrorPage = 'https://yz.chsi.com.cn/notice'
const examTitle = (year) => `${year}年全国硕士研究生招生工作管理规定`
const notice = (year, body) => `<title>${examTitle(year)}</title><p>${body}</p>`
const searchResult = (url) => ({ url, title: '搜索摘要声称初试时间为2025年12月1日至2日' })
for (const [year, body, start, end] of [
  [2026, '初试方式均为笔试。初试时间为2025年12月20日至21日。', '2025-12-20', '2025-12-21'],
  [2027, '初试时间：２０２６ 年 １２ 月 １９ 日—<strong>１２月２０日</strong>。', '2026-12-19', '2026-12-20'],
  [2025, '初试时间定于2024年12月21日至2024年12月23日。', '2024-12-21', '2024-12-23'],
]) {
  const queries = []
  const result = await verifyExamDateOnline({ year, web: {
    async search({ query }) { queries.push(query); return { sources: [searchResult(examPage)] } },
    async fetch({ url }) { return { url, body: { kind: 'html', content: notice(year, body) } } },
  } })
  check(`${year} 届同时按届次和实际考试年份检索，并取正文的起止日`,
    queries.length === 1 && queries[0].includes(examTitle(year)) && queries[0].includes(`${year - 1}年12月`)
    && result.record?.date === start && result.record?.endDate === end && result.record?.method === 'online-search')
}
for (const [label, content, url = examPage] of [
  ['报名日期', notice(2026, '网上报名时间为2025年12月10日至12日。')],
  ['材料提交日期', notice(2026, '初试时间另行公布，材料提交时间为2025年12月10日至12日。')],
  ['同句的其他日期', notice(2026, '初试时间以准考证为准，材料提交时间为2025年12月10日至12日。')],
  ['复试日期', notice(2026, '复试时间为2025年12月10日至12日。')],
  ['不完整区间', notice(2026, '初试时间为2025年12月20日。')],
  ['倒序区间', notice(2026, '初试时间为2025年12月21日至20日。')],
  ['非法日期', notice(2026, '初试时间为2025年12月30日至32日。')],
  ['公告内有冲突区间', notice(2026, '初试时间为2025年12月20日至21日。初试时间为2025年12月25日至26日。')],
  ['其他届次', notice(2027, '初试时间为2025年12月20日至21日。')],
  ['实际年份错误', notice(2026, '初试时间为2026年12月20日至21日。')],
  ['只有标题有日期', '<title>2026考研初试时间为2025年12月20日至21日</title><p>详情另行公布。</p>'],
  ['只有正文标题有日期', '<h1>2026考研初试时间为2025年12月20日至21日</h1><p>详情另行公布。</p>'],
  ['仅链接文字含日期', notice(2026, '<a href="/previous">初试时间为2025年12月20日至21日</a>')],
  ['网页最终跳转到非官方域名', notice(2026, '初试时间为2025年12月20日至21日。'), 'https://www.moe.gov.cn.example.com/notice'],
]) {
  const result = await verifyExamDateOnline({ year: 2026, web: {
    async search() { return { sources: [searchResult(examPage)] } },
    async fetch() { return { url, body: { kind: 'html', content } } },
  } })
  check(`不采信${label}`, !result.ok && !result.record)
}
const visitedPages = []
const mirrored = await verifyExamDateOnline({ year: 2026, web: {
  async search({ query }) {
    return { sources: (query.startsWith('site:moe.gov.cn')
      ? ['https://www.moe.gov.cn.example.com/notice', examPage + '#1', examPage + '#2']
      : [mirrorPage]).map(searchResult) }
  },
  async fetch({ url }) {
    visitedPages.push(url)
    if (url === examPage) throw new Error('官方页面跳转被宿主阻止')
    return { url, body: { kind: 'text', content: '2026年全国硕士研究生招生考试初试时间为2025年12月20日至21日。' } }
  },
} })
check('首选站点不可读时改查官方备用站点，过滤仿冒域名及重复链接',
  visitedPages.join() === [examPage, mirrorPage].join() && mirrored.record?.sourceUrl === mirrorPage)

// ---- 题库解析 ----
const md = `# 数学一 每日一题题库

## 第 1 题
设函数 $f(x)=x^2$，则 $f'(1)=$？

A. 1
B. 2
C. 3
D. 4

答案：B
解析：因为 $f'(x)=2x$，所以 $f'(1)=2$。
知识点：导数计算
难度：2

---

## 第 2 题
阅读下面的代码，写出它的时间复杂度。

\`\`\`python
for i in range(n):
    A. 这行不是选项
    ---
\`\`\`

答案：O(n)
解析：循环体执行 n 次，因此复杂度为 $O(n)$。
`
const parsed = parseBankText(md)
check('解析出 2 道题', parsed.items.length === 2, JSON.stringify(parsed.items.map((i) => i.type)))
check('第 1 题是单选且答案 B', parsed.items[0].type === 'single' && parsed.items[0].answerKey === 'B', JSON.stringify(parsed.items[0]))
check('第 1 题识别 4 个选项', parsed.items[0].options.length === 4)
check('第 2 题是解答题', parsed.items[1].type === 'solution', parsed.items[1].type)
check('代码块内的 --- 未切断题目', parsed.items[1].stem.includes('for i in range(n):'), JSON.stringify(parsed.items[1].stem))
check('代码块内的 A. 不被当成选项', parsed.items[1].options.length === 0, JSON.stringify(parsed.items[1].options))
check('代码块保留在题干中', parsed.items[1].stem.includes('```'))
check('缺少答案时标记缺答案', (() => {
  const r = parseBankText('1. 求 $1+1$ 的值。\n\n解析：略')
  return r.items[0].answerStatus === 'missing' && r.items[0].issues.some((i) => i.includes('参考答案'))
})())
const numberedSteps = parseBankText([
  '# 第1题', '题型：解答题', '计算函数的导数并说明原因。', '答案：1', '解析：按定义计算。',
  '1. 求导得到分子。', '', '2. 计算分母。', '',
  '2. 设函数为 $f(x)=x^2$，求导函数。', '答案：$2x$',
].join('\n'))
check('编号解析步骤留在本题，明确的下一题仍单独切分', numberedSteps.items.length === 2
  && numberedSteps.items[0].explanation.includes('1. 求导得到分子。\n\n2. 计算分母。')
  && numberedSteps.items[1].stem.startsWith('设函数'))
const readingImport = parseBankText('## 第 1 题\n题型：阅读理解\n阅读下面的句子并选择。\nA. 甲\nB. 乙\n答案：AB')
check('阅读理解导入保留题干，但多字母答案不作自动判分依据',
  readingImport.usable === 1 && readingImport.items[0].type === 'reading' && readingImport.items[0].answerKey === '')

// ---- 模型回复的 JSON 修复 ----
const jsonBadEscape = '{"explanation": "由 $\\sqrt{2}$ 得 $\\alpha$，故 $a \\to 0$"}'
const repaired = parseJsonLoose(jsonBadEscape)
check('非法 JSON 转义（\\sqrt / \\alpha / \\to）自动修复',
  repaired.explanation.includes('\\sqrt{2}') && repaired.explanation.includes('\\alpha') && repaired.explanation.includes('\\to 0'),
  repaired.explanation)

const jsonFrac = '{"explanation": "即 $\\frac{1}{2}$ 与 $\\theta$、$\\beta$、$\\times$"}'
const repairedFrac = parseJsonLoose(jsonFrac)
check('合法转义被吃掉后还原为 LaTeX 命令',
  ['\\frac', '\\theta', '\\beta', '\\times'].every((cmd) => repairedFrac.explanation.includes(cmd)),
  repairedFrac.explanation)

const jsonNewline = '{"stem": "第一行\\n第二行"}'
check('字符串内的换行保持为换行', parseJsonLoose(jsonNewline).stem === '第一行\n第二行', JSON.stringify(parseJsonLoose(jsonNewline).stem))

const jsonRealNewline = '{"stem": "第一行\nStep two"}'
check('裸换行 + 英文保持为换行', parseJsonLoose(jsonRealNewline).stem.includes('\nStep'), JSON.stringify(parseJsonLoose(jsonRealNewline).stem))

const jsonDoubled = '{"stem": "写成 \\\\frac{1}{2} 与 \\\\alpha"}'
const doubled = parseJsonLoose(jsonDoubled)
check('已正确转义的反斜杠不被二次修改', doubled.stem.includes('\\frac{1}{2}') && doubled.stem.includes('\\alpha'), doubled.stem)

const jsonFenced = '```json\n{"a": 1, "b": [1, 2,],}\n```'
check('代码围栏与尾逗号仍可解析', parseJsonLoose(jsonFenced).b.length === 2, JSON.stringify(parseJsonLoose(jsonFenced)))
const codeQuestion={stem:'执行下列代码：\n```c\nif (x) { x++; }\n```\n判断结果。',answer:'A'}
const codeJson=JSON.stringify(codeQuestion)
check('JSON题干内的代码围栏与花括号不会被当成外层包装',parseJsonLoose(codeJson).stem===codeQuestion.stem)
check('外层JSON围栏内仍可嵌套题干代码围栏',parseJsonLoose('```json\n'+codeJson+'\n```').stem===codeQuestion.stem)

const jsonStrayQuote = '{"stem": "求 "x+1" 的值", "options": [{"key": "A", "text": "1"}]}'
const stray = parseJsonLoose(jsonStrayQuote)
check('字符串内未转义的引号被保留', stray.stem === '求 "x+1" 的值' && stray.options[0].text === '1', JSON.stringify(stray))

// ---- 候选归一化 ----
const cand = normalizeCandidate({
  type: 'single', stem: '题干足够长的问题？', options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }],
  answer: 'B', answerKey: '', explanation: '解析内容需要足够长以通过结构检查，这里写满二十个字符。', knowledge: ['x'], difficulty: 9,
}, ['single', 'solution'])
check('从 answer 推出 answerKey', cand.answerKey === 'B', JSON.stringify(cand))
check('难度被夹到 5', cand.difficulty === 5)
check('结构检查通过', structuralProblems(cand, ['single']).length === 0, JSON.stringify(structuralProblems(cand, ['single'])))
for (const type of ['cloze', 'reading']) {
  check(`${type} 在线出题只接受单字母答案`,
    structuralProblems({ ...cand, type, answerKey: 'AB' }, [type]).length > 0
    && structuralProblems({ ...cand, type }, [type]).length === 0)
}

// ---- 科目 ----
check('政治只考单选与多选', JSON.stringify(subjectTypes('politics')) === JSON.stringify(['single', 'multiple']))
check('英语一题型', JSON.stringify(subjectTypes('english1')) === JSON.stringify(['cloze', 'reading', 'translation']))
check('英语二题型', JSON.stringify(subjectTypes('english2')) === JSON.stringify(['cloze', 'reading', 'translation']))
check('408 已不在默认科目目录', findSubject('cs408') === undefined)
check('完形填空/阅读理解按选择题判分', CHOICE_TYPES.has('cloze') && CHOICE_TYPES.has('reading'))
check('数学一题型', JSON.stringify(subjectTypes('math1')) === JSON.stringify(['single', 'fill', 'solution']))
check('未知科目退化', JSON.stringify(subjectTypes('nope')) === JSON.stringify(['single', 'solution']))
check('科目查找', findSubject('math2')?.name === '数学二')

const customSubject = [{ id: 'c1', name: '自命题科目', referenceSubjectId: 'math1', types: ['名词解释', 'multiple'] }]
check('自定义科目可用任意题型名', JSON.stringify(subjectTypes('c1', customSubject)) === JSON.stringify(['名词解释', 'multiple']),
  JSON.stringify(subjectTypes('c1', customSubject)))

// ---- Store ----
const custom = findSubject('c1', customSubject)
const customDraft = {
  type: '名词解释', stem: '请解释机会成本的含义并举例。', answer: '选择某方案所放弃的最佳替代方案的收益。',
  explanation: '机会成本衡量放弃的最佳替代方案的收益，需要区分它与已经发生且不可收回的沉没成本。',
}
let modelCalls = 0, answerCalls = 0
const ctx = { get(name) {
  if (name === 'web') return referenceWeb()
  if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'test', model: 'test' }) }
  if (name === 'llm') return { async *stream(options) {
    modelCalls++
    if (options.system.includes('独立的考研范围与难度评审员')) {
      yield { type: 'text-delta', text: JSON.stringify(fitResponse()) }
      return
    }
    const phase = answerCalls++ % 3
    const reply = phase === 0 ? customDraft : phase === 1 ? { ...customDraft, solvable: true, issues: [] }
      : { agree: true, writerValid: true, solverValid: true, issues: [] }
    yield { type: 'text-delta', text: JSON.stringify(reply) }
  } }
} }
const generatedCustom = await createVerifiedQuestion({ ctx, subject: custom, preferredType: '名词解释' })
check('在线生成保留自定义题型并通过校验', generatedCustom.question.type === '名词解释' && modelCalls === 4)
const revisedCustom = await reviseAnswer({ ctx, subject: custom, question: { ...customDraft, subjectId: custom.id }, currentAnswer: customDraft })
check('答案修订保留自定义题型并通过校验', revisedCustom.candidate.type === '名词解释' && modelCalls === 7)

const tmpRoot = await mkdtemp(join(tmpdir(), 'daily-question-store-'))
const dir = join(tmpRoot, 'data')
const store = new Store(dir)
await store.load()
await store.update((draft) => { draft.settings.targetYear = 2030; return draft })
const store2 = new Store(dir)
await store2.load()
check('持久化后重新读回', store2.data.settings.targetYear === 2030, String(store2.data.settings.targetYear))
let threw = false
try { await store.update(() => { throw new Error('boom') }) } catch { threw = true }
check('失败的事务抛错且不写入', threw && store.data.settings.targetYear === 2030)
const originalWrite = store.write
store.write = async () => { throw new Error('模拟磁盘写入失败') }
threw = false
try { await store.update((draft) => { draft.settings.targetYear = 2099 }) } catch { threw = true }
check('磁盘写入失败不改变内存或文件', threw && store.data.settings.targetYear === 2030
  && (await new Store(dir).read()).settings.targetYear === 2030)
store.write = originalWrite
await store.update((draft) => { draft.settings.activeSubject = 'math1' })
const recovered = await new Store(dir).read()
check('写入失败后队列能恢复且不带入失败修改', recovered.settings.activeSubject === 'math1' && recovered.settings.targetYear === 2030)

const olderStore = new Store(join(tmpRoot, 'missing-target'))
await olderStore.write({ examDates: verifiedDates })
globalThis.Date = class extends SystemDate {
  constructor(...args) { super(...(args.length ? args : [2026, 11, 21, 12])) }
}
try {
  check('已有核验日期但未设置目标年份时，按核验日期选默认届次', (await olderStore.read()).settings.targetYear === 2027)
} finally {
  globalThis.Date = SystemDate
}

await rm(tmpRoot, { recursive: true, force: true })
console.log(failures ? `\n${failures} 个检查未通过` : '\n全部通过')
process.exit(failures ? 1 : 0)
