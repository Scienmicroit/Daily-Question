window.__ModuleLoader__.load({
  id: 'daily-question',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo, useCallback, useId } = React

    /* ============================== 文案 ============================== */
    const T = {
      title: '考研每日一题',
      subtitle: '每天每科一道题，答案独立校验后才会发布',
      tabs: { today: '今日题目', all: '全部', favorite: '收藏', wrong: '错题本' },
      tabEmpty: {
        all: '这个科目还没有历史题目。先在「今日题目」完成今天的题，或导入题库。',
        favorite: '还没有收藏任何题目。查看答案后点「收藏」即可加入收藏列表。',
        wrong: '错题本是空的。答错或选择「未能作答」的题目会自动进入错题本。',
        today: '今天还没有分配题目。',
      },
      noSubjects: '还没有启用任何科目',
      noSubjectsHint: '先添加你要复习的科目（例如数学一、408），系统会为每个科目每天分配一道题。',
      addSubject: '添加科目',
      manageSubjects: '科目管理',
      manageBanks: '题库管理',
      year: '考研年份',
      generating: '正在出题并做独立答案校验…',
      generateFailed: '出题失败',
      retry: '重试',
      submit: '提交答案',
      done: '作答完毕',
      giveup: '未能作答',
      correct: '作答正确',
      wrong: '作答错误',
      favorite: '收藏',
      unfavorite: '取消收藏',
      redo: '重新作答',
      answer: '标准答案',
      explanation: '解析',
      verified: '已通过独立校验',
      unverified: '答案待核验',
      missing: '缺少参考答案',
      attempts: '作答次数',
      assigned: '出题日期',
      difficulty: '难度',
      knowledge: '知识点',
      source: '来源',
      followup: '本题追问',
      followupHint: '只讨论当前这道题。追问不会修改正式答案详解。',
      send: '发送',
      sending: '回复生成中…',
      clearThread: '清空对话',
      close: '关闭',
      cancel: '取消',
      confirm: '确认',
      import: '导入题库',
      importHint: '支持 Markdown（.md/.txt）与文本型 PDF。导入后先预览，确认识别正确再入库。',
      preview: '识别预览',
      commit: '确认入库',
      deleteBank: '删除题库',
      deleteSubject: '移出每日出题',
      revision: '修订答案详解',
      revisionRunning: '正在生成候选版本并做独立校验…',
      confirmRevision: '确认替换',
      discardRevision: '放弃候选版本',
    }

    const TYPE_TONE = {
      single: '蓝', multiple: '蓝', fill: '青', solution: '紫', analysis: '紫', translation: '青', writing: '青', shortanswer: '紫',
    }

    /* ============================== 通用 ============================== */
    let uid = 0
    const nextKey = (prefix) => `${prefix}${(uid += 1)}`

    function formatDate(iso) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
      if (!m) return String(iso || '')
      return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`
    }

    function formatDateTime(iso) {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return String(iso || '')
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    /** 把内部方法串换成可读说法，避免面板里出现英文流水账。 */
    function methodLabel(method) {
      const value = String(method || '')
      if (!value) return '独立校验'
      if (value.startsWith('two-step')) return '两步：出题 → 独立视角校验'
      if (value.startsWith('blind-solve')) return '盲解 → 比对 → 分歧主裁'
      if (value === 'import-parse') return '题库导入解析'
      if (value === 'online-search') return '官方渠道联网核验'
      if (value === 'catalog') return '内置官方日期表'
      return value
    }

    function formatClock(iso) {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      const pad = (n) => String(n).padStart(2, '0')
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    function statusLabel(result) {
      if (result === 'correct') return { text: '正确', tone: 'ok' }
      if (result === 'wrong') return { text: '错误', tone: 'bad' }
      if (result === 'pending') return { text: '待判定', tone: 'warn' }
      return { text: '未作答', tone: 'idle' }
    }

    /* ============================== 公式（MathJax 3） ============================== */
    // MathJax 的 SVG 输出自带字形路径，不依赖任何字体文件；单文件 bundle 随包分发，
    // 由宿主在 /api/daily-question/vendor/tex-svg.js 提供。
    const MATHJAX_SRC = '/api/daily-question/vendor/tex-svg.js'
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
      window.MathJax = {
        startup: { typeset: false },
        // 每条公式自带 <defs>，注入 innerHTML 后不依赖全局字体缓存
        svg: { fontCache: 'local', scale: 1, matchFontHeight: false },
      }
      const script = document.createElement('script')
      script.src = MATHJAX_SRC
      script.async = true
      script.onload = () => {
        const startup = window.MathJax && window.MathJax.startup
        const done = () => {
          mathState.status = 'ready'
          ensureMathStylesheet()
          notifyMath()
        }
        const failed = () => { mathState.status = 'failed'; notifyMath() }
        if (startup && startup.promise) startup.promise.then(done, failed)
        else done()
      }
      script.onerror = () => { mathState.status = 'failed'; notifyMath() }
      document.head.appendChild(script)
    }

    /** SVG 输出依赖 MathJax 自己生成的样式表；手动调用 tex2svg 时不会自动插，补一次。 */
    function ensureMathStylesheet() {
      try {
        const mathJax = window.MathJax
        if (!mathJax || typeof mathJax.svgStylesheet !== 'function') return
        if (document.getElementById('MJX-SVG-styles')) return
        const sheet = mathJax.svgStylesheet()
        if (sheet) document.head.appendChild(sheet)
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
     * - 公式块里的裸 \\ 换行在 MathJax 3 需要放进 \displaylines（Typora 也是这么处理的）；
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

    function renderMath(source, display) {
      const tex = normalizeTeX(source, display)
      const key = nextKey('math')
      if (mathState.status !== 'ready') {
        // 引擎还没就绪（或加载失败）：先显示原文，就绪后组件会重渲染
        return h('span', { className: 'kd-math-pending', key, title: '公式引擎正在加载' }, tex)
      }
      try {
        const node = window.MathJax.tex2svg(tex, { display: Boolean(display) })
        const html = node && node.outerHTML
        if (!html) throw new Error('empty svg')
        return h(display ? 'div' : 'span', {
          className: display ? 'kd-mathblock' : 'kd-math',
          key,
          dangerouslySetInnerHTML: { __html: html },
        })
      } catch (error) {
        return h('span', { className: 'kd-math-error', key, title: '公式无法渲染' }, tex)
      }
    }

    /* ============================== Markdown ============================== */
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
            out.push(h(MarkdownImage, {
              key: nextKey('img'),
              alt: link.text,
              url: link.url,
              raw: text.slice(index, link.end),
            }))
            index = link.end
            continue
          }
        }
        if (c === '[') {
          const link = matchLink(text, index)
          if (link) {
            flush()
            out.push(h('a', {
              className: 'kd-link',
              key: nextKey('a'),
              href: link.url,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, inlineNodes(link.text)))
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

    /* ============================== 样式 ============================== */
    /** 由 apply 用 styles.insert 注入时置位；否则由组件渲染 <style> 兜底。 */
    let styleInjected = false
    const CSS = `
.kd-page {
  --kd-bg-base:var(--dsw-alias-bg-base, #ffffff);
  --kd-bg-layer-1:var(--dsw-alias-bg-layer-1, #ffffff);
  --kd-bg-layer-2:color-mix(in srgb, var(--kd-ink) 5%, var(--kd-surface));
  --kd-bg-overlay:var(--dsw-alias-bg-overlay, #ffffff);
  --kd-label-primary:var(--dsw-alias-label-primary, #24332f);
  --kd-label-secondary:var(--dsw-alias-label-secondary, #66736e);
  --kd-border-l1:color-mix(in srgb, var(--kd-ink) 9%, var(--kd-surface));
  --kd-border-l2:color-mix(in srgb, var(--kd-ink) 17%, var(--kd-surface));
  --kd-brand-primary:#4d6bfe;
  --kd-state-success-primary:#078443;
  --kd-state-error-primary:#db3144;
  --kd-state-warn-primary:#95702b;
  --kd-state-idle-primary:#85918b;
  --kd-ink:var(--kd-label-primary); --kd-surface:var(--kd-bg-base);
  font-family:inherit; isolation:isolate; height:100%; min-height:0; display:flex; flex-direction:column; position:relative;
  background:color-mix(in srgb, var(--kd-brand-primary) 2%, var(--kd-surface)); color: var(--kd-label-primary);
  font-size:14px; line-height:1.65; -webkit-font-smoothing:antialiased; box-sizing:border-box; }
.kd-page *, .kd-page *::before, .kd-page *::after { box-sizing:border-box; }
.kd-page :focus-visible { outline:2px solid var(--kd-brand-primary); outline-offset:2px; }
.kd-header { padding:20px 28px 12px; background:var(--kd-surface); border-bottom:1px solid var(--kd-border-l1);
  display:flex; flex-direction:column; gap:12px; }
.kd-header-top { display:flex; gap:20px; justify-content:space-between; align-items:center; flex-wrap:wrap; }
.kd-header-left { min-width:0; flex:1 1 320px; display:flex; gap:12px; align-items:center; }
.kd-brand { flex:0 0 40px; }
.kd-title { margin:0; font-size:19px; font-weight:650; letter-spacing:.01em; line-height:1.4; }
.kd-sub { margin-top:3px; font-size:12px; color:var(--kd-label-secondary); line-height:1.6; }
.kd-select { height:30px; padding:0 10px; border-radius:8px; font-size:13px; font-family:inherit;
  border:1px solid var(--kd-border-l2); background:var(--kd-bg-layer-1);
  color:var(--kd-label-primary); transition:border-color .15s; }
.kd-select:hover { border-color:var(--kd-brand-primary); }
.kd-select-sm { height:26px; font-size:12px; padding:0 6px; }
.kd-cd-lines { min-width:0; flex:0 1 auto; display:flex; flex-direction:column; align-items:flex-end;
  gap:2px; text-align:right; }
.kd-cd-primary, .kd-cd-days { font-size:21px; font-weight:400; color:var(--kd-brand-primary); font-variant-numeric:tabular-nums; line-height:1.25; }
.kd-cd-days strong { font-size:36px; font-weight:700; }
.kd-cd-secondary { font-size:12px; color:var(--kd-label-secondary); }
.kd-cd-target { font-size:11px; font-weight:400; color:var(--kd-label-primary); color:light-dark(#000, var(--kd-label-primary)); }
.kd-exam-strip { display:flex; align-items:center; gap:6px 14px; flex-wrap:wrap; padding:8px 0 0;
  border:0; border-top:1px solid var(--kd-border-l1); background:transparent;
  font-size:11.5px; color:var(--kd-label-secondary); }
.kd-strip-item { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
.kd-strip-warn { color:var(--kd-state-warn-primary); white-space:normal; text-align:left; }
.kd-shell { flex:1 1 auto; min-height:0; display:flex; }
.kd-nav { width:204px; flex:0 0 204px; background:var(--kd-surface); border-right:1px solid var(--kd-border-l1);
  padding:24px 14px; overflow:auto; display:flex; flex-direction:column; gap:18px; }
.kd-nav-group { display:flex; flex-direction:column; gap:4px; }
.kd-nav-group-label { display:flex; justify-content:space-between; gap:6px;
  font-size:10.5px; letter-spacing:.1em; color:var(--kd-label-secondary);
  padding:0 8px 4px; }
.kd-nav-item { position:relative; display:flex; align-items:center; justify-content:space-between; gap:7px; flex-direction:column; align-items:flex-start;
  width:100%; padding:12px; border-radius:9px; border:1px solid transparent; background:transparent;
  cursor:pointer; color:var(--kd-label-primary); font:inherit; font-size:13px; text-align:left;
  transition:background-color .15s, border-color .15s, color .15s; }
.kd-nav-item:hover { background:var(--kd-bg-layer-2); }
.kd-nav-item > span:first-child { min-width:0; overflow-wrap:anywhere; line-height:1.6; }
.kd-nav-item.is-active { background:color-mix(in srgb, var(--kd-brand-primary) 9%, var(--kd-surface)); border-color:transparent;
  color:var(--kd-brand-primary); font-weight:600; }
.kd-nav-item .kd-nav-count { flex:0 0 auto; white-space:nowrap; font-size:11px;
  color:var(--kd-label-secondary); }
.kd-nav-status { flex:0 0 auto; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;
  font-size:10.5px; color:var(--kd-label-secondary); }
.kd-dot { width:6px; height:6px; border-radius:50%; background:var(--kd-state-success-primary); }
.kd-dot-idle { background:var(--kd-state-idle-primary); }
.kd-nav-spacer { flex:1 1 auto; }
.kd-update { display:flex; flex-direction:column; gap:4px; }
.kd-main { flex:1 1 auto; min-width:0; overflow:hidden; display:flex; flex-direction:column; }
.kd-main-toolbar { flex:none; padding:24px 28px 20px; display:flex; align-items:center; gap:12px; }
.kd-main-toolbar > .kd-btn { flex:none; align-self:stretch; aspect-ratio:1; padding:0; min-height:0; white-space:nowrap; border-radius:12px; }
.kd-main-scroll { flex:1; min-height:0; overflow:auto; padding:0 28px 48px; scrollbar-gutter:stable; }
.kd-main-inner { width:100%; margin:0; }
.kd-thread { position:relative; width:clamp(280px,calc((100% - 204px) * var(--kd-thread-ratio, .33)),55%); flex:0 0 auto; border-left:1px solid var(--kd-border-l1);
  display:flex; flex-direction:column; min-height:0; background:var(--kd-bg-layer-1); }
.kd-thread-resize { position:absolute; left:-5px; top:0; bottom:0; width:10px; cursor:col-resize; touch-action:none; z-index:2; }
.kd-thread-resize:hover, .kd-thread-resize:focus-visible { background:color-mix(in srgb,var(--kd-brand-primary) 20%,transparent); }
.kd-thread-head { padding:20px; border-bottom:1px solid var(--kd-border-l1);
  display:flex; align-items:center; justify-content:space-between; gap:8px; }
.kd-thread-title { font-size:13px; font-weight:600; }
.kd-thread-hint { padding:12px 20px 0; font-size:11px; line-height:1.6;
  color:var(--kd-label-secondary); }
.kd-thread-scroll { flex:1 1 auto; min-height:0; overflow:auto; padding:18px 20px; display:flex;
  flex-direction:column; gap:12px; }
.kd-msg { max-width:100%; border-radius:12px; padding:10px 12px; font-size:13px; line-height:1.72; }
.kd-msg-user { align-self:flex-end; background:color-mix(in srgb, var(--kd-brand-primary) 9%, transparent);
  border:1px solid color-mix(in srgb, var(--kd-brand-primary) 26%, transparent); }
.kd-msg-assistant { align-self:stretch; padding:0; border:0; background:transparent; }
.kd-msg-meta { font-size:10px; color:var(--kd-label-secondary); margin-top:6px; }
.kd-msg-failed { border-color:var(--kd-state-error-primary); }
.kd-thread-foot { border-top:1px solid var(--kd-border-l1); padding:12px 16px; }
.kd-composer { border:1px solid var(--kd-border-l2); border-radius:12px;
  background:var(--kd-bg-base); padding:6px; transition:border-color .15s, box-shadow .15s; }
.kd-composer:focus-within { border-color:var(--kd-brand-primary);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--kd-brand-primary) 14%, transparent); }
.kd-textarea { width:100%; min-height:58px; max-height:180px; resize:vertical; padding:6px 8px;
  border:0; background:transparent; color:var(--kd-label-primary); font:inherit; font-size:13px; }
.kd-textarea:focus { outline:none; }
.kd-tabs { display:flex; gap:4px; width:fit-content; max-width:100%; min-width:0; overflow-x:auto; padding:4px; border:1px solid var(--kd-border-l1); border-radius:12px; background:var(--kd-surface); }
.kd-tab { position:relative; display:inline-flex; align-items:center; gap:6px; padding:7px 14px; white-space:nowrap;
  border:0; background:transparent; color:var(--kd-label-secondary); font:inherit; font-size:13px;
  cursor:pointer; border-radius:8px; transition:color .15s, background-color .15s; }
.kd-tab:hover { color:var(--kd-label-primary); background:var(--kd-bg-layer-2); }
.kd-tab:disabled { opacity:.5; cursor:default; background:none; transform:none; }
.kd-tab.is-active { color:var(--kd-brand-primary); font-weight:600; background:color-mix(in srgb, var(--kd-brand-primary) 10%, var(--kd-surface)); }

.kd-tab-count { min-width:17px; padding:0 5px; border-radius:999px; font-size:10.5px; line-height:17px;
  text-align:center; background:var(--kd-bg-layer-2); color:var(--kd-label-secondary); }
.kd-tab.is-active .kd-tab-count { color:var(--kd-brand-primary); }
.kd-card { border:1px solid var(--kd-border-l1); border-radius:14px;
  background:var(--kd-bg-layer-1); padding:28px; box-shadow:0 4px 24px rgb(20 45 35 / 3%); }
.kd-card + .kd-card { margin-top:14px; }
.kd-meta { display:flex; gap:8px; flex-wrap:wrap; align-items:center; font-size:12px;
  color:var(--kd-label-secondary); }
.kd-meta-dot::before { content:'·'; margin-right:8px; }
.kd-chips { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.kd-tag { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:6px;
  font-size:11.5px; line-height:1.7; white-space:nowrap;
  color:var(--kd-label-secondary); background:var(--kd-bg-layer-2); }
.kd-tag-brand { color:var(--kd-brand-primary);
  background:color-mix(in srgb, var(--kd-brand-primary) 10%, transparent); }
.kd-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:999px;
  font-size:11px; line-height:1.6; border:1px solid var(--kd-border-l2);
  color:var(--kd-label-secondary); background:var(--kd-bg-layer-1); white-space:nowrap; }
.kd-badge-ok { color:var(--kd-state-success-primary);
  border-color:color-mix(in srgb, var(--kd-state-success-primary) 34%, transparent);
  background:color-mix(in srgb, var(--kd-state-success-primary) 10%, transparent); }
.kd-badge-bad { color:var(--kd-state-error-primary);
  border-color:color-mix(in srgb, var(--kd-state-error-primary) 34%, transparent);
  background:color-mix(in srgb, var(--kd-state-error-primary) 10%, transparent); }
.kd-badge-warn { color:var(--kd-state-warn-primary);
  border-color:color-mix(in srgb, var(--kd-state-warn-primary) 34%, transparent);
  background:color-mix(in srgb, var(--kd-state-warn-primary) 12%, transparent); }
.kd-badge-brand { color:var(--kd-brand-primary);
  border-color:color-mix(in srgb, var(--kd-brand-primary) 34%, transparent);
  background:color-mix(in srgb, var(--kd-brand-primary) 10%, transparent); }
.kd-stem { margin:24px 0; font-size:16px; line-height:1.85; }
.kd-options { display:flex; flex-direction:column; gap:8px; margin:0 0 4px; }
.kd-option { display:flex; gap:12px; align-items:flex-start; padding:14px 16px; border-radius:12px;
  border:1px solid var(--kd-border-l1); background:var(--kd-bg-base); cursor:pointer;
  text-align:left; color:var(--kd-label-primary); font:inherit; font-size:14px;
  transition:background-color .15s, border-color .15s; }
.kd-option:hover:not(:disabled) { border-color:var(--kd-border-l2);
  background:var(--kd-bg-layer-2); }
.kd-option:disabled { cursor:default; }
.kd-option.is-selected { border-color:var(--kd-brand-primary);
  background:color-mix(in srgb, var(--kd-brand-primary) 7%, transparent); }
.kd-option.is-correct { border-color:color-mix(in srgb, var(--kd-state-success-primary) 45%, var(--kd-surface));
  background:color-mix(in srgb, var(--kd-state-success-primary) 8%, transparent); }
.kd-option.is-wrong { border-color:var(--kd-state-error-primary);
  background:color-mix(in srgb, var(--kd-state-error-primary) 8%, transparent); }
.kd-option-key { flex:0 0 auto; align-self:center; width:24px; height:24px; border-radius:8px; display:inline-flex;
  align-items:center; justify-content:center; font-size:12px; font-weight:600;
  border:1px solid var(--kd-border-l2); background:var(--kd-bg-base); }
.kd-option.is-selected .kd-option-key { color:var(--kd-brand-primary); border-color:var(--kd-brand-primary); }
.kd-option.is-correct .kd-option-key { color:var(--kd-state-success-primary); border-color:var(--kd-state-success-primary); }
.kd-option.is-wrong .kd-option-key { color:var(--kd-state-error-primary); border-color:var(--kd-state-error-primary); }
.kd-option-text { min-width:0; flex:1 1 auto; }
.kd-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:16px; }
.kd-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:36px;
  padding:0 14px; border-radius:8px; font-family:inherit; font-size:13px; font-weight:500; cursor:pointer;
  border:1px solid var(--kd-border-l2); background:var(--kd-bg-layer-1);
  color:var(--kd-label-primary);
  transition:background-color .15s, border-color .15s, color .15s; }
.kd-btn:hover:not(:disabled) { background:var(--kd-bg-layer-2); }
.kd-btn:disabled { opacity:.5; cursor:not-allowed; }
.kd-btn-primary { background:var(--kd-brand-primary); border-color:var(--kd-brand-primary); color:#fff; }
.kd-btn-primary:hover:not(:disabled) { background:var(--kd-brand-primary); filter:brightness(1.07); }
.kd-btn-ghost { border-color:transparent; background:transparent; color:var(--kd-label-secondary); }
.kd-btn-ghost:hover:not(:disabled) { background:var(--kd-bg-layer-2); color:var(--kd-label-primary); }
.kd-btn-danger { color:var(--kd-state-error-primary); background:transparent;
  border-color:color-mix(in srgb, var(--kd-state-error-primary) 40%, transparent); }
.kd-btn-danger:hover:not(:disabled) { background:color-mix(in srgb, var(--kd-state-error-primary) 10%, transparent); }
.kd-btn-sm { min-height:26px; padding:0 9px; font-size:12px; }
.kd-iconbtn { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px;
  border-radius:6px; border:0; background:transparent; color:var(--kd-label-secondary); cursor:pointer;
  transition:background-color .15s, color .15s; }
.kd-iconbtn:hover { background:var(--kd-bg-layer-2); color:var(--kd-label-primary); }
.kd-answer { margin-top:6px; }
.kd-answer-panel { margin-top:18px; border:1px solid var(--kd-border-l1); border-radius:14px;
  background:var(--kd-bg-layer-1); overflow:hidden; }
.kd-answer-panel-head { display:flex; align-items:center; justify-content:space-between; gap:10px;
  flex-wrap:wrap; padding:11px 18px; border-bottom:1px solid var(--kd-border-l1);
  background:color-mix(in srgb, var(--kd-brand-primary) 5%, var(--kd-surface)); font-size:13px; font-weight:600; }
.kd-answer-panel-head .kd-tag { background:var(--kd-bg-layer-1); font-weight:400; }
.kd-answer-panel-body { padding:18px; }
.kd-answer-block + .kd-answer-block { margin-top:18px; padding-top:16px;
  border-top:1px solid var(--kd-border-l1); }
.kd-answer-label { font-size:10.5px; letter-spacing:.1em; color:var(--kd-label-secondary);
  margin-bottom:6px; }
.kd-verify { margin-top:14px; padding:11px 13px; border-radius:10px; font-size:12px; line-height:1.7;
  border:1px solid var(--kd-border-l1); background:var(--kd-bg-layer-2);
  color:var(--kd-label-secondary); }
.kd-verify ul { margin:6px 0 0; padding-left:18px; }
.kd-list-row { display:flex; gap:14px; align-items:flex-start; width:100%; text-align:left;
  padding:14px 16px; border-radius:12px; border:1px solid var(--kd-border-l1);
  background:var(--kd-bg-layer-1); color:var(--kd-label-primary);
  font:inherit; transition:background-color .15s, border-color .15s; }
.kd-list-row > .kd-btn { flex:none; white-space:nowrap; }
.kd-list-row[role=button] { cursor:pointer; }
.kd-list-open { flex:none; display:flex; align-items:center; gap:6px; font-size:12px; color:var(--kd-label-secondary); white-space:nowrap; }
.kd-list-row + .kd-list-row { margin-top:8px; }
.kd-list-row:hover { border-color:var(--kd-border-l2); background:var(--kd-bg-layer-2); }
.kd-list-body { min-width:0; flex:1 1 auto; }
.kd-list-summary { --kd-preview-line-height:28px; font-size:14px; line-height:var(--kd-preview-line-height); min-width:0;
  max-height:calc(2 * var(--kd-preview-line-height)); overflow:hidden; }
.kd-list-summary .kd-md { line-height:inherit; }
.kd-list-summary .kd-md > * { display:inline; }
.kd-list-summary .kd-p, .kd-list-summary .kd-h, .kd-list-summary .kd-mathblock { margin:0; }
.kd-list-summary .kd-p::after { content:' '; }
.kd-list-summary .kd-mathblock { display:inline; padding:0; text-align:left; vertical-align:baseline; }
.kd-list-summary mjx-container[display=true] { margin:0; }
.kd-list-summary .kd-code-wrap { margin:0; border:0; }
.kd-list-summary .kd-code-lang { display:none; }
.kd-list-summary .kd-code { display:inline; padding:0; line-height:inherit; white-space:pre-wrap; }
.kd-list-summary.is-truncated { mask-image:linear-gradient(#000,#000),linear-gradient(to right,#000 var(--kd-preview-fade-start),transparent var(--kd-preview-fade-end));
  mask-size:100% var(--kd-preview-fade-top),100% calc(100% - var(--kd-preview-fade-top)); mask-position:top,bottom; mask-repeat:no-repeat; }
.kd-list-meta { margin-top:7px; display:flex; gap:6px; flex-wrap:wrap; font-size:11px;
  color:var(--kd-label-secondary); align-items:center; }
.kd-empty { padding:56px 24px; text-align:center; color:var(--kd-label-secondary); }
.kd-empty-icon { width:44px; height:44px; margin:0 auto 14px; border-radius:50%; display:flex;
  align-items:center; justify-content:center; border:1px solid var(--kd-border-l1);
  background:var(--kd-bg-layer-1); color:var(--kd-label-secondary); }
.kd-empty-title { font-size:15px; font-weight:600; color:var(--kd-label-primary); margin-bottom:6px; }
.kd-empty-body { font-size:13px; max-width:460px; margin:0 auto; line-height:1.8; }
.kd-empty .kd-actions { justify-content:center; }
.kd-overlay { position:absolute; inset:0; background:rgba(0,0,0,.38); display:flex; align-items:center;
  justify-content:center; padding:24px; z-index:40; backdrop-filter:blur(2px); }
.kd-modal { width:min(580px,100%); max-height:100%; display:flex; flex-direction:column;
  background:var(--kd-bg-overlay); color:var(--kd-label-primary);
  border:1px solid var(--kd-border-l2); border-radius:16px; overflow:hidden;
  box-shadow:0 16px 48px rgba(0,0,0,.24); }
.kd-modal-wide { width:min(880px,100%); }
.kd-modal-head { padding:16px 20px; border-bottom:1px solid var(--kd-border-l1);
  display:flex; align-items:center; justify-content:space-between; gap:10px; }
.kd-modal-title { font-size:15px; font-weight:650; letter-spacing:.01em; }
.kd-modal-body { padding:18px 20px; overflow:auto; min-height:0; }
.kd-modal-foot { padding:14px 20px; border-top:1px solid var(--kd-border-l1);
  display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
.kd-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
.kd-field-label { font-size:12px; font-weight:500; color:var(--kd-label-secondary); }
.kd-input { height:34px; padding:0 11px; border-radius:8px; border:1px solid var(--kd-border-l2);
  background:var(--kd-bg-base); color:var(--kd-label-primary); font:inherit; font-size:13px;
  transition:border-color .15s, box-shadow .15s; }
.kd-input:focus { outline:none; border-color:var(--kd-brand-primary);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--kd-brand-primary) 14%, transparent); }
.kd-input::placeholder { color:var(--kd-label-secondary); }
.kd-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.kd-row-between { display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
.kd-divider { height:1px; background:var(--kd-border-l1); margin:16px 0; }
.kd-preview-item { border:1px solid var(--kd-border-l1); border-radius:12px; padding:12px 14px;
  background:var(--kd-bg-base); }
.kd-preview-item + .kd-preview-item { margin-top:8px; }
.kd-warn-text { color:var(--kd-state-warn-primary); font-size:12px; line-height:1.7; }
.kd-error-text { color:var(--kd-state-error-primary); font-size:12px; line-height:1.7; }
.kd-toast { position:absolute; left:50%; bottom:24px; transform:translateX(-50%); z-index:60;
  padding:9px 18px; border-radius:999px; font-size:13px; max-width:80%;
  background:var(--kd-bg-overlay); border:1px solid var(--kd-border-l2);
  box-shadow:0 8px 24px rgba(0,0,0,.18); }
.kd-toast-bad { color:var(--kd-state-error-primary); }
.kd-toast-ok { color:var(--kd-state-success-primary); }
.kd-toast-warn { color:var(--kd-state-warn-primary); }
.kd-loading { padding:48px 0; text-align:center; color:var(--kd-label-secondary); font-size:13px; }
.kd-spinner { display:inline-block; width:14px; height:14px; border-radius:50%; vertical-align:-2px;
  border:2px solid var(--kd-border-l2); border-top-color:var(--kd-brand-primary);
  animation:kd-spin .8s linear infinite; margin-right:8px; }
@keyframes kd-spin { to { transform:rotate(360deg); } }
.kd-mobilebar { display:none; gap:8px; padding:10px 14px; border-bottom:1px solid var(--kd-border-l1);
  overflow:auto; }
.kd-mobilebar > * { flex:0 0 auto; white-space:nowrap; }
.kd-mobilebar .kd-select { max-width:180px; }
.kd-md { line-height:1.78; overflow-wrap:anywhere; }
.kd-md > *:first-child { margin-top:0; }
.kd-md > *:last-child { margin-bottom:0; }
.kd-p { margin:8px 0; }
.kd-h { margin:14px 0 8px; line-height:1.4; font-weight:650; }
.kd-h1 { font-size:17px; } .kd-h2 { font-size:16px; } .kd-h3 { font-size:15px; }
.kd-h4, .kd-h5, .kd-h6 { font-size:14px; }
.kd-list { margin:8px 0; padding-left:22px; }
.kd-list li { margin:3px 0; }
.kd-quote { margin:10px 0; padding:6px 12px; border-left:3px solid var(--kd-border-l2);
  color:var(--kd-label-secondary); }
.kd-hr { border:0; border-top:1px solid var(--kd-border-l1); margin:14px 0; }
.kd-link { color:var(--kd-brand-primary); text-decoration:underline; text-underline-offset:2px; }
.kd-inline-code { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:.9em;
  padding:1px 5px; border-radius:5px; background:var(--kd-bg-layer-2);
  border:1px solid var(--kd-border-l1); }
.kd-code-wrap { margin:10px 0; border-radius:10px; overflow:hidden; border:1px solid var(--kd-border-l1);
  background:var(--kd-bg-layer-2); }
.kd-code-lang { padding:3px 10px; font-size:11px; color:var(--kd-label-secondary);
  border-bottom:1px solid var(--kd-border-l1); }
.kd-code { margin:0; padding:10px 12px; overflow:auto; font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
  font-size:12.5px; line-height:1.6; white-space:pre; tab-size:2; }
.kd-code code { font:inherit; }
.kd-table-wrap { overflow:auto; margin:10px 0; }
.kd-table { border-collapse:collapse; font-size:13px; min-width:0; }
.kd-table th, .kd-table td { border:1px solid var(--kd-border-l1); padding:5px 10px; text-align:left; }
.kd-table th { background:var(--kd-bg-layer-2); font-weight:600; }
.kd-image { max-width:100%; height:auto; border-radius:8px; display:block; margin:8px 0; }
.kd-image-fallback { display:inline-block; font-family:ui-monospace,monospace; font-size:12px;
  color:var(--kd-state-warn-primary); border:1px dashed var(--kd-state-warn-primary);
  border-radius:6px; padding:2px 6px; }
.kd-math, .kd-mathblock { font-size:17px; }
.kd-math { display:inline-flex; vertical-align:baseline; align-items:baseline; max-width:100%; padding:.25em .1em;
  overflow-x:auto; overflow-y:hidden; }
.kd-math mjx-container { color:currentColor; flex:none; }
.kd-mathblock { display:block; max-width:100%; min-width:0; margin:10px 0; padding:.35em .2em; overflow-x:auto; overflow-y:hidden;
  text-align:center; }
.kd-page .kd-math mjx-container, .kd-page .kd-mathblock mjx-container {
  display:inline-block; font-size:100% !important; max-width:none; }
.kd-page .kd-math svg, .kd-page .kd-mathblock svg { max-width:none !important; }
.kd-math-pending { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:.9em;
  opacity:.55; white-space:pre-wrap; }
.kd-math-error { color:var(--kd-state-error-primary);
  font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:.9em; }
.kd-checkline { display:flex; gap:8px; align-items:flex-start; padding:5px 0; font-size:13px; }
.kd-chip { display:inline-flex; align-items:center; gap:2px; padding:0 2px 0 8px; border-radius:999px;
  border:1px solid var(--kd-border-l2); background:var(--kd-bg-layer-1); font-size:12px; }
.kd-chip .kd-checkline { padding:0; }
.kd-chip .kd-iconbtn { width:20px; height:20px; }
.kd-option.is-correct { border-color:#22c55e; }
.kd-option.is-wrong { border-color:#f35464; }
.kd-page input[type=checkbox] { accent-color:var(--kd-brand-primary); width:16px; height:16px; flex:none; }
.kd-btn, .kd-iconbtn, .kd-tab, .kd-nav-item, .kd-option, .kd-list-row {
  transition:background-color .16s, border-color .16s, color .16s, box-shadow .16s, transform .16s; }
.kd-btn:active:not(:disabled), .kd-iconbtn:active, .kd-tab:active, .kd-nav-item:active { transform:scale(.97); }
.kd-option:active:not(:disabled) { transform:translateY(1px); }
.kd-view { animation:kd-enter .2s ease-out; }
.kd-presence { display:contents; }
.kd-overlay { animation:kd-fade .16s ease-out; background:rgb(18 27 52 / 28%); backdrop-filter:blur(5px); }
.kd-modal { animation:kd-enter .18s ease-out; box-shadow:0 24px 80px rgb(12 25 60 / 18%); border-radius:20px; }
.kd-presence.is-leaving .kd-overlay { animation:kd-fade .16s ease-in reverse both; pointer-events:none; }
.kd-presence.is-leaving .kd-modal { animation:kd-enter .16s ease-in reverse both; }
.kd-thread { animation:kd-drawer .2s ease-out; }
.kd-presence.is-leaving .kd-thread { animation:kd-drawer .16s ease-in reverse both; pointer-events:none; }
.kd-modal-head { padding:22px 24px; }
.kd-modal-title { font-size:18px; }
.kd-modal-body { padding:20px 24px; background:color-mix(in srgb, var(--kd-brand-primary) 2%, var(--kd-surface)); }
.kd-modal-foot { padding:16px 24px; }
.kd-manage-card { padding:16px; border:1px solid var(--kd-border-l1); border-radius:14px; background:var(--kd-bg-base); margin-bottom:10px; }
.kd-manage-card.is-enabled { border-color:color-mix(in srgb, var(--kd-brand-primary) 25%, var(--kd-surface)); }
.kd-manage-card .kd-checkline { font-weight:550; }
.kd-manage-card .kd-msg-meta { font-weight:400; line-height:1.7; }
.kd-custom-subject { padding:20px; border-radius:14px; border:1px solid var(--kd-border-l1); background:var(--kd-bg-base); }
.kd-field-label { font-size:13px; }
.kd-input { height:38px; }
.kd-bulkbar { position:sticky; top:0; z-index:5; display:flex; flex-direction:column; gap:10px; padding:14px;
  margin-bottom:14px; border-radius:14px; border:1px solid color-mix(in srgb, var(--kd-brand-primary) 25%, var(--kd-surface));
  background:var(--kd-bg-base); box-shadow:0 5px 20px rgb(20 35 70 / 5%); animation:kd-enter .18s ease-out; }
.kd-list-row.is-selected { border-color:var(--kd-brand-primary); background:color-mix(in srgb, var(--kd-brand-primary) 5%, var(--kd-surface)); }
.kd-list-row input { margin-top:5px; }
@keyframes kd-fade { from { opacity:0; } to { opacity:1; } }
@keyframes kd-enter { from { opacity:0; transform:translateY(8px) scale(.99); } to { opacity:1; transform:none; } }
@keyframes kd-drawer { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:none; } }
@media (max-width: 1180px) {
  .kd-thread { position:absolute; right:0; top:0; bottom:0; width:min(370px,92vw); flex-basis:auto; z-index:30;
    box-shadow:-12px 0 32px rgba(0,0,0,.22); }
  .kd-thread-resize { display:none; }
}
@media (max-width: 860px) {
  .kd-nav { display:none; }
  .kd-mobilebar { display:flex; }
  .kd-main-toolbar { padding:16px 14px; }
  .kd-main-scroll { padding:0 14px 40px; }
  .kd-header { padding:14px 14px 12px; gap:10px; }
  .kd-header-left { flex-basis:100%; }
  .kd-cd-lines { align-items:flex-start; text-align:left; }
  .kd-cd-primary { font-size:19px; }
  .kd-tabs { flex:1; }
  .kd-tab { flex:1 0 auto; justify-content:center; padding:7px 10px; }
  .kd-strip-item { white-space:normal; }
  .kd-card { padding:16px 14px; }
  .kd-answer-panel-body { padding:14px; }
  .kd-exam-strip { padding:8px 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .kd-page *, .kd-page *::before, .kd-page *::after { transition:none !important; animation:none !important; }
}

`

    /* ============================== 接口 ============================== */
    async function rpc(op, args) {
      let response
      try {
        response = await fetch('/api/daily-question/rpc', {
          method: 'POST',
          signal: AbortSignal.timeout(op === 'ensureDaily' || op === 'revise' ? 16*60*1000 : op === 'followup' ? 6*60*1000 : 60_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, args: args || {} }),
        })
      } catch (error) {
        if (error.name === 'TimeoutError') throw new Error('等待服务响应超时，请重试')
        throw new Error(`无法连接插件后端（${error.message}）。请确认「考研每日一题」插件已启用。`)
      }
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok || !payload || payload.ok === false) {
        const message = payload?.error?.message || `请求失败（HTTP ${response.status}）`
        throw new Error(message)
      }
      return payload.result
    }

    function newAttemptId() {
      return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    }

    function isChoiceType(type) {
      return type === 'single' || type === 'multiple' || type === 'cloze' || type === 'reading'
    }

    function readFileAsPayload(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('读取文件失败，请重试'))
        if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
          reader.onload = () => {
            const text = String(reader.result || '')
            resolve({ kind: 'pdf', base64: text.slice(text.indexOf(',') + 1) })
          }
          reader.readAsDataURL(file)
          return
        }
        reader.onload = () => resolve({ kind: 'md', text: String(reader.result || '') })
        reader.readAsText(file, 'utf-8')
      })
    }

    /* ============================== 基础组件 ============================== */
    const ICON_PATHS = {
      close: 'M6 6l12 12M18 6L6 18',
      star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z',
      refresh: 'M20 11a8 8 0 1 0-2.6 5.9M20 5v6h-6',
      check: 'M4 12.5l5 5L20 6.5',
      x: 'M6 6l12 12M18 6L6 18',
      chevron: 'M9 6l6 6-6 6',
      'chevron-left': 'M15 6l-6 6 6 6',
      send: 'M4 12l16-8-6 8 6 8z',
      book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z',
      plus: 'M12 5v14M5 12h14',
      trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
      upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
      spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
    }

    function Icon({ name, size = 15 }) {
      const path = ICON_PATHS[name]
      if (!path) return null
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      }, h('path', { d: path }))
    }

    function Btn({ children, onClick, variant = 'default', disabled, title, small, type = 'button', ariaLabel }) {
      return h('button', {
        type,
        className: `kd-btn kd-btn-${variant}${small ? ' kd-btn-sm' : ''}`,
        onClick,
        disabled,
        title,
        'aria-label': ariaLabel,
      }, children)
    }

    function Badge({ children, tone = 'neutral' }) {
      return h('span', { className: `kd-badge kd-badge-${tone}` }, children)
    }

    /** 统一的空状态：图标 + 标题 + 说明 + 操作。 */
    function EmptyState({ icon = 'spark', title, body, actions }) {
      return h('div', { className: 'kd-empty' },
        h('div', { className: 'kd-empty-icon' }, h(Icon, { name: icon, size: 20 })),
        title ? h('div', { className: 'kd-empty-title' }, title) : null,
        body ? h('div', { className: 'kd-empty-body' }, body) : null,
        actions ? h('div', { className: 'kd-actions' }, actions) : null)
    }

    function Presence({ children }) {
      const active = Array.isArray(children) ? children.some(Boolean) : Boolean(children)
      const [retained, setRetained] = useState(children)
      useEffect(() => {
        if (active) { setRetained(children); return undefined }
        const timer = setTimeout(() => setRetained([]), 160)
        return () => clearTimeout(timer)
      }, [children, active])
      return h('div', { className: 'kd-presence' + (active ? '' : ' is-leaving') }, active ? children : retained)
    }

    function Modal({ title, children, footer, onClose, wide }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', {
        className: 'kd-overlay',
        onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() },
      }, h('div', {
        className: `kd-modal${wide ? ' kd-modal-wide' : ''}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
      },
      h('div', { className: 'kd-modal-head' },
        h('div', { className: 'kd-modal-title' }, title),
        h('button', { className: 'kd-iconbtn', onClick: onClose, 'aria-label': T.close }, h(Icon, { name: 'close' }))),
      h('div', { className: 'kd-modal-body' }, children),
      footer ? h('div', { className: 'kd-modal-foot' }, footer) : null))
    }

    function hostOf(url) {
      try {
        return new URL(url).host.replace(/^www\./, '')
      } catch {
        return ''
      }
    }

    function formatShort(iso) {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return String(iso || '')
      const pad = (value) => String(value).padStart(2, '0')
      return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /** 剩余不超过 30 天时省略按年、月拆分的时长。 */
    function CountdownLines({ countdown }) {
      const { year, days, approx, lines = {} } = countdown || {}
      const showDays = Number.isInteger(days) && days >= 0
      const duration = days === 0 ? '今日开考' : lines.secondary
      const spaceDigits = (line = '') => line.replace(/\p{Script=Han}(?=\d)|\d(?=\p{Script=Han})/gu, '$& ')
      return h('div', { className: 'kd-cd-lines' },
        h('div', { className: 'kd-cd-primary' }, showDays ? `距离 ${year} 考研还剩` : spaceDigits(lines.primary)),
        showDays ? h('div', { className: 'kd-cd-days' }, approx ? '约 ' : null, h('strong', null, String(days)), ' 天') : null,
        duration ? h('div', { className: 'kd-cd-secondary' }, spaceDigits(duration)) : null,
        h('div', { className: 'kd-cd-target' }, spaceDigits(lines.target)))
    }

    /** 年份、日期口径与来源：一条紧凑的状态带，横跨整个头部。 */
    function ExamStrip({ boot, busy, onRefresh, onYearChange }) {
      const cd = boot.countdown || {}
      const basis = cd.basis
      const statusTone = cd.status === 'official' ? 'ok' : cd.status === 'estimated' ? 'warn' : 'bad'
      const statusText = cd.status === 'official' ? '官方公布'
        : cd.status === 'estimated' ? '官方未公布 · 估算' : '尚未核实'
      const sourceUrl = cd.sourceUrl || (basis && basis.sourceUrl) || ''
      const sourceLabel = cd.status === 'official'
        ? `来源 ${hostOf(sourceUrl) || '官方'}`
        : basis ? `依据 ${basis.year} 官方（${hostOf(basis.sourceUrl) || '官方'}）` : '无来源记录'

      return h('div', { className: 'kd-exam-strip' },
        h('label', { className: 'kd-strip-item' },
          h('span', null, T.year),
          h('select', {
            className: 'kd-select kd-select-sm',
            value: boot.settings.targetYear,
            'aria-label': T.year,
            onChange: (event) => onYearChange(Number(event.target.value)),
          }, (boot.yearOptions || []).map((year) => h('option', { key: year, value: year }, `${year} 考研`)))),
        h('span', { className: 'kd-strip-item' }, h(Badge, { tone: statusTone }, statusText)),
        h('span', {
          className: 'kd-strip-item',
          title: cd.source ? `${cd.source}${sourceUrl ? `\n${sourceUrl}` : ''}` : '',
        }, sourceUrl
          ? h('a', { className: 'kd-link', href: sourceUrl, target: '_blank', rel: 'noreferrer noopener' }, sourceLabel)
          : h('span', null, sourceLabel)),
        cd.verifiedAt
          ? h('span', { className: 'kd-strip-item', title: formatDateTime(cd.verifiedAt) },
            `核验成功 ${formatShort(cd.verifiedAt)}`)
          : null,
        h(Btn, {
          small: true,
          variant: 'ghost',
          disabled: busy,
          title: '联网核验官方公布的考试日期',
          onClick: onRefresh,
        }, busy ? h('span', { className: 'kd-spinner' }) : h(Icon, { name: 'refresh', size: 13 }), '核验'),
        cd.expired
          ? h('span', { className: 'kd-strip-item kd-strip-warn' }, '目标日期已过，请重新选择考研年份')
          : cd.status === 'unverified'
            ? h('span', { className: 'kd-strip-item kd-strip-warn', title: cd.note || '' }, '官方日期尚未核实')
            : null)
    }

    /* ============================== 导航 ============================== */
    function UpdateCheck({ currentVersion }) {
      const [state,setState]=useState({busy:true,result:null,error:''})
      const checking=useRef(false)
      const active=useRef(true)
      const check=async(force=false)=>{
        if(checking.current)return
        checking.current=true
        setState((value)=>({...value,busy:true,error:''}))
        try {
          const result=await rpc('checkUpdates',{force})
          if(active.current)setState({busy:false,result,error:''})
        } catch(error) {
          if(active.current)setState((value)=>({...value,busy:false,error:error.message}))
        } finally {checking.current=false}
      }
      useEffect(()=>{
        active.current=true
        const automatic=()=>{if(!window.document.hidden)check(false)}
        automatic()
        const timer=window.setInterval(automatic,6*60*60*1000)
        window.addEventListener('focus',automatic)
        return ()=>{active.current=false;window.clearInterval(timer);window.removeEventListener('focus',automatic)}
      },[])
      return h('div',{className:'kd-update'},
        h(Btn,{variant:'ghost',disabled:state.busy,onClick:()=>check(true)},
          state.busy?h('span',{className:'kd-spinner'}):h(Icon,{name:'refresh'}),state.busy?'正在检查…':'检查更新'),
        h('div',{className:'kd-msg-meta',style:{padding:'0 8px'}},`当前版本 v${currentVersion||state.result?.currentVersion||'—'}`),
        h('div',{className:'kd-msg-meta',role:'status','aria-live':'polite',title:state.error||'',style:{padding:'4px 8px',overflowWrap:'anywhere'}},
          state.error?'暂时无法检查，请重试':state.result?.updateAvailable
            ? h('a',{className:'kd-link',href:state.result.packageUrl,target:'_blank',rel:'noreferrer noopener'},`发现新版本 v${state.result.latestVersion} ↗`)
            : state.result?'已是最新版本':null))
    }

    function SubjectNav({ boot, subjectId, onPick, onManage, onBanks }) {
      const enabled = (boot.subjects || []).filter((subject) => subject.enabled)
      const archived = archivedSubjects(boot, subjectId)
      const subjectButton = (subject) => {
        const done = Boolean(boot.todayMap?.[subject.id])
        return h('button', {
          key: subject.id,
          type: 'button',
          className: `kd-nav-item${subject.id === subjectId ? ' is-active' : ''}`,
          onClick: () => onPick(subject.id),
          title: subject.name,
        },
        h('span', null, subject.name),
        subject.enabled ? h('span', { className: 'kd-nav-status' },
          h('span', { className: `kd-dot${done ? '' : ' kd-dot-idle'}` }),
          done ? '今日已出' : '待出题') : null)
      }
      return h('div', { className: 'kd-nav' },
        h('div', { className: 'kd-nav-group' },
          h('div', { className: 'kd-nav-group-label' }, '已启用科目', h('span', null, String(enabled.length))),
          enabled.length ? enabled.map(subjectButton)
            : h('div', { className: 'kd-msg-meta', style: { padding: '4px 8px' } }, '还没有启用科目')),
        archived.length ? h('div', { className: 'kd-nav-group' },
          h('div', { className: 'kd-nav-group-label' }, '已停用科目', h('span', null, String(archived.length))),
          archived.map(subjectButton)) : null,
        h('div', { className: 'kd-nav-spacer' }),
        h('div', { className: 'kd-nav-group' },
          h('div', { className: 'kd-nav-group-label' }, '设置'),
          h(Btn, { variant: 'ghost', onClick: onManage }, h(Icon, { name: 'plus' }), T.manageSubjects),
          h(Btn, { variant: 'ghost', onClick: onBanks }, h(Icon, { name: 'book' }), T.manageBanks),
          h(UpdateCheck,{currentVersion:boot.pluginVersion})))
    }

    function archivedSubjects(boot, subjectId) {
      return (boot.subjects || []).filter((subject) => !subject.enabled && (boot.counts?.[subject.id]?.all || subject.id === subjectId))
    }

    function TabBar({ kind, counts, onPick, todayDisabled }) {
      const items = [
        ['today', T.tabs.today, null],
        ['all', T.tabs.all, counts?.all],
        ['favorite', T.tabs.favorite, counts?.favorite],
        ['wrong', T.tabs.wrong, counts?.wrong],
      ]
      return h('div', { className: 'kd-tabs' },
        items.map(([value, label, count]) => h('button', {
          key: value,
          type: 'button',
          className: `kd-tab${kind === value ? ' is-active' : ''}`,
          disabled: value === 'today' && todayDisabled,
          onClick: () => onPick(value),
        }, label, count ? h('span', { className: 'kd-tab-count' }, String(count)) : null)))
    }

    function MobileBar({ boot, subjectId, onPick, onManage, onBanks }) {
      const enabled = (boot.subjects || []).filter((subject) => subject.enabled)
      const archived = archivedSubjects(boot, subjectId)
      const option = (subject) => h('option', { key: subject.id, value: subject.id }, subject.name)
      return h('div', { className: 'kd-mobilebar' },
        h('select', {
          className: 'kd-select',
          value: subjectId || '',
          'aria-label': '切换科目',
          onChange: (event) => onPick(event.target.value),
        }, !subjectId ? h('option', { value: '', disabled: true }, '选择科目') : null,
        enabled.length ? h('optgroup', { label: `已启用科目（${enabled.length}）` }, enabled.map(option)) : null,
        archived.length ? h('optgroup', { label: `已停用科目（${archived.length}）` }, archived.map(option)) : null),
        // 窄屏隐藏了左侧栏，科目的增删与题库入口必须在这里保留。
        h(Btn, { small: true, variant: 'ghost', onClick: onManage }, h(Icon, { name: 'plus', size: 13 }), T.manageSubjects),
        h(Btn, { small: true, variant: 'ghost', onClick: onBanks }, h(Icon, { name: 'book', size: 13 }), T.manageBanks))
    }

    /* ============================== 题目详情 ============================== */
    function ResultBanner({ attempt }) {
      if (!attempt) return null
      const status = statusLabel(attempt.result)
      const text = attempt.result === 'correct' ? '本题作答正确'
        : attempt.result === 'wrong' ? (attempt.mode === 'giveup' ? '本题标记为未能作答，已进入错题本' : '本题作答错误，已进入错题本')
          : '已查看答案，等待你判定「作答正确 / 作答错误」'
      return h('div', { className: 'kd-actions', style: { marginTop: '0', marginBottom: '10px' } },
        h(Badge, { tone: status.tone }, status.text),
        h('span', { className: 'kd-meta' }, text))
    }

    function AnswerBlock({ question, onRevise, revising, onRemoveWrong }) {
      if (!question.answer) {
        if (question.answerState !== 'revealed') return null
        return h('div', { className: 'kd-answer' },
          h('div', { className: 'kd-verify' }, '这道题没有可用的参考答案与解析。系统不会用猜测的内容冒充标准答案。'))
      }
      const answer = question.answer
      return h('div', { className: 'kd-answer' },
        h('div', { className: 'kd-answer-panel' },
          h('div', { className: 'kd-answer-panel-head' },
            h('span', null, '答案与解析'),
            h('span', { className: 'kd-tag' }, `版本 ${answer.versionId}`)),
          h('div', { className: 'kd-answer-panel-body' },
            answer.verified
              ? null
              : h('div', { className: 'kd-verify', style: { marginTop: 0 } },
                h(Badge, { tone: 'warn' }, answer.basis === 'imported' ? T.unverified : T.missing),
                ' 这份答案来自导入题库，尚未经过独立校验，请自行核对。'),
            h('div', { className: 'kd-answer-block' },
              h('div', { className: 'kd-answer-label' }, T.answer),
              h(Markdown, { text: answer.answer || '（题库未提供参考答案）' })),
            h('div', { className: 'kd-answer-block' },
              h('div', { className: 'kd-answer-label' }, T.explanation),
              h(Markdown, { text: answer.explanation || '（题库未提供解析）' })),
            h('div', { className: 'kd-answer-block' },
              h('div', { className: 'kd-answer-label' }, '作答历史'),
              h('div', {
                className: 'kd-meta',
                style: { flexDirection: 'column', alignItems: 'flex-start', gap: '3px' },
              },
              question.attempts.map((attempt, index) => h('div', { key: attempt.id },
                `${index + 1}. ${formatDateTime(attempt.at)} · ${statusLabel(attempt.result).text}`
                + `${attempt.mode === 'giveup' ? ' · 未能作答' : attempt.mode === 'done' ? ' · 作答完毕' : ''}`
                + `${attempt.choice ? ` · 选择 ${attempt.choice}` : ''}`))),
              question.wrongEver
                ? h('div', { className: 'kd-actions', style: { marginTop: '10px' } },
                  h(Btn, {
                    small: true,
                    variant: 'ghost',
                    title: '只把这道题移出错题本，历史上的错误作答记录仍然保留',
                    onClick: onRemoveWrong,
                  }, '移出错题本'))
                : null),
            h('div', { className: 'kd-verify' },
              h('div', { className: 'kd-row-between' },
                h('span', null,
                  h(Badge, { tone: answer.verified ? 'ok' : 'warn' }, answer.verified ? T.verified : T.unverified),
                  ` 首次展示 ${answer.firstShownAt ? formatDateTime(answer.firstShownAt) : '—'}`,
                  answer.superseded ? ` · 已有 ${answer.superseded} 个历史版本` : ''),
                h(Btn, {
                  small: true,
                  variant: 'ghost',
                  disabled: revising,
                  title: '生成候选新版本并重新做独立校验；只有校验通过才能替换正式版本',
                  onClick: onRevise,
                }, revising ? h('span', { className: 'kd-spinner' }) : null, T.revision)),
              answer.verification?.summary
                ? h('div', null, `校验：${answer.verification.summary}（${methodLabel(answer.verification.method)}${answer.verification.at ? `，${formatDateTime(answer.verification.at)}` : ''}）`)
                : null,
              (() => {
                const trail = answer.verification?.trail
                if (!Array.isArray(trail)) return null
                const passes = trail.filter((entry) => entry && entry.independentAnswer)
                if (!passes.length) return null
                return h('div', null, passes.map((entry, index) => h('div', { key: index },
                  `校验视角独立求解：${entry.independentAnswer}${entry.attempt ? `（第 ${entry.attempt} 次命题）` : ''}`)))
              })(),
              answer.verification?.issues?.length
                ? h('ul', null, answer.verification.issues.map((issue, index) => h('li', { key: index }, issue)))
                : null))))
    }

    function QuestionPane({
      q, busy, choice, onSelect, onReveal, onJudge, onFavorite, onRedo, localRedo,
      onRevise, revising, onToggleThread, threadOpen, onRemoveWrong,
      onCancel, onSkip,
    }) {
      if (!q) return null
      const revealed = !localRedo && q.answerState === 'revealed' && q.attemptCount > 0
      const last = q.lastAttempt
      const isChoice = typeof q.isChoice === 'boolean' ? q.isChoice : isChoiceType(q.type)
      const canSelect = isChoice && (q.canSelect ?? q.options?.length >= 2)
      const answerKey = q.answer?.answerKey || ''
      const selected = revealed ? (last?.choice || '') : choice
      const meta = [q.subjectName, q.typeLabel]
      return h('div', null,
        h('div', { className: 'kd-card' },
          h('div', { className: 'kd-chips' },
            h('span', { className: 'kd-tag kd-tag-brand' }, q.typeLabel),
            h('span', { className: 'kd-tag' }, q.subjectName),
            h('span', { className: 'kd-tag', title: q.examAlignment ? '独立评审参考历年真题给出的难度，不是考生正确率统计' : '原始难度标签，尚无真题对照评审' }, `难度 ${q.difficulty}/5`),
            h('span', { className: 'kd-tag' }, formatDate(q.assignedDate)),
            h('span', { className: 'kd-tag' }, `累计作答 ${q.attemptCount} 次`),
            h('span', { className: 'kd-tag' }, q.source?.kind === 'bank' ? q.source.label : '在线出题'),
            q.answerStatus === 'verified'
              ? h(Badge, { tone: 'ok' }, T.verified)
              : h(Badge, { tone: 'warn' }, q.answerStatus === 'missing' ? T.missing : T.unverified),
            q.repeated ? h(Badge, { tone: 'warn' }, '本题此前出过') : null,
            q.favorite ? h(Badge, { tone: 'brand' }, '已收藏') : null,
            q.wrongEver ? h(Badge, { tone: 'bad' }, '在错题本') : null),
          q.knowledge?.length
            ? h('div', { className: 'kd-meta', style: { marginTop: '10px' } },
              h('span', null, `${T.knowledge}：${q.knowledge.join('、')}`))
            : null,
          q.examAlignment ? h('details', { className: 'kd-verify' },
            h('summary', null, `范围与难度依据 · 大纲 ${q.examAlignment.outlineYear} · 独立真题对照`),
            h('div', null, q.examAlignment.note),
            h('div', null, `参考考试：${q.examAlignment.basisSubject?.name || q.subjectName} · 检索时间：${formatDateTime(q.examAlignment.checkedAt)}`),
            ...(q.examAlignment.sources || []).map((source) => h('div', { key: source.id },
              h('a', { className: 'kd-link', href: source.url, target: '_blank', rel: 'noreferrer noopener' },
                `${source.year} ${source.title}（${source.official ? '官方来源' : source.kind === 'outline' ? source.verificationLabel || '非官方大纲转载' : '非官方真题转载'}）`),
              source.coverage ? h('div', null, source.coverage) : null,
              source.publisherUrl ? h('a', { className:'kd-link', href:source.publisherUrl, target:'_blank', rel:'noreferrer noopener' }, `出版社版本记录 · ISBN ${source.isbn}`) : null)),
            revealed ? h('div', null, q.examAlignment.rationale,
              ...(q.examAlignment.warnings || []).map((warning,i)=>h('div',{key:i,className:'kd-meta'},warning))) : null) : null,
          h('div', { className: 'kd-stem' }, h(Markdown, { text: q.stem })),
          isChoice && !canSelect ? h('div', { className: 'kd-msg-meta' }, '本题选项不完整，可跳过或查看答案后自行判定。') : null,
          canSelect
            ? h('div', { className: 'kd-options' }, q.options.map((option) => {
              const isSelected = selected.split('').includes(option.key)
              const isRight = revealed && answerKey.split('').includes(option.key)
              const isWrongPick = revealed && answerKey && isSelected && !isRight
              const cls = ['kd-option']
              if (isSelected && !revealed) cls.push('is-selected')
              if (isRight) cls.push('is-correct')
              if (isWrongPick) cls.push('is-wrong')
              return h('button', {
                key: option.key,
                type: 'button',
                className: cls.join(' '),
                disabled: revealed || busy === 'reveal',
                onClick: () => onSelect(option.key),
              },
              h('span', { className: 'kd-option-key' }, option.key),
              h('div', { className: 'kd-option-text' }, h(Markdown, { text: option.text })))
            }))
            : null,
          revealed ? h(ResultBanner, { attempt: last }) : null,
          h('div', { className: 'kd-actions' },
            !revealed && canSelect
              ? h(Btn, { variant: 'primary', disabled: busy === 'reveal' || !choice, onClick: () => onReveal('submit') },
                busy === 'reveal' ? h('span', { className: 'kd-spinner' }) : null, T.submit)
              : null,
            !revealed && !canSelect
              ? [
                h(Btn, { key: 'done', variant: 'primary', disabled: busy === 'reveal', onClick: () => onReveal('done') }, T.done),
                isChoice
                  ? h(Btn, { key: 'skip', disabled: busy === 'reveal', onClick: onSkip }, '跳过本题')
                  : h(Btn, { key: 'giveup', variant: 'danger', disabled: busy === 'reveal', onClick: () => onReveal('giveup') }, T.giveup),
              ]
              : null,
            revealed && last?.result === 'pending'
              ? h(Btn, { key: 'wait', variant: 'ghost', disabled: true }, '待判定：请在下方向答案区域做判定')
              : null,
            revealed
              ? h(Btn, { onClick: onFavorite, disabled: busy === 'favorite' },
                h(Icon, { name: 'star' }), q.favorite ? T.unfavorite : T.favorite)
              : null,
            revealed
              ? h(Btn, { variant: 'ghost', onClick: onRedo, disabled: busy === 'reveal' }, h(Icon, { name: 'refresh', size: 13 }), T.redo)
              : null,
            revealed ? h(Btn, { variant: 'ghost', onClick: onToggleThread }, h(Icon, { name: 'book' }), threadOpen ? '收起追问' : T.followup) : null),
          revealed ? h(AnswerBlock, { question: q, onRevise, revising, onRemoveWrong }) : null,
          revising && onCancel ? h(Btn,{variant:'ghost',onClick:onCancel},'取消修订') : null,
          revealed && last?.result === 'pending'
            ? h('div', { className: 'kd-actions', style: { marginTop: '12px' } },
              h('span', { className: 'kd-meta' }, '这道题由你自己判定（系统不会替你把“作答完毕”当成答对）：'),
              h(Btn, { variant: 'primary', disabled: busy === 'judge', onClick: () => onJudge('correct') }, T.correct),
              h(Btn, { variant: 'danger', disabled: busy === 'judge', onClick: () => onJudge('wrong') }, T.wrong))
            : null),
        q.publishVerification
          ? h('div', { className: 'kd-verify', style: { marginTop: '12px' } },
            h(Badge, { tone: q.publishVerification.status === 'passed' ? 'ok' : 'warn' },
              q.publishVerification.status === 'passed' ? '试题发布前已通过独立校验' : '试题发布状态：待核验'),
            // 校验结论里通常写着答案与关键推导，提交答案前不能展示，否则等于泄题。
            revealed
              ? ` ${q.publishVerification.summary}`
              : ' 结论在提交答案后显示',
            `（${methodLabel(q.publishVerification.method)}${q.publishVerification.at ? `，${formatDateTime(q.publishVerification.at)}` : ''}）`)
          : null)
    }

    /* ============================== 列表 ============================== */
    function previewFadePosition(element, lineHeight) {
      const bounds = element.getBoundingClientRect()
      const rects = []
      const document = element.ownerDocument
      const walker = document.createTreeWalker(element, 4) // 只测量正文文字，公式由 SVG 的外框参与定位。
      const range = document.createRange()
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim() || node.parentElement.closest('mjx-container,.kd-code-lang')) continue
        range.setStart(node, 0)
        range.setEnd(node, node.textContent.trimEnd().length)
        rects.push(...range.getClientRects())
      }
      for (const node of element.querySelectorAll('svg,img')) rects.push(node.getBoundingClientRect())
      const visible = rects.filter((rect) => rect.width > 0 && rect.height > 0
        && rect.top < bounds.bottom - 1 && rect.bottom > bounds.top
        && rect.left < bounds.right && rect.right > bounds.left)
      if (!visible.length) return null
      const lineOf = (rect) => Math.max(0, Math.min(1, Math.floor(((rect.top + rect.bottom) / 2 - bounds.top) / lineHeight)))
      const lastLine = Math.max(...visible.map(lineOf))
      const end = Math.min(bounds.width, Math.max(...visible.filter((rect) => lineOf(rect) === lastLine).map((rect) => rect.right - bounds.left)))
      return { top: lastLine * lineHeight, start: Math.max(0, end - 72), end }
    }

    function QuestionPreview({ text }) {
      const ref = useRef(null)
      const [truncated, setTruncated] = useState(false)
      const mathStatus = useMathJaxStatus()
      useEffect(() => {
        const element = ref.current
        if (!element) return undefined
        const measure = () => {
          let lineHeight = 28
          for (const svg of element.querySelectorAll('svg')) lineHeight = Math.max(lineHeight, Math.ceil(svg.getBoundingClientRect().height + 16))
          element.style.setProperty('--kd-preview-line-height', `${lineHeight}px`)
          const content = element.firstElementChild
          const clipped = element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1
            || (content && content.scrollHeight > content.clientHeight + 1)
          const fade = clipped && previewFadePosition(element, lineHeight)
          if (fade) {
            for (const [key, value] of Object.entries(fade)) element.style.setProperty(`--kd-preview-fade-${key}`, `${value}px`)
          }
          setTruncated(Boolean(fade))
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        if (element.firstElementChild) observer.observe(element.firstElementChild)
        return () => observer.disconnect()
      }, [text, mathStatus])
      return h('div', { ref, className: 'kd-list-summary' + (truncated ? ' is-truncated' : '') }, h(Markdown, { text }))
    }

    function ListPane({ list, kind, subjectName, onOpen, managing, selected, onManage, onToggle, onSelectAll, onBulk, onPage, busy }) {
      if (!list) return h('div', { className: 'kd-loading' }, h('span', { className: 'kd-spinner' }), '加载中…')
      if (!list.items.length) {
        const icon = kind === 'favorite' ? 'star' : kind === 'wrong' ? 'check' : kind === 'all' ? 'book' : 'spark'
        return h(EmptyState, {
          icon,
          title: `${subjectName} · ${T.tabs[kind]}`,
          body: T.tabEmpty[kind] || '暂无内容',
        })
      }
      return h('div', null,
        h('div', { className: 'kd-meta', style: { marginBottom: '10px' } },
          h('span', null, `${subjectName} · ${T.tabs[kind]} · 共 ${list.total ?? list.items.length} 道`),
          h(Btn, { small: true, onClick: onManage, disabled: busy }, managing ? '完成管理' : '批量管理')),
        list.totalPages>1?h('div',{className:'kd-row',style:{marginBottom:'12px'},'aria-label':'题目分页'},
          h(Btn,{small:true,disabled:busy||list.page<=1,onClick:()=>onPage(list.page-1)},'上一页'),
          h('span',{className:'kd-meta'},`第 ${list.page} / ${list.totalPages} 页`),
          h(Btn,{small:true,disabled:busy||list.page>=list.totalPages,onClick:()=>onPage(list.page+1)},'下一页')):null,
        managing ? h('div', { className: 'kd-bulkbar', 'aria-label': '批量管理' },
          h('div', { className: 'kd-row' },
            h('strong', { 'aria-live': 'polite' }, `已选 ${selected.length} 道`),
            h(Btn, { small: true, disabled: busy, onClick: () => onSelectAll(true) }, '全选'),
            h(Btn, { small: true, disabled: busy || !selected.length, onClick: () => onSelectAll(false) }, '全不选')),
          h('div', { className: 'kd-row' },
            ...[['favorite', '收藏'], ['unfavorite', '取消收藏'], ['wrong', '加入错题本'], ['unwrong', '移出错题本'], ['delete', '删除题目']].map(([action, label]) =>
              h(Btn, { key: action, small: true, variant: action === 'delete' ? 'danger' : 'default', disabled: busy || !selected.length, onClick: () => onBulk(action) }, label)))) : null,
        list.items.map((item) => h('div', {
          key: item.id,
          className: 'kd-list-row' + (managing && selected.includes(item.id) ? ' is-selected' : ''),
          role: managing ? undefined : 'button',
          tabIndex: managing ? undefined : 0,
          onClick: managing ? undefined : (event) => { if (!event.target.closest('a,input')) onOpen(item.id) },
          onKeyDown: managing ? undefined : (event) => {
            if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onOpen(item.id) }
          },
        },
        managing ? h('input', { type: 'checkbox', checked: selected.includes(item.id), disabled: busy,
          'aria-label': '选择题目：' + (item.summary || item.id), onChange: () => onToggle(item.id) }) : null,
        h('div', { className: 'kd-list-body' },
          h(QuestionPreview, { text: item.stem || item.summary || '(无题干)' }),
          h('div', { className: 'kd-list-meta' },
            h(Badge, null, item.typeLabel),
            h('span', null, formatDate(item.assignedDate)),
            h('span', null, `作答 ${item.attemptCount} 次`),
            item.favorite ? h(Badge, { tone: 'brand' }, '收藏') : null,
            item.wrongEver ? h(Badge, { tone: 'bad' }, item.mastered ? '错题 · 已掌握' : '错题') : null,
            item.answerStatus !== 'verified' ? h(Badge, { tone: 'warn' }, T.unverified) : null,
            h('span', null, `难度 ${item.difficulty}/5`))),
        !managing ? h('span', { className: 'kd-list-open', 'aria-hidden': true }, '查看题目', h(Icon, { name: 'chevron' })) : null)))
    }

    /* ============================== 追问侧栏 ============================== */
    function ThreadPane({ thread, questionId, busy, onSend, onClear, onClose, onCancel, narrow, ratio = 33, onRatioChange }) {
      const [draft, setDraft] = useState('')
      const [sending, setSending] = useState(false)
      const [localError, setLocalError] = useState('')
      const [pending, setPending] = useState(null)
      const scrollRef = useRef(null)
      const sendingRef = useRef(false)
      const sendingMessage = useRef(null)
      const messages = thread?.messages || []

      useEffect(() => {
        const node = scrollRef.current
        if (node) node.scrollTop = node.scrollHeight
      }, [messages.length, pending?.id])

      const send = useCallback(async (text, messageId) => {
        const value = String(text || '').trim()
        if (!value || sendingRef.current) return
        sendingRef.current = true
        sendingMessage.current = messageId
        setSending(true)
        setLocalError('')
        try {
          await onSend(value, messageId)
          setPending(null)
          setDraft('')
        } catch (error) {
          setLocalError(error.message)
          setPending({ id: messageId, text: value })
        } finally {
          sendingRef.current = false
          sendingMessage.current = null
          setSending(false)
        }
      }, [onSend])

      const rows = []
      for (const message of messages) {
        const failed = message.status === 'failed'
        rows.push(h('div', {
          key: message.id,
          className: `kd-msg kd-msg-${message.role}${failed ? ' kd-msg-failed' : ''}`,
        },
        h(Markdown, { text: message.text }),
        h('div', { className: 'kd-msg-meta' },
          `${message.role === 'user' ? '我' : '老师'} · ${formatClock(message.createdAt)}`,
          failed ? ' · 回复失败' : ''),
        failed
          ? h(Btn, {
            small: true,
            variant: 'ghost',
            disabled: sending,
            onClick: () => send(message.text, message.id),
          }, '重试')
          : null))
      }
      if (pending) {
        rows.push(h('div', { key: 'pending', className: 'kd-msg kd-msg-user kd-msg-failed' },
          h(Markdown, { text: pending.text }),
          h('div', { className: 'kd-msg-meta' }, '我 · 尚未送达'),
          h(Btn, { small: true, variant: 'ghost', disabled: sending, onClick: () => send(pending.text, pending.id) }, '重试')))
      }
      if (sending) {
        rows.push(h('div', { key: 'sending', className: 'kd-msg kd-msg-assistant' },
          h('span', { className: 'kd-spinner' }), T.sending))
      }

      const resize = (value) => onRatioChange(Math.max(20, Math.min(55, value)))
      return h('aside', { className: 'kd-thread', 'aria-label': T.followup, style: { '--kd-thread-ratio': ratio / 100 } },
        !narrow ? h('div', { className: 'kd-thread-resize', role: 'separator', tabIndex: 0,
          'aria-label': '调整题目与追问的宽度比例', 'aria-orientation': 'vertical',
          'aria-valuemin': 20, 'aria-valuemax': 55, 'aria-valuenow': Math.round(ratio),
          onPointerDown: (event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) },
          onPointerMove: (event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            const pane = event.currentTarget.parentElement
            const left = pane.closest('.kd-shell').querySelector('.kd-main').getBoundingClientRect().left
            const right = pane.getBoundingClientRect().right
            resize((right - event.clientX) / (right - left) * 100)
          },
          onPointerUp: (event) => event.currentTarget.releasePointerCapture(event.pointerId),
          onPointerCancel: (event) => event.currentTarget.releasePointerCapture(event.pointerId),
          onKeyDown: (event) => {
            const value = { ArrowLeft: ratio + 2, ArrowRight: ratio - 2, Home: 20, End: 55 }[event.key]
            if (value !== undefined) { event.preventDefault(); resize(value) }
          },
        }) : null,
        h('div', { className: 'kd-thread-head' },
          h('div', null,
            h('div', { className: 'kd-thread-title' }, T.followup),
            h('div', { className: 'kd-msg-meta' }, '围绕当前题目，一起理清思路')),
          h('div', { className: 'kd-row' },
            h(Btn, {
              small: true,
              variant: 'ghost',
              disabled: !messages.length || sending,
              onClick: onClear,
              title: '只清空本题的追问记录',
            }, T.clearThread),
            h('button', { className: 'kd-iconbtn', onClick: onClose, 'aria-label': T.close }, h(Icon, { name: 'close' })))),
        h('div', { className: 'kd-thread-hint' }, T.followupHint),
        h('div', { className: 'kd-thread-scroll', ref: scrollRef },
          rows.length ? rows : h('div', { className: 'kd-empty-body' }, '还没有追问。可以问某一步推导为什么成立、某个知识点怎么理解，或有没有别的解法。')),
        localError ? h('div', { className: 'kd-error-text', style: { padding: '0 14px' } }, localError) : null,
        h('div', { className: 'kd-thread-foot' },
          h('div', { className: 'kd-composer' },
            h('textarea', {
              className: 'kd-textarea',
              value: draft,
              placeholder: '围绕这道题继续追问…（Enter 发送，Shift+Enter 换行）',
              disabled: sending,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229) {
                  event.preventDefault()
                  if (!event.repeat) send(draft, newAttemptId())
                }
              },
            }),
            h('div', { className: 'kd-row', style: { justifyContent: 'flex-end', marginTop: '2px' } },
              sending && onCancel ? h(Btn,{small:true,variant:'ghost',onClick:()=>onCancel(sendingMessage.current)},'取消回复') : null,
              h(Btn, {
                variant: 'primary',
                small: true,
                disabled: sending || !draft.trim(),
                onClick: () => send(draft, newAttemptId()),
              }, h(Icon, { name: 'send', size: 13 }), T.send)))))
    }

    /* ============================== 弹窗 ============================== */
    function SubjectsModal({ boot, onClose, onDone }) {
      const [draft, setDraft] = useState(() => ({ subjects: [...boot.settings.subjects],
        subjectSource: { ...boot.settings.subjectSource }, customSubjects: structuredClone(boot.customSubjects || []) }))
      const [saving, setSaving] = useState(false)
      const [saveError, setSaveError] = useState('')
      const [name, setName] = useState('')
      const [types, setTypes] = useState([])
      const [customTypes, setCustomTypes] = useState([])
      const [typeDraft, setTypeDraft] = useState('')
      const [referenceSubjectId, setReferenceSubjectId] = useState('auto')
      const [referenceExamName, setReferenceExamName] = useState('')
      const [referenceExamCode, setReferenceExamCode] = useState('')
      const [subjectCode, setSubjectCode] = useState('')
      const referenceExams = boot.referenceExams || (boot.subjects || []).filter((s) => !s.custom)
      const referenceEditor = (value, change, label) => h('div', { className:'kd-field', style:{ marginBottom:0 } },
        h('select', { className:'kd-select', 'aria-label':label, value:value.referenceSubjectId || 'auto',
          onChange:(event)=>change({referenceSubjectId:event.target.value}) },
          h('option', {value:'auto'}, '自动检索与核验（按科目名称和代码）'),
          ...referenceExams.map((exam)=>h('option',{key:exam.id,value:exam.id},`${exam.name}${exam.code ? `（${exam.code}）` : ''}`)),
          h('option',{value:'independent'},'另行指定参考考试名称…')),
        !value.referenceSubjectId || value.referenceSubjectId === 'auto' ? h('input',{className:'kd-input','aria-label':`${label}代码（考试科目或专业）`,
          placeholder:'考试科目或专业代码（选填）',value:value.code || '',maxLength:20,onChange:(event)=>change({code:event.target.value})}) : null,
        value.referenceSubjectId === 'independent' ? h('div',{className:'kd-row'},
          h('input',{className:'kd-input','aria-label':`${label}名称`,placeholder:'考试名称，院校自命题请包含院校',value:value.referenceExamName || '',maxLength:100,
            onChange:(event)=>change({referenceExamName:event.target.value})}),
          h('input',{className:'kd-input','aria-label':`${label}代码`,placeholder:'科目代码（选填）',value:value.referenceExamCode || '',maxLength:20,style:{width:'150px'},
            onChange:(event)=>change({referenceExamCode:event.target.value})})) : null)
      const enabled = new Set(draft.subjects)
      const subjects = [...(boot.subjects || []), ...draft.customSubjects.filter((item) => !(boot.subjects || []).some((s) => s.id === item.id)).map((item) => ({
        ...item, custom: true, typeLabels: item.types.map((type) => ({ single: '单项选择题', multiple: '多项选择题', fill: '填空题', solution: '解答题' })[type] || type), bankItemCount: 0,
      }))]
      const close = () => { if (!saving) onClose() }
      const toggleSubject = (id) => setDraft((current) => ({ ...current,
        subjects: current.subjects.includes(id) ? current.subjects.filter((value) => value !== id) : [...current.subjects, id] }))
      const toggleType = (type) => setTypes((current) => current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type])
      const addCustomType = () => {
        const value = typeDraft.trim().slice(0, 24)
        if (!value) return
        setCustomTypes((current) => (current.includes(value) ? current : [...current, value]))
        setTypes((current) => (current.includes(value) ? current : [...current, value]))
        setTypeDraft('')
      }
      const dropCustomType = (value) => {
        setCustomTypes((current) => current.filter((item) => item !== value))
        setTypes((current) => current.filter((item) => item !== value))
      }
      const selectedTypes = [...new Set([...types, ...(typeDraft.trim() ? [typeDraft.trim().slice(0, 24)] : [])])]
      const canAdd = Boolean(name.trim()) && selectedTypes.length > 0 && (referenceSubjectId !== 'independent' || Boolean(referenceExamName.trim()))
      const withCustomSubject = (current) => {
        const subject = { id: 'custom_' + newAttemptId(), name: name.trim(), code:subjectCode.trim(), types: selectedTypes, referenceSubjectId, referenceExamName:referenceExamName.trim(), referenceExamCode:referenceExamCode.trim() }
        return { ...current, subjects: [...current.subjects, subject.id], customSubjects: [...current.customSubjects, subject] }
      }
      const finish = async () => {
        if (saving) return
        if ((name.trim() || types.length || typeDraft.trim() || (referenceSubjectId && referenceSubjectId !== 'auto') || referenceExamName.trim() || referenceExamCode.trim() || subjectCode.trim()) && !canAdd) {
          setSaveError('请填写自定义科目名称并至少选择一个题型；选择独立参考考试时，还需填写考试名称。或清空未完成的输入。')
          return
        }
        const next = canAdd ? withCustomSubject(draft) : draft
        if (next.customSubjects.some((s)=>s.referenceSubjectId === 'independent' && !s.referenceExamName?.trim())) {
          setSaveError('独立参考考试请填写准确的考试名称（院校自命题请包含院校名称）。')
          return
        }
        setSaving(true)
        setSaveError('')
        try { await onDone(next) }
        catch (error) { setSaveError(error.message || '保存失败，请重试') }
        finally { setSaving(false) }
      }
      const submit = () => {
        if (!canAdd) return
        setDraft(withCustomSubject)
        setName('')
        setTypes([])
        setCustomTypes([])
        setTypeDraft('')
        setReferenceSubjectId('auto')
        setReferenceExamName('')
        setReferenceExamCode('')
        setSubjectCode('')
      }
      return h(Modal, {
        title: T.manageSubjects,
        onClose: close,
        wide: true,
        footer: [
          h(Btn, { key: 'cancel', onClick: close, disabled: saving }, T.cancel),
          h(Btn, { key: 'done', variant: 'primary', onClick: finish, disabled: saving }, saving ? '保存中…' : '完成'),
        ],
      },
      saveError ? h('div', { className: 'kd-error-text', role: 'alert' }, saveError) : null,
      h('fieldset', { disabled: saving, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } },
      h('div', { className: 'kd-meta', style: { marginBottom: '12px' } },
        '修改后点击右下角「完成」统一保存；取消或关闭会放弃修改。停用科目不会删除历史题目、作答、收藏和追问。'),
      subjects.map((subject) => h('div', {
        key: subject.id,
        className: 'kd-row-between kd-manage-card' + (enabled.has(subject.id) ? ' is-enabled' : ''),
      },
      h('label', { className: 'kd-checkline', style: { flex: '1 1 240px', cursor: 'pointer' } },
        h('input', {
          type: 'checkbox',
          checked: enabled.has(subject.id),
          onChange: () => toggleSubject(subject.id),
        }),
        h('span', null,
          h('span', null, subject.name),
          subject.code ? h('span', { className: 'kd-msg-meta' }, ` · ${subject.code}`) : null,
          h('div', { className: 'kd-msg-meta' }, subject.typeLabels.join(' / ')))),
      enabled.has(subject.id)
        ? h('div', { className: 'kd-row' },
          subject.custom ? referenceEditor(draft.customSubjects.find((s)=>s.id === subject.id) || subject,
            (patch)=>setDraft((current)=>({...current,customSubjects:current.customSubjects.map((s)=>s.id === subject.id ? {...s,...patch} : s)})),`${subject.name} 参考考试科目`) : null,
          h('select', {
            className: 'kd-select',
            value: draft.subjectSource[subject.id] || 'auto',
            'aria-label': `${subject.name} 出题来源`,
            onChange: (event) => { const source = event.target.value; setDraft((current) => ({ ...current, subjectSource: { ...current.subjectSource, [subject.id]: source } })) },
          },
          h('option', { value: 'auto' }, '自动（优先题库）'),
          h('option', { value: 'online' }, '在线出题'),
          h('option', { value: 'bank' }, '题库出题')),
          subject.bankItemCount
            ? h('span', { className: 'kd-msg-meta' }, `题库 ${subject.bankItemCount} 题`)
            : h('span', { className: 'kd-msg-meta' }, '题库为空'))
        : null)),
      h('div', { className: 'kd-divider' }),
      h('div', { className: 'kd-field kd-custom-subject' },
        h('div', { className: 'kd-field-label' }, '添加自定义科目'),
        referenceEditor({referenceSubjectId,referenceExamName,referenceExamCode,code:subjectCode},(patch)=>{
          if (patch.referenceSubjectId !== undefined) setReferenceSubjectId(patch.referenceSubjectId)
          if (patch.referenceExamName !== undefined) setReferenceExamName(patch.referenceExamName)
          if (patch.referenceExamCode !== undefined) setReferenceExamCode(patch.referenceExamCode)
          if (patch.code !== undefined) setSubjectCode(patch.code)
        },'自定义科目的参考考试'),
        h('div',{className:'kd-meta'},'默认由模型按名称和代码自主检索、独立核验大纲及两年真题。专业代码不等于考试科目代码；信息不足时可在「另行指定参考考试名称」补充院校和准确考试名称，资料不足不会发布。'),
        h('div', { className: 'kd-row' },
          h('input', {
            className: 'kd-input',
            style: { flex: '1 1 200px' },
            value: name,
            placeholder: '例如：数据结构（自命题）',
            onChange: (event) => setName(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') submit() },
          }),
          h(Btn, { disabled: !canAdd, onClick: submit }, '添加')),
        h('div', { className: 'kd-meta', style: { marginTop: '10px' } }, '题型（至少选一个）'),
        h('div', { className: 'kd-row', style: { marginTop: '6px' } },
          [['single', '单项选择题'], ['multiple', '多项选择题'], ['fill', '填空题'], ['solution', '解答题']]
            .map(([value, label]) =>
              h('label', { key: value, className: 'kd-checkline', style: { cursor: 'pointer' } },
                h('input', {
                  type: 'checkbox',
                  checked: types.includes(value),
                  onChange: () => toggleType(value),
                }),
                h('span', null, label)))),
        customTypes.length
          ? h('div', { className: 'kd-row', style: { marginTop: '6px' } },
            customTypes.map((value) => h('span', { key: value, className: 'kd-chip' },
              h('label', { className: 'kd-checkline', style: { cursor: 'pointer' } },
                h('input', {
                  type: 'checkbox',
                  checked: types.includes(value),
                  onChange: () => toggleType(value),
                }),
                h('span', null, value)),
              h('button', {
                type: 'button',
                className: 'kd-iconbtn',
                title: '删除这个自定义题型',
                onClick: () => dropCustomType(value),
              }, h(Icon, { name: 'close', size: 12 })))))
          : null,
        h('div', { className: 'kd-row', style: { marginTop: '8px' } },
          h('input', {
            className: 'kd-input',
            style: { flex: '1 1 160px' },
            value: typeDraft,
            placeholder: '自定义题型，例如：名词解释',
            onChange: (event) => setTypeDraft(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') addCustomType() },
          }),
          h(Btn, { small: true, disabled: !typeDraft.trim(), onClick: addCustomType }, '添加题型')),
        h('div', { className: 'kd-msg-meta', style: { marginTop: '6px' } },
          canAdd ? `将添加：${name.trim()}（${types.join(' / ')}）` : '填写科目名称并至少选择一个题型后即可添加'))))
    }

    function BanksModal({ boot, importResult, onClose, onPickFile, onDelete, onCommit, onCancelImport, committing }) {
      const [excluded, setExcluded] = useState([])
      const [previewPage, setPreviewPage] = useState(0)
      if (importResult) {
        const pageSize = 60
        const pageCount = Math.ceil(importResult.items.length / pageSize)
        const selectedCount = importResult.usable - excluded.length
        return h(Modal, {
          title: `${T.preview}（${importResult.name}）`,
          onClose: onCancelImport,
          wide: true,
          footer: [
            h(Btn, { key: 'cancel', onClick: onCancelImport }, T.cancel),
            h(Btn, {
              key: 'ok',
              variant: 'primary',
              disabled: !selectedCount || committing,
              onClick: () => onCommit(importResult, excluded),
            }, T.commit),
          ],
        },
        h('div', { className: 'kd-meta', style: { marginBottom: '10px' } },
          `共识别 ${importResult.stats.total} 道，可用 ${importResult.usable} 道，已选 ${selectedCount} 道入库。`),
        importResult.warnings.length
          ? h('div', { className: 'kd-verify' },
            h('div', null, '解析提示：'),
            h('ul', null, importResult.warnings.map((item, index) => h('li', { key: index }, item))))
          : null,
        pageCount > 1
          ? h('div', { className: 'kd-actions' },
            h(Btn, { small: true, disabled: previewPage === 0, onClick: () => setPreviewPage(previewPage - 1) }, '上一页'),
            h('span', { className: 'kd-meta' }, `${previewPage + 1} / ${pageCount}`),
            h(Btn, { small: true, disabled: previewPage + 1 === pageCount, onClick: () => setPreviewPage(previewPage + 1) }, '下一页'))
          : null,
        h('div', { style: { marginTop: '12px' } },
          importResult.items.slice(previewPage * pageSize, (previewPage + 1) * pageSize).map((item) => h('div', { key: item.index, className: 'kd-preview-item' },
            h('div', { className: 'kd-meta' },
              h('input', {
                type: 'checkbox',
                'aria-label': `第 ${item.index} 题入库`,
                disabled: !item.usable || committing,
                checked: item.usable && !excluded.includes(item.index),
                onChange: (event) => {
                  const checked = event.target.checked
                  setExcluded((items) => checked ? items.filter((index) => index !== item.index) : [...items, item.index])
                },
              }),
              h(Badge, null, `第 ${item.index} 题`),
              h(Badge, null, item.typeLabel),
              item.usable === false ? h(Badge, { tone: 'warn' }, '不入库') : null,
              item.answerStatus === 'missing'
                ? h(Badge, { tone: 'warn' }, T.missing)
                : h(Badge, { tone: 'ok' }, '含参考答案（待核验）'),
              item.options.length ? h(Badge, null, `${item.options.length} 个选项`) : null),
            h('div', { style: { marginTop: '6px', fontSize: '13px' } },
              h(Markdown, { text: (item.stem || '(未识别到题干)').slice(0, 400) })),
            item.issues.length
              ? h('div', { className: 'kd-warn-text', style: { marginTop: '6px' } }, `问题：${item.issues.join('；')}`)
              : null))))
      }

      return h(Modal, {
        title: T.manageBanks,
        onClose,
        wide: true,
        footer: [
          h(Btn, { key: 'import', variant: 'primary', onClick: onPickFile }, h(Icon, { name: 'upload', size: 13 }), T.import),
          h(Btn, { key: 'close', onClick: onClose }, T.close),
        ],
      },
      h('div', { className: 'kd-meta', style: { marginBottom: '12px' } }, T.importHint),
      (boot.banks || []).length
        ? boot.banks.map((bank) => h('div', {
          key: bank.id,
          className: 'kd-row-between kd-manage-card',
        },
        h('div', { style: { minWidth: 0 } },
          h('div', null, bank.name),
          h('div', { className: 'kd-msg-meta' },
            `${bank.itemCount} 道 · ${bank.kind === 'pdf' ? 'PDF' : 'Markdown'} · 导入于 ${formatDateTime(bank.importedAt)}`,
            bank.pendingAnswers ? ` · ${bank.pendingAnswers} 道答案待核验` : '')),
        h(Btn, { small: true, variant: 'danger', onClick: () => onDelete(bank) }, h(Icon, { name: 'trash', size: 13 }), T.deleteBank)))
        : h(EmptyState, {
          icon: 'upload',
          title: '还没有导入题库',
          body: '题库用于「题库出题」来源：每道题会被分配唯一题目 ID，同一题反复出现也不会在列表里产生重复记录。',
        }))
    }

    function RevisionModal({ question, onClose, onConfirm, onDiscard, busy }) {
      const candidate = question?.pendingRevision
      if (!candidate) return null
      return h(Modal, {
        title: T.revision,
        onClose,
        wide: true,
        footer: [
          h(Btn, { key: 'discard', onClick: onDiscard }, T.discardRevision),
          h(Btn, {
            key: 'ok',
            variant: 'primary',
            disabled: busy || candidate.verification?.status !== 'passed',
            onClick: onConfirm,
          }, T.confirmRevision),
        ],
      },
      h('div', { className: 'kd-verify' },
        h(Badge, { tone: candidate.verification?.status === 'passed' ? 'ok' : 'warn' },
          candidate.verification?.status === 'passed' ? '候选版本已通过独立校验' : '候选版本未通过校验'),
        ` ${candidate.verification?.summary || ''}（${candidate.verification?.method || ''}）`),
      h('div', { className: 'kd-answer-block', style: { marginTop: '14px' } },
        h('div', { className: 'kd-answer-label' }, '候选标准答案'),
        h(Markdown, { text: candidate.answer })),
      h('div', { className: 'kd-answer-block' },
        h('div', { className: 'kd-answer-label' }, '候选解析'),
        h(Markdown, { text: candidate.explanation })),
      h('div', { className: 'kd-msg-meta' }, '确认后才会替换正式版本；旧版本会保留在版本历史中。'))
    }

    function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose, danger, busy }) {
      return h(Modal, {
        title,
        onClose,
        footer: [
          h(Btn, { key: 'cancel', onClick: onClose, disabled: busy }, T.cancel),
          h(Btn, { key: 'ok', variant: danger ? 'danger' : 'primary', onClick: onConfirm, disabled: busy }, busy ? '正在处理…' : (confirmLabel || T.confirm)),
        ],
      }, h('div', { className: 'kd-md' }, message))
    }

    /* ============================== 主页面 ============================== */
    function watchDayChange(snapshot, onSnapshot) {
      let timer, stopped = false, checking = false
      const schedule = (retry = false) => {
        const delay = Date.parse(snapshot.nextDayAt) - Date.parse(snapshot.now)
        timer = window.setTimeout(check, retry || !Number.isFinite(delay) ? 60_000 : Math.max(1000, delay))
      }
      const check = async () => {
        if (stopped || checking) return
        checking = true
        window.clearTimeout(timer)
        let retry = false
        try {
          const fresh = await rpc('bootstrap')
          if (!stopped) { snapshot = fresh; onSnapshot(fresh) }
        } catch { retry = true }
        finally { checking = false; if (!stopped) schedule(retry) }
      }
      const onVisible = () => { if (window.document.visibilityState === 'visible') check() }
      schedule()
      window.addEventListener('focus', check)
      window.document.addEventListener('visibilitychange', onVisible)
      return () => {
        stopped = true
        window.clearTimeout(timer)
        window.removeEventListener('focus', check)
        window.document.removeEventListener('visibilitychange', onVisible)
      }
    }

    function Page() {
      const [boot, setBoot] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [subjectId, setSubjectId] = useState(null)
      const [kind, setKind] = useState('today')
      const [view, setView] = useState('empty')
      const [question, setQuestion] = useState(null)
      const [thread, setThread] = useState(null)
      const [list, setList] = useState(null)
      const [busy, setBusy] = useState('')
      const [managing, setManaging] = useState(false)
      const [selected, setSelected] = useState([])
      const bulkLock = useRef(false)
      const [fail, setFail] = useState('')
      const [toast, setToast] = useState(null)
      const [modal, setModal] = useState(null)
      const [choice, setChoice] = useState('')
      const [localRedo, setLocalRedo] = useState(false)
      const [threadOpen, setThreadOpen] = useState(false)
      const [threadRatio, setThreadRatio] = useState(33)
      const fileRef = useRef(null)
      const attemptRef = useRef(newAttemptId())
      const toastTimer = useRef(null)
      const mainScroll = useRef(null)
      const listScroll = useRef(0)
      const redoQuestions = useRef(new Set())
      const dailyRequest = useRef(0)
      const lastDay = useRef(null)
      const currentView = useRef(null)
      const bootRequest = useRef(0)
      const threadRequest = useRef(0)
      const selectionRequest = useRef(0)
      currentView.current = { subjectId, kind, view, page:list?.page||1, loading:busy==='list' }

      useEffect(() => {
        if (view === 'list' && list && mainScroll.current) mainScroll.current.scrollTop = listScroll.current
        if (view === 'detail' && mainScroll.current) mainScroll.current.scrollTop = 0
      }, [view, list])

      const notify = useCallback((message, tone = 'ok') => {
        setToast({ message, tone })
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 4200)
      }, [])

      useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

      const refreshBoot = useCallback(async () => {
        const request = ++bootRequest.current
        try {
          const result = await rpc('bootstrap')
          if (request === bootRequest.current) setBoot(result)
          return result
        } catch {
          return null
        }
      }, [])

      const loadToday = useCallback(async (sid) => {
        if (!sid) return
        const request = ++dailyRequest.current
        // 高亮必须跟着视图走：从「全部 / 收藏 / 错题本」切回今日题目时要一起复位
        setKind('today')
        setThreadOpen(false)
        setView('detail')
        setBusy('daily')
        setFail('')
        setQuestion(null)
        setThread(null)
        setLocalRedo(false)
        setChoice('')
        attemptRef.current = newAttemptId()
        try {
          const result = await rpc('ensureDaily', { subjectId: sid })
          if (request === dailyRequest.current) {
            setQuestion(result.question)
            setLocalRedo(redoQuestions.current.has(result.question.id))
            setThread(result.thread || null)
          }
          await refreshBoot()
        } catch (issue) {
          if (request === dailyRequest.current) setFail(issue.message)
        } finally {
          if (request === dailyRequest.current) setBusy('')
        }
      }, [refreshBoot])

      useEffect(() => {
        if (!boot?.today) return undefined
        return watchDayChange(boot, setBoot)
      }, [boot?.today])

      useEffect(() => {
        if (!boot?.today || lastDay.current === boot.today) return undefined
        const previous = lastDay.current
        lastDay.current = boot.today
        if (!previous) return undefined
        redoQuestions.current.clear()
        const { subjectId: sid, kind: activeKind } = currentView.current
        if (!sid || !boot.settings.subjects.includes(sid)) return undefined
        if (activeKind === 'today') { loadToday(sid); return undefined }
        let cancelled = false
        const request=dailyRequest.current
        rpc('ensureDaily', { subjectId: sid }).then(async () => {
          if (cancelled) return
          await refreshBoot()
          const current = currentView.current
          if (cancelled || request!==dailyRequest.current || current.loading || current.subjectId !== sid || current.kind === 'today' || current.view !== 'list') return
          const result = await rpc('listQuestions', { subjectId: sid, kind: current.kind, page:current.page })
          const latest = currentView.current
          if (!cancelled && request===dailyRequest.current && !latest.loading && latest.page===current.page && latest.subjectId === sid && latest.kind === current.kind && latest.view === 'list') {
            listScroll.current = mainScroll.current?.scrollTop || 0
            setList(result)
          }
        }).catch((issue) => { if (!cancelled) notify(`今日题目更新失败：${issue.message}`, 'warn') })
        return () => { cancelled = true }
      }, [boot?.today, loadToday, refreshBoot, notify])

      const loadList = useCallback(async (sid, nextKind, page = 1) => {
        if (!sid) return
        const request = ++dailyRequest.current
        listScroll.current = 0
        setKind(nextKind)
        setThreadOpen(false)
        setView('list')
        setFail('')
        setBusy('list')
        setList(null)
        try {
          const result = await rpc('listQuestions', { subjectId: sid, kind: nextKind, page })
          if (request === dailyRequest.current) setList(result)
        } catch (issue) {
          if (request === dailyRequest.current) notify(issue.message, 'bad')
        } finally {
          if (request === dailyRequest.current) setBusy('')
        }
      }, [notify])

      useEffect(() => { setSelected([]); setManaging(false) }, [subjectId, kind, view])

      const pickSubject = useCallback((sid) => {
        if (!sid || sid === subjectId) return
        setSubjectId(sid)
        setList(null)
        rpc('saveSettings', { activeSubject: sid }).catch(() => {})
        if (boot.settings.subjects.includes(sid)) loadToday(sid)
        else loadList(sid, 'all')
      }, [boot, subjectId, loadToday, loadList])

      const openQuestion = useCallback(async (qid) => {
        const request = ++dailyRequest.current
        listScroll.current = mainScroll.current?.scrollTop || 0
        setBusy('question')
        try {
          const result = await rpc('getQuestion', { qid })
          if (request !== dailyRequest.current) return
          const canResume = result.isToday && result.question.answerState === 'revealed'
            && result.question.attemptCount > 0 && !redoQuestions.current.has(qid)
          if (!canResume) redoQuestions.current.add(qid)
          setQuestion(result.question)
          setThread(result.thread || null)
          setView('detail')
          setLocalRedo(!canResume)
          setChoice('')
          setThreadOpen(false)
          attemptRef.current = newAttemptId()
        } catch (issue) {
          if (request === dailyRequest.current) notify(issue.message, 'bad')
        } finally {
          if (request === dailyRequest.current) setBusy('')
        }
      }, [notify])

      const backToList = async () => {
        const request = ++dailyRequest.current
        setThreadOpen(false)
        setView('list')
        try {
          const result = await rpc('listQuestions', { subjectId, kind, page:list?.page||1 })
          if (request === dailyRequest.current) setList(result)
        } catch (issue) { if (request === dailyRequest.current) notify(issue.message, 'bad') }
      }

      useEffect(() => {
        let cancelled = false
        rpc('bootstrap').then((result) => {
          if (cancelled) return
          setBoot(result)
          const preferred = result.settings?.activeSubject
          const archived = archivedSubjects(result)
          const first = preferred && (result.settings.subjects.includes(preferred) || archived.some((subject) => subject.id === preferred))
            ? preferred
            : (result.settings.subjects[0] || archived[0]?.id || null)
          setSubjectId(first)
          setLoading(false)
          if (first && result.settings.subjects.includes(first)) loadToday(first)
          else if (first) loadList(first, 'all')
          else setView('empty')
        }).catch((issue) => {
          if (cancelled) return
          setError(issue.message)
          setLoading(false)
        })
        return () => { cancelled = true }
      }, [loadToday, loadList])

      const currentSubject = useMemo(() => (boot?.subjects || []).find((subject) => subject.id === subjectId) || null,
        [boot, subjectId])

      const reveal = useCallback(async (mode) => {
        if (!question) return
        const request = dailyRequest.current
        const attemptId = attemptRef.current
        setBusy('reveal')
        const showSaved = (saved) => {
          setQuestion(saved)
          redoQuestions.current.delete(question.id)
          setLocalRedo(false)
        }
        try {
          const result = await rpc('reveal', {
            qid: question.id,
            mode,
            choice: mode === 'submit' ? choice : '',
            attemptId,
          })
          if (request === dailyRequest.current) showSaved(result.question)
          refreshBoot()
        } catch (issue) {
          if (request !== dailyRequest.current) return
          const saved = await rpc('getQuestion', { qid: question.id, attemptId }).catch(() => null)
          if (request !== dailyRequest.current) return
          if (saved?.question?.lastAttempt?.id === attemptId) {
            showSaved(saved.question)
            const last = saved.question.lastAttempt
            const changed = last.mode !== mode || (mode === 'submit' && last.choice !== choice)
            notify(changed ? '已找回先前保存的作答。本次改选未提交，可点击「重新作答」再提交。' : '已找回本轮保存的作答', changed ? 'warn' : 'ok')
            refreshBoot()
          } else {
            notify(`${issue.message}。未确认本轮是否保存，可再次提交以核对。`, 'warn')
          }
        } finally {
          if (request === dailyRequest.current) setBusy('')
        }
      }, [question, choice, notify, refreshBoot])

      const judge = useCallback(async (verdict) => {
        if (!question) return
        if (!question.lastAttempt?.id) { notify('缺少本次作答记录，请重新打开题目后判定','bad'); return }
        const request = dailyRequest.current
        setBusy('judge')
        try {
          const result = await rpc('judge', { qid: question.id, verdict, attemptId:question.lastAttempt.id })
          if (request === dailyRequest.current) setQuestion(result.question)
          refreshBoot()
        } catch (issue) {
          if (request === dailyRequest.current) notify(issue.message, 'bad')
        } finally {
          if (request === dailyRequest.current) setBusy('')
        }
      }, [question, notify, refreshBoot])

      const favorite = useCallback(async () => {
        if (!question) return
        const request = dailyRequest.current
        setBusy('favorite')
        try {
          const result = await rpc('favorite', { qid: question.id, value: !question.favorite })
          if (request === dailyRequest.current) {
            setQuestion(result.question)
            notify(question.favorite ? '已取消收藏' : '已加入收藏')
          }
          refreshBoot()
        } catch (issue) {
          if (request === dailyRequest.current) notify(issue.message, 'bad')
        } finally {
          if (request === dailyRequest.current) setBusy('')
        }
      }, [question, notify, refreshBoot])

      const sendFollowup = useCallback(async (text, messageId) => {        if (!question) throw new Error('没有打开任何题目')
        const request = dailyRequest.current
        const threadVersion = ++threadRequest.current
        const result = await rpc('followup', { qid: question.id, message: text, clientMessageId: messageId })
        if (request === dailyRequest.current && threadVersion === threadRequest.current) setThread(result.thread)
      }, [question])

      const clearThread = useCallback(async () => {
        if (!question) return
        setModal({
          kind: 'confirm',
          title: '清空本题追问',
          message: '只会清空当前这道题的追问记录，不会删除题目、作答记录或其他题目的对话。',
          confirmLabel: '清空',
          danger: true,
          onConfirm: async () => {
            const request = dailyRequest.current
            const threadVersion = ++threadRequest.current
            setModal(null)
            try {
              const result = await rpc('clearThread', { qid: question.id })
              if (request === dailyRequest.current && threadVersion === threadRequest.current) {
                setThread(result.thread)
                notify('本题追问已清空')
              }
            } catch (issue) {
              notify(issue.message, 'bad')
            }
          },
        })
      }, [question, notify])

      const cancelWork = async (kind, qid, clientMessageId) => {
        try { await rpc('cancelTask',{kind,subjectId,qid,clientMessageId}) }
        catch (issue) { notify(issue.message,'bad') }
      }

      const revise = useCallback(async () => {
        if (!question) return
        const request = dailyRequest.current
        setBusy('revise')
        try {
          const result = await rpc('revise', { qid: question.id })
          if (request !== dailyRequest.current) return
          setQuestion(result.question)
          setModal({ kind: 'revision' })
        } catch (issue) {
          if (request === dailyRequest.current) notify(issue.message, 'bad')
        } finally {
          if (request === dailyRequest.current) setBusy('')
        }
      }, [question, notify])

      const confirmRevision = useCallback(async () => {
        if (!question?.pendingRevision) return
        const request = dailyRequest.current
        setBusy('revise')
        try {
          const result = await rpc('confirmRevision', {
            qid: question.id,
            candidateId: question.pendingRevision.candidateId,
          })
          if (request !== dailyRequest.current) return
          setQuestion(result.question)
          setModal(null)
          notify('已替换为通过校验的新版本，旧版本已保留')
        } catch (issue) {
          if (request === dailyRequest.current) notify(issue.message, 'bad')
        } finally {
          if (request === dailyRequest.current) setBusy('')
        }
      }, [question, notify])

      const discardRevision = useCallback(async () => {
        if (!question) return
        const request = dailyRequest.current
        setModal(null)
        try {
          const result = await rpc('discardRevision', { qid: question.id })
          if (request !== dailyRequest.current) return
          setQuestion(result.question)
          notify('已放弃候选版本，正式答案保持不变')
        } catch (issue) {
          if (request === dailyRequest.current) notify(issue.message, 'bad')
        }
      }, [question, notify])

      const changeYear = useCallback(async (year) => {
        setBusy('year')
        try {
          const result = await rpc('saveSettings', { targetYear: year })
          await refreshBoot()
          if (result.countdown?.expired) notify('该年份的考试日期已过，请重新选择考研年份', 'warn')
          else notify(`已切换到 ${year} 考研`)
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [notify, refreshBoot])

      const refreshExam = useCallback(async () => {
        setBusy('exam')
        try {
          const result = await rpc('refreshExamDate', { year: boot?.settings?.targetYear })
          if (result.ok) {
            notify('已核验到官方公布的考试日期')
            await refreshBoot()
          } else {
            notify(result.reason || '暂未核验到官方公布的日期', 'warn')
            await refreshBoot()
          }
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [boot, notify, refreshBoot])

      const saveSubjects = async (draft) => {
        const keepHistory = boot.counts?.[subjectId]?.all > 0
        const next = draft.subjects.includes(subjectId) || keepHistory ? subjectId : (draft.subjects[0] || null)
        const result = await rpc('saveSettings', { ...draft, activeSubject: next })
        bootRequest.current++
        setBoot((current) => ({ ...current, ...result, customSubjects: draft.customSubjects }))
        setModal(null)
        notify('科目设置已保存')
        if (next !== subjectId || (kind === 'today' && !result.settings.subjects.includes(next))) {
          setSubjectId(next)
          if (next && result.settings.subjects.includes(next)) loadToday(next)
          else if (next) loadList(next, 'all')
          else {
            dailyRequest.current++
            setBusy(''); setFail(''); setQuestion(null); setThread(null); setThreadOpen(false); setView('empty')
          }
        }
      }

      const pickFile = useCallback(() => {
        if (fileRef.current) {
          fileRef.current.value = ''
          fileRef.current.click()
        }
      }, [])

      const onFile = useCallback(async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        setBusy('import')
        try {
          const payload = await readFileAsPayload(file)
          const result = await rpc('importBank', {
            name: file.name.replace(/\.[^.]+$/, ''),
            fileName: file.name,
            kind: payload.kind,
            text: payload.text,
            base64: payload.base64,
            subjectId: subjectId || '',
          })
          setModal({ kind: 'banks', importResult: result })
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [subjectId, notify])

      const commitBank = useCallback(async (result, excludedIndexes) => {
        setBusy('commit')
        try {
          const saved = await rpc('commitBank', { importId: result.importId, name: result.name, subjectId: subjectId || '', excludedIndexes })
          setModal({ kind: 'banks' })
          await refreshBoot()
          notify(`题库《${saved.bank.name}》已入库，共 ${saved.bank.itemCount} 道题`)
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [subjectId, notify, refreshBoot])

      const deleteBank = useCallback((bank) => {
        setModal({
          kind: 'confirm',
          title: `${T.deleteBank}：${bank.name}`,
          message: `确认删除题库《${bank.name}》吗？\n\n- 已由该题库出过的题目、作答记录、收藏与追问都会保留，仍可在“全部”里打开。\n- 删除后无法再从这个题库抽题（需要重新导入）。`,
          confirmLabel: T.deleteBank,
          danger: true,
          onConfirm: async () => {
            setModal(null)
            try {
              const result = await rpc('deleteBank', { bankId: bank.id })
              await refreshBoot()
              notify(result.message)
            } catch (issue) {
              notify(issue.message, 'bad')
            }
          },
        })
      }, [notify, refreshBoot])

      const bulkQuestions = async (action) => {
        if (bulkLock.current || !selected.length) return
        const request = dailyRequest.current
        const qids = [...selected]
        const execute = async (confirmProtected = false) => {
          if (bulkLock.current || request !== dailyRequest.current) return
          bulkLock.current = true
          setBusy('bulk')
          try {
            const result = await rpc('bulkQuestions', { qids, action, confirmProtected })
            if (request !== dailyRequest.current) { refreshBoot(); return }
            if (result.requiresConfirmation) {
              setModal({ kind: 'confirm', title: '再次确认删除收藏或错题', danger: true,
                message: `选中的题目中有 ${result.protectedCount} 道已收藏或在错题本中。继续将永久删除所选 ${qids.length} 道题及其作答和追问，无法恢复。确定仍要删除吗？`,
                confirmLabel: '仍要永久删除', onConfirm: () => execute(true) })
              return
            }
            setModal(null)
            setSelected([])
            const loading = loadList(subjectId, kind, list?.page||1)
            const listRequest = dailyRequest.current
            await loading
            await refreshBoot()
            if (listRequest === dailyRequest.current) notify(`已处理 ${result.affected} 道题目`)
          } catch (issue) {
            if (request === dailyRequest.current) { setModal(null); notify(issue.message, 'bad') }
          } finally { bulkLock.current = false; if (request === dailyRequest.current) setBusy('') }
        }
        if (action === 'delete') {
          setModal({ kind: 'confirm', title: '删除所选题目', danger: true,
            message: `将永久删除 ${qids.length} 道题及其作答、收藏、错题标记和追问，无法恢复。题库原文件仍会保留，未来可能重新抽到其中的题目。`,
            confirmLabel: '确认删除', onConfirm: () => execute() })
        } else await execute()
      }

      const counts = subjectId ? boot?.counts?.[subjectId] : null
      const selectAllQuestions = async (value) => {
        if(bulkLock.current)return
        const request=dailyRequest.current,selection=++selectionRequest.current
        const isCurrent=()=>request===dailyRequest.current&&selection===selectionRequest.current
        if(!value){setSelected([]);setBusy(current=>current==='selection'?'':current);return}
        setBusy('selection')
        try {
          const result=await rpc('listQuestions',{subjectId,kind,idsOnly:true})
          if(isCurrent())setSelected(result.ids)
        } catch(issue){if(isCurrent())notify(issue.message,'bad')}
        finally{if(isCurrent())setBusy(current=>current==='selection'?'':current)}
      }
      const narrow = useMediaQuery('(max-width: 1180px)')

      const mainContent = (() => {
        if (error) {
          return h(EmptyState, {
            icon: 'x',
            title: '插件后端没有响应',
            body: error,
            actions: h(Btn, { onClick: () => window.location.reload() }, '重新加载页面'),
          })
        }
        if (loading) return h('div', { className: 'kd-loading' }, h('span', { className: 'kd-spinner' }), '正在读取学习数据…')
        if (!subjectId && !boot?.settings?.subjects?.length && !archivedSubjects(boot || {}).length) {
          return h(EmptyState, {
            icon: 'plus',
            title: T.noSubjects,
            body: T.noSubjectsHint,
            actions: [
              h(Btn, {
                key: 'add',
                variant: 'primary',
                onClick: () => setModal({ kind: 'subjects' }),
              }, h(Icon, { name: 'plus', size: 13 }), T.addSubject),
              h(Btn, { key: 'bank', onClick: () => setModal({ kind: 'banks' }) }, T.manageBanks),
            ],
          })
        }
        if (busy === 'daily' && !question) {
          return h('div', { className: 'kd-loading' },
            h('span', { className: 'kd-spinner' }),
            T.generating,
            h('div', { className: 'kd-msg-meta', style: { marginTop: '8px' } },
              '先出题，再仅凭题干和选项盲解并比对答案；分歧交由主裁，仍无法确定就重新出题或阻止发布。首次出题可能需要较长时间。'),
            h(Btn,{variant:'ghost',onClick:()=>cancelWork('daily')},'取消生成'))
        }
        if (fail) {
          return h(EmptyState, {
            icon: 'refresh',
            title: T.generateFailed,
            body: fail,
            actions: [
              h(Btn, {
                key: 'retry',
                variant: 'primary',
                onClick: () => loadToday(subjectId),
              }, h(Icon, { name: 'refresh', size: 13 }), T.retry),
              h(Btn, { key: 'src', onClick: () => setModal({ kind: 'subjects' }) }, '切换出题来源'),
              h(Btn, { key: 'bank', onClick: () => setModal({ kind: 'banks' }) }, T.manageBanks),
            ],
          })
        }
        if (!subjectId) {
          return h(EmptyState, {
            icon: 'book',
            title: '先选择一个科目',
            body: '左侧列出的科目都可以切换；没有想要的科目就先去「科目管理」添加。',
          })
        }
        if (kind !== 'today' && view === 'list') {
          return h(ListPane, {
            list,
            kind,
            subjectName: currentSubject?.name || '',
            onOpen: openQuestion,
            managing, selected, busy: busy === 'bulk' || busy === 'selection',
            onManage: () => { setManaging(!managing); setSelected([]) },
            onToggle: (id) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]),
            onSelectAll: selectAllQuestions,
            onPage: (page) => loadList(subjectId,kind,page),
            onBulk: bulkQuestions,
          })
        }
        if (view === 'detail' && question) {
          return h(QuestionPane, {
            q: question,
            busy,
            choice,
            localRedo,
            threadOpen,
            onSelect: (key) => {
              setChoice((current) => {
                if (question.type !== 'multiple') return key
                const set = new Set(current.split('').filter(Boolean))
                if (set.has(key)) set.delete(key)
                else set.add(key)
                return [...set].sort().join('')
              })
            },
            onReveal: reveal,
            onSkip: () => kind === 'today' ? loadList(subjectId, 'all') : backToList(),
            onJudge: judge,
            onFavorite: favorite,
            onRedo: () => {
              dailyRequest.current++
              setBusy('')
              redoQuestions.current.add(question.id)
              setLocalRedo(true)
              setThreadOpen(false)
              setChoice('')
              attemptRef.current = newAttemptId()
            },
            onRevise: revise,
            onCancel: () => cancelWork('revise',question.id),
            revising: busy === 'revise',
            onToggleThread: () => setThreadOpen((value) => !value),
            onRemoveWrong: async () => {
              if (!question) return
              const request = dailyRequest.current
              try {
                const result = await rpc('removeFromWrongBook', { qid: question.id })
                if (request === dailyRequest.current) {
                  setQuestion(result.question)
                  notify('已移出错题本，历史作答记录仍然保留')
                }
                refreshBoot()
              } catch (issue) {
                if (request === dailyRequest.current) notify(issue.message, 'bad')
              }
            },
          })
        }
        return h(EmptyState, {
          icon: 'spark',
          title: '选择一个入口开始',
          body: '左侧「今日题目 / 全部 / 收藏 / 错题本」分别对应今天这道题、历史题目、收藏和错题。',
        })
      })()

      const pickTab = (value) => {
        if (value === kind && (value === 'today' || view === 'list')) return
        if (value === 'today') {
          if (boot?.settings.subjects.includes(subjectId)) loadToday(subjectId)
        }
        else loadList(subjectId, value)
      }
      const showThread = view === 'detail' && question && threadOpen && !localRedo
        && question.answerState === 'revealed' && question.attemptCount > 0

      return h('div', { className: 'kd-page' },
        styleInjected ? null : h('style', null, CSS),
        h('div', { className: 'kd-header' },
          h('div', { className: 'kd-header-top' },
            h('div', { className: 'kd-header-left' },
              h(PluginLogo, { size: 40, className: 'kd-brand' }),
              h('div', { style: { minWidth: 0 } },
                h('h1', { className: 'kd-title' }, T.title),
                h('div', { className: 'kd-sub', title: T.subtitle },
                  boot?.today ? `今日日期：${formatDate(boot.today)}\u00a0\u00a0` : '',
                  '每日一题，稳步向前'))),
            boot ? h(CountdownLines, { countdown: boot.countdown }) : null),
          boot ? h(ExamStrip, {
            boot,
            busy: busy === 'exam',
            onRefresh: refreshExam,
            onYearChange: changeYear,
          }) : null),
        boot ? h(MobileBar, {
          boot,
          subjectId,
          onPick: pickSubject,
          onManage: () => setModal({ kind: 'subjects' }),
          onBanks: () => setModal({ kind: 'banks' }),
        }) : null,
        h('div', { className: 'kd-shell' },
          boot ? h(SubjectNav, {
            boot,
            subjectId,
            onPick: pickSubject,
            onManage: () => setModal({ kind: 'subjects' }),
            onBanks: () => setModal({ kind: 'banks' }),
          }) : null,
          h('main', { className: 'kd-main' },
            h('div', { className: 'kd-main-toolbar' },
              boot ? h(TabBar, {
                kind,
                counts,
                onPick: pickTab,
                todayDisabled: !boot.settings.subjects.includes(subjectId),
              }) : null,
              kind !== 'today' && view === 'detail'
                ? h(Btn, { small: true, onClick: backToList, title: '返回列表', ariaLabel: '返回列表' }, h(Icon, { name: 'chevron-left', size: 16 })) : null),
            h('div', { className: 'kd-main-scroll', ref: mainScroll },
              h('div', { className: 'kd-main-inner' },
                h('div', { className: 'kd-view', key: `${subjectId}|${kind}|${view}|${question?.id || ''}` }, mainContent)))),
          h(Presence, null, showThread
            ? h(ThreadPane, {
              thread,
              questionId: question.id,
              busy,
              narrow,
              ratio: threadRatio,
              onRatioChange: setThreadRatio,
              onSend: sendFollowup,
              onClear: clearThread,
              onCancel: (messageId) => cancelWork('followup',question.id,messageId),
              onClose: () => setThreadOpen(false),
            })
            : null)),
        h('input', {
          ref: fileRef,
          type: 'file',
          accept: '.md,.markdown,.txt,.pdf',
          style: { display: 'none' },
          onChange: onFile,
        }),
        h(Presence, null,
        modal?.kind === 'subjects' && boot
          ? h(SubjectsModal, {
            boot,
            onClose: () => setModal(null),
            onDone: saveSubjects,
          })
          : null,
        modal?.kind === 'banks' && boot
          ? h(BanksModal, {
            key: modal.importResult?.importId || 'banks',
            boot,
            importResult: modal.importResult,
            committing: busy === 'commit',
            onClose: () => setModal(null),
            onPickFile: pickFile,
            onDelete: deleteBank,
            onCommit: commitBank,
            onCancelImport: () => setModal({ kind: 'banks' }),
          })
          : null,
        modal?.kind === 'revision' ? h(RevisionModal, {
          question,
          busy: busy === 'revise',
          onClose: () => setModal(null),
          onConfirm: confirmRevision,
          onDiscard: discardRevision,
        }) : null,
        modal?.kind === 'confirm' ? h(ConfirmModal, {
          key: modal.title,
          title: modal.title,
          message: modal.message,
          confirmLabel: modal.confirmLabel,
          danger: modal.danger,
          busy: busy === 'bulk',
          onConfirm: modal.onConfirm,
          onClose: () => { if (!bulkLock.current) setModal(null) },
        }) : null,
        ),
        toast ? h('div', { className: `kd-toast kd-toast-${toast.tone}` }, toast.message) : null,
        busy === 'import' || busy === 'commit'
          ? h('div', { className: 'kd-loading', style: { position: 'absolute', inset: 'auto 0 60px 0' } },
            h('span', { className: 'kd-spinner' }), busy === 'import' ? '正在解析文件…' : '正在入库…')
          : null)
    }

    function useMediaQuery(query) {
      const [matches, setMatches] = useState(() => {
        try {
          return window.matchMedia(query).matches
        } catch {
          return false
        }
      })
      useEffect(() => {
        let media
        try {
          media = window.matchMedia(query)
        } catch {
          return undefined
        }
        const onChange = () => setMatches(media.matches)
        onChange()
        media.addEventListener ? media.addEventListener('change', onChange) : media.addListener(onChange)
        return () => {
          media.removeEventListener ? media.removeEventListener('change', onChange) : media.removeListener(onChange)
        }
      }, [query])
      return matches
    }

    /* ============================== 插件图标 ============================== */
    function PluginLogo({ size = 16, className }) {
      const gradientId = useId()
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 64 64',
        className,
        'aria-hidden': true,
      },
      h('defs', null,
        h('linearGradient', { id: gradientId, x1: 0, y1: 0, x2: 1, y2: 1 },
          h('stop', { offset: 0, stopColor: '#5676ff' }),
          h('stop', { offset: 1, stopColor: '#3b55e8' }))),
      h('rect', { x: 2, y: 2, width: 60, height: 60, rx: 16, fill: `url(#${gradientId})` }),
      h('g', { fill: 'none', stroke: '#fff', strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 15.5, y: 20, width: 33, height: 30, rx: 6.5, strokeWidth: 3.6 }),
        h('path', { d: 'M23 15.5V23M41 15.5V23', strokeWidth: 3.6 }),
        h('path', { d: 'm27.4 33.2 5.5-3.9v13.3m-4.4 0h9.2', strokeWidth: 4 })))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.slots
        if (!slots || typeof slots.inject !== 'function') {
          console.error('[daily-question] slots 服务不可用，界面没有注册')
          return
        }
        ctx.effect(() => {
          // 优先用宿主提供的样式注入（带 CSP nonce 等处理）；不可用时由 Page 渲染 <style>。
          if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
            try {
              const dispose = styles.insert(CSS)
              styleInjected = true
              return () => {
                try {
                  dispose?.()
                } catch (error) {
                  console.error('[daily-question] 注销样式失败', error)
                }
              }
            } catch (error) {
              styleInjected = false
              console.error('[daily-question] 样式注入失败，改用 <style> 元素', error)
            }
          }
          return undefined
        }, 'daily-question.styles')
        ctx.effect(() => {
          const stops = [
            slots.inject('sidebar.panellist', () => slots.register({
              name: 'sidebar.panellist',
              id: 'daily-question',
              order: 20,
              label: () => T.title,
            }, PluginLogo)),
            slots.inject('main', () => slots.register({
              name: 'main',
              key: 'daily-question',
            }, Page)),
          ]
          return () => {
            for (const stop of stops.reverse()) {
              try {
                stop?.()
              } catch (error) {
                console.error('[daily-question] 注销失败', error)
              }
            }
          }
        }, 'daily-question.slots')
      },
    }
  },
})
