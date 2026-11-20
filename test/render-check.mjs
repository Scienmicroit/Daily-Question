import { createMarkdown } from '../ui/markdown.js'
import { createClient } from '../ui/app.js'
import { createStudyMemoryPage } from '../ui/study-memory.js'

const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(9) })
function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] }
const window = { MathJax: {} }
function factory(h, useState, useMemo, useEffect, useRef, useCallback) {
  return createMarkdown({ createElement: h, useState, useMemo, useEffect, useRef, useCallback }, { window })
}
const api = factory(h, useState, (fn) => fn(), () => {}, (v) => ({ current: v }), (fn) => fn)
const { inlineNodes, renderBlocks, mathState } = api

let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log(`ok   ${name}`)
  else { failures += 1; console.log(`FAIL ${name} :: ${detail}`) }
}

function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) { for (const item of node) walk(item, visit); return }
  if (typeof node === 'object') {
    visit(node)
    for (const child of node.children || []) walk(child, visit)
  }
}

function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object') return (node.children || []).map(textOf).join('')
  return ''
}

/** 取出送进 MathJax 的 TeX 和 display 标记。 */
function texOf(node) {
  let first
  walk(node, (n) => { if (n.type === api.MathFormula) first ??= n.props })
  if (!first) return null
  return { ...first, className: api.MathFormula(first).props.className }
}

mathState.status = 'ready'

// ---- 公式 ----
const inline = texOf(inlineNodes('斜率 $k=\\frac{1}{2}$ 与法线'))
check('行内公式交给 MathJax', inline && inline.tex === 'k=\\frac{1}{2}' && inline.display === false, JSON.stringify(inline))
check('行内公式用 kd-math 包裹', inline && inline.className === 'kd-math', inline && inline.className)

const displayMath = texOf(renderBlocks('$$\\int_0^1 x^2 dx$$'))
check('公式块用 kd-mathblock', displayMath && displayMath.className === 'kd-mathblock', displayMath && displayMath.className)
check('公式块标记为 display', displayMath && displayMath.display === true, JSON.stringify(displayMath))

const arrow = texOf(inlineNodes('$a \\Longleftrightarrow b$'))
check('长箭头原样交给 MathJax（不再自己映射）', arrow.tex.includes('\\Longleftrightarrow'), arrow.tex)

const boxed = texOf(inlineNodes('$\\boxed{x=1}$'))
check('\\boxed 原样交给 MathJax', boxed.tex.includes('\\boxed'), boxed.tex)

const lineBreak = texOf(renderBlocks('$$a\\\\b$$'))
check('公式块里的裸 \\\\ 包进 \\displaylines', lineBreak.tex.startsWith('\\displaylines{'), lineBreak.tex)

const alignedBreak = texOf(renderBlocks('$$\\begin{aligned}a\\\\b\\end{aligned}$$'))
check('环境里的 \\\\ 不会被再包一层', !alignedBreak.tex.includes('\\displaylines'), alignedBreak.tex)

const parenDelim = texOf(inlineNodes('行内 \\(a+b\\) 结束'))
check('\\( \\) 定界符', parenDelim && parenDelim.tex === 'a+b' && parenDelim.display === false, JSON.stringify(parenDelim))

const bracketDelim = texOf(renderBlocks('\\[a+b\\]'))
check('\\[ \\] 定界符按公式块处理', bracketDelim && bracketDelim.display === true, JSON.stringify(bracketDelim))

const dangling = inlineNodes('价格 $5 与 $6 不是公式')
check('不闭合的 $ 不会吃掉正文', textOf(dangling).includes('价格'), textOf(dangling))

// ---- Markdown ----
const doc = renderBlocks([
  '# 标题',
  '',
  '普通段落，**加粗**、*斜体*、`代码`、[链接](https://example.com)。',
  '',
  '- 项目一',
  '- 项目二',
  '',
  '> 引用',
  '',
  '```js',
  'const a = 1',
  '```',
].join('\n'))
const types = []
walk(doc, (n) => { if (n.type) types.push(n.type) })
check('标题', types.some((t) => /^h[1-6]$/.test(t)), types.join(','))
check('段落与列表', types.includes('p') && types.includes('ul') && types.includes('li'), types.join(','))
check('引用与代码块', types.includes('blockquote') && types.includes('pre'), types.join(','))
check('粗体斜体与行内代码', types.includes('strong') && types.includes('em') && types.includes('code'), types.join(','))
check('链接', types.includes('a'), types.join(','))

for (const url of ['javascript:alert%281%29', 'JaVaScRiPt:alert%281%29', 'java\tscript:alert%281%29',
  'data:text/html;base64,PHNjcmlwdD4=', 'file:///private.txt', 'vbscript:evil', '//example.com/page', '/\\example.com/page']) {
  const nodes = inlineNodes(`[危险链接](${url})`)
  check(`阻止 Markdown 链接 ${JSON.stringify(url)}`, !nodes.some((node) => node?.type === 'a') && textOf(nodes) === '危险链接')
}
for (const url of ['http://example.com/page', 'https://example.com/page', 'mailto:help@example.com', './guide', '#topic']) {
  check(`保留 Markdown 链接 ${url}`, inlineNodes(`[链接](${url})`)[0]?.props?.href === url)
}
for (const url of ['javascript:alert%281%29', 'data:image/svg+xml;base64,PHN2Zz4=', 'file:///private.png']) {
  check(`阻止 Markdown 图片 ${url}`, textOf(inlineNodes(`![图片说明](${url})`)) === '图片说明')
}
for (const url of ['https://example.com/diagram.png', 'data:image/png;base64,iVBORw0KGgo=']) {
  const [node] = inlineNodes(`![图](${url})`)
  check(`保留 Markdown 图片 ${url}`, node?.type?.(node.props)?.props?.src === url)
}

const table = renderBlocks('| a | b |\n| --- | --- |\n| 1 | 2 |')
const tableTags = []
walk(table, (n) => { if (n.type) tableTags.push(n.type) })
check('表格', tableTags.includes('table') && tableTags.includes('th') && tableTags.includes('td'), tableTags.join(','))

// ---- 文本清洗 ----
const literalBreak = renderBlocks('段落一\\n\\n段落二')
check('字面量 \\n\\n 还原成两个段落', literalBreak.length === 2
  && literalBreak.every((block) => block && block.type === 'p'), String(literalBreak.length))
const nabla = renderBlocks('$\\nabla f$')
check('\\nabla 不会被当成换行', texOf(nabla).tex === '\\nabla f', JSON.stringify(texOf(nabla)))

// ---- 引擎未就绪 / 失败 ----
mathState.status = 'loading'
const pending = inlineNodes('$x^2$')
check('引擎未就绪时先显示原文', textOf(pending).includes('x^2'), textOf(pending))
mathState.status = 'ready'

for (const outcome of ['success', 'error', 'unmount']) {
  let html = null, cleanup
  const { MathFormula } = factory(h, () => [html, (value) => { html = value }], (fn) => fn(),
    (effect) => { if (!cleanup) cleanup = effect() }, () => ({}), (fn) => fn)
  window.MathJax.tex2svgPromise = async (tex, { display }) => {
    if (outcome === 'error') throw new Error('boom')
    if (tex === 'x^2' && display) return { outerHTML: '<mjx-container><svg></svg></mjx-container>' }
  }
  const props = { tex: 'x^2', display: true }
  check('等待字形分片期间显示原文', textOf(MathFormula(props)) === 'x^2')
  if (outcome === 'unmount') cleanup()
  await Promise.resolve()
  const rendered = MathFormula(props)
  check(`异步 SVG 渲染处理 ${outcome}`, outcome === 'success'
    ? rendered.props.dangerouslySetInnerHTML?.__html.includes('<svg>')
    : outcome === 'error' ? rendered.children[0]?.props.className === 'kd-math-error' : html === null)
}

let engineScript
window.document = {
  baseURI: 'dsh-app://app/index.html',
  createElement: () => ({}),
  head: { appendChild: (script) => { engineScript = script } },
}
mathState.status = 'idle'
api.ensureMathJax()
const engine = window.MathJax
const assetRoot = 'dsh-app://app/api/daily-question/vendor/mathjax-4.1.3'
check('桌面协议下主程序和分片使用同一个离线资源根目录',
  engineScript.src === assetRoot + '/tex-svg.js'
  && engine.loader.paths.mathjax === assetRoot
  && engine.output.fontPath === assetRoot + '/newcm')
engine.startup.defaultReady = () => {
  engine.startup.document = { options: { enableEnrichment: true, enableAssistiveMml: false } }
  engine.startup.output = { options: { displayOverflow: 'scale', linebreaks: { inline: true } } }
}
engine.startup.ready()
check('历史菜单偏好不再开启语音依赖或缩放长公式',
  !engine.startup.document.options.enableEnrichment
  && engine.startup.document.options.enableAssistiveMml
  && engine.startup.output.options.displayOverflow === 'overflow'
  && !engine.startup.output.options.linebreaks.inline)
mathState.status = 'failed'
check('宿主资源未加载时保留原文并提示重启',
  inlineNodes('$x$').some((node) => node?.props?.title.includes('重启 DSH 应用和宿主') && textOf(node) === 'x'))
mathState.status = 'ready'
delete window.document

// ---- 安全过滤 ----
const xss = texOf(inlineNodes('$\\href{javascript:alert(1)}{click}$'))
check('去掉 \\href（防 javascript: 链接）', !xss.tex.includes('\\href') && !xss.tex.includes('javascript:'), xss.tex)
const styled = texOf(inlineNodes('$\\style{color:red}{x}$'))
check('去掉 \\style', !styled.tex.includes('\\style'), styled.tex)
const requireTag = texOf(inlineNodes('$\\require{enclose}x$'))
check('去掉 \\require', !requireTag.tex.includes('\\require'), requireTag.tex)
const normal = texOf(inlineNodes('$\\frac{\\sqrt{2}}{2}$'))
check('正常公式不受过滤影响', normal.tex === '\\frac{\\sqrt{2}}{2}', normal.tex)

// 用实际列表组件检查批量入口、选择状态和动作回调。
let components
let stateHook = useState
let refHook = (v) => ({ current: v })
let effectHook = () => {}
const requests = []
let rpcResult = { items: [] }
let rpcResponder = null
let rpcError = null
const mockWindow = {}
const react = { createElement: h, useState: (v) => stateHook(v), useEffect: (fn, deps) => effectHook(fn, deps),
  useRef: (v) => refHook(v), useMemo: (fn) => fn(), useCallback: (fn) => fn, useId: () => 'test-id' }
components = createClient(react, { window: mockWindow, fetch: async (_, options) => {
  const payload = JSON.parse(options.body)
  requests.push(payload)
  if (rpcError) throw rpcError
  const result = rpcResponder ? await rpcResponder(payload) : rpcResult
  return { ok: true, json: async () => ({ ok: true, result }) }
} })
const rect = (left, top, width, height = 18) => ({ left, top, width, height, right: left + width, bottom: top + height })
function fadeFixture(textRects, svgRects = [], lineHeight = 28) {
  let index = 0, selected
  const nodes = textRects.map((rects) => ({ textContent: '示例正文', rects, parentElement: { closest: () => false } }))
  const element = {
    getBoundingClientRect: () => rect(100, 200, 600, lineHeight * 2),
    querySelectorAll: () => svgRects.map((r) => ({ getBoundingClientRect: () => r })),
    ownerDocument: {
      createTreeWalker: () => ({ nextNode: () => nodes[index++] }),
      createRange: () => ({ setStart: (node) => { selected = node }, setEnd() {}, getClientRects: () => selected.rects }),
    },
  }
  return components.previewFadePosition(element, lineHeight)
}
check('自动换行的渐隐跟随最后一行末端', JSON.stringify(fadeFixture([[rect(100, 202, 590), rect(100, 230, 540), rect(100, 258, 590)]]))
  === JSON.stringify({ top: 28, start: 468, end: 540 }))
check('手动换行后的短行也从实际末尾渐隐', JSON.stringify(fadeFixture([[rect(100, 202, 500)], [rect(100, 230, 90)], [rect(100, 258, 500)]]))
  === JSON.stringify({ top: 28, start: 18, end: 90 }))
check('最后一行是公式时使用公式外框且忽略隐藏公式', JSON.stringify(fadeFixture([[rect(100, 210, 500)]], [rect(100, 260, 240, 40), rect(100, 330, 500, 40)], 60))
  === JSON.stringify({ top: 60, start: 168, end: 240 }))
check('公式后的短文字决定渐隐末端', JSON.stringify(fadeFixture([[rect(100, 210, 500)], [rect(350, 282, 40)]], [rect(100, 260, 240, 40)], 60))
  === JSON.stringify({ top: 60, start: 218, end: 290 }))
for (const secondary of ['', '约1个月2天']) {
  const tree = components.CountdownLines({ countdown: { year: 2028, days: secondary ? 32 : 30, approx: true, lines: { secondary, target: '目标日' } } })
  check('倒计时时长行按内容显示或隐藏', tree.children.filter(Boolean).length === (secondary ? 4 : 3))
}
const estimatedCountdown = components.CountdownLines({ countdown: {
  year: 2028, days: 407, approx: true,
  lines: { secondary: '约1年1个月12天', target: '目标日：约2027年12月19日' },
} })
const [countdownTitle, countdownDays, countdownDuration, countdownTarget] = estimatedCountdown.children
check('倒计时标题与天数分行，只有天数使用加粗节点',
  textOf(countdownTitle) === '距离 2028 考研还剩'
  && textOf(countdownDays) === '约 407 天'
  && countdownDays.children.find((node) => node?.type === 'strong')?.children[0] === '407')
check('倒计时时长与目标日期的数字、汉字之间加空格',
  textOf(countdownDuration) === '约 1 年 1 个月 12 天'
  && textOf(countdownTarget) === '目标日：约 2027 年 12 月 19 日')
const examDay = components.CountdownLines({ countdown: { year: 2027, days: 0, approx: false } })
check('正式日期省略约字，开考当天保留提示', textOf(examDay.children[1]) === '0 天' && textOf(examDay.children[2]) === '今日开考')
const expiredCountdown = components.CountdownLines({ countdown: { days: -1, lines: { primary: '2027考研的考试日期已过' } } })
check('已过期时保留原提示并给年份加空格', textOf(expiredCountdown.children[0]) === '2027 考研的考试日期已过' && !expiredCountdown.children[1])
function resolve(node) {
  if (node == null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(resolve)
  if (typeof node.type === 'function') return resolve(node.type({ ...node.props, children: node.children }))
  return { ...node, children: node.children.map(resolve) }
}
const examStrip = resolve(components.ExamStrip({ boot: { settings: { targetYear: 2028 }, yearOptions: [2028] } }))
let yearSelect
walk(examStrip, (node) => { if (node.type === 'select') yearSelect = node })
check('年份选择器隐藏文字标签并保留无障碍名称',
  !textOf(examStrip).includes('考研年份') && yearSelect?.props['aria-label'] === '考研年份')

for (const kind of ['all', 'favorite', 'wrong']) {
  const actions = []
  const props = { list: { total: 3, items: [{ id: 'q1', summary: '题目一', typeLabel: '单选题' }, { id: 'q2', summary: '题目二', typeLabel: '解答题' }] },
    kind, subjectName: '数学', managing: true, selected: ['q1'],
    onSelectAll: (value) => actions.push(value), onBulk: (action) => actions.push(action), onToggle: (id) => actions.push(id),
    onOpen: () => actions.push('open') }
  const tree = resolve(components.ListPane(props))
  const buttons = [], inputs = [], rows = []
  walk(tree, (n) => {
    if (n.type === 'button') buttons.push(n)
    if (n.type === 'input') inputs.push(n)
    if (n.props.className?.startsWith('kd-list-row')) rows.push(n)
  })
  check(`${kind} 列表可逐题选择且保持选中状态`, inputs.length === 2 && inputs[0].props.checked && !inputs[1].props.checked)
  rows[0].props.onClick({ target: { closest: () => null } })
  rows[1].props.onClick({ target: { closest: () => inputs[1] } })
  inputs[1].props.onChange()
  for (const label of ['全选', '全不选', '收藏', '取消收藏', '加入错题本', '移出错题本', '删除题目']) {
    buttons.find((b) => textOf(b) === label).props.onClick()
  }
  check(`${kind} 卡片点击切换选中，复选框只触发一次且不打开详情`,
    JSON.stringify(actions) === JSON.stringify(['q1', 'q2', true, false, 'favorite', 'unfavorite', 'wrong', 'unwrong', 'delete']))
  for (const [selected, allDisabled, clearDisabled] of [
    [[], false, true], [['q1', 'q2'], false, false], [['q1', 'q2', 'off-page'], true, false],
  ]) {
    const currentButtons = []
    walk(resolve(components.ListPane({ ...props, selected })), (node) => { if (node.type === 'button') currentButtons.push(node) })
    const disabled = (label) => Boolean(currentButtons.find((button) => textOf(button) === label).props.disabled)
    check(`${kind} 选中 ${selected.length} 道时按整栏数量控制批量按钮`,
      disabled('全选') === allDisabled && disabled('全不选') === clearDisabled && disabled('删除题目') === clearDisabled)
  }
}

components.mathState.status = 'ready'
mockWindow.MathJax = window.MathJax
const preview = resolve(components.ListPane({ list: { items: [{ id: 'preview', stem: '完整题干\n\n$$x^2+1$$\n\n```js\n  return 42\n```' }] }, kind: 'all', onOpen() {} }))
const previewNodes = []
walk(preview, (n) => previewNodes.push(n))
check('列表预览保留公式块和代码块', previewNodes.some((n) => n.props.className === 'kd-mathblock')
  && previewNodes.some((n) => n.type === 'pre' && textOf(n).includes('  return 42')))
let opened = 0
const card = resolve(components.ListPane({ list: { items: [{ id: 'card', stem: '题干' }] }, kind: 'all', onOpen: () => opened++ }))
const cardNodes = []
walk(card, (n) => cardNodes.push(n))
const row = cardNodes.find((n) => n.props.className === 'kd-list-row')
row.props.onClick({ target: { closest: () => null } })
const target = {}
row.props.onKeyDown({ key: 'Enter', target, currentTarget: target, preventDefault() {} })
check('整张题目卡片支持点击与键盘进入详情', opened === 2)

for (const kind of ['today', 'all', 'favorite', 'wrong']) {
  let index = 0
  const initial = { 0: { settings: { subjects: ['math1'] }, subjects: [] }, 1: false, 3: 'math1', 4: kind, 5: kind === 'today' ? 'detail' : 'list', 6: { id: 'q' } }
  stateHook = (value) => { const i = index++; return [Object.hasOwn(initial, i) ? initial[i] : (typeof value === 'function' ? value() : value), () => {}] }
  const page = components.Page()
  const nodes = []
  walk(page, (n) => nodes.push(n))
  const tabs = nodes.find((n) => n.type === components.TabBar)
  check(`${kind} 主栏目不显示返回按钮`, !tabs.props.onBack)
  const before = requests.length
  tabs.props.onPick(kind)
  check(`${kind} 重复点击当前栏目不发请求`, requests.length === before)
  tabs.props.onPick(kind === 'all' ? 'favorite' : 'all')
  check(`${kind} 切换其他栏目正常加载`, requests.length === before + 1 && requests.at(-1).op === 'listQuestions')
  check(`${kind} 追问默认不挂载`, !nodes.some((n) => n.type === components.ThreadPane))
}

for (const [isToday, hasViewed] of [[false, false], [false, true], [true, false], [true, true]]) {
  let index = 0
  const changed = new Map()
  const initial = { 0: { settings: { subjects: ['math1'] }, subjects: [] }, 1: false, 3: 'math1', 4: 'all', 5: 'list', 8: { items: [] } }
  stateHook = (value) => { const i = index++; return [Object.hasOwn(initial, i) ? initial[i] : (typeof value === 'function' ? value() : value), (v) => changed.set(i, v)] }
  const page = components.Page()
  const nodes = []
  walk(page, (n) => nodes.push(n))
  rpcResult = { question: { id: 'q', answerState: hasViewed ? 'revealed' : 'locked', attemptCount: hasViewed ? 1 : 0 }, thread: { messages: [] }, isToday }
  await nodes.find((n) => n.type === components.ListPane).props.onOpen('q')
  check(`列表进入：今日题=${isToday}、已看答案=${hasViewed}`, changed.get(16) === !(isToday && hasViewed))
  initial[5] = 'detail'; initial[6] = rpcResult.question; index = 0
  const detailNodes = []
  walk(components.Page(), (n) => detailNodes.push(n))
  const back = detailNodes.find((n) => n.type === components.TabBar).props.onBack
  detailNodes.find((n) => n.type === components.QuestionPane).props.onRedo()
  check('主动重新作答隐藏答案并收起追问', changed.get(16) === true && changed.get(17) === false)
  rpcResult = { items: [] }
  await back()
  check('详情菜单栏的返回按钮回到原列表', changed.get(5) === 'list'
    && requests.at(-1).op === 'listQuestions' && requests.at(-1).args.kind === 'all')
}
stateHook = useState
const redo = resolve(components.QuestionPane({ localRedo: true, choice: '', q: {
  id: 'q', type: 'single', isChoice: true, typeLabel: '单选题', answerState: 'revealed', attemptCount: 1,
  options: [{ key: 'A', text: '选项 A' }, { key: 'B', text: '选项 B' }], lastAttempt: { choice: 'A', result: 'correct' },
  answer: { answerKey: 'A', answer: 'SECRET ANSWER', explanation: 'SECRET EXPLANATION' },
  publishVerification: { status: 'passed', summary: 'SECRET REVIEW' },
  examAlignment: { outlineYear:2027, rationale:'SECRET FIT', sources:[{ id:'ref-1',url:'https://www.neea.edu.cn/test',title:'官方大纲',year:2027,official:true }], checkedAt:'2026-11-05T00:00:00Z' },
} }))
check('重新作答隐藏答案解析和可能泄题的校验结论', !textOf(redo).includes('SECRET') && textOf(redo).includes('提交答案'))
check('重新作答时隐藏追问按钮', !textOf(redo).includes('本题追问'))
const scopeOnly = resolve(components.QuestionPane({ q: {
  id:'scope-only',type:'fill',options:[],difficulty:3,attemptCount:0,
  answerStatus:'verified',favorite:true,wrongEver:true,
  examAlignment:{status:'difficulty-unverified',scopeBasis:'built-in',scopeLabel:'内置科目范围',sources:[{id:'ref-1',local:true}]},
} }))
const scopeOnlyList = resolve(components.ListPane({list:{items:[
  {id:'scope-only',stem:'题干',answerStatus:'verified',difficulty:3,difficultyUnverified:true},
]},kind:'all',onOpen(){}}))
check('难度未校验的题目在详情与列表均显示标记，省去未校验的分数',
  [scopeOnly,scopeOnlyList].every((pane)=>textOf(pane).includes('× 真题难度校验')&&!textOf(pane).includes('难度 3/5')))
check('详情显示大纲、独立校验、收藏和错题本的符号标签',
  ['× 考试大纲校验', '✓ 独立校验', '☆ 收藏', '◨ 错题本'].every((label) => textOf(scopeOnly).includes(label)))
check('本地依据只显示实际范围，不伪造大纲年份或核验时间',
  textOf(scopeOnly).includes('范围校验依据 · 内置科目范围') && !/undefined|核验时间/.test(textOf(scopeOnly)))
let fallbackMode, skipped = false
const brokenChoice = resolve(components.QuestionPane({
  q: { id: 'broken', type: 'single', canSelect: false, options: [{ key: 'A', text: '仅一个选项' }] },
  onReveal: (mode) => { fallbackMode = mode }, onSkip: () => { skipped = true },
}))
walk(brokenChoice, (node) => {
  if (node.type !== 'button') return
  const label = textOf(node)
  if (label === '作答完毕' || label === '跳过本题') node.props.onClick()
})
check('残缺选择题有作答完毕和跳过入口', !textOf(brokenChoice).includes('提交答案') && fallbackMode === 'done' && skipped)
const archivedBoot = { subjects: [
  { id: 'math1', name: '数学一', enabled: true },
  { id: 'math2', name: '数学二', enabled: false },
  { id: 'politics', name: '思想政治理论', enabled: false },
], counts: { math2: { all: 1 } } }
const navLabels = [], mobileOptions = [], navNames = []
walk(components.SubjectNav({ boot: archivedBoot, subjectId:'math2' }), (node) => {
  if (node.props.className === 'kd-nav-group-label') navLabels.push(textOf(node))
  if (node.props.className?.startsWith('kd-nav-item')) navNames.push(node.props.title)
})
walk(components.MobileBar({ boot: archivedBoot, subjectId:'math2' }), (node) => {
  if (node.type === 'option' && node.props.value) mobileOptions.push(node.props.value)
})
check('桌面和窄屏只显示启用科目，省去分组标题',
  navLabels.length === 0 && navNames.join() === '数学一' && mobileOptions.join() === 'math1')
for (const component of [components.SubjectNav, components.MobileBar]) {
  const nav = textOf(component({ boot: archivedBoot }))
  check('桌面和窄屏各只有一个设置入口', nav.includes('设置') && !/科目管理|题库管理|检查更新|当前版本/.test(nav))
  check('记忆与建议入口位于统计之前', /记忆与建议统计/.test(nav))
}
{
  const subjects = [
    { id: 'math1', name: '数学一', enabled: true },
    { id: 'math2', name: '数学二', enabled: false },
    { id: 'custom', name: '自定义科目', enabled: true },
  ]
  const panel = (enabled) => createStudyMemoryPage({
    createElement: h, useState: (initial) => [initial ?? { enabled, reinforce: false }, () => {}], useEffect() {},
  }, { window, rpc: () => { throw new Error('渲染时不应发起请求') }, Btn: components.Btn, Icon: components.Icon })
  const inspect = (enabled, subjects) => {
    const panels = []
    let selector = false
    walk(panel(enabled)({ subjects }), (node) => {
      if (node.type === 'article') panels.push(node.props['aria-label'])
      if (node.type === 'select') selector = true
    })
    return { panels, selector }
  }
  const enabled = inspect(true, subjects)
  check('记忆页直接列出全部已启用科目且没有科目下拉菜单',
    enabled.panels.join() === '数学一,自定义科目' && !enabled.selector)
  check('关闭记忆或没有启用科目时不渲染学情面板',
    !inspect(false, subjects).panels.length && !inspect(true, subjects.filter((item) => !item.enabled)).panels.length)
}
let selectedSection, closeRequested = false, settingsKeys
effectHook = (fn) => { settingsKeys = fn }
const settingsNav = resolve(components.SettingsModal({ active: 'subjects', ready: true,
  onPick: (id) => { selectedSection = id }, onClose: () => { closeRequested = true } }))
effectHook = () => {}
check('设置作为独立全屏页面，不响应遮罩点击和 Escape',
  settingsNav.props.className === 'kd-fullscreen kd-settings-screen' && !settingsNav.props.onMouseDown && settingsKeys?.() === undefined)
const settingsHeaderButtons = []
walk(settingsNav.children[0], (node) => { if (node.type === 'button') settingsHeaderButtons.push(node) })
const [settingsBack] = settingsHeaderButtons
settingsBack?.props.onClick()
check('全屏设置标题左侧提供返回按钮', settingsHeaderButtons.length === 1
  && settingsBack.props['aria-label'] === '返回练习'
  && settingsNav.children[0].children[0].children[0] === settingsBack && closeRequested)
const sectionButtons = []
walk(settingsNav, (node) => { if (node.props.className === 'kd-settings-option') sectionButtons.push(node) })
check('设置左侧按顺序列出管理功能和关于', sectionButtons.map(textOf).join() === '科目管理,题库管理,大纲管理,真题管理,备份与恢复,关于')
sectionButtons.at(-1)?.props.onClick()
check('设置项切换到关于', selectedSection === 'about' && sectionButtons[0]?.props['aria-current'] === 'page')
const about = resolve(components.AboutPanel({ currentVersion: '2.2.0' }))
let repoLink
walk(about, (node) => { if (node.type === 'a') repoLink = node })
check('关于显示简介、GitHub 仓库和当前版本', textOf(about).includes('考研练习插件')
  && textOf(about).includes('当前版本 v2.2.0') && repoLink?.props.href === 'https://github.com/Scienmicroit/Daily-Question'
  && repoLink.props.className.includes('kd-btn') && repoLink.children.some((node) => node.type === 'svg')
  && textOf(repoLink) === 'Github')
for (const [panel, labels] of [
  [components.SubjectsModal({ boot: { settings: { subjects: [] } }, embedded: true }), '撤销保存'],
  [components.BanksModal({ boot: archivedBoot, embedded: true }), '导入题库'],
]) {
  const tree = resolve(panel)
  const header = tree.children.find((node) => node?.props?.className === 'kd-modal-head')
  check('功能按钮位于各自功能标题旁', textOf(header).endsWith(labels))
  check('功能按钮不占用底栏', !tree.children.some((node) => node?.props?.className === 'kd-modal-foot'))
}
const previousReader=globalThis.FileReader
globalThis.FileReader=class { readAsText() { this.result='考试范围包括函数极限、连续性及导数应用。';this.onload() } }
try {
  const form=new Map()
  let field=0, syllabuses, pastPapers
  stateHook=(initial)=>{
    const key=field++
    if(!form.has(key))form.set(key,typeof initial==='function'?initial():initial)
    return [form.get(key),(value)=>form.set(key,value)]
  }
  const renderImportForm=(Panel,onSaved)=>{
    field=0
    const nodes=[]
    walk(resolve(Panel({boot:archivedBoot,onSaved})),(node)=>nodes.push(node))
    return nodes
  }
  const renderSyllabusForm=()=>renderImportForm(components.SyllabusesModal,(value)=>{syllabuses=value})
  const renderPaperForm=()=>renderImportForm(components.PastPapersModal,(value)=>{pastPapers=value})
  const subjectSelect=(nodes)=>nodes.find((node)=>node.type==='select')
  const importButton=(nodes,label)=>nodes.find((node)=>node.type==='button'&&textOf(node)===label)
  let syllabusNodes=renderSyllabusForm()
  check('大纲管理未预选科目时禁用导入', subjectSelect(syllabusNodes).props.value===''
    && syllabusNodes.some((node)=>node.type==='option'&&textOf(node)==='选择一门科目')
    && importButton(syllabusNodes,'导入大纲').props.disabled)
  subjectSelect(syllabusNodes).props.onChange({target:{value:'math2'}})
  syllabusNodes=renderSyllabusForm()
  check('大纲管理选定科目后允许导入',!importButton(syllabusNodes,'导入大纲').props.disabled)
  const beforeSyllabus = requests.length
  rpcResult={importId:'syllabus-preview',canSave:true,fileName:'范围.txt',text:'函数极限'}
  await syllabusNodes.find((node)=>node.props.type==='file').props.onChange({target:{files:[{name:'范围.txt',size:64}],value:'范围.txt'}})
  check('大纲管理上传后先预览',requests.length===beforeSyllabus+1&&requests.at(-1).op==='importSyllabus'
    && requests.at(-1).args.subjectId==='math2' && requests.at(-1).args.text.includes('函数极限') && !syllabuses)
  rpcResult={syllabuses:[{subjectId:'math2',fileName:'范围.txt'}]}
  await importButton(renderSyllabusForm(),'确认导入').props.onClick()
  check('大纲预览确认后保存', requests.at(-1).op==='commitStudyImport' && syllabuses[0].fileName==='范围.txt')
  form.clear()
  renderPaperForm().find((node)=>node.props.type==='number').props.onChange({target:{value:'2025'}})
  const paperNodes=renderPaperForm()
  check('真题管理有年份但未选科目时禁用导入', subjectSelect(paperNodes).props.value===''
    && paperNodes.some((node)=>node.type==='option'&&textOf(node)==='选择一门科目')
    && importButton(paperNodes,'导入真题').props.disabled)
  subjectSelect(paperNodes).props.onChange({target:{value:'math2'}})
  check('真题管理选定科目和年份后允许导入',!importButton(renderPaperForm(),'导入真题').props.disabled)
  rpcResult={importId:'paper-preview',canSave:true,fileName:'试卷.txt',text:'真题预览'}
  await renderPaperForm().find((node)=>node.props.type==='file').props.onChange({target:{files:[{name:'试卷.txt',size:64}],value:'试卷.txt'}})
  check('真题管理携带所选科目和年份预览',requests.at(-1).op==='importPastPaper'
    && requests.at(-1).args.subjectId==='math2' && requests.at(-1).args.year===2025 && !pastPapers)
  rpcResult={pastPapers:[{subjectId:'math2',year:2025,fileName:'试卷.txt'}]}
  await importButton(renderPaperForm(),'确认导入').props.onClick()
  check('真题预览确认后保存', requests.at(-1).op==='commitStudyImport' && pastPapers[0].fileName==='试卷.txt')
  stateHook=useState
  rpcResult={items:[]}
} finally {
  if(previousReader===undefined)delete globalThis.FileReader
  else globalThis.FileReader=previousReader
}

let previewStateIndex = 0, submittedExclusions
const previewStates = []
stateHook = (value) => {
  const index = previewStateIndex++
  previewStates[index] ??= value
  return [previewStates[index], (next) => { previewStates[index] = typeof next === 'function' ? next(previewStates[index]) : next }]
}
const previewImport = { name: '预览', usable: 2, stats: { total: 3 }, warnings: [], sourceText: '文件末尾参考答案',
  items: [true, false, true].map((usable, index) => ({ index: index + 1, usable, stem: '导入预览测试题', issues: [], options: [] })) }
const bankPreviewNodes = () => {
  previewStateIndex = 0
  const nodes = []
  walk(resolve(components.BanksModal({ importResult: previewImport, onCommit(_result, excluded) { submittedExclusions = excluded } })), (node) => nodes.push(node))
  return nodes
}
const previewChecks = bankPreviewNodes().filter((node) => node.props.type === 'checkbox')
check('文本题库预览可对照完整原文', bankPreviewNodes().some((node) => node.type === 'pre' && textOf(node) === '文件末尾参考答案'))
previewChecks[0].props.onChange({ target: { checked: false } })
bankPreviewNodes().find((node) => node.type === 'button' && textOf(node) === '确认入库').props.onClick()
check('题库预览可取消单题，问题条目默认禁选',
  previewChecks[1].props.disabled && !previewChecks[1].props.checked && String(submittedExclusions) === '1')
previewImport.incomplete = true
previewImport.pages = [{ page: 1, source: 'text', text: '第 1 页正文' },
  { page: 2, source: 'failed', reason: '模型未能完整识别这一页' }]
const incompleteBank = bankPreviewNodes()
check('题库预览明确列出失败页并禁用确认入库', incompleteBank.some((node) => node.props.role === 'alert'
  && textOf(node).includes('识别失败页：2')) && incompleteBank.find((node) => node.type === 'button'
  && textOf(node) === '确认入库').props.disabled)
stateHook = useState
const sessionBoot = { settings: { subjects: ['math1'] }, subjects: [] }
const sessionQuestion = { id: 'session-q', answerState: 'revealed', attemptCount: 1 }
const sessionState = new Map([[0, sessionBoot], [1, false], [3, 'math1'], [4, 'all'], [5, 'list'], [8, { items: [] }]])
const refs = []
let stateIndex, refIndex
stateHook = (value) => {
  const i = stateIndex++
  if (!sessionState.has(i)) sessionState.set(i, typeof value === 'function' ? value() : value)
  return [sessionState.get(i), (v) => sessionState.set(i, typeof v === 'function' ? v(sessionState.get(i)) : v)]
}
refHook = (value) => refs[refIndex++] ||= { current: value }
const sessionNodes = () => {
  stateIndex = refIndex = 0
  const nodes = []
  walk(components.Page(), (n) => nodes.push(n))
  return nodes
}
rpcResult = { ...sessionBoot, question: sessionQuestion, isToday: true, items: [] }
await sessionNodes().find((n) => n.type === components.ListPane).props.onOpen(sessionQuestion.id)
sessionNodes().find((n) => n.type === components.QuestionPane).props.onRedo()
await sessionNodes().find((n) => n.type === components.TabBar).props.onBack()
await sessionNodes().find((n) => n.type === components.ListPane).props.onOpen(sessionQuestion.id)
check('今日题重新作答后离开再进入仍隐藏答案', sessionState.get(16) === true)
await sessionNodes().find((n) => n.type === components.QuestionPane).props.onReveal('done')
check('本次查看答案后恢复答案展示', sessionState.get(16) === false)
stateHook = useState
refHook = (v) => ({ current: v })
for (const [answerState, localRedo] of [['locked', false], ['revealed', false], ['revealed', true]]) {
  const q = { id: 'q', type: 'single', answerState, attemptCount: answerState === 'revealed' ? 1 : 0,
    attempts: [], options: [], lastAttempt: { result: 'correct' },
    answer: { answer: 'VISIBLE ANSWER', explanation: 'VISIBLE EXPLANATION' } }
  const pane = resolve(components.QuestionPane({ q, localRedo }))
  const visible = answerState === 'revealed' && !localRedo
  check(`本次答案展示=${visible} 时追问按钮同步展示`, textOf(pane).includes('本题追问') === visible
    && textOf(pane).includes('VISIBLE EXPLANATION') === visible)
  const focused = resolve(components.QuestionPane({ q: { ...q, stem: '题干', options: [{ key: 'A', text: '选项甲' }, { key: 'B', text: '选项乙' }],
    knowledge: ['示例知识点'] }, localRedo, focused: true, choice: 'A', onToggleFocus() {} }))
  const copy = textOf(focused)
  check(`全屏阅读只展示已揭示的答案（${visible}）并保留作答入口`, copy.includes('题干') && copy.includes('选项甲')
    && copy.includes('VISIBLE EXPLANATION') === visible && copy.includes('提交答案') === !visible
    && !/本题追问|示例知识点|累计作答|收藏/.test(copy))
}

// 科目管理只编辑草稿，完成后才提交。
const subjectsBoot = { settings: { subjects: ['math1'], subjectSource: { math1: 'auto' } }, customSubjects: [],
  referenceExams:[{id:'math1',name:'数学一',code:'301'},{id:'politics',name:'思想政治理论',code:'101'},{id:'cs408',name:'计算机学科专业基础综合',code:'408'}],
  subjects: [{ id: 'math1', name: '数学一', typeLabels: ['解答题'] }, { id: 'politics', name: '思想政治理论', typeLabels: ['单项选择题'] }] }
const originalSubjects = JSON.stringify(subjectsBoot)
let subjectState = new Map(), subjectIndex = 0, subjectSaves = [], closes = 0, failSave = false
const subjectProps = { boot: subjectsBoot, onClose: () => closes++, onDone: async (value) => {
  if (failSave) throw new Error('模拟保存失败')
  subjectSaves.push(structuredClone(value))
} }
stateHook = (value) => {
  const i = subjectIndex++
  if (!subjectState.has(i)) subjectState.set(i, typeof value === 'function' ? value() : value)
  return [subjectState.get(i), (v) => subjectState.set(i, typeof v === 'function' ? v(subjectState.get(i)) : v)]
}
const subjectNodes = () => {
  subjectIndex = 0
  const nodes = []
  walk(resolve(components.SubjectsModal(subjectProps)), (n) => nodes.push(n))
  return nodes
}
const subjectButton = (label) => subjectNodes().find((n) => n.type === 'button' && textOf(n) === label)
const subjectActionsDisabled = () => subjectButton('撤销').props.disabled && subjectButton('保存').props.disabled
const togglePolitics = () => subjectNodes().filter((n) => n.type === 'input' && n.props.type === 'checkbox')[1].props.onChange()
check('无修改时，撤销和保存按钮不可用', subjectActionsDisabled())
togglePolitics()
check('改变科目勾选状态后可以撤销和保存', !subjectButton('撤销').props.disabled && !subjectButton('保存').props.disabled)
togglePolitics()
check('勾选后再取消，撤销和保存重新置灰', subjectActionsDisabled())
const mathSource = (value) => subjectNodes().find((n) => n.props['aria-label'] === '数学一 出题来源').props.onChange({ target: { value } })
mathSource('bank')
check('改变出题来源后可以保存', !subjectButton('保存').props.disabled)
mathSource('auto')
check('恢复原出题来源后按钮重新置灰', subjectActionsDisabled())
subjectNodes().filter((n) => n.type === 'input' && n.props.type === 'checkbox')[1].props.onChange()
subjectNodes().find((n) => n.type === 'select' && n.props['aria-label'] === '思想政治理论 出题来源').props.onChange({ target: { value: 'bank' } })
check('勾选和出题来源只修改草稿', subjectSaves.length === 0 && JSON.stringify(subjectsBoot) === originalSubjects)
subjectButton('撤销').props.onClick()
check('撤销前弹出确认并保留草稿', closes === 0 && subjectButton('确认撤销')
  && subjectNodes().filter((n) => n.type === 'input' && n.props.type === 'checkbox')[1].props.checked)
const undoEffects = []
effectHook = (fn) => undoEffects.push(fn)
const undoNodes = subjectNodes()
effectHook = () => {}
const undoOverlay = undoNodes.filter((node) => node.props.className === 'kd-overlay').at(-1)
check('撤销确认不响应遮罩点击和 Escape', !undoOverlay.props.onMouseDown && undoEffects.every((fn) => fn() === undefined))
let undoClose
walk(undoOverlay, (node) => { if (node.type === 'button' && node.props['aria-label'] === '关闭') undoClose = node })
undoClose.props.onClick()
check('点击确认框的关闭图标保留草稿', closes === 0 && !subjectButton('确认撤销') && !subjectActionsDisabled())
subjectButton('撤销').props.onClick()
subjectButton('取消').props.onClick()
check('取消撤销保留草稿', closes === 0 && !subjectButton('确认撤销')
  && subjectNodes().filter((n) => n.type === 'input' && n.props.type === 'checkbox')[1].props.checked)
subjectButton('撤销').props.onClick()
subjectButton('确认撤销').props.onClick()
check('确认撤销不提交修改', closes === 1 && subjectSaves.length === 0)
subjectState = new Map()
check('重新打开不保留取消的草稿', subjectNodes().filter((n) => n.type === 'input' && n.props.type === 'checkbox')[1].props.checked === false)
check('确认撤销后按钮重新置灰', subjectActionsDisabled())
subjectNodes().find((n) => n.props['aria-label'] === '自定义科目的参考考试').props.onChange({ target: { value: 'math1' } })
subjectNodes().find((n) => n.props.placeholder === '例如：数据结构（自命题）').props.onChange({ target: { value: '专业课' } })
subjectNodes().find((n) => n.type === 'textarea').props.onChange({target:{value:'顺序表\n单链表'}})
subjectNodes().find((n) => n.props.placeholder === '自定义题型，例如：名词解释').props.onChange({ target: { value: '名词解释' } })
subjectButton('添加题型').props.onClick()
subjectButton('加入科目列表').props.onClick()
subjectNodes().find((n) => n.type === 'textarea' && n.props.value === '顺序表\n单链表').props.onChange({target:{value:'顺序表\n循环链表'}})
check('添加自定义科目和题型仍不提交且显示在草稿中', subjectSaves.length === 0 && subjectNodes().some((n) => textOf(n).includes('专业课'))
  && JSON.stringify(subjectsBoot) === originalSubjects)
failSave = true
await subjectButton('保存').props.onClick()
check('保存失败保留草稿并显示错误', subjectSaves.length === 0 && subjectNodes().some((n) => n.props.role === 'alert' && textOf(n).includes('模拟保存失败'))
  && subjectState.get(0).customSubjects[0].name === '专业课')
failSave = false
await subjectButton('保存').props.onClick()
check('完成一次提交科目和自定义题型', subjectSaves.length === 1 && subjectSaves[0].customSubjects[0].types[0] === '名词解释'
  && subjectSaves[0].subjects.includes(subjectSaves[0].customSubjects[0].id) && subjectSaves[0].customSubjects[0].referenceSubjectId === 'math1')
check('自定义练习范围跟随科目草稿保存', subjectSaves[0].customSubjects[0].outline.join(',')==='顺序表,循环链表')
subjectState = new Map()
subjectNodes().find((n) => n.props['aria-label'] === '自定义科目的参考考试').props.onChange({ target: { value: 'cs408' } })
subjectNodes().find((n) => n.props.placeholder === '自定义题型，例如：名词解释').props.onChange({ target: { value: '简答' } })
const beforeMissingName = subjectSaves.length
await subjectButton('保存').props.onClick()
check('选择 408 且缺少科目名称时，只提示补填科目名称', subjectSaves.length === beforeMissingName
  && subjectNodes().some((n) => n.props.role === 'alert' && textOf(n) === '添加自定义科目前，请填写科目名称。'))
subjectNodes().find((n) => n.props.placeholder === '例如：数据结构（自命题）').props.onChange({ target: { value: '待添加科目' } })
check('补填名称后立即清除提示', !subjectNodes().some((n) => n.props.role === 'alert'))
await subjectButton('保存').props.onClick()
check('完成同时保存未点击添加的有效自定义输入', subjectSaves.at(-1).customSubjects[0].name === '待添加科目'
  && subjectSaves.at(-1).customSubjects[0].types[0] === '简答')
subjectState=new Map()
check('参考考试显示408及独立考试且不受每日科目目录限制',subjectNodes().some((n)=>n.type==='option'&&n.props.value==='cs408')
  &&subjectNodes().some((n)=>n.type==='option'&&n.props.value==='independent')&&!subjectsBoot.subjects.some((s)=>s.id==='cs408'))
subjectNodes().find((n)=>n.props['aria-label']==='自定义科目的参考考试').props.onChange({target:{value:'independent'}})
subjectNodes().find((n)=>n.props.placeholder==='例如：数据结构（自命题）').props.onChange({target:{value:'专业课练习'}})
subjectNodes().find((n)=>n.props.placeholder==='自定义题型，例如：名词解释').props.onChange({target:{value:'简答'}})
const savesBeforeIndependent=subjectSaves.length
await subjectButton('保存').props.onClick()
check('独立参考考试缺少名称时不提交',subjectSaves.length===savesBeforeIndependent)
subjectNodes().find((n)=>n.props['aria-label']==='自定义科目的参考考试名称').props.onChange({target:{value:'示例大学数据结构'}})
subjectNodes().find((n)=>n.props['aria-label']==='自定义科目的参考考试代码').props.onChange({target:{value:'801'}})
subjectButton('加入科目列表').props.onClick()
subjectNodes().find((n)=>n.props['aria-label']==='专业课练习 参考考试科目代码').props.onChange({target:{value:'802'}})
check('编辑独立考试名称代码仍只修改草稿',subjectSaves.length===savesBeforeIndependent&&JSON.stringify(subjectsBoot)===originalSubjects)
await subjectButton('保存').props.onClick()
check('点击完成后统一保存独立考试名称代码',subjectSaves.at(-1).customSubjects[0].referenceSubjectId==='independent'
  &&subjectSaves.at(-1).customSubjects[0].referenceExamName==='示例大学数据结构'&&subjectSaves.at(-1).customSubjects[0].referenceExamCode==='802')
subjectState=new Map()
check('新自定义科目默认自主检索',subjectNodes().find((n)=>n.props['aria-label']==='自定义科目的参考考试').props.value==='auto')
subjectNodes().find((n)=>n.props.placeholder==='例如：数据结构（自命题）').props.onChange({target:{value:'示例大学计算机科学与技术'}})
subjectNodes().find((n)=>n.props['aria-label']==='自定义科目的参考考试代码（考试科目或专业）').props.onChange({target:{value:'081200'}})
subjectNodes().find((n)=>n.props.placeholder==='自定义题型，例如：名词解释').props.onChange({target:{value:'简答'}})
const beforeAuto=subjectSaves.length
subjectButton('加入科目列表').props.onClick()
subjectNodes().find((n)=>n.props['aria-label']==='示例大学计算机科学与技术 参考考试科目代码（考试科目或专业）').props.onChange({target:{value:'081201'}})
check('自主检索代码编辑仍只修改草稿',subjectSaves.length===beforeAuto&&JSON.stringify(subjectsBoot)===originalSubjects)
await subjectButton('保存').props.onClick()
check('完成后保存自动检索和专业代码',subjectSaves.at(-1).customSubjects[0].referenceSubjectId==='auto'&&subjectSaves.at(-1).customSubjects[0].code==='081201')
subjectState = new Map()
const beforeDelete = subjectSaves.length
const deleteMath = () => subjectNodes().find((n) => n.props['aria-label'] === '删除数学一')
deleteMath().props.onClick()
subjectButton('继续删除').props.onClick()
check('第二次提醒说明会删除题目与追问',subjectNodes().some((n)=>n.props.role==='dialog'&&n.props['aria-label']==='再次确认删除科目')
  && subjectNodes().some((n)=>textOf(n).includes('作答、收藏、错题和追问')))
subjectButton('取消').props.onClick()
check('取消第二次提醒仍保留科目和原草稿',Boolean(deleteMath())&&subjectSaves.length===beforeDelete)
deleteMath().props.onClick()
subjectButton('继续删除').props.onClick()
subjectButton('确认永久删除').props.onClick()
check('两次确认仅加入待删除草稿',!deleteMath()&&subjectSaves.length===beforeDelete)
await subjectButton('保存').props.onClick()
check('完成才提交科目删除',subjectSaves.at(-1).deleteSubjectIds.join()==='math1'&&!subjectSaves.at(-1).subjects.includes('math1'))
let pageStateIndex = 0
const pageInitial = { 0: subjectsBoot, 1: false, 3: 'math1', 4: 'all', 5: 'list', 8: { items: [] }, 14: { kind: 'subjects' } }
stateHook = (value) => { const i = pageStateIndex++; return [Object.hasOwn(pageInitial, i) ? pageInitial[i] : (typeof value === 'function' ? value() : value), () => {}] }
const subjectPage = []
walk(components.Page(), (n) => subjectPage.push(n))
const beforeSave = requests.length
const settingsDraft = { subjects: ['math1', 'politics'], subjectSource: { math1: 'bank' }, customSubjects: [] }
rpcResult = { settings: { ...settingsDraft, activeSubject: 'math1' }, subjects: subjectsBoot.subjects }
await subjectPage.find((n) => n.type === components.SubjectsModal).props.onDone(settingsDraft)
check('完成通过单次设置请求统一保存且保留当前科目', requests.length === beforeSave + 1
  && requests.at(-1).op === 'saveSettings' && requests.at(-1).args.activeSubject === 'math1'
  && requests.at(-1).args.subjects.length === 2 && requests.at(-1).args.subjectSource.math1 === 'bank')
stateHook = useState

// 模拟宿主零点，不依赖测试电脑的时区，也不真的等待午夜。
const timers = new Map(), focusListeners = new Map(), visibilityListeners = new Map()
let timerId = 0
mockWindow.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id }
mockWindow.clearTimeout = (id) => timers.delete(id)
mockWindow.addEventListener = (name, fn) => focusListeners.set(name, fn)
mockWindow.removeEventListener = (name) => focusListeners.delete(name)
mockWindow.document = { visibilityState: 'visible', addEventListener: (name, fn) => visibilityListeners.set(name, fn), removeEventListener: (name) => visibilityListeners.delete(name) }
const beforeMidnight = { today: '2026-11-04', now: '2026-11-04T15:59:50Z', nextDayAt: '2026-11-04T16:00:00Z' }
const afterMidnight = { today: '2026-11-05', now: '2026-11-04T16:00:00Z', nextDayAt: '2026-11-05T16:00:00Z', counts: { math1: { all: 3 } } }
const snapshots = []
const stopWatch = components.watchDayChange(beforeMidnight, (value) => snapshots.push(value))
check('按宿主的零点安排检查，不使用浏览器当前时区', [...timers.values()][0].delay === 10_000)
rpcResult = afterMidnight
await [...timers.values()][0].fn()
check('跨日自动读取新日期与数量，并安排下次零点', snapshots.at(-1).today === '2026-11-05'
  && snapshots.at(-1).counts.math1.all === 3 && [...timers.values()][0].delay === 86_400_000)
const beforeHidden = requests.length
mockWindow.document.visibilityState = 'hidden'
visibilityListeners.get('visibilitychange')()
check('后台状态变化不重复检查', requests.length === beforeHidden)
mockWindow.document.visibilityState = 'visible'
visibilityListeners.get('visibilitychange')()
await new Promise((resolve) => setImmediate(resolve))
check('从后台恢复时补查日期', requests.length === beforeHidden + 1)
rpcError = new Error('offline')
await focusListeners.get('focus')()
check('临时断网后一分钟重试', [...timers.values()][0].delay === 60_000)
rpcError = null
const beforeStop = snapshots.length
const pendingCheck = focusListeners.get('focus')()
stopWatch()
await pendingCheck
check('卸载后清理定时器和监听，不再更新页面', !timers.size && !focusListeners.size && !visibilityListeners.size && snapshots.length === beforeStop)

for (const activeKind of ['today', 'all']) {
  const state = new Map([[0, { ...beforeMidnight, settings: { subjects: ['math1'] }, subjects: [], counts: { math1: { all: 2 } } }],
    [1, false], [3, 'math1'], [4, activeKind], [5, activeKind === 'today' ? 'detail' : 'list'], [8, { page:activeKind==='all'?2:1,items: [] }]])
  const dayRefs = []
  let si, ri, effects
  stateHook = (value) => {
    const n = si++
    if (!state.has(n)) state.set(n, typeof value === 'function' ? value() : value)
    return [state.get(n), (v) => state.set(n, typeof v === 'function' ? v(state.get(n)) : v)]
  }
  refHook = (value) => dayRefs[ri++] ||= { current: value }
  effectHook = (fn, deps) => effects.push({ fn, deps })
  const renderDay = () => { si = ri = 0; effects = []; components.Page(); return effects.find((e) => e.deps?.length === 4 && e.deps[0] === state.get(0).today).fn }
  renderDay()()
  state.set(0, { ...state.get(0), ...afterMidnight })
  rpcResponder = ({ op,args }) => op === 'ensureDaily' ? { question: { id: 'new-day-q' } }
    : op === 'bootstrap' ? { ...state.get(0), todayMap: { math1: { questionId: 'new-day-q' } }, counts: { math1: { all: 3 } } }
    : { page:args.page,items: [{ id: 'new-day-q' }] }
  const requestStart = requests.length
  renderDay()()
  await new Promise((resolve) => setImmediate(resolve))
  check(`跨日时 ${activeKind} 栏目自动生成当前科目今日题`, requests.slice(requestStart).some((r) => r.op === 'ensureDaily' && r.args.subjectId === 'math1'))
  check(`跨日后 ${activeKind} 栏目数量和今日状态自动同步`, state.get(0).counts.math1.all === 3 && state.get(0).todayMap.math1.questionId === 'new-day-q')
  check(`跨日保留 ${activeKind} 栏目并更新内容`, state.get(4) === activeKind && (activeKind === 'today' ? state.get(6).id === 'new-day-q' : state.get(8).items[0].id === 'new-day-q'))
  if (activeKind === 'today') {
    let resolveOld, generation = 0
    rpcResponder = ({ op }) => op === 'ensureDaily'
      ? generation++ === 0 ? new Promise((resolve) => { resolveOld = resolve }) : { question: { id: 'latest-q' } }
      : { ...state.get(0), counts: { math1: { all: 4 } } }
    state.set(0, { ...state.get(0), today: '2026-11-06' })
    renderDay()()
    state.set(0, { ...state.get(0), today: '2026-11-07' })
    renderDay()()
    await new Promise((resolve) => setImmediate(resolve))
    resolveOld({ question: { id: 'late-old-q' } })
    await new Promise((resolve) => setImmediate(resolve))
    check('旧日期的延迟生成结果不会覆盖当前今日题', state.get(6).id === 'latest-q')
  } else {
    check('跨日刷新保留列表当前页',state.get(8).page===2)
    let resolveOldPage
    rpcResponder=({op})=>op==='listQuestions'?new Promise(resolve=>{resolveOldPage=resolve}):op==='bootstrap'?state.get(0):{}
    state.set(0,{...state.get(0),today:'2026-11-08'})
    renderDay()();await new Promise(resolve=>setImmediate(resolve))
    state.set(8,{page:3,items:[{id:'page-three'}]});renderDay()
    resolveOldPage({page:2,items:[{id:'late-page-two'}]});await new Promise(resolve=>setImmediate(resolve))
    check('跨日延迟响应不会覆盖后来切换的列表页',state.get(8).page===3&&state.get(8).items[0].id==='page-three')
  }
  rpcResponder = null
}
stateHook = useState
refHook = (v) => ({ current: v })
effectHook = () => {}

let threadIndex = 0, sent = 0, prevented = 0
stateHook = (value) => [threadIndex++ === 0 ? '请解释这一步' : value, () => {}]
const widths = []
const thread = components.ThreadPane({ thread: { messages: [] }, onSend: async () => { sent++ }, ratio: 33, onRatioChange: (v) => widths.push(v) })
const threadNodes = []
walk(thread, (n) => threadNodes.push(n))
const textarea = threadNodes.find((n) => n.type === 'textarea')
const key = (extra = {}) => textarea.props.onKeyDown({ key: 'Enter', preventDefault() { prevented++ }, ...extra })
key({ shiftKey: true }); key({ nativeEvent: { isComposing: true } }); key({ keyCode: 229 })
check('换行与中文输入法确认不触发发送', sent === 0 && prevented === 0)
key(); key({ repeat: true })
check('Enter 发送且按住回车不会重复发送', sent === 1 && prevented === 2)
const separator = threadNodes.find((n) => n.props.role === 'separator')
for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) separator.props.onKeyDown({ key, preventDefault() {} })
check('分隔线支持键盘调整比例且限制范围', JSON.stringify(widths) === JSON.stringify([35, 31, 20, 55]))
for (const clientX of [400, 1100]) separator.props.onPointerMove({ pointerId: 1, clientX, currentTarget: {
  hasPointerCapture: () => true,
  parentElement: { getBoundingClientRect: () => ({ right: 1200 }), closest: () => ({ querySelector: () => ({ getBoundingClientRect: () => ({ left: 200 }) }) }) },
} })
check('拖动分隔线使用主区域宽度并限制比例', JSON.stringify(widths.slice(-2)) === JSON.stringify([55, 20]))
stateHook = useState

const pageChanges=[]
const pagedNodes=[]
walk(resolve(components.ListPane({list:{total:60,page:1,totalPages:2,items:[{id:'paged-q',stem:'测试题干',summary:'测试题干',typeLabel:'解答题',answerStatus:'verified'}]},
  kind:'all',subjectName:'数学一',selected:[],managing:false,onPage:page=>pageChanges.push(page)})),n=>pagedNodes.push(n))
check('分页显示栏目总量及当前页数',pagedNodes.some(n=>textOf(n).includes('共 60 道'))&&pagedNodes.some(n=>textOf(n)==='第 1 / 2 页'))
check('第一页禁用上一页',pagedNodes.find(n=>n.type==='button'&&textOf(n)==='上一页').props.disabled)
pagedNodes.find(n=>n.type==='button'&&textOf(n)==='下一页').props.onClick()
check('下一页按钮传递正确页码',pageChanges[0]===2)

let updateState,updateEffect,updateRefs=[],updateRefIndex=0,timerDelay,cleared=false,focusListener
stateHook=(initial)=>{updateState??=initial;return [updateState,(value)=>{updateState=typeof value==='function'?value(updateState):value}]}
refHook=(initial)=>{const i=updateRefIndex++;return updateRefs[i]??=( {current:initial} )}
effectHook=(fn)=>{updateEffect=fn}
mockWindow.document={hidden:false}
mockWindow.setInterval=(_fn,delay)=>{timerDelay=delay;return 123}
mockWindow.clearInterval=(id)=>{cleared=id===123}
mockWindow.addEventListener=(name,fn)=>{if(name==='focus')focusListener=fn}
mockWindow.removeEventListener=(name,fn)=>{if(name==='focus'&&focusListener===fn)focusListener=null}
const updateNodes=()=>{updateRefIndex=0;const nodes=[];walk(resolve(components.UpdateCheck({currentVersion:'2.0.0'})),n=>nodes.push(n));return nodes}
rpcResult={currentVersion:'2.0.0',latestVersion:'2.0.1',updateAvailable:true,packageUrl:'https://www.npmjs.com/package/daily-question'}
updateNodes();const stopUpdates=updateEffect()
await new Promise(resolve=>setImmediate(resolve))
check('打开页面自动检查且每6小时重查',requests.at(-1).op==='checkUpdates'&&requests.at(-1).args.force===false&&timerDelay===6*60*60*1000)
check('同时展示当前版本及新版npm链接',updateNodes().some(n=>textOf(n)==='当前版本 v2.0.0')&&updateNodes().some(n=>n.type==='a'&&textOf(n).includes('2.0.1')&&n.props.href===rpcResult.packageUrl))
await updateNodes().find(n=>n.type==='button'&&textOf(n)==='检查更新').props.onClick()
check('手动检查强制重查npm',requests.at(-1).args.force===true)
rpcResult={...rpcResult,latestVersion:'2.0.0',updateAvailable:false}
await updateNodes().find(n=>n.type==='button'&&textOf(n)==='检查更新').props.onClick()
check('无新版时显示已是最新版本',updateNodes().some(n=>n.props.role==='status'&&textOf(n)==='已是最新版本'))
rpcError=new Error('模拟npm断网')
await updateNodes().find(n=>n.type==='button'&&textOf(n)==='检查更新').props.onClick()
check('断网提示重试且保留当前版本',updateNodes().some(n=>n.props.role==='status'&&textOf(n).includes('请重试'))&&updateNodes().some(n=>textOf(n)==='当前版本 v2.0.0'))
rpcError=null;stopUpdates()
check('关闭页面清理更新检查定时器与事件',cleared&&focusListener===null)

{
  const backupState = new Map()
  let backupIndex, backupEffects, restored = false
  stateHook = (initial) => {
    const index = backupIndex++
    if (!backupState.has(index)) backupState.set(index, initial)
    return [backupState.get(index), (value) => backupState.set(index, value)]
  }
  refHook = (value) => ({ current: value })
  effectHook = (fn) => backupEffects.push(fn)
  const nodes = () => {
    backupIndex = 0
    backupEffects = []
    const result = []
    walk(resolve(components.BackupModal({ embedded: true, onRestored: () => { restored = true } })), (node) => result.push(node))
    return result
  }
  const button = (label) => nodes().find((node) => node.type === 'button' && textOf(node) === label)
  rpcResult = [{ kind: 'before-delete', at: '2026-11-17T08:00:00Z' }]
  check('备份页分别展示下载、文件恢复和本机恢复点', button('下载备份') && button('选择备份文件')
    && nodes().some((node) => node.type === 'h3' && textOf(node) === '本机恢复点'))
  const unload = backupEffects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const beforeRestore = requests.length
  button('使用此恢复点').props.onClick()
  check('选择恢复点后先确认且显示来源', requests.length === beforeRestore
    && nodes().some((node) => node.type === 'strong' && textOf(node) === '删除科目前'))
  button('取消').props.onClick()
  check('取消确认不会发起恢复', requests.length === beforeRestore && !button('确认恢复'))
  nodes().find((node) => node.type === 'input' && node.props.type === 'file').props.onChange({
    target: { value: 'backup.json', files: [{ name: 'backup.json', text: async () => '{"schemaVersion":1}' }] },
  })
  check('从文件恢复显示文件名并等待确认', requests.length === beforeRestore
    && nodes().some((node) => node.type === 'strong' && textOf(node) === 'backup.json'))
  rpcResult = {}
  await button('确认恢复').props.onClick()
  check('确认后提交所选文件并完成恢复', restored && requests.at(-1).op === 'restoreBackup'
    && requests.at(-1).args.confirmed && requests.at(-1).args.data.schemaVersion === 1)
  unload()
}

let notificationClock = 0
mockWindow.performance = { now: () => notificationClock }
for (const action of ['auto', 'close', 'undo']) {
  let phase, bannerEffect, undone = false
  stateHook = (initial) => initial === 'visible' ? [phase ?? initial, (value) => { phase = value }] : useState(initial)
  effectHook = (fn) => { bannerEffect = fn }
  const banner = () => resolve(components.NotificationBanner({ message: '测试通知',
    tone: action === 'close' ? 'bad' : 'ok', onUndo: action === 'undo' ? () => { undone = true } : undefined }))
  const nodes = []
  walk(banner(), (node) => nodes.push(node))
  const closeButton = nodes.find((node) => node.props['aria-label'] === '关闭通知')
  const stopDisplay = bannerEffect()
  const [[showTimer, show]] = timers
  const undoButton = nodes.find((node) => node.type === 'button' && textOf(node) === '撤销')
  check('通知停留两秒，撤销按钮与关闭按钮互斥', show.delay === 2000
    && (action === 'undo' ? undoButton && !closeButton : closeButton && !undoButton))
  if (action === 'undo') {
    undoButton.props.onClick()
    check('点击撤销会执行操作', undone)
  } else if (action === 'close') closeButton.props.onClick()
  else show.fn()
  stopDisplay()
  check('手动或自动关闭都会进入收回动画', banner().children[0].props.className.includes('is-leaving') && !timers.has(showTimer))
  const stopExit = bannerEffect()
  const [exit] = timers.values()
  exit.fn()
  stopExit()
  check('收回动画结束后移除横幅', exit.delay === 180 && banner() === null && timers.size === 0)
}

{
  let phase = 'visible', hovering = false, bannerEffect, cleanup
  const remaining = { current: 2000 }
  stateHook = (initial) => initial === 'visible' ? [phase, (value) => { phase = value }]
    : [hovering, (value) => { hovering = value }]
  refHook = () => remaining
  effectHook = (fn) => { bannerEffect = fn }
  const refresh = () => {
    cleanup?.()
    const banner = resolve(components.NotificationBanner({ message: '悬停测试', floating: true }))
    cleanup = bannerEffect()
    return banner?.children[0].props
  }
  let controls = refresh()
  notificationClock += 900
  controls.onMouseEnter()
  controls = refresh()
  notificationClock += 8000
  check('鼠标停在通知内时暂停，不会自动收回', timers.size === 0 && phase === 'visible')
  controls.onMouseLeave()
  controls = refresh()
  check('移出后仅等待第一次悬停前的剩余时间', [...timers.values()][0].delay === 1100)
  notificationClock += 600
  controls.onMouseEnter()
  controls = refresh()
  notificationClock += 5000
  controls.onMouseLeave()
  refresh()
  const [expiry] = timers.values()
  check('反复移入移出只累计鼠标在外部的时间', expiry.delay === 500)
  notificationClock += 500
  expiry.fn()
  controls = refresh()
  check('累计两秒后开始收回，退出动画不会再暂停', controls.className.includes('is-leaving') && !controls.onMouseEnter
    && [...timers.values()][0].delay === 180)
  cleanup?.()
}

console.log(failures === 0 ? '全部通过' : `${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
