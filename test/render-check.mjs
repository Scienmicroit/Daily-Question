import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 渲染层单元测试：切片 client.js 里的「公式 + Markdown」代码段，用只记录结构的
 * React 桩跑一遍。公式现在交给 MathJax，所以这里用一个假的 tex2svg 记录
 * 「最终送给 MathJax 的 TeX 是什么」，而不是检查我们自己画的节点。
 */
const clientPath = fileURLToPath(new URL('../client.js', import.meta.url))
const source = readFileSync(clientPath, 'utf8')
const start = source.indexOf('    /* ============================== 公式（MathJax')
const end = source.indexOf('    /* ============================== 样式')
if (start < 0 || end < 0) throw new Error('没有找到渲染器代码段')
const code = `let uid = 0
const nextKey = (prefix) => prefix + (uid += 1)
${source.slice(start, end)}
return { inlineNodes, renderBlocks, renderMath, Markdown, mathState }`

const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(9) })
function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] }
const factory = new Function('h', 'useState', 'useMemo', 'useEffect', 'useRef', 'useCallback', code)
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

function mathNodes(node) {
  const found = []
  walk(node, (n) => { if (n.props && n.props.dangerouslySetInnerHTML) found.push(n) })
  return found
}

/** 取出送进 MathJax 的 TeX 和 display 标记。 */
function texOf(node) {
  const [first] = mathNodes(node)
  if (!first) return null
  const html = first.props.dangerouslySetInnerHTML.__html
  const match = /data-tex="([\s\S]*?)"/.exec(html)
  return {
    tex: match ? match[1] : '',
    display: /data-display="true"/.test(html),
    className: first.props.className,
  }
}

// ---- 假的 MathJax ----
mathState.status = 'ready'
globalThis.window = {
  MathJax: {
    tex2svg(tex, options) {
      const escaped = String(tex).replace(/"/g, '&#34;')
      const display = options && options.display ? 'true' : 'false'
      return { outerHTML: `<mjx-container data-tex="${escaped}" data-display="${display}"></mjx-container>` }
    },
  },
}

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

mathState.status = 'ready'
globalThis.window.MathJax.tex2svg = () => { throw new Error('boom') }
const broken = inlineNodes('$\\bad$')
check('渲染失败时降级为错误样式', textOf(broken).includes('\\bad'), textOf(broken))
check('渲染失败不抛错', true)

// ---- 安全过滤 ----
// 恢复一个可用的 tex2svg（上面测失败路径时把它换成了抛错的桩）
globalThis.window.MathJax.tex2svg = (tex, options) => {
  const escaped = String(tex).replace(/"/g, '&#34;')
  const display = options && options.display ? 'true' : 'false'
  return { outerHTML: `<mjx-container data-tex="${escaped}" data-display="${display}"></mjx-container>` }
}
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
const requests = []
let rpcResult = { items: [] }
const mockWindow = { __ModuleLoader__: { load(module) {
  components = module.factory(() => ({ createElement: h, useState: (v) => stateHook(v), useEffect() {}, useRef: (v) => refHook(v), useMemo: (fn) => fn(), useCallback: (fn) => fn }))
} } }
new Function('window', 'fetch', source.replace("    return {\n      inject: ['slots'],", "    return { ListPane, CountdownLines, Page, TabBar, ThreadPane, QuestionPane, SubjectsModal, mathState, previewFadePosition };\n    return {\n      inject: ['slots'],"))(mockWindow, async (_, options) => {
  requests.push(JSON.parse(options.body))
  return { ok: true, json: async () => ({ ok: true, result: rpcResult }) }
})
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
  const tree = components.CountdownLines({ countdown: { lines: { primary: '还剩32天', secondary, target: '目标日' } } })
  check('倒计时时长行按内容显示或隐藏', tree.children.filter(Boolean).length === (secondary ? 3 : 2))
}
function resolve(node) {
  if (node == null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(resolve)
  if (typeof node.type === 'function') return resolve(node.type({ ...node.props, children: node.children }))
  return { ...node, children: node.children.map(resolve) }
}
for (const kind of ['all', 'favorite', 'wrong']) {
  const actions = []
  const props = { list: { items: [{ id: 'q1', summary: '题目一', typeLabel: '单选题' }, { id: 'q2', summary: '题目二', typeLabel: '解答题' }] },
    kind, subjectName: '数学', managing: true, selected: ['q1'],
    onSelectAll: (value) => actions.push(value), onBulk: (action) => actions.push(action), onToggle: (id) => actions.push(id) }
  const tree = resolve(components.ListPane(props))
  const buttons = [], inputs = []
  walk(tree, (n) => { if (n.type === 'button') buttons.push(n); if (n.type === 'input') inputs.push(n) })
  check(`${kind} 列表可逐题选择且保持选中状态`, inputs.length === 2 && inputs[0].props.checked && !inputs[1].props.checked)
  inputs[1].props.onChange()
  for (const label of ['全选', '全不选', '收藏', '取消收藏', '加入错题本', '移出错题本', '删除题目']) {
    buttons.find((b) => textOf(b) === label).props.onClick()
  }
  check(`${kind} 列表批量动作回调正确`, JSON.stringify(actions) === JSON.stringify(['q2', true, false, 'favorite', 'unfavorite', 'wrong', 'unwrong', 'delete']))
  const emptySelection = resolve(components.ListPane({ ...props, selected: [] }))
  const emptyButtons = []
  walk(emptySelection, (n) => { if (n.type === 'button') emptyButtons.push(n) })
  check(`${kind} 未选择题目时禁用删除`, emptyButtons.find((b) => textOf(b) === '删除题目').props.disabled === true)
}

components.mathState.status = 'ready'
mockWindow.MathJax = globalThis.window.MathJax
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
  const back = detailNodes.find((n) => n.props.ariaLabel === '返回列表' && n.props.onClick)
  detailNodes.find((n) => n.type === components.QuestionPane).props.onRedo()
  check('主动重新作答隐藏答案并收起追问', changed.get(16) === true && changed.get(17) === false)
  rpcResult = { items: [] }
  await back.props.onClick()
  check('详情的独立返回按钮回到原列表', changed.get(5) === 'list'
    && requests.at(-1).op === 'listQuestions' && requests.at(-1).args.kind === 'all')
}
stateHook = useState
const redo = resolve(components.QuestionPane({ localRedo: true, choice: '', q: {
  id: 'q', type: 'single', isChoice: true, typeLabel: '单选题', answerState: 'revealed', attemptCount: 1,
  options: [{ key: 'A', text: '选项' }], lastAttempt: { choice: 'A', result: 'correct' },
  answer: { answerKey: 'A', answer: 'SECRET ANSWER', explanation: 'SECRET EXPLANATION' },
  publishVerification: { status: 'passed', summary: 'SECRET REVIEW' },
} }))
check('重新作答隐藏答案解析和可能泄题的校验结论', !textOf(redo).includes('SECRET') && textOf(redo).includes('提交答案'))
check('重新作答时隐藏追问按钮', !textOf(redo).includes('本题追问'))
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
await sessionNodes().find((n) => n.props.ariaLabel === '返回列表').props.onClick()
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
}

// 科目管理只编辑草稿，完成后才提交。
const subjectsBoot = { settings: { subjects: ['math1'], subjectSource: { math1: 'auto' } }, customSubjects: [],
  subjects: [{ id: 'math1', name: '数学一', typeLabels: ['解答题'] }, { id: 'english1', name: '英语一', typeLabels: ['翻译'] }] }
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
subjectNodes().filter((n) => n.type === 'input' && n.props.type === 'checkbox')[1].props.onChange()
subjectNodes().find((n) => n.type === 'select' && n.props['aria-label'] === '英语一 出题来源').props.onChange({ target: { value: 'bank' } })
check('勾选和出题来源只修改草稿', subjectSaves.length === 0 && JSON.stringify(subjectsBoot) === originalSubjects)
subjectButton('取消').props.onClick()
check('取消不提交修改', closes === 1 && subjectSaves.length === 0)
subjectState = new Map()
check('重新打开不保留取消的草稿', subjectNodes().filter((n) => n.type === 'input' && n.props.type === 'checkbox')[1].props.checked === false)
subjectNodes().find((n) => n.props.placeholder === '例如：数据结构（自命题）').props.onChange({ target: { value: '专业课' } })
subjectNodes().find((n) => n.props.placeholder === '自定义题型，例如：名词解释').props.onChange({ target: { value: '名词解释' } })
subjectButton('添加题型').props.onClick()
subjectButton('添加').props.onClick()
check('添加自定义科目和题型仍不提交且显示在草稿中', subjectSaves.length === 0 && subjectNodes().some((n) => textOf(n).includes('专业课'))
  && JSON.stringify(subjectsBoot) === originalSubjects)
failSave = true
await subjectButton('完成').props.onClick()
check('保存失败保留草稿并显示错误', subjectSaves.length === 0 && subjectNodes().some((n) => n.props.role === 'alert' && textOf(n).includes('模拟保存失败'))
  && subjectState.get(0).customSubjects[0].name === '专业课')
failSave = false
await subjectButton('完成').props.onClick()
check('完成一次提交科目和自定义题型', subjectSaves.length === 1 && subjectSaves[0].customSubjects[0].types[0] === '名词解释'
  && subjectSaves[0].subjects.includes(subjectSaves[0].customSubjects[0].id))
subjectState = new Map()
subjectNodes().find((n) => n.props.placeholder === '例如：数据结构（自命题）').props.onChange({ target: { value: '待添加科目' } })
subjectNodes().find((n) => n.props.placeholder === '自定义题型，例如：名词解释').props.onChange({ target: { value: '简答' } })
await subjectButton('完成').props.onClick()
check('完成同时保存未点击添加的有效自定义输入', subjectSaves.at(-1).customSubjects[0].name === '待添加科目'
  && subjectSaves.at(-1).customSubjects[0].types[0] === '简答')
let pageStateIndex = 0
const pageInitial = { 0: subjectsBoot, 1: false, 3: 'math1', 4: 'all', 5: 'list', 8: { items: [] }, 14: { kind: 'subjects' } }
stateHook = (value) => { const i = pageStateIndex++; return [Object.hasOwn(pageInitial, i) ? pageInitial[i] : (typeof value === 'function' ? value() : value), () => {}] }
const subjectPage = []
walk(components.Page(), (n) => subjectPage.push(n))
const beforeSave = requests.length
const settingsDraft = { subjects: ['math1', 'english1'], subjectSource: { math1: 'bank' }, customSubjects: [] }
rpcResult = { settings: { ...settingsDraft, activeSubject: 'math1' }, subjects: subjectsBoot.subjects }
await subjectPage.find((n) => n.type === components.SubjectsModal).props.onDone(settingsDraft)
check('完成通过单次设置请求统一保存且保留当前科目', requests.length === beforeSave + 1
  && requests.at(-1).op === 'saveSettings' && requests.at(-1).args.activeSubject === 'math1'
  && requests.at(-1).args.subjects.length === 2 && requests.at(-1).args.subjectSource.math1 === 'bank')
stateHook = useState

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

console.log(failures === 0 ? '全部通过' : `${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
