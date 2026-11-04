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

console.log(failures === 0 ? '全部通过' : `${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
