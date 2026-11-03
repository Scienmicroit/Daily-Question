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
