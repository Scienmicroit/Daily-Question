export function createMarkdown(React, { window = globalThis.window } = {}) {
  const { createElement: h, useState, useEffect, useMemo } = React
  let uid = 0
  const nextKey = (prefix) => prefix + (++uid)

  const MATHJAX_PATH = '/api/daily-question/vendor/mathjax-4.1.3'
  const mathState = { status: 'idle' }
  const mathWatchers = new Set()

  function notifyMath() {
    for (const watcher of [...mathWatchers]) {
      try { watcher() } catch (error) { /* 单个订阅出错不影响其它 */ }
    }
  }

  function subscribeMath(fn) {
    mathWatchers.add(fn)
    return () => { mathWatchers.delete(fn) }
  }

  function ensureMathJax() {
    if (mathState.status !== 'idle') return
    mathState.status = 'loading'
    const assetRoot = new URL(MATHJAX_PATH, window.document.baseURI).href
    const failed = (error) => {
      mathState.status = 'failed'
      console.warn('[daily-question] 公式引擎启动失败', error)
      notifyMath()
    }
    window.MathJax = {
      loader: { paths: { mathjax: assetRoot }, load: ['a11y/assistive-mml'] },
      startup: {
        typeset: false,
        ready() {
          const { startup } = window.MathJax
          startup.defaultReady()
          // 旧菜单设置可能重新开启依赖外部资源的语音组件。
          startup.document.options.enableEnrichment = false
          startup.document.options.enableAssistiveMml = true
          startup.output.options.displayOverflow = 'overflow'
          startup.output.options.linebreaks.inline = false
        },
      },
      options: {
        enableMenu: false,
        menuOptions: { settings: { enrich: false, assistiveMml: true, breakInline: false, overflow: 'Overflow' } },
      },
      tex: { packages: { '[-]': ['require', 'html', 'texhtml', 'setoptions'] } },
      output: {
        font: 'mathjax-newcm',
        fontPath: assetRoot + '/newcm',
        minScale: 1,
        displayOverflow: 'overflow',
        linebreaks: { inline: false },
      },
      // 每条公式自带 <defs>，注入 innerHTML 后不依赖全局字体缓存
      svg: { fontCache: 'local' },
    }
    const script = window.document.createElement('script')
    script.src = assetRoot + '/tex-svg.js'
    script.async = true
    script.onload = () => {
      const startup = window.MathJax && window.MathJax.startup
      const done = () => {
        if (typeof window.MathJax?.tex2svgPromise !== 'function') {
          failed(new Error('MathJax SVG 转换接口不可用'))
          return
        }
        mathState.status = 'ready'
        ensureMathStylesheet()
        notifyMath()
      }
      if (startup && startup.promise) startup.promise.then(done, failed)
      else done()
    }
    script.onerror = () => failed(new Error('无法加载 ' + script.src))
    window.document.head.appendChild(script)
  }

  /** SVG 输出依赖 MathJax 自己生成的样式表；手动调用 tex2svg 时不会自动插，补一次。 */
  function ensureMathStylesheet() {
    try {
      const mathJax = window.MathJax
      if (!mathJax || typeof mathJax.svgStylesheet !== 'function') return
      if (window.document.getElementById('MJX-SVG-styles')) return
      const sheet = mathJax.svgStylesheet()
      if (sheet) window.document.head.appendChild(sheet)
    } catch (error) {
      // 没有样式表也能显示，只是对齐略差，不阻断渲染
    }
  }

  /** 让组件跟着公式引擎的加载状态重渲染。 */
  function useMathJaxStatus() {
    const [status, setStatus] = useState(mathState.status)
    useEffect(() => {
      ensureMathJax()
      const update = () => setStatus(mathState.status)
      update()
      return subscribeMath(update)
    }, [])
    return status
  }

  /**
   * 规范化模型输出的 TeX：
   * - 去掉自带的 $ / $$ 包裹；
   * - 过滤能改页面结构或注入链接的宏（公式来自模型输出，不当作可信内容）；
   * - 兼容旧题公式块中的裸 \\ 换行；
   * - 其余交给 MathJax，不再自己做子集解析。
   */
  const RISKY_TEX = [
    /\\href\s*\{[^{}]*\}/g,
    /\\url\s*\{[^{}]*\}/g,
    /\\(?:style|class|cssId|htmlId|htmlClass|htmlStyle)\s*\{[^{}]*\}/g,
    /\\require\s*\{[^{}]*\}/g,
    /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}/g,
  ]

  function normalizeTeX(source, display) {
    let tex = String(source || '').trim()
    tex = tex.replace(/^\${1,2}/, '').replace(/\${1,2}$/, '')
    for (const pattern of RISKY_TEX) tex = tex.replace(pattern, '')
    if (display && /\\\\/.test(tex) && !/\\displaylines/.test(tex) && !/\\begin\{/.test(tex)) {
      tex = `\\displaylines{${tex}}`
    }
    return tex
  }

  function MathFormula({ tex, display }) {
    const [html, setHtml] = useState(null)
    useEffect(() => {
      let active = true
      window.MathJax.tex2svgPromise(tex, { display }).then(
        (node) => { if (active) setHtml(node?.outerHTML || '') },
        () => { if (active) setHtml('') },
      )
      return () => { active = false }
    }, [tex, display])
    const tag = display ? 'div' : 'span'
    const className = display ? 'kd-mathblock' : 'kd-math'
    return html ? h(tag, { className, dangerouslySetInnerHTML: { __html: html } })
      : h(tag, { className }, mathFallback(tex, html === '' ? '公式无法渲染' : ''))
  }

  function mathFallback(tex, error, key) {
    return h('span', {
      className: error ? 'kd-math-error' : 'kd-math-pending',
      title: error || '公式引擎正在加载',
      key,
    }, tex)
  }

  function renderMath(source, display) {
    const tex = normalizeTeX(source, display)
    const key = nextKey('math')
    return mathState.status === 'ready' ? h(MathFormula, { tex, display: Boolean(display), key })
      : mathFallback(tex, mathState.status === 'failed' ? '公式引擎加载失败。若刚更新插件，请重启 DSH 应用和宿主。' : '', key)
  }

  /* ============================== Markdown ============================== */
  function markdownUrl(value, image = false) {
    if (!value || /[\u0000-\u001f\u007f\\]/.test(value) || value.startsWith('//')) return null
    if (image && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value)) return value
    try {
      const { protocol } = image ? new URL(value) : new URL(value, 'https://example.invalid/')
      if (protocol === 'http:' || protocol === 'https:' || (!image && protocol === 'mailto:')) return value
    } catch { /* 地址格式无效 */ }
    return null
  }

  function matchLink(text, index) {
    if (text[index] !== '[') return null
    const close = text.indexOf(']', index + 1)
    if (close < 0 || text[close + 1] !== '(') return null
    const paren = text.indexOf(')', close + 2)
    if (paren < 0) return null
    return {
      text: text.slice(index + 1, close),
      url: text.slice(close + 2, paren).trim(),
      end: paren + 1,
    }
  }

  function MarkdownImage({ alt, url, raw }) {
    const [broken, setBroken] = useState(false)
    if (broken) {
      return h('span', { className: 'kd-image-fallback', title: '图片无法加载' }, raw)
    }
    return h('img', {
      className: 'kd-image',
      src: url,
      alt,
      loading: 'lazy',
      onError: () => setBroken(true),
    })
  }

  /** Markdown 里有转义意义的字符：只有这些才允许把反斜杠吃掉。 */
  const MD_ESCAPABLE = new Set(['\\', '`', '*', '_', '{', '}', '[', ']', '(', ')',
    '#', '+', '-', '.', '!', '>', '|', '~', '<', '$', '"', "'"])

  function inlineNodes(text) {
    const out = []
    let buffer = ''
    let index = 0
    const flush = () => { if (buffer) { out.push(buffer); buffer = '' } }
    while (index < text.length) {
      const c = text[index]
      if (c === '\\' && (text[index + 1] === '(' || text[index + 1] === '[')) {
        // 兼容 \( ... \) 与 \[ ... \] 两套 LaTeX 定界符（模型经常这样输出）。
        const display = text[index + 1] === '['
        const closing = display ? '\\]' : '\\)'
        const end = text.indexOf(closing, index + 2)
        if (end > index + 2) {
          flush()
          out.push(renderMath(text.slice(index + 2, end), display))
          index = end + 2
          continue
        }
      }
      if (c === '\\' && index + 1 < text.length) {
        const next = text[index + 1]
        // 只有 Markdown 里有意义的字符才去掉反斜杠；其余原样保留，
        // 免得把 \nabla、\neq 这类命令悄悄变成 "nabla"、"neq"。
        if (MD_ESCAPABLE.has(next)) {
          buffer += next
          index += 2
          continue
        }
        buffer += c
        index += 1
        continue
      }
      if (c === '`') {
        const end = text.indexOf('`', index + 1)
        if (end > index + 1) {
          flush()
          out.push(h('code', { className: 'kd-inline-code', key: nextKey('ic') }, text.slice(index + 1, end)))
          index = end + 1
          continue
        }
      }
      if (c === '$') {
        const display = text[index + 1] === '$'
        const marker = display ? '$$' : '$'
        const from = index + marker.length
        const end = text.indexOf(marker, from)
        if (end > from) {
          flush()
          out.push(renderMath(text.slice(from, end), display))
          index = end + marker.length
          continue
        }
      }
      if (c === '!' && text[index + 1] === '[') {
        const link = matchLink(text, index + 1)
        if (link) {
          flush()
          const url = markdownUrl(link.url, true)
          out.push(url ? h(MarkdownImage, {
            key: nextKey('img'),
            alt: link.text,
            url,
            raw: text.slice(index, link.end),
          }) : link.text)
          index = link.end
          continue
        }
      }
      if (c === '[') {
        const link = matchLink(text, index)
        if (link) {
          flush()
          const url = markdownUrl(link.url)
          const label = inlineNodes(link.text)
          if (url) out.push(h('a', {
            className: 'kd-link',
            key: nextKey('a'),
            href: url,
            target: '_blank',
            rel: 'noreferrer noopener',
          }, label))
          else out.push(...label)
          index = link.end
          continue
        }
      }
      if ((c === '*' && text[index + 1] === '*') || (c === '_' && text[index + 1] === '_')) {
        const marker = c + c
        const end = text.indexOf(marker, index + 2)
        if (end > index + 2) {
          flush()
          out.push(h('strong', { key: nextKey('b') }, inlineNodes(text.slice(index + 2, end))))
          index = end + 2
          continue
        }
      }
      if (c === '~' && text[index + 1] === '~') {
        const end = text.indexOf('~~', index + 2)
        if (end > index + 2) {
          flush()
          out.push(h('del', { key: nextKey('del') }, inlineNodes(text.slice(index + 2, end))))
          index = end + 2
          continue
        }
      }
      if (c === '*' || c === '_') {
        const previous = index === 0 ? '' : text[index - 1]
        const allowed = c === '*' || !/[A-Za-z0-9\u4e00-\u9fa5]/.test(previous)
        if (allowed) {
          const end = text.indexOf(c, index + 1)
          if (end > index + 1 && text[end + 1] !== c) {
            flush()
            out.push(h('em', { key: nextKey('em') }, inlineNodes(text.slice(index + 1, end))))
            index = end + 1
            continue
          }
        }
      }
      if (c === '\n') {
        flush()
        out.push(h('br', { key: nextKey('br') }))
        index += 1
        continue
      }
      buffer += c
      index += 1
    }
    flush()
    return out
  }

  function isFence(line) {
    return /^\s{0,3}(```+|~~~+)/.test(line)
  }

  function isBlockStart(line) {
    return isFence(line)
      || /^\s{0,3}#{1,6}\s+/.test(line)
      || /^\s{0,3}>\s?/.test(line)
      || /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
      || /^\s{0,3}([-*+]|\d{1,3}[.)])\s+/.test(line)
      || /^\s{0,3}\|/.test(line)
  }

  function renderTable(rows) {
    const header = rows[0].map((cell) => inlineNodes(cell))
    const body = rows.slice(1).map((row) => row.map((cell) => inlineNodes(cell)))
    return h('div', { className: 'kd-table-wrap', key: nextKey('tb') },
      h('table', { className: 'kd-table' },
        h('thead', null, h('tr', null, header.map((cell, index) => h('th', { key: index }, cell)))),
        h('tbody', null, body.map((row, rowIndex) => h('tr', { key: rowIndex },
          row.map((cell, cellIndex) => h('td', { key: cellIndex }, cell)))))))
  }

  function splitRow(line) {
    let text = line.trim()
    if (text.startsWith('|')) text = text.slice(1)
    if (text.endsWith('|')) text = text.slice(0, -1)
    return text.split('|').map((cell) => cell.trim())
  }

  function renderBlocks(source) {
    // 模型偶尔把换行写成字面量 `\n`（JSON 里多转义了一层），这里先还原成真换行，
    // 否则会渲染成一串多余的字母 n，段落结构也会塌成一行。
    // 用 (?!\w) 保证不会误伤 \nabla / \neq / \theta / \times 这类命令。
    const normalized = String(source || '')
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n(?!\w)/g, '\n')
      .replace(/\\r(?!\w)/g, '\n')
      .replace(/\\t(?!\w)/g, ' ')
      .replace(/\r\n?/g, '\n')
    const lines = normalized.split('\n')
    const out = []
    let index = 0
    while (index < lines.length) {
      const line = lines[index]
      if (!line.trim()) { index += 1; continue }

      const fence = /^\s{0,3}(```+|~~~+)\s*([^\s`]*)\s*$/.exec(line)
      if (fence) {
        const marker = fence[1]
        const lang = fence[2] || ''
        const body = []
        index += 1
        while (index < lines.length && !new RegExp(`^\\s{0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[index])) {
          body.push(lines[index])
          index += 1
        }
        index += 1
        out.push(h('div', { className: 'kd-code-wrap', key: nextKey('code') },
          lang ? h('div', { className: 'kd-code-lang' }, lang) : null,
          h('pre', { className: 'kd-code' }, h('code', null, body.join('\n')))))
        continue
      }

      if (/^\s{0,3}\\\[/.test(line)) {
        let body = line.replace(/^\s{0,3}\\\[/, '')
        index += 1
        while (index < lines.length && !/\\\]/.test(body)) {
          body += `\n${lines[index]}`
          index += 1
        }
        body = body.replace(/\\\]\s*$/, '')
        out.push(renderMath(body, true))
        continue
      }

      const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
      if (heading) {
        const level = Math.min(6, heading[1].length + 2)
        out.push(h(`h${level}`, { className: `kd-h kd-h${heading[1].length}`, key: nextKey('hd') },
          inlineNodes(heading[2].trim())))
        index += 1
        continue
      }

      if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push(h('hr', { className: 'kd-hr', key: nextKey('hr') }))
        index += 1
        continue
      }

      if (/^\s{0,3}>\s?/.test(line)) {
        const body = []
        while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) {
          body.push(lines[index].replace(/^\s{0,3}>\s?/, ''))
          index += 1
        }
        out.push(h('blockquote', { className: 'kd-quote', key: nextKey('q') }, renderBlocks(body.join('\n'))))
        continue
      }

      if (/^\s{0,3}\|/.test(line) && index + 1 < lines.length
        && /^\s{0,3}\|?[\s:|-]*-[\s:|-]*$/.test(lines[index + 1]) && lines[index + 1].includes('-')) {
        const rows = [splitRow(line)]
        index += 2
        while (index < lines.length && /^\s{0,3}\|/.test(lines[index])) {
          rows.push(splitRow(lines[index]))
          index += 1
        }
        out.push(renderTable(rows))
        continue
      }

      const listItem = /^(\s{0,3})([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line)
      if (listItem) {
        const ordered = /\d/.test(listItem[2])
        const items = []
        while (index < lines.length) {
          const current = /^(\s{0,3})([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(lines[index])
          if (!current) break
          const parts = [current[3]]
          index += 1
          while (index < lines.length && lines[index].trim() && !/^\s{0,3}([-*+]|\d{1,3}[.)])\s+/.test(lines[index]) && !isFence(lines[index])) {
            parts.push(lines[index].trim())
            index += 1
          }
          items.push(h('li', { key: nextKey('li') }, inlineNodes(parts.join('\n'))))
        }
        out.push(h(ordered ? 'ol' : 'ul', { className: 'kd-list', key: nextKey('ls') }, items))
        continue
      }

      const paragraph = []
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
        paragraph.push(lines[index])
        index += 1
      }
      if (!paragraph.length) { index += 1; continue }
      out.push(h('p', { className: 'kd-p', key: nextKey('p') }, inlineNodes(paragraph.join('\n'))))
    }
    return out
  }

  function Markdown({ text, className }) {
    // 公式引擎加载完成后要重渲染一次，否则首次绘制出来的还是 TeX 原文
    const mathStatus = useMathJaxStatus()
    const nodes = useMemo(() => {
      try {
        return renderBlocks(text)
      } catch (error) {
        return [h('pre', { className: 'kd-code', key: 'raw' }, String(text || ''))]
      }
    }, [text, mathStatus])
    return h('div', { className: `kd-md ${className || ''}` }, nodes)
  }

  return { Markdown, useMathJaxStatus, inlineNodes, renderBlocks, MathFormula, ensureMathJax, mathState }
}
