import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveExamDate, computeCountdown, calendarDiff, daysBetween, addYears } from '../lib/exam-dates.js'
import { parseBankText } from '../lib/bank.js'
import { Store } from '../lib/store.js'
import { findSubject, subjectTypes } from '../lib/subjects.js'
import { normalizeCandidate, structuralProblems } from '../lib/generate.js'

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

const cd2027 = computeCountdown(2027, y2027, '2026-11-03')
check('2027 正式日期不带“约”', !cd2027.lines.primary.includes('约'), cd2027.lines.primary)

const expired = computeCountdown(2030, resolveExamDate(2030, { 2030: { date: '2026-01-10', status: 'official' } }), '2026-11-03')
check('过期时不再显示正向倒计时', expired.expired === true && expired.lines.primary.includes('已过'), JSON.stringify(expired.lines))

const unverified = resolveExamDate(2001)
check('无依据时标记未核实', unverified.status === 'unverified', JSON.stringify(unverified))

check('跨月借位', JSON.stringify(calendarDiff('2026-01-31', '2026-03-01')) === JSON.stringify({ years: 0, months: 1, days: 1 }), JSON.stringify(calendarDiff('2026-01-31', '2026-03-01')))
check('跨年借位', JSON.stringify(calendarDiff('2026-12-31', '2027-01-01')) === JSON.stringify({ years: 0, months: 0, days: 1 }), JSON.stringify(calendarDiff('2026-12-31', '2027-01-01')))
check('闰年 2/29 退化', addYears('2024-02-29', 1) === '2025-02-28')

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

// ---- 候选归一化 ----
const cand = normalizeCandidate({
  type: 'single', stem: '题干足够长的问题？', options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }],
  answer: 'B', answerKey: '', explanation: '解析内容需要足够长以通过结构检查，这里写满二十个字符。', knowledge: ['x'], difficulty: 9,
}, ['single', 'solution'])
check('从 answer 推出 answerKey', cand.answerKey === 'B', JSON.stringify(cand))
check('难度被夹到 5', cand.difficulty === 5)
check('结构检查通过', structuralProblems(cand, ['single']).length === 0, JSON.stringify(structuralProblems(cand, ['single'])))

// ---- 科目 ----
check('408 只有单选与解答', JSON.stringify(subjectTypes('cs408')) === JSON.stringify(['single', 'solution']))
check('数学一题型', JSON.stringify(subjectTypes('math1')) === JSON.stringify(['single', 'fill', 'solution']))
check('未知科目退化', JSON.stringify(subjectTypes('nope')) === JSON.stringify(['single', 'solution']))
check('科目查找', findSubject('math2')?.name === '数学二')

// ---- Store ----
const tmpRoot = await mkdtemp(join(tmpdir(), 'kaoyan-store-'))
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

await rm(tmpRoot, { recursive: true, force: true })
console.log(failures ? `\n${failures} 个检查未通过` : '\n全部通过')
process.exit(failures ? 1 : 0)
