import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 渲染器单元测试：直接切片 client.js 里的 LaTeX / Markdown 解析段，
 * 用一个只记录结构的 React 桩函数跑一遍，检查解析结果（不是模拟浏览器渲染）。
 */
const clientPath = fileURLToPath(new URL('../client.js', import.meta.url))
const source = readFileSync(clientPath, 'utf8')
const start = source.indexOf('    /* ============================== LaTeX')
const end = source.indexOf('    /* ============================== 样式')
if (start < 0 || end < 0) throw new Error('没有找到渲染器代码段')
const code = `let uid = 0\nconst nextKey = (prefix) => prefix + (uid += 1)\n${source.slice(start, end)}\nreturn { inlineNodes, renderBlocks, renderMath, Markdown }`

const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(9) })
function useState(initial) {
  return [typeof initial === 'function' ? initial() : initial, () => {}]
}
const factory = new Function('h', 'useState', 'useMemo', 'useEffect', 'useRef', 'useCallback', code)
const { renderBlocks, inlineNodes, Markdown } = factory(h, useState, (fn) => fn(), () => {}, (v) => ({ current: v }), (fn) => fn)

let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log(`ok   ${name}`)
  else { failures += 1; console.log(`FAIL ${name} :: ${detail}`) }
}

function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  if (typeof node === 'object') {
    visit(node)
    for (const child of node.children || []) walk(child, visit)
  }
}
function classes(node) {
  const out = []
  walk(node, (item) => { if (item.props?.className) out.push(item.props.className) })
  return out
}
function types(node) {
  const out = []
  walk(node, (item) => out.push(item.type))
  return out
}
function textOf(node) {
  let out = ''
  const visit = (item) => { for (const child of item.children || []) if (typeof child === 'string') out += child }
  if (typeof node === 'string') return node
  const collect = (value) => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) { value.forEach(collect); return }
    if (typeof value === 'string') { out += value; return }
    if (typeof value === 'object') {
      visit(value)
      ;(value.children || []).forEach(collect)
    }
  }
  collect(node)
  return out
}
function find(node, cls) {
  let hit = null
  walk(node, (item) => { if (!hit && item.props?.className?.includes(cls)) hit = item })
  return hit
}

// ---- 数学公式 ----
const inlineMath = inlineNodes('设 $x^2+\\frac{1}{2}$ 为所求')
check('行内公式识别为 $...$', classes(inlineMath).some((c) => c.includes('kd-math')), JSON.stringify(classes(inlineMath)))
check('上下标渲染为 sup', types(inlineMath).includes('sup'))
check('分式渲染为 kd-frac', classes(inlineMath).some((c) => c.includes('kd-frac')))

const blockMath = renderBlocks('$$\\int_0^1 x\\,dx = \\frac{1}{2}$$')
check('独立公式渲染为块级', classes(blockMath).some((c) => c.includes('kd-mathblock')))
check('积分号渲染为大运算符', classes(blockMath).some((c) => c.includes('kd-op')))

const parenMath = inlineNodes('因为 \\(A\\) 的特征值为 0')
check('支持 \\( ... \\) 定界符', classes(parenMath).some((c) => c.includes('kd-math')) && !textOf(parenMath).includes('\\('))

const bracketMath = renderBlocks('\\[\nA^2+A\n\\]')
check('支持 \\[ ... \\] 定界符', classes(bracketMath).some((c) => c.includes('kd-mathblock')))

const matrix = renderBlocks('$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$')
check('矩阵渲染为表格', types(matrix).includes('table') && classes(matrix).some((c) => c.includes('kd-matrix')))

const cases = renderBlocks('$$\\begin{cases} x, & x>0 \\\\ -x, & x\\le 0 \\end{cases}$$')
check('分段函数渲染', classes(cases).some((c) => c.includes('kd-cases')))

const greek = inlineNodes('$\\alpha+\\beta \\to \\infty$')
check('希腊字母与符号', textOf(greek).includes('α') && textOf(greek).includes('∞'), textOf(greek))

const unknown = inlineNodes('$\\weirdcmd{x}$')
check('未知命令保留原文并提示', classes(unknown).some((c) => c.includes('kd-latex-unknown')) && textOf(unknown).includes('\\weirdcmd'), textOf(unknown))

const sqrt = inlineNodes('$\\sqrt[3]{x}$')
check('根式渲染', classes(sqrt).some((c) => c.includes('kd-sqrt')))

const textCmd = inlineNodes('$\\text{当 } x>0$')
check('\\text 原样输出', textOf(textCmd).includes('当'))

const italic = inlineNodes('$x+y$')
const italicText = textOf(italic)
check('变量使用数学斜体码位', italicText.includes('\u{1D465}') && italicText.includes('\u{1D466}'), italicText)
const upright = inlineNodes('$\\sin x+1$')
const uprightText = textOf(upright)
check('函数名与数字保持直立', uprightText.includes('sin') && uprightText.includes('1') && !uprightText.includes('\u{1D460}'), uprightText)
const italicH = textOf(inlineNodes('$h(t)$'))
check('斜体 h 使用 U+210E', italicH.includes('\u210E'), italicH)

// 减号与导数记号必须是数学符号，不能是 ASCII 连字符/撇号
const minus = textOf(inlineNodes('$x-1$'))
check('减号使用 U+2212 而不是 ASCII 连字符', minus.includes('\u2212') && !minus.includes('-'), minus)
const prime1 = textOf(inlineNodes("$f'(x)$"))
check("撇号使用 U+2032 而不是 ASCII '", prime1.includes('\u2032') && !prime1.includes("'"), prime1)
const prime2 = textOf(inlineNodes("$f''(x)$"))
check('二阶导使用 U+2033', prime2.includes('\u2033'), prime2)
const primeCurly = textOf(inlineNodes('$f\u2019(x)$'))
check('中文输入法的 ’ 也归一为 U+2032', primeCurly.includes('\u2032') && !primeCurly.includes('\u2019'), primeCurly)
const textHyphen = textOf(inlineNodes('$\\text{a-b}$'))
check('文本模式保留普通连字符', textHyphen.includes('a-b'), textHyphen)

// 其余符号也必须是数学字符
const times = textOf(inlineNodes('$a*b$'))
check('乘号使用 U+2217 而不是 ASCII 星号', times.includes('\u2217') && !times.includes('*'), times)
const ellipsis = textOf(inlineNodes('$x_1,...$'))
check('省略号使用 U+2026', ellipsis.includes('\u2026'), ellipsis)
const norm = textOf(inlineNodes('$\\|x\\|$'))
check('\\| 渲染为双竖线 U+2016', norm.includes('\u2016'), norm)
const cond = textOf(inlineNodes('$P(A\\mid B)$'))
check('\\mid 渲染为条件竖线 U+2223', cond.includes('\u2223'), cond)

// amsmath 常用命令：\boxed / \binom / \overrightarrow
const boxed = inlineNodes('$\\boxed{x=1}$')
check('\\boxed 渲染成方框而不是字面量', classes(boxed).some((c) => c.includes('kd-boxed')), JSON.stringify(classes(boxed)))
check('\\boxed 内部内容正常渲染', textOf(boxed).includes('\u{1D465}=1'), textOf(boxed))
const binom = inlineNodes('$\\binom{n}{k}$')
check('\\binom 渲染为堆叠括号', classes(binom).some((c) => c.includes('kd-binom')) && textOf(binom).includes('\u{1D45B}'), textOf(binom))
const vector = inlineNodes('$\\overrightarrow{AB}$')
check('\\overrightarrow 渲染为向量箭头', classes(vector).some((c) => c.includes('kd-accent-overrightarrow')) && textOf(vector).includes('\u{1D434}'), JSON.stringify(classes(vector)))

// 公式块：根号必须保留 √ 字形（否则只剩一条横线），长箭头不能退化成字面量
const sqrtNode = inlineNodes('$\\sqrt{x^2+y^2}$')
check('根号输出里带 √ 字形', textOf(sqrtNode).includes('\u221A'), textOf(sqrtNode))
check('根号有 kd-sqrt 结构与横线容器',
  classes(sqrtNode).some((c) => c.includes('kd-sqrt')) && classes(sqrtNode).some((c) => c.includes('kd-sqrt-body')),
  JSON.stringify(classes(sqrtNode)))
// 被开方式偏高时必须换画法，否则单个 √ 字形盖不住分式
check('矮根号仍用 √ 字形', !classes(sqrtNode).some((c) => c.includes('kd-sqrt-tall')), JSON.stringify(classes(sqrtNode)))
const tallRoot = inlineNodes('$\\sqrt{\\frac{a}{b}}$')
check('分式根号切到可拉伸画法', classes(tallRoot).some((c) => c.includes('kd-sqrt-tall')), JSON.stringify(classes(tallRoot)))
check('可拉伸根号不再输出 √ 字形（避免钩子悬空）', !textOf(tallRoot).includes('\u221A'), textOf(tallRoot))
const tallBinom = inlineNodes('$\\sqrt{\\binom{n}{k}}$')
check('组合数根号也切到可拉伸画法', classes(tallBinom).some((c) => c.includes('kd-sqrt-tall')), JSON.stringify(classes(tallBinom)))
const tallIndex = inlineNodes('$\\sqrt[3]{\\frac{a}{b}}$')
check('带次数的分式根号保留次数', textOf(tallIndex).includes('3') && classes(tallIndex).some((c) => c.includes('kd-sqrt-tall')), textOf(tallIndex))
const nestedRoot = inlineNodes('$\\sqrt{1+\\sqrt{x}}$')
check('嵌套矮根号仍是字形画法', classes(nestedRoot).every((c) => !c.includes('kd-sqrt-tall')), JSON.stringify(classes(nestedRoot)))
for (const [name, glyph] of [['Longleftrightarrow', '\u27FA'], ['Longrightarrow', '\u27F9'], ['Longleftarrow', '\u27F8']]) {
  const nodes = inlineNodes(`$a \\${name} b$`)
  check(`\\${name} 渲染为箭头`, !classes(nodes).some((c) => c.includes('kd-latex-unknown'))
    && textOf(nodes).includes(glyph), textOf(nodes))
}

// 字面量 \n（模型多转义了一层）应还原成换行，且不能误伤 \nabla 这类命令
const literalBreak = renderBlocks('段落一\\n\\n段落二')
check('字面量 \\n\\n 还原成两个段落', literalBreak.length === 2
  && literalBreak.every((block) => block && block.type === 'p'), String(literalBreak.length))
const literalLine = renderBlocks('第一行\\n第二行')
check('字面量 \\n 变成换行而不是字母 n', !textOf(literalLine[0]).includes('n第'),
  JSON.stringify(textOf(literalLine[0])))
const nablaText = textOf(renderBlocks('$\\nabla f$')[0])
check('\\nabla 不会被当成换行', nablaText.includes('\u2207') && !nablaText.includes('abla f'), nablaText)

const KNOWN_SNIPPETS = [
  '\\boxed{x}', '\\binom{n}{k}', '\\lceil x \\rceil', '\\lfloor x \\rfloor',
  '\\langle a,b \\rangle', '\\ell', '\\Re', '\\Im', '\\hbar',
  '\\overset{a}{b}', '\\underset{a}{b}', '\\underbrace{1+1}_{=2}', '\\overbrace{a+b}^{c}',
  '\\big(', '\\Big[', '\\bigl\\{', '\\bmod', '\\pmod{7}', '\\|x\\|', '\\mid', '\\nmid',
  '\\bullet', '\\ni', '\\Box', '\\bigcirc', '\\dagger', '\\ddagger', '\\backslash', '\\hline',
]
const unknownCommands = KNOWN_SNIPPETS.filter((snippet) => classes(inlineNodes(`$${snippet}$`))
  .some((c) => c.includes('kd-latex-unknown')))
check('常见 LaTeX 命令都不会退化成字面量', unknownCommands.length === 0, JSON.stringify(unknownCommands))

// ---- Markdown 块级 ----
const doc = renderBlocks([
  '# 标题',
  '',
  '普通段落，**加粗**、*斜体*、`代码`、[链接](https://example.com)。',
  '',
  '- 第一项',
  '- 第二项',
  '',
  '> 引用行',
  '',
  '| 列1 | 列2 |',
  '| --- | --- |',
  '| a | b |',
  '',
  '```python',
  'for i in range(3):',
  '    print(i)',
  '```',
].join('\n'))

check('标题渲染', types(doc).includes('h3'), JSON.stringify(types(doc)))
check('粗体与斜体', types(doc).includes('strong') && types(doc).includes('em'))
check('行内代码', classes(doc).some((c) => c.includes('kd-inline-code')))
check('链接', types(doc).includes('a'))
check('无序列表', types(doc).includes('ul'))
check('引用块', types(doc).includes('blockquote'))
check('表格', types(doc).includes('table'))
const codeBlock = find(doc, 'kd-code')
check('代码块保留缩进与换行', Boolean(codeBlock) && textOf(codeBlock).includes('    print(i)'), textOf(codeBlock))

const ordered = renderBlocks('1. 一\n2. 二')
check('有序列表', types(ordered).includes('ol'))

const image = renderBlocks('![图](https://example.com/a.png)')
let imageNode = null
walk(image, (item) => { if (item.props?.url) imageNode = item })
check('图片渲染为组件并保留地址', Boolean(imageNode) && typeof imageNode.type === 'function' && imageNode.props.url === 'https://example.com/a.png', JSON.stringify(imageNode && imageNode.props))

const broken = renderBlocks('$\\frac{1}{$')
check('不完整公式不会抛错', Array.isArray(broken))

const empty = renderBlocks('')
check('空内容安全', Array.isArray(empty) && empty.length === 0)

console.log(failures ? `\n${failures} 个检查未通过` : '\n全部通过')
process.exit(failures ? 1 : 0)
