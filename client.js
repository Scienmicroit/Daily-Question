window.__ModuleLoader__.load({
  id: 'daily-question',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo, useCallback } = React

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

    /* ============================== LaTeX ============================== */
    const LATEX_SYMBOLS = {
      alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
      theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
      rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
      Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
      Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
      infty: '∞', cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', oplus: '⊕', otimes: '⊗',
      leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼',
      propto: '∝', ll: '≪', gg: '≫', leqslant: '≤', geqslant: '≥',
      to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
      Leftrightarrow: '⇔', mapsto: '↦', implies: '⟹', iff: '⟺',
      partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄', neg: '¬', in: '∈', notin: '∉',
      subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅',
      varnothing: '∅', setminus: '∖', land: '∧', lor: '∨',
      ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', dots: '…',
      angle: '∠', perp: '⊥', parallel: '∥', circ: '∘', degree: '°', prime: '′',
      therefore: '∴', because: '∵', triangle: '△', square: '□',
      quad: '\u2003', qquad: '\u2003\u2003',
      '%': '%', '&': '&', '#': '#', '_': '_', '{': '{', '}': '}',
      ' ': ' ', ',': '\u2009', ';': '\u2005', ':': '\u2005', '!': '',
    }
    const LATEX_FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
      'sinh', 'cosh', 'tanh', 'ln', 'log', 'lg', 'exp', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'lcm',
      'deg', 'dim', 'ker', 'arg', 'Pr'])
    const LATEX_BIGOPS = {
      sum: '∑', prod: '∏', int: '∫', iint: '∬', iiint: '∭', oint: '∮',
      lim: 'lim', limsup: 'lim sup', liminf: 'lim inf', bigcup: '⋃', bigcap: '⋂',
    }
    const DOUBLE_STRUCK = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ' }

    /**
     * 数学斜体只在变量上使用：把 ASCII 字母换成 Unicode 数学斜体码位
     * （U+1D434… 大写、U+1D44E… 小写，唯一的例外是 h → U+210E）。
     * Latin Modern Math 与 Cambria Math 都完整覆盖这一区块，因此变量是真斜体，
     * 而数字、运算符、函数名（\sin 等）保持直立 —— 与 LaTeX 的排版规则一致。
     */
    function toMathItalic(text) {
      return String(text).replace(/[A-Za-z]/g, (ch) => {
        if (ch === 'h') return '\u210E'
        const code = ch.charCodeAt(0)
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d44e + (code - 97))
        return String.fromCodePoint(0x1d434 + (code - 65))
      })
    }

    function readGroup(cur) {
      // cur.src[cur.i] === '{'
      let depth = 0
      let j = cur.i
      const start = cur.i + 1
      while (j < cur.src.length) {
        const c = cur.src[j]
        if (c === '\\') { j += 2; continue }
        if (c === '{') depth += 1
        else if (c === '}') {
          depth -= 1
          if (depth === 0) {
            cur.i = j + 1
            return cur.src.slice(start, j)
          }
        }
        j += 1
      }
      cur.i = cur.src.length
      return cur.src.slice(start)
    }

    function readOptionalGroup(cur) {
      while (cur.i < cur.src.length && cur.src[cur.i] === ' ') cur.i += 1
      if (cur.src[cur.i] !== '[') return null
      const end = cur.src.indexOf(']', cur.i)
      if (end < 0) return null
      const body = cur.src.slice(cur.i + 1, end)
      cur.i = end + 1
      return body
    }

    function readArg(cur) {
      while (cur.i < cur.src.length && cur.src[cur.i] === ' ') cur.i += 1
      if (cur.src[cur.i] === '{') return latexNodes(readGroup(cur))
      const rest = cur.src.slice(cur.i)
      const command = /^\\[A-Za-z]+/.exec(rest)
      if (command) {
        cur.i += command[0].length
        return latexNodes(command[0])
      }
      if (rest[0] === '\\') {
        cur.i += 2
        return latexNodes(rest.slice(0, 2))
      }
      cur.i += 1
      return latexNodes(rest.slice(0, 1))
    }

    function readLimits(cur) {
      let sub = null
      let sup = null
      for (let guard = 0; guard < 4; guard += 1) {
        const save = cur.i
        while (cur.i < cur.src.length && cur.src[cur.i] === ' ') cur.i += 1
        const c = cur.src[cur.i]
        if (c === '_' && !sub) { cur.i += 1; sub = readArg(cur); continue }
        if (c === '^' && !sup) { cur.i += 1; sup = readArg(cur); continue }
        cur.i = save
        break
      }
      return { sub, sup }
    }

    function readMatrix(cur, env) {
      const marker = `\\end{${env}}`
      const end = cur.src.indexOf(marker, cur.i)
      const body = end < 0 ? cur.src.slice(cur.i) : cur.src.slice(cur.i, end)
      cur.i = end < 0 ? cur.src.length : end + marker.length
      const rows = body.split(/\\\\/).map((row) => row.trim()).filter((row) => row.length)
      const cells = rows.map((row) => row.split('&').map((cell) => latexNodes(cell.trim())))
      const table = h('table', { className: 'kd-matrix', key: nextKey('mx') },
        h('tbody', null, cells.map((row, rowIndex) => h('tr', { key: rowIndex },
          row.map((cell, cellIndex) => h('td', { key: cellIndex }, cell))))))
      const wrapCls = env === 'cases' ? 'kd-cases'
        : env === 'bmatrix' ? 'kd-bmatrix'
          : env === 'vmatrix' ? 'kd-vmatrix'
            : env === 'pmatrix' ? 'kd-pmatrix' : 'kd-matrixwrap'
      const open = env === 'cases' ? '{' : env === 'bmatrix' ? '[' : env === 'pmatrix' ? '(' : ''
      const close = env === 'bmatrix' ? ']' : env === 'pmatrix' ? ')' : ''
      const children = []
      if (open) children.push(h('span', { className: 'kd-delim', key: 'open' }, open))
      children.push(table)
      if (close) children.push(h('span', { className: 'kd-delim', key: 'close' }, close))
      return h('span', { className: `kd-matrixbox ${wrapCls}`, key: nextKey('mb') }, children)
    }

    function latexNodes(src) {
      const cur = { src: String(src || ''), i: 0 }
      return latexSeq(cur, '')
    }

    function latexSeq(cur, stopChars) {
      const out = []
      let buf = ''
      const flush = () => {
        if (buf) {
          out.push(toMathItalic(buf))
          buf = ''
        }
      }
      while (cur.i < cur.src.length) {
        const c = cur.src[cur.i]
        if (stopChars && stopChars.includes(c)) break
        if (c === '}') { buf += c; cur.i += 1; continue }
        if (c === '{') {
          flush()
          out.push(...latexNodes(readGroup(cur)))
          continue
        }
        if (c === '^' || c === '_') {
          flush()
          cur.i += 1
          const arg = readArg(cur)
          out.push(h(c === '^' ? 'sup' : 'sub', { className: c === '^' ? 'kd-sup' : 'kd-sub', key: nextKey('sc') }, arg))
          continue
        }
        if (c === '&') {
          flush()
          cur.i += 1
          out.push(h('span', { className: 'kd-colsep', key: nextKey('cs') }, '\u2003'))
          continue
        }
        if (c === '~') {
          buf += '\u00a0'
          cur.i += 1
          continue
        }
        if (c === '\\') {
          const rest = cur.src.slice(cur.i)
          const command = /^\\([A-Za-z]+)/.exec(rest)
          if (command) {
            flush()
            cur.i += command[0].length
            const node = latexCommand(cur, command[1])
            if (node !== null && node !== undefined) out.push(node)
            continue
          }
          const symbol = rest[1]
          cur.i += symbol === undefined ? 1 : 2
          if (symbol === '\\') {
            flush()
            out.push(h('br', { key: nextKey('br') }))
            continue
          }
          if (LATEX_SYMBOLS[symbol] !== undefined) buf += LATEX_SYMBOLS[symbol]
          else if (symbol !== undefined) buf += symbol
          continue
        }
        if (c === ' ') { buf += ' '; cur.i += 1; continue }
        buf += c
        cur.i += 1
      }
      flush()
      return out
    }

    function latexCommand(cur, name) {
      if (LATEX_BIGOPS[name]) {
        const { sub, sup } = readLimits(cur)
        const symbol = LATEX_BIGOPS[name]
        return h('span', { className: 'kd-op', key: nextKey('op') },
          sup ? h('span', { className: 'kd-op-lim', key: 'up' }, sup) : null,
          h('span', { className: 'kd-op-sym', key: 'sym' }, symbol),
          sub ? h('span', { className: 'kd-op-lim', key: 'down' }, sub) : null)
      }
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
        const numerator = readArg(cur)
        const denominator = readArg(cur)
        return h('span', { className: 'kd-frac', key: nextKey('fr') },
          h('span', { className: 'kd-frac-n', key: 'n' }, numerator),
          h('span', { className: 'kd-frac-d', key: 'd' }, denominator))
      }
      if (name === 'sqrt') {
        const index = readOptionalGroup(cur)
        const body = readArg(cur)
        return h('span', { className: 'kd-sqrt', key: nextKey('sq') },
          h('span', { className: 'kd-sqrt-sign', key: 's' }, '√'),
          index ? h('sup', { className: 'kd-sqrt-index', key: 'i' }, latexNodes(index)) : null,
          h('span', { className: 'kd-sqrt-body', key: 'b' }, body))
      }
      if (name === 'text' || name === 'textrm' || name === 'mbox' || name === 'mathrm' || name === 'operatorname') {
        const raw = readGroup(cur)
        return h('span', { className: 'kd-roman', key: nextKey('rm') }, raw.replace(/\\([,;: !])/g, ' '))
      }
      if (name === 'mathbf' || name === 'boldsymbol' || name === 'bm' || name === 'textbf') {
        return h('strong', { className: 'kd-bold', key: nextKey('bd') }, latexNodes(readGroup(cur)))
      }
      if (name === 'mathbb' || name === 'mathcal' || name === 'mathscr') {
        const raw = readGroup(cur).trim()
        return h('span', { className: 'kd-blackboard', key: nextKey('bb') }, DOUBLE_STRUCK[raw] || raw)
      }
      if (name === 'overline' || name === 'bar' || name === 'underline' || name === 'vec'
        || name === 'hat' || name === 'widehat' || name === 'tilde' || name === 'dot' || name === 'ddot') {
        const body = readArg(cur)
        return h('span', { className: `kd-accent kd-accent-${name}`, key: nextKey('ac') }, body)
      }
      if (name === 'left' || name === 'right' || name === 'middle') {
        while (cur.i < cur.src.length && cur.src[cur.i] === ' ') cur.i += 1
        const rest = cur.src.slice(cur.i)
        const command = /^\\[A-Za-z]+/.exec(rest)
        let token
        if (command) { token = command[0]; cur.i += command[0].length } else { token = rest[0] || ''; cur.i += 1 }
        const display = token === '.' ? '' : (LATEX_SYMBOLS[token.replace(/^\\/, '')] || token.replace(/^\\/, ''))
        return h('span', { className: 'kd-delim', key: nextKey('dl') }, display)
      }
      if (name === 'begin') {
        const env = readGroup(cur).trim()
        return readMatrix(cur, env)
      }
      if (name === 'displaystyle' || name === 'textstyle' || name === 'limits' || name === 'nolimits' || name === 'notag') {
        return null
      }
      if (name === 'space' || name === 'newline') return h('br', { key: nextKey('br') })
      if (LATEX_FUNCS.has(name)) return h('span', { className: 'kd-roman', key: nextKey('fn') }, name)
      if (LATEX_SYMBOLS[name] !== undefined) return LATEX_SYMBOLS[name]
      // 未知命令：保留原始内容并提示，绝不丢弃。
      return h('span', { className: 'kd-latex-unknown', title: `未知的 LaTeX 命令：\\${name}`, key: nextKey('un') }, `\\${name}`)
    }

    function renderMath(source, display) {
      let nodes
      try {
        nodes = latexNodes(source)
      } catch (error) {
        nodes = [source]
      }
      return h(display ? 'div' : 'span', {
        className: display ? 'kd-mathblock' : 'kd-math',
        key: nextKey('math'),
      }, nodes)
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
          buffer += text[index + 1]
          index += 2
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
      const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
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
      const nodes = useMemo(() => {
        try {
          return renderBlocks(text)
        } catch (error) {
          return [h('pre', { className: 'kd-code', key: 'raw' }, String(text || ''))]
        }
      }, [text])
      return h('div', { className: `kd-md ${className || ''}` }, nodes)
    }

    /* ============================== 样式 ============================== */
    /** 由 apply 用 styles.insert 注入时置位；否则由组件渲染 <style> 兜底。 */
    let styleInjected = false
    const CSS = `
@font-face {
  font-family: 'KD Latin Modern Math';
  src: local('Latin Modern Math'), local('LatinModernMath'), local('LatinModernMath-Regular'),
       url('/api/kaoyan/font/latinmodern-math.otf') format('opentype');
  font-display: swap;
}
.kd-page { height:100%; min-height:0; display:flex; flex-direction:column; position:relative;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-size:14px; line-height:1.65; box-sizing:border-box; }
.kd-page *, .kd-page *::before, .kd-page *::after { box-sizing:border-box; }
.kd-header { padding:18px 22px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); display:flex;
  gap:20px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; }
.kd-header-left { min-width:0; flex:1 1 320px; }
.kd-title { margin:0; font-size:19px; font-weight:650; letter-spacing:.01em; }
.kd-sub { margin-top:4px; font-size:12px; color:var(--dsw-alias-label-secondary); }
.kd-yearline { margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:12px;
  color:var(--dsw-alias-label-secondary); }
.kd-select { height:30px; padding:0 8px; border-radius:8px; font-size:13px;
  border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary); }
.kd-countdown { text-align:right; min-width:0; flex:0 1 auto; display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
.kd-cd-primary { font-size:24px; font-weight:700; letter-spacing:.01em; line-height:1.25; }
.kd-cd-secondary { font-size:12px; color:var(--dsw-alias-label-secondary); }
.kd-cd-target { font-size:14px; font-weight:500; }
.kd-cd-meta { margin-top:6px; display:flex; gap:8px; align-items:center; justify-content:flex-end;
  flex-wrap:wrap; font-size:11px; color:var(--dsw-alias-label-secondary); max-width:420px; }
.kd-cd-warn { margin-top:6px; font-size:12px; color:var(--dsw-alias-state-warn-primary); max-width:380px; text-align:right; }
.kd-shell { flex:1 1 auto; min-height:0; display:flex; }
.kd-nav { width:200px; flex:0 0 200px; border-right:1px solid var(--dsw-alias-border-l1); padding:14px 10px;
  overflow:auto; display:flex; flex-direction:column; gap:12px; }
.kd-nav-group-label { font-size:11px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--dsw-alias-label-secondary); padding:0 6px; }
.kd-nav-item { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;
  padding:7px 9px; border-radius:8px; border:1px solid transparent; background:transparent; cursor:pointer;
  color:var(--dsw-alias-label-primary); font-size:13px; text-align:left; }
.kd-nav-item:hover { background:var(--dsw-alias-bg-layer-2); }
.kd-nav-item > span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.kd-nav-item.is-active { background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-border-l2); font-weight:600; }
.kd-nav-item .kd-nav-count { flex:0 0 auto; white-space:nowrap; font-size:11px; color:var(--dsw-alias-label-secondary); }
.kd-nav-spacer { flex:1 1 auto; }
.kd-main { flex:1 1 auto; min-width:0; overflow:auto; padding:18px 22px 40px; }
.kd-thread { width:330px; flex:0 0 330px; border-left:1px solid var(--dsw-alias-border-l1);
  display:flex; flex-direction:column; min-height:0; background:var(--dsw-alias-bg-layer-1); }
.kd-thread-head { padding:12px 14px; border-bottom:1px solid var(--dsw-alias-border-l1);
  display:flex; align-items:center; justify-content:space-between; gap:8px; }
.kd-thread-title { font-size:13px; font-weight:600; }
.kd-thread-hint { padding:8px 14px 0; font-size:11px; color:var(--dsw-alias-label-secondary); }
.kd-thread-scroll { flex:1 1 auto; min-height:0; overflow:auto; padding:12px 14px; display:flex;
  flex-direction:column; gap:10px; }
.kd-msg { max-width:100%; border-radius:10px; padding:8px 10px; font-size:13px; }
.kd-msg-user { align-self:flex-end; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); }
.kd-msg-assistant { align-self:stretch; border:1px solid var(--dsw-alias-border-l1); }
.kd-msg-meta { font-size:10px; color:var(--dsw-alias-label-secondary); margin-top:6px; }
.kd-msg-failed { border-color:var(--dsw-alias-state-error-primary); }
.kd-thread-foot { border-top:1px solid var(--dsw-alias-border-l1); padding:10px 14px; }
.kd-textarea { width:100%; min-height:62px; max-height:180px; resize:vertical; padding:8px 10px;
  border-radius:8px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-base);
  color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; }
.kd-card { border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1);
  padding:16px 18px; }
.kd-card + .kd-card { margin-top:14px; }
.kd-meta { display:flex; gap:8px; flex-wrap:wrap; align-items:center; font-size:12px;
  color:var(--dsw-alias-label-secondary); }
.kd-meta-dot::before { content:'·'; margin-right:8px; }
.kd-badge { display:inline-flex; align-items:center; gap:4px; padding:1px 7px; border-radius:999px;
  font-size:11px; line-height:1.6; border:1px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-secondary); white-space:nowrap; }
.kd-badge-ok { color:var(--dsw-alias-state-success-primary); border-color:var(--dsw-alias-state-success-primary); }
.kd-badge-bad { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }
.kd-badge-warn { color:var(--dsw-alias-state-warn-primary); border-color:var(--dsw-alias-state-warn-primary); }
.kd-badge-brand { color:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); }
.kd-stem { margin:12px 0 16px; font-size:15px; }
.kd-options { display:flex; flex-direction:column; gap:8px; margin:12px 0 4px; }
.kd-option { display:flex; gap:10px; align-items:flex-start; padding:9px 12px; border-radius:10px;
  border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-base); cursor:pointer;
  text-align:left; color:var(--dsw-alias-label-primary); font:inherit; font-size:14px; }
.kd-option:hover:not(:disabled) { border-color:var(--dsw-alias-brand-primary); }
.kd-option:disabled { cursor:default; }
.kd-option.is-selected { border-color:var(--dsw-alias-brand-primary); background:var(--dsw-alias-bg-layer-2); }
.kd-option.is-correct { border-color:var(--dsw-alias-state-success-primary); }
.kd-option.is-wrong { border-color:var(--dsw-alias-state-error-primary); }
.kd-option-key { flex:0 0 auto; width:22px; height:22px; border-radius:999px; display:inline-flex;
  align-items:center; justify-content:center; font-size:12px; font-weight:600;
  border:1px solid var(--dsw-alias-border-l2); }
.kd-option.is-selected .kd-option-key { color:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); }
.kd-option.is-correct .kd-option-key { color:var(--dsw-alias-state-success-primary); border-color:var(--dsw-alias-state-success-primary); }
.kd-option.is-wrong .kd-option-key { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }
.kd-option-text { min-width:0; flex:1 1 auto; }
.kd-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:14px; }
.kd-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:8px;
  font-size:13px; font-family:inherit; cursor:pointer; border:1px solid var(--dsw-alias-border-l2);
  background:transparent; color:var(--dsw-alias-label-primary); }
.kd-btn:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-2); }
.kd-btn:disabled { opacity:.55; cursor:not-allowed; }
.kd-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
.kd-btn-primary:hover:not(:disabled) { filter:brightness(1.06); background:var(--dsw-alias-brand-primary); }
.kd-btn-ghost { border-color:transparent; color:var(--dsw-alias-label-secondary); }
.kd-btn-danger { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }
.kd-btn-sm { padding:3px 9px; font-size:12px; }
.kd-iconbtn { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px;
  border-radius:6px; border:0; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; }
.kd-iconbtn:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
.kd-answer { margin-top:16px; border-top:1px dashed var(--dsw-alias-border-l2); padding-top:14px; }
.kd-answer-block + .kd-answer-block { margin-top:14px; }
.kd-answer-label { font-size:12px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--dsw-alias-label-secondary); margin-bottom:4px; }
.kd-verify { margin-top:12px; padding:10px 12px; border-radius:10px; font-size:12px;
  border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-secondary); }
.kd-verify ul { margin:6px 0 0; padding-left:18px; }
.kd-list-row { display:flex; gap:12px; align-items:flex-start; width:100%; text-align:left;
  padding:11px 13px; border-radius:10px; border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1); cursor:pointer; color:var(--dsw-alias-label-primary); font:inherit; }
.kd-list-row + .kd-list-row { margin-top:8px; }
.kd-list-row:hover { border-color:var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-2); }
.kd-list-body { min-width:0; flex:1 1 auto; }
.kd-list-summary { font-size:13px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; }
.kd-list-meta { margin-top:5px; display:flex; gap:8px; flex-wrap:wrap; font-size:11px;
  color:var(--dsw-alias-label-secondary); align-items:center; }
.kd-empty { padding:44px 20px; text-align:center; color:var(--dsw-alias-label-secondary); }
.kd-empty-title { font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary); margin-bottom:6px; }
.kd-empty-body { font-size:13px; max-width:520px; margin:0 auto; line-height:1.75; }
.kd-empty .kd-actions { justify-content:center; }
.kd-overlay { position:absolute; inset:0; background:rgba(0,0,0,.34); display:flex; align-items:center;
  justify-content:center; padding:24px; z-index:40; }
.kd-modal { width:min(560px,100%); max-height:100%; display:flex; flex-direction:column;
  background:var(--dsw-alias-bg-overlay); color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l2); border-radius:14px; overflow:hidden; }
.kd-modal-wide { width:min(860px,100%); }
.kd-modal-head { padding:14px 16px; border-bottom:1px solid var(--dsw-alias-border-l1);
  display:flex; align-items:center; justify-content:space-between; gap:10px; }
.kd-modal-title { font-size:15px; font-weight:600; }
.kd-modal-body { padding:16px; overflow:auto; min-height:0; }
.kd-modal-foot { padding:12px 16px; border-top:1px solid var(--dsw-alias-border-l1);
  display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
.kd-field { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.kd-field-label { font-size:12px; color:var(--dsw-alias-label-secondary); }
.kd-input { height:32px; padding:0 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; }
.kd-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.kd-row-between { display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
.kd-divider { height:1px; background:var(--dsw-alias-border-l1); margin:14px 0; }
.kd-preview-item { border:1px solid var(--dsw-alias-border-l1); border-radius:10px; padding:10px 12px; }
.kd-preview-item + .kd-preview-item { margin-top:8px; }
.kd-warn-text { color:var(--dsw-alias-state-warn-primary); font-size:12px; }
.kd-error-text { color:var(--dsw-alias-state-error-primary); font-size:12px; }
.kd-toast { position:absolute; left:50%; bottom:22px; transform:translateX(-50%); z-index:60;
  padding:8px 16px; border-radius:999px; font-size:13px; max-width:80%;
  background:var(--dsw-alias-bg-overlay); border:1px solid var(--dsw-alias-border-l2);
  box-shadow:0 6px 20px rgba(0,0,0,.16); }
.kd-toast-bad { color:var(--dsw-alias-state-error-primary); }
.kd-toast-ok { color:var(--dsw-alias-state-success-primary); }
.kd-toast-warn { color:var(--dsw-alias-state-warn-primary); }
.kd-loading { padding:40px 0; text-align:center; color:var(--dsw-alias-label-secondary); font-size:13px; }
.kd-spinner { display:inline-block; width:14px; height:14px; border-radius:50%; vertical-align:-2px;
  border:2px solid var(--dsw-alias-border-l2); border-top-color:var(--dsw-alias-brand-primary);
  animation:kd-spin .8s linear infinite; margin-right:8px; }
@keyframes kd-spin { to { transform:rotate(360deg); } }
.kd-mobilebar { display:none; gap:8px; padding:8px 14px; border-bottom:1px solid var(--dsw-alias-border-l1);
  overflow:auto; }
.kd-md { line-height:1.78; overflow-wrap:anywhere; }
.kd-md > *:first-child { margin-top:0; }
.kd-md > *:last-child { margin-bottom:0; }
.kd-p { margin:8px 0; }
.kd-h { margin:14px 0 8px; line-height:1.4; font-weight:650; }
.kd-h1 { font-size:17px; } .kd-h2 { font-size:16px; } .kd-h3 { font-size:15px; }
.kd-h4, .kd-h5, .kd-h6 { font-size:14px; }
.kd-list { margin:8px 0; padding-left:22px; }
.kd-list li { margin:3px 0; }
.kd-quote { margin:10px 0; padding:6px 12px; border-left:3px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-secondary); }
.kd-hr { border:0; border-top:1px solid var(--dsw-alias-border-l1); margin:14px 0; }
.kd-link { color:var(--dsw-alias-brand-primary); text-decoration:underline; text-underline-offset:2px; }
.kd-inline-code { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:.9em;
  padding:1px 5px; border-radius:5px; background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l1); }
.kd-code-wrap { margin:10px 0; border-radius:10px; overflow:hidden; border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2); }
.kd-code-lang { padding:3px 10px; font-size:11px; color:var(--dsw-alias-label-secondary);
  border-bottom:1px solid var(--dsw-alias-border-l1); }
.kd-code { margin:0; padding:10px 12px; overflow:auto; font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
  font-size:12.5px; line-height:1.6; white-space:pre; tab-size:2; }
.kd-code code { font:inherit; }
.kd-table-wrap { overflow:auto; margin:10px 0; }
.kd-table { border-collapse:collapse; font-size:13px; min-width:0; }
.kd-table th, .kd-table td { border:1px solid var(--dsw-alias-border-l1); padding:5px 10px; text-align:left; }
.kd-table th { background:var(--dsw-alias-bg-layer-2); font-weight:600; }
.kd-image { max-width:100%; height:auto; border-radius:8px; display:block; margin:8px 0; }
.kd-image-fallback { display:inline-block; font-family:ui-monospace,monospace; font-size:12px;
  color:var(--dsw-alias-state-warn-primary); border:1px dashed var(--dsw-alias-state-warn-primary);
  border-radius:6px; padding:2px 6px; }
.kd-math { display:inline-block; vertical-align:middle; }
.kd-mathblock { display:block; margin:10px 0; overflow-x:auto; overflow-y:hidden; text-align:center; }
.kd-math, .kd-mathblock {
  font-family: 'KD Latin Modern Math', 'Latin Modern Math', 'Cambria Math', 'STIX Two Math',
    'TeX Gyre Termes Math', 'Times New Roman', serif;
  font-feature-settings: 'ss01' 0;
  letter-spacing: 0;
}
.kd-frac { display:inline-flex; flex-direction:column; vertical-align:-0.5em; text-align:center;
  margin:0 .18em; }
.kd-frac-n { padding:0 .2em; }
.kd-frac-d { border-top:1px solid currentColor; padding:0 .2em; }
.kd-sup, .kd-sub { font-size:.72em; }
.kd-sup { vertical-align:super; }
.kd-sub { vertical-align:sub; }
.kd-sqrt { display:inline-flex; align-items:flex-start; }
.kd-sqrt-sign { font-size:1.05em; }
.kd-sqrt-index { font-size:.6em; margin-left:-.35em; }
.kd-sqrt-body { border-top:1px solid currentColor; padding:0 .12em; }
.kd-op { display:inline-flex; flex-direction:column; align-items:center; vertical-align:middle;
  margin:0 .2em; line-height:1.15; }
.kd-op-sym { font-size:1.35em; line-height:1; }
.kd-op-lim { font-size:.62em; }
.kd-roman { font-style:normal; }
.kd-matrixbox { display:inline-flex; align-items:center; vertical-align:middle; }
.kd-matrix { border-collapse:collapse; }
.kd-matrix td { padding:2px 7px; text-align:center; border:0; }
.kd-delim { font-size:1.5em; line-height:1; }
.kd-cases .kd-matrix td { text-align:left; }
.kd-accent-overline, .kd-accent-bar { border-top:1px solid currentColor; }
.kd-accent-underline { border-bottom:1px solid currentColor; }
.kd-accent-vec { position:relative; }
.kd-accent-vec::before { content:'→'; position:absolute; top:-.75em; left:50%; transform:translateX(-50%); font-size:.7em; }
.kd-accent-hat::before, .kd-accent-widehat::before { content:'^'; position:absolute; top:-.5em; left:50%; transform:translateX(-50%); font-size:.8em; }
.kd-accent-hat, .kd-accent-widehat { position:relative; }
.kd-accent-tilde { position:relative; }
.kd-accent-tilde::before { content:'~'; position:absolute; top:-.55em; left:50%; transform:translateX(-50%); }
.kd-accent-dot { position:relative; }
.kd-accent-dot::before { content:'·'; position:absolute; top:-.6em; left:50%; transform:translateX(-50%); }
.kd-accent-ddot { position:relative; }
.kd-accent-ddot::before { content:'··'; position:absolute; top:-.6em; left:50%; transform:translateX(-50%); }
.kd-latex-unknown { color:var(--dsw-alias-state-warn-primary); font-size:.92em; }
.kd-checkline { display:flex; gap:8px; align-items:flex-start; padding:5px 0; font-size:13px; }
@media (max-width: 1180px) {
  .kd-thread { position:absolute; right:0; top:0; bottom:0; width:min(360px,90vw); z-index:30;
    box-shadow:-8px 0 24px rgba(0,0,0,.18); }
}
@media (max-width: 860px) {
  .kd-nav { display:none; }
  .kd-mobilebar { display:flex; }
  .kd-main { padding:14px 14px 32px; }
  .kd-header { padding:14px 14px 12px; }
  .kd-countdown { text-align:left; align-items:flex-start; }
  .kd-cd-warn, .kd-cd-meta { text-align:left; justify-content:flex-start; }
}
`

    /* ============================== 接口 ============================== */
    async function rpc(op, args) {
      let response
      try {
        response = await fetch('/api/kaoyan/rpc', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, args: args || {} }),
        })
      } catch (error) {
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
      return type === 'single' || type === 'multiple'
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

    function Btn({ children, onClick, variant = 'default', disabled, title, small, type = 'button' }) {
      return h('button', {
        type,
        className: `kd-btn kd-btn-${variant}${small ? ' kd-btn-sm' : ''}`,
        onClick,
        disabled,
        title,
      }, children)
    }

    function Badge({ children, tone = 'neutral' }) {
      return h('span', { className: `kd-badge kd-badge-${tone}` }, children)
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

    function Countdown({ boot, onRefresh, onYearChange, busy }) {
      const cd = boot.countdown || {}
      const lines = cd.lines || {}
      const statusTone = cd.status === 'official' ? 'ok' : cd.status === 'estimated' ? 'warn' : 'bad'
      const statusText = cd.status === 'official' ? '官方公布'
        : cd.status === 'estimated' ? '官方未公布 · 估算' : '尚未核实'
      return h('div', { className: 'kd-countdown' },
        h('div', { className: 'kd-cd-primary' }, lines.primary || ''),
        h('div', { className: 'kd-cd-secondary' }, lines.secondary || ''),
        h('div', { className: 'kd-cd-target' }, lines.target || ''),
        cd.expired ? h('div', { className: 'kd-cd-warn' },
          `目标日期已过，请重新选择考研年份后再继续倒计时。`) : null,
        h('div', { className: 'kd-cd-meta' },
          h(Badge, { tone: statusTone }, statusText),
          cd.source
            ? h('span', { title: cd.source }, cd.sourceUrl
              ? h('a', { className: 'kd-link', href: cd.sourceUrl, target: '_blank', rel: 'noreferrer noopener' }, cd.source)
              : cd.source)
            : h('span', null, '无来源记录'),
          cd.verifiedAt ? h('span', null, `核验于 ${formatDateTime(cd.verifiedAt)}`) : null,
          h(Btn, {
            small: true,
            variant: 'ghost',
            disabled: busy,
            title: '联网核验官方公布的考试日期',
            onClick: onRefresh,
          }, busy ? h('span', { className: 'kd-spinner' }) : h(Icon, { name: 'refresh', size: 13 }), '核验日期'),
          h('select', {
            className: 'kd-select',
            value: boot.settings.targetYear,
            'aria-label': T.year,
            onChange: (event) => onYearChange(Number(event.target.value)),
          }, (boot.yearOptions || []).map((year) => h('option', { key: year, value: year }, `${year} 考研`)))),
        cd.note ? h('div', { className: 'kd-cd-warn' }, cd.note) : null)
    }

    /* ============================== 导航 ============================== */
    function SubjectNav({ boot, subjectId, onPick, onManage, onBanks }) {
      const enabled = (boot.subjects || []).filter((subject) => subject.enabled)
      return h('div', { className: 'kd-nav' },
        h('div', { className: 'kd-nav-group-label' }, '科目'),
        enabled.length
          ? enabled.map((subject) => h('button', {
            key: subject.id,
            type: 'button',
            className: `kd-nav-item${subject.id === subjectId ? ' is-active' : ''}`,
            onClick: () => onPick(subject.id),
            title: subject.name,
          },
          h('span', null, subject.name),
          h('span', { className: 'kd-nav-count' }, boot.todayMap?.[subject.id] ? '今日已出' : '待出题')))
          : h('div', { className: 'kd-empty-body' }, '还没有启用科目'),
        h('div', { className: 'kd-nav-spacer' }),
        h('div', { className: 'kd-nav-group-label' }, '设置'),
        h(Btn, { variant: 'ghost', onClick: onManage }, h(Icon, { name: 'plus' }), T.manageSubjects),
        h(Btn, { variant: 'ghost', onClick: onBanks }, h(Icon, { name: 'book' }), T.manageBanks))
    }

    function TabBar({ kind, counts, onPick }) {
      const items = [
        ['today', T.tabs.today, null],
        ['all', T.tabs.all, counts?.all],
        ['favorite', T.tabs.favorite, counts?.favorite],
        ['wrong', T.tabs.wrong, counts?.wrong],
      ]
      return h('div', { className: 'kd-tabs', style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
        items.map(([value, label, count]) => h('button', {
          key: value,
          type: 'button',
          className: `kd-nav-item${kind === value ? ' is-active' : ''}`,
          style: { width: 'auto' },
          onClick: () => onPick(value),
        }, label, count ? h('span', { className: 'kd-nav-count' }, String(count)) : null)))
    }

    function MobileBar({ boot, subjectId, kind, onPick, onTab }) {
      const enabled = (boot.subjects || []).filter((subject) => subject.enabled)
      return h('div', { className: 'kd-mobilebar' },
        h('select', {
          className: 'kd-select',
          value: subjectId || '',
          'aria-label': '切换科目',
          onChange: (event) => onPick(event.target.value),
        }, enabled.map((subject) => h('option', { key: subject.id, value: subject.id }, subject.name))),
        ['today', 'all', 'favorite', 'wrong'].map((value) => h('button', {
          key: value,
          type: 'button',
          className: `kd-nav-item${kind === value ? ' is-active' : ''}`,
          style: { width: 'auto' },
          onClick: () => onTab(value),
        }, T.tabs[value])))
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
        answer.verified
          ? null
          : h('div', { className: 'kd-verify' },
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
            style: { flexDirection: 'column', alignItems: 'flex-start', gap: '2px' },
          },
          question.attempts.map((attempt, index) => h('div', { key: attempt.id },
            `${index + 1}. ${formatDateTime(attempt.at)} · ${statusLabel(attempt.result).text}`
            + `${attempt.mode === 'giveup' ? ' · 未能作答' : attempt.mode === 'done' ? ' · 作答完毕' : ''}`
            + `${attempt.choice ? ` · 选择 ${attempt.choice}` : ''}`))),
          question.wrongEver
            ? h(Btn, {
              small: true,
              variant: 'ghost',
              title: '只把这道题移出错题本，历史上的错误作答记录仍然保留',
              onClick: onRemoveWrong,
            }, '移出错题本')
            : null),
        h('div', { className: 'kd-verify' },
          h('div', { className: 'kd-row-between' },
            h('span', null,
              h(Badge, { tone: answer.verified ? 'ok' : 'warn' }, answer.verified ? T.verified : T.unverified),
              ` 版本 ${answer.versionId}${answer.firstShownAt ? ` · 首次展示 ${formatDateTime(answer.firstShownAt)}` : ''}`,
              answer.superseded ? ` · 已有 ${answer.superseded} 个历史版本` : ''),
            h(Btn, {
              small: true,
              variant: 'ghost',
              disabled: revising,
              title: '生成候选新版本并重新做独立校验；只有校验通过才能替换正式版本',
              onClick: onRevise,
            }, revising ? h('span', { className: 'kd-spinner' }) : null, T.revision)),
          answer.verification?.summary
            ? h('div', null, `校验：${answer.verification.summary}（${answer.verification.method || '独立校验'}${answer.verification.at ? `，${formatDateTime(answer.verification.at)}` : ''}）`)
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
            : null))
    }

    function QuestionPane({
      q, busy, choice, onSelect, onReveal, onJudge, onFavorite, onRedo, localRedo,
      onRevise, revising, onToggleThread, threadOpen, narrow, onRemoveWrong,
    }) {
      if (!q) return null
      const revealed = !localRedo && q.answerState === 'revealed' && q.attemptCount > 0
      const last = q.lastAttempt
      const isChoice = isChoiceType(q.type)
      const answerKey = q.answer?.answerKey || ''
      const selected = revealed ? (last?.choice || '') : choice
      const meta = [q.subjectName, q.typeLabel]
      return h('div', null,
        h('div', { className: 'kd-card' },
          h('div', { className: 'kd-meta' },
            h(Badge, { tone: 'brand' }, q.typeLabel),
            h('span', null, q.subjectName),
            h('span', { className: 'kd-meta-dot' }, `难度 ${q.difficulty}/5`),
            h('span', { className: 'kd-meta-dot' }, `出题日期 ${formatDate(q.assignedDate)}`),
            h('span', { className: 'kd-meta-dot' }, `作答次数 ${q.attemptCount}`),
            q.source?.kind === 'bank'
              ? h('span', { className: 'kd-meta-dot' }, q.source.label)
              : h('span', { className: 'kd-meta-dot' }, '在线出题'),
            q.answerStatus === 'verified'
              ? h(Badge, { tone: 'ok' }, T.verified)
              : h(Badge, { tone: 'warn' }, q.answerStatus === 'missing' ? T.missing : T.unverified),
            q.repeated ? h(Badge, { tone: 'warn' }, '本题此前出过') : null,
            q.favorite ? h(Badge, { tone: 'brand' }, '已收藏') : null,
            q.wrongEver ? h(Badge, { tone: 'bad' }, '在错题本') : null),
          q.knowledge?.length
            ? h('div', { className: 'kd-meta', style: { marginTop: '8px' } },
              h('span', null, `${T.knowledge}：${q.knowledge.join('、')}`))
            : null,
          h('div', { className: 'kd-stem' }, h(Markdown, { text: q.stem })),
          isChoice && q.options?.length
            ? h('div', { className: 'kd-options' }, q.options.map((option) => {
              const isSelected = selected.split('').includes(option.key)
              const isRight = revealed && answerKey.split('').includes(option.key)
              const isWrongPick = revealed && isSelected && !isRight
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
            !revealed && isChoice
              ? h(Btn, { variant: 'primary', disabled: busy === 'reveal' || !choice, onClick: () => onReveal('submit') },
                busy === 'reveal' ? h('span', { className: 'kd-spinner' }) : null, T.submit)
              : null,
            !revealed && !isChoice
              ? [
                h(Btn, { key: 'done', variant: 'primary', disabled: busy === 'reveal', onClick: () => onReveal('done') }, T.done),
                h(Btn, { key: 'giveup', variant: 'danger', disabled: busy === 'reveal', onClick: () => onReveal('giveup') }, T.giveup),
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
            narrow
              ? h(Btn, { variant: 'ghost', onClick: onToggleThread }, h(Icon, { name: 'book' }), threadOpen ? '收起追问' : T.followup)
              : null),
          revealed ? h(AnswerBlock, { question: q, onRevise, revising, onRemoveWrong }) : null,
          revealed && last?.result === 'pending'
            ? h('div', { className: 'kd-actions', style: { marginTop: '12px' } },
              h('span', { className: 'kd-meta' }, '这道题由你自己判定（系统不会替你把“作答完毕”当成答对）：'),
              h(Btn, { variant: 'primary', disabled: busy === 'judge', onClick: () => onJudge('correct') }, T.correct),
              h(Btn, { variant: 'danger', disabled: busy === 'judge', onClick: () => onJudge('wrong') }, T.wrong))
            : null),
        q.publishVerification?.summary
          ? h('div', { className: 'kd-verify', style: { marginTop: '12px' } },
            h(Badge, { tone: q.publishVerification.status === 'passed' ? 'ok' : 'warn' },
              q.publishVerification.status === 'passed' ? '试题发布前已通过独立校验' : '试题发布状态：待核验'),
            ` ${q.publishVerification.summary}（${q.publishVerification.method || ''}${q.publishVerification.at ? `，${formatDateTime(q.publishVerification.at)}` : ''}）`)
          : null)
    }

    /* ============================== 列表 ============================== */
    function ListPane({ list, kind, subjectName, onOpen }) {
      if (!list) return h('div', { className: 'kd-loading' }, h('span', { className: 'kd-spinner' }), '加载中…')
      if (!list.items.length) {
        return h('div', { className: 'kd-empty' },
          h('div', { className: 'kd-empty-title' }, `${subjectName} · ${T.tabs[kind]}`),
          h('div', { className: 'kd-empty-body' }, T.tabEmpty[kind] || '暂无内容'))
      }
      return h('div', null,
        h('div', { className: 'kd-meta', style: { marginBottom: '10px' } },
          h('span', null, `${subjectName} · ${T.tabs[kind]} · 共 ${list.items.length} 道`)),
        list.items.map((item) => h('button', {
          key: item.id,
          type: 'button',
          className: 'kd-list-row',
          onClick: () => onOpen(item.id),
        },
        h('div', { className: 'kd-list-body' },
          h('div', { className: 'kd-list-summary' }, item.summary || '(无题干)'),
          h('div', { className: 'kd-list-meta' },
            h(Badge, null, item.typeLabel),
            h('span', null, formatDate(item.assignedDate)),
            h('span', null, `作答 ${item.attemptCount} 次`),
            item.favorite ? h(Badge, { tone: 'brand' }, '收藏') : null,
            item.wrongEver ? h(Badge, { tone: 'bad' }, item.mastered ? '曾答错 · 已掌握' : '错题') : null,
            item.answerStatus !== 'verified' ? h(Badge, { tone: 'warn' }, T.unverified) : null,
            h('span', null, `难度 ${item.difficulty}/5`))),
        h('span', { className: 'kd-iconbtn' }, h(Icon, { name: 'chevron' })))))
    }

    /* ============================== 追问侧栏 ============================== */
    function ThreadPane({ thread, questionId, busy, onSend, onClear, onClose, narrow }) {
      const [draft, setDraft] = useState('')
      const [sending, setSending] = useState(false)
      const [localError, setLocalError] = useState('')
      const [pending, setPending] = useState(null)
      const scrollRef = useRef(null)
      const messages = thread?.messages || []

      useEffect(() => {
        const node = scrollRef.current
        if (node) node.scrollTop = node.scrollHeight
      }, [messages.length, pending?.id])

      const send = useCallback(async (text, messageId) => {
        const value = String(text || '').trim()
        if (!value) return
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

      return h('aside', { className: 'kd-thread', 'aria-label': T.followup },
        h('div', { className: 'kd-thread-head' },
          h('div', null,
            h('div', { className: 'kd-thread-title' }, T.followup),
            h('div', { className: 'kd-msg-meta' }, `题目 ${String(questionId || '').slice(0, 14)}`)),
          h('div', { className: 'kd-row' },
            h(Btn, {
              small: true,
              variant: 'ghost',
              disabled: !messages.length || sending,
              onClick: onClear,
              title: '只清空本题的追问记录',
            }, T.clearThread),
            narrow
              ? h('button', { className: 'kd-iconbtn', onClick: onClose, 'aria-label': T.close }, h(Icon, { name: 'close' }))
              : null)),
        h('div', { className: 'kd-thread-hint' }, T.followupHint),
        h('div', { className: 'kd-thread-scroll', ref: scrollRef },
          rows.length ? rows : h('div', { className: 'kd-empty-body' }, '还没有追问。可以问某一步推导为什么成立、某个知识点怎么理解，或有没有别的解法。')),
        localError ? h('div', { className: 'kd-error-text', style: { padding: '0 14px' } }, localError) : null,
        h('div', { className: 'kd-thread-foot' },
          h('textarea', {
            className: 'kd-textarea',
            value: draft,
            placeholder: '围绕这道题继续追问…（Ctrl+Enter 发送）',
            disabled: sending,
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault()
                send(draft, newAttemptId())
              }
            },
          }),
          h('div', { className: 'kd-actions', style: { marginTop: '8px', justifyContent: 'flex-end' } },
            h(Btn, {
              variant: 'primary',
              disabled: sending || !draft.trim(),
              onClick: () => send(draft, newAttemptId()),
            }, h(Icon, { name: 'send', size: 13 }), T.send))))
    }

    /* ============================== 弹窗 ============================== */
    function SubjectsModal({ boot, onClose, onAdd, onRemove, onSource, onPick }) {
      const [name, setName] = useState('')
      const [types, setTypes] = useState(['single', 'solution'])
      const enabled = new Set(boot.settings.subjects)
      const toggleType = (type) => setTypes((current) => current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type])
      return h(Modal, {
        title: T.manageSubjects,
        onClose,
        wide: true,
        footer: [
          h(Btn, { key: 'close', onClick: onClose }, T.close),
        ],
      },
      h('div', { className: 'kd-meta', style: { marginBottom: '12px' } },
        '勾选要每天出题的科目。取消勾选只会移出每日出题，该科目已出过的题目、收藏、错题与作答记录都会保留。'),
      (boot.subjects || []).map((subject) => h('div', {
        key: subject.id,
        className: 'kd-row-between',
        style: { padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' },
      },
      h('label', { className: 'kd-checkline', style: { flex: '1 1 240px', cursor: 'pointer' } },
        h('input', {
          type: 'checkbox',
          checked: enabled.has(subject.id),
          onChange: () => (enabled.has(subject.id) ? onRemove(subject) : onAdd(subject)),
        }),
        h('span', null,
          h('span', null, subject.name),
          subject.code ? h('span', { className: 'kd-msg-meta' }, ` · ${subject.code}`) : null,
          h('div', { className: 'kd-msg-meta' }, subject.typeLabels.join(' / ')))),
      enabled.has(subject.id)
        ? h('div', { className: 'kd-row' },
          h('select', {
            className: 'kd-select',
            value: subject.source,
            'aria-label': `${subject.name} 出题来源`,
            onChange: (event) => onSource(subject.id, event.target.value),
          },
          h('option', { value: 'auto' }, '自动（优先题库）'),
          h('option', { value: 'online' }, '在线出题'),
          h('option', { value: 'bank' }, '题库出题')),
          subject.bankItemCount
            ? h('span', { className: 'kd-msg-meta' }, `题库 ${subject.bankItemCount} 题`)
            : h('span', { className: 'kd-msg-meta' }, '题库为空'),
          h(Btn, {
            small: true,
            variant: 'ghost',
            onClick: () => { onClose(); onPick(subject.id) },
          }, '查看'))
        : null)),
      h('div', { className: 'kd-divider' }),
      h('div', { className: 'kd-field' },
        h('div', { className: 'kd-field-label' }, '添加自定义科目（内置科目之外）'),
        h('div', { className: 'kd-row' },
          h('input', {
            className: 'kd-input',
            style: { flex: '1 1 200px' },
            value: name,
            placeholder: '例如：数据结构（自命题）',
            onChange: (event) => setName(event.target.value),
          }),
          h(Btn, {
            disabled: !name.trim(),
            onClick: () => {
              onAdd({ name: name.trim(), types })
              setName('')
            },
          }, '添加')),
        h('div', { className: 'kd-row', style: { marginTop: '8px' } },
          [['single', '单项选择题'], ['fill', '填空题'], ['solution', '解答题']].map(([value, label]) =>
            h('label', { key: value, className: 'kd-checkline', style: { cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: types.includes(value),
                onChange: () => toggleType(value),
              }),
              h('span', null, label))))))
    }

    function BanksModal({ boot, importResult, onClose, onPickFile, onDelete, onCommit, onCancelImport }) {
      if (importResult) {
        return h(Modal, {
          title: `${T.preview}（${importResult.name}）`,
          onClose: onCancelImport,
          wide: true,
          footer: [
            h(Btn, { key: 'cancel', onClick: onCancelImport }, T.cancel),
            h(Btn, {
              key: 'ok',
              variant: 'primary',
              disabled: !importResult.usable,
              onClick: () => onCommit(importResult),
            }, T.commit),
          ],
        },
        h('div', { className: 'kd-meta', style: { marginBottom: '10px' } },
          `共识别 ${importResult.stats.total} 道，其中带答案 ${importResult.stats.withAnswer} 道，可用 ${importResult.usable} 道。`),
        importResult.warnings.length
          ? h('div', { className: 'kd-verify' },
            h('div', null, '解析提示：'),
            h('ul', null, importResult.warnings.map((item, index) => h('li', { key: index }, item))))
          : null,
        h('div', { style: { marginTop: '12px' } },
          importResult.items.slice(0, 60).map((item) => h('div', { key: item.index, className: 'kd-preview-item' },
            h('div', { className: 'kd-meta' },
              h(Badge, null, `第 ${item.index} 题`),
              h(Badge, null, item.typeLabel),
              item.answerStatus === 'missing'
                ? h(Badge, { tone: 'warn' }, T.missing)
                : h(Badge, { tone: 'ok' }, '含参考答案（待核验）'),
              item.options.length ? h(Badge, null, `${item.options.length} 个选项`) : null),
            h('div', { style: { marginTop: '6px', fontSize: '13px' } },
              h(Markdown, { text: (item.stem || '(未识别到题干)').slice(0, 400) })),
            item.issues.length
              ? h('div', { className: 'kd-warn-text', style: { marginTop: '6px' } }, `问题：${item.issues.join('；')}`)
              : null))),
        importResult.items.length > 60
          ? h('div', { className: 'kd-msg-meta' }, `仅预览前 60 道，其余 ${importResult.items.length - 60} 道同样会按上述规则入库。`)
          : null)
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
          className: 'kd-row-between',
          style: { padding: '9px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' },
        },
        h('div', { style: { minWidth: 0 } },
          h('div', null, bank.name),
          h('div', { className: 'kd-msg-meta' },
            `${bank.itemCount} 道 · ${bank.kind === 'pdf' ? 'PDF' : 'Markdown'} · 导入于 ${formatDateTime(bank.importedAt)}`,
            bank.pendingAnswers ? ` · ${bank.pendingAnswers} 道答案待核验` : '')),
        h(Btn, { small: true, variant: 'danger', onClick: () => onDelete(bank) }, h(Icon, { name: 'trash', size: 13 }), T.deleteBank)))
        : h('div', { className: 'kd-empty' },
          h('div', { className: 'kd-empty-title' }, '还没有导入题库'),
          h('div', { className: 'kd-empty-body' }, '题库用于「题库出题」来源：每道题会被分配唯一题目 ID，同一题反复出现也不会在列表里产生重复记录。')))
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

    function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose, danger }) {
      return h(Modal, {
        title,
        onClose,
        footer: [
          h(Btn, { key: 'cancel', onClick: onClose }, T.cancel),
          h(Btn, { key: 'ok', variant: danger ? 'danger' : 'primary', onClick: onConfirm }, confirmLabel || T.confirm),
        ],
      }, h('div', { className: 'kd-md' }, message))
    }

    /* ============================== 主页面 ============================== */
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
      const [fail, setFail] = useState('')
      const [toast, setToast] = useState(null)
      const [modal, setModal] = useState(null)
      const [choice, setChoice] = useState('')
      const [localRedo, setLocalRedo] = useState(false)
      const [threadOpen, setThreadOpen] = useState(false)
      const fileRef = useRef(null)
      const attemptRef = useRef(newAttemptId())
      const toastTimer = useRef(null)

      const notify = useCallback((message, tone = 'ok') => {
        setToast({ message, tone })
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 4200)
      }, [])

      useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

      const refreshBoot = useCallback(async () => {
        try {
          const result = await rpc('bootstrap')
          setBoot(result)
          return result
        } catch {
          return null
        }
      }, [])

      const loadToday = useCallback(async (sid) => {
        if (!sid) return
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
          setQuestion(result.question)
          setThread(result.thread || null)
        } catch (issue) {
          setFail(issue.message)
        } finally {
          setBusy('')
        }
      }, [])

      const loadList = useCallback(async (sid, nextKind) => {
        if (!sid) return
        setKind(nextKind)
        setView('list')
        setBusy('list')
        setList(null)
        try {
          const result = await rpc('listQuestions', { subjectId: sid, kind: nextKind })
          setList(result)
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [notify])

      const pickSubject = useCallback((sid) => {
        if (!sid || sid === subjectId) return
        setSubjectId(sid)
        setList(null)
        rpc('saveSettings', { activeSubject: sid }).catch(() => {})
        loadToday(sid)
      }, [subjectId, loadToday])

      const openQuestion = useCallback(async (qid) => {
        setBusy('question')
        try {
          const result = await rpc('getQuestion', { qid })
          setQuestion(result.question)
          setThread(result.thread || null)
          setView('detail')
          setLocalRedo(false)
          setChoice('')
          setThreadOpen(false)
          attemptRef.current = newAttemptId()
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [notify])

      useEffect(() => {
        let cancelled = false
        rpc('bootstrap').then((result) => {
          if (cancelled) return
          setBoot(result)
          const preferred = result.settings?.activeSubject
          const first = preferred && result.settings.subjects.includes(preferred)
            ? preferred
            : (result.settings.subjects[0] || null)
          setSubjectId(first)
          setLoading(false)
          if (first) loadToday(first)
          else setView('empty')
        }).catch((issue) => {
          if (cancelled) return
          setError(issue.message)
          setLoading(false)
        })
        return () => { cancelled = true }
      }, [loadToday])

      const currentSubject = useMemo(() => (boot?.subjects || []).find((subject) => subject.id === subjectId) || null,
        [boot, subjectId])

      const reveal = useCallback(async (mode) => {
        if (!question) return
        setBusy('reveal')
        try {
          const result = await rpc('reveal', {
            qid: question.id,
            mode,
            choice: mode === 'submit' ? choice : '',
            attemptId: attemptRef.current,
          })
          setQuestion(result.question)
          setLocalRedo(false)
          refreshBoot()
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [question, choice, notify, refreshBoot])

      const judge = useCallback(async (verdict) => {
        if (!question) return
        setBusy('judge')
        try {
          const result = await rpc('judge', { qid: question.id, verdict })
          setQuestion(result.question)
          refreshBoot()
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [question, notify, refreshBoot])

      const favorite = useCallback(async () => {
        if (!question) return
        setBusy('favorite')
        try {
          const result = await rpc('favorite', { qid: question.id, value: !question.favorite })
          setQuestion(result.question)
          notify(question.favorite ? '已取消收藏' : '已加入收藏')
          refreshBoot()
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [question, notify, refreshBoot])

      const sendFollowup = useCallback(async (text, messageId) => {        if (!question) throw new Error('没有打开任何题目')
        const result = await rpc('followup', { qid: question.id, message: text, clientMessageId: messageId })
        setThread(result.thread)
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
            setModal(null)
            try {
              const result = await rpc('clearThread', { qid: question.id })
              setThread(result.thread)
              notify('本题追问已清空')
            } catch (issue) {
              notify(issue.message, 'bad')
            }
          },
        })
      }, [question, notify])

      const revise = useCallback(async () => {
        if (!question) return
        setBusy('revise')
        try {
          const result = await rpc('revise', { qid: question.id })
          setQuestion(result.question)
          setModal({ kind: 'revision' })
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [question, notify])

      const confirmRevision = useCallback(async () => {
        if (!question?.pendingRevision) return
        setBusy('revise')
        try {
          const result = await rpc('confirmRevision', {
            qid: question.id,
            candidateId: question.pendingRevision.candidateId,
          })
          setQuestion(result.question)
          setModal(null)
          notify('已替换为通过校验的新版本，旧版本已保留')
        } catch (issue) {
          notify(issue.message, 'bad')
        } finally {
          setBusy('')
        }
      }, [question, notify])

      const discardRevision = useCallback(async () => {
        if (!question) return
        setModal(null)
        try {
          const result = await rpc('discardRevision', { qid: question.id })
          setQuestion(result.question)
          notify('已放弃候选版本，正式答案保持不变')
        } catch (issue) {
          notify(issue.message, 'bad')
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

      const addSubject = useCallback(async (subject) => {
        try {
          let targetId = subject.id
          if (!targetId) {
            targetId = `custom_${Date.now().toString(36)}`
            await rpc('saveSettings', {
              customSubjects: [...(boot?.customSubjects || []), {
                id: targetId,
                name: subject.name,
                types: subject.types,
              }],
            })
          }
          const result = await rpc('addSubject', { subjectId: targetId })
          const fresh = await refreshBoot()
          notify(`${subject.name} 已启用，系统会为它分配今天的题目`)
          if (fresh && result) {
            setSubjectId(targetId)
            loadToday(targetId)
          }
          setModal(null)
        } catch (issue) {
          notify(issue.message, 'bad')
        }
      }, [boot, notify, refreshBoot, loadToday])

      const removeSubject = useCallback((subject) => {
        setModal({
          kind: 'confirm',
          title: `${T.deleteSubject}：${subject.name}`,
          message: `确认把「${subject.name}」移出每日出题吗？\n\n- 该科目已出过的题目、收藏、错题与作答记录都会保留在“全部”里。\n- 今天已经分配的题目不会丢失，重新启用后当天仍会复用同一道题。`,
          confirmLabel: T.deleteSubject,
          danger: true,
          onConfirm: async () => {
            setModal(null)
            try {
              const result = await rpc('removeSubject', { subjectId: subject.id })
              const fresh = await refreshBoot()
              notify(result.message || '已移出每日出题')
              if (fresh) {
                const next = fresh.settings.subjects[0] || null
                setSubjectId(next)
                if (next) loadToday(next)
                else { setQuestion(null); setView('empty') }
              }
            } catch (issue) {
              notify(issue.message, 'bad')
            }
          },
        })
      }, [notify, refreshBoot, loadToday])

      const changeSource = useCallback(async (id, source) => {
        try {
          await rpc('saveSettings', { subjectSource: { [id]: source } })
          await refreshBoot()
          notify('出题来源已更新')
        } catch (issue) {
          notify(issue.message, 'bad')
        }
      }, [notify, refreshBoot])

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

      const commitBank = useCallback(async (result) => {
        setBusy('commit')
        try {
          const saved = await rpc('commitBank', { importId: result.importId, name: result.name, subjectId: subjectId || '' })
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

      const counts = subjectId ? boot?.counts?.[subjectId] : null
      const narrow = useMediaQuery('(max-width: 1180px)')

      const mainContent = (() => {
        if (error) {
          return h('div', { className: 'kd-empty' },
            h('div', { className: 'kd-empty-title' }, '插件后端没有响应'),
            h('div', { className: 'kd-empty-body' }, error),
            h('div', { className: 'kd-actions' },
              h(Btn, { onClick: () => window.location.reload() }, '重新加载页面')))
        }
        if (loading) return h('div', { className: 'kd-loading' }, h('span', { className: 'kd-spinner' }), '正在读取学习数据…')
        if (!boot?.settings?.subjects?.length) {
          return h('div', { className: 'kd-empty' },
            h('div', { className: 'kd-empty-title' }, T.noSubjects),
            h('div', { className: 'kd-empty-body' }, T.noSubjectsHint),
            h('div', { className: 'kd-actions' },
              h(Btn, { variant: 'primary', onClick: () => setModal({ kind: 'subjects' }) }, h(Icon, { name: 'plus', size: 13 }), T.addSubject),
              h(Btn, { onClick: () => setModal({ kind: 'banks' }) }, T.manageBanks)))
        }
        if (busy === 'daily' && !question) {
          return h('div', { className: 'kd-loading' },
            h('span', { className: 'kd-spinner' }),
            T.generating,
            h('div', { className: 'kd-msg-meta', style: { marginTop: '8px' } },
              '题目会先生成，再由另一个独立视角重新求解并校验；校验不通过就不会发布。首次出题可能需要几十秒。'))
        }
        if (fail) {
          return h('div', { className: 'kd-empty' },
            h('div', { className: 'kd-empty-title' }, T.generateFailed),
            h('div', { className: 'kd-empty-body' }, fail),
            h('div', { className: 'kd-actions' },
              h(Btn, { variant: 'primary', onClick: () => loadToday(subjectId) }, h(Icon, { name: 'refresh', size: 13 }), T.retry),
              h(Btn, { onClick: () => setModal({ kind: 'subjects' }) }, '切换出题来源'),
              h(Btn, { onClick: () => setModal({ kind: 'banks' }) }, T.manageBanks)))
        }
        if (!subjectId) {
          return h('div', { className: 'kd-empty' },
            h('div', { className: 'kd-empty-title' }, '先选择一个科目'),
            h('div', { className: 'kd-empty-body' }, '左侧列出的科目都可以切换；没有想要的科目就先去「科目管理」添加。'))
        }
        if (kind !== 'today' && view === 'list') {
          return h(ListPane, {
            list,
            kind,
            subjectName: currentSubject?.name || '',
            onOpen: openQuestion,
          })
        }
        if (view === 'detail' && question) {
          return h(QuestionPane, {
            q: question,
            busy,
            choice,
            localRedo,
            narrow,
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
            onJudge: judge,
            onFavorite: favorite,
            onRedo: () => {
              setLocalRedo(true)
              setChoice('')
              attemptRef.current = newAttemptId()
            },
            onRevise: revise,
            revising: busy === 'revise',
            onToggleThread: () => setThreadOpen((value) => !value),
            onRemoveWrong: async () => {
              if (!question) return
              try {
                const result = await rpc('removeFromWrongBook', { qid: question.id })
                setQuestion(result.question)
                notify('已移出错题本，历史作答记录仍然保留')
                refreshBoot()
              } catch (issue) {
                notify(issue.message, 'bad')
              }
            },
          })
        }
        return h('div', { className: 'kd-empty' },
          h('div', { className: 'kd-empty-title' }, '选择一个入口开始'),
          h('div', { className: 'kd-empty-body' }, '左侧「今日题目 / 全部 / 收藏 / 错题本」分别对应今天这道题、历史题目、收藏和错题。'))
      })()

      const showThread = view === 'detail' && question && (!narrow || threadOpen)

      return h('div', { className: 'kd-page' },
        styleInjected ? null : h('style', null, CSS),
        h('div', { className: 'kd-header' },
          h('div', { className: 'kd-header-left' },
            h('h1', { className: 'kd-title' }, T.title),
            h('div', { className: 'kd-sub' },
              boot?.today ? `${formatDate(boot.today)} · ` : '',
              boot ? `已启用 ${boot.settings.subjects.length} 个科目 · ` : '',
              T.subtitle),
            h('div', { className: 'kd-yearline' },
              h('span', null, `${T.year}：`),
              h(Btn, { small: true, disabled: !boot, onClick: () => setModal({ kind: 'subjects' }) }, h(Icon, { name: 'plus', size: 13 }), T.manageSubjects),
              h(Btn, { small: true, disabled: !boot, onClick: () => setModal({ kind: 'banks' }) }, h(Icon, { name: 'book', size: 13 }), T.manageBanks),
              boot?.dataFile ? h('span', { title: boot.dataFile }, '数据已本地保存') : null)),
          boot ? h(Countdown, {
            boot,
            busy: busy === 'exam',
            onRefresh: refreshExam,
            onYearChange: changeYear,
          }) : null),
        boot ? h(MobileBar, {
          boot,
          subjectId,
          kind,
          onPick: pickSubject,
          onTab: (value) => {
            if (value === 'today') loadToday(subjectId)
            else loadList(subjectId, value)
          },
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
            boot ? h(TabBar, {
              kind,
              counts,
              onPick: (value) => {
                if (value === 'today') loadToday(subjectId)
                else loadList(subjectId, value)
              },
            }) : null,
            mainContent),
          showThread
            ? h(ThreadPane, {
              thread,
              questionId: question.id,
              busy,
              narrow,
              onSend: sendFollowup,
              onClear: clearThread,
              onClose: () => setThreadOpen(false),
            })
            : null),
        h('input', {
          ref: fileRef,
          type: 'file',
          accept: '.md,.markdown,.txt,.pdf',
          style: { display: 'none' },
          onChange: onFile,
        }),
        modal?.kind === 'subjects' && boot
          ? h(SubjectsModal, {
            boot,
            onClose: () => setModal(null),
            onAdd: addSubject,
            onRemove: removeSubject,
            onSource: changeSource,
            onPick: (id) => { setModal(null); pickSubject(id) },
          })
          : null,
        modal?.kind === 'banks' && boot
          ? h(BanksModal, {
            boot,
            importResult: modal.importResult,
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
          title: modal.title,
          message: modal.message,
          confirmLabel: modal.confirmLabel,
          danger: modal.danger,
          onConfirm: modal.onConfirm,
          onClose: () => setModal(null),
        }) : null,
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

    /* ============================== 侧栏入口 ============================== */
    function SidebarIcon({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
      },
      h('path', {
        d: 'M4.6 2h14.8A2.6 2.6 0 0 1 22 4.6v14.8A2.6 2.6 0 0 1 19.4 22H4.6A2.6 2.6 0 0 1 2 19.4V4.6A2.6 2.6 0 0 1 4.6 2Z',
        fill: 'currentColor',
        opacity: 0.16,
      }),
      h('path', {
        d: 'M8 5.2c.5 0 .9.4.9.9v.9h6.2v-.9a.9.9 0 0 1 1.8 0v.9h.3c.9 0 1.6.7 1.6 1.6v8.6c0 .9-.7 1.6-1.6 1.6H6.8c-.9 0-1.6-.7-1.6-1.6V8.6c0-.9.7-1.6 1.6-1.6h.3v-.9c0-.5.4-.9.9-.9Z',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinejoin: 'round',
      }),
      h('path', {
        d: 'M8.6 12.6l1.7 1.7 3.5-3.6',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.slots
        if (!slots || typeof slots.inject !== 'function') {
          console.error('[kaoyan-daily] slots 服务不可用，界面没有注册')
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
                  console.error('[kaoyan-daily] 注销样式失败', error)
                }
              }
            } catch (error) {
              styleInjected = false
              console.error('[kaoyan-daily] 样式注入失败，改用 <style> 元素', error)
            }
          }
          return undefined
        }, 'kaoyan-daily.styles')
        ctx.effect(() => {
          const stops = [
            slots.inject('sidebar.panellist', () => slots.register({
              name: 'sidebar.panellist',
              id: 'kaoyan-daily',
              order: 20,
              label: () => T.title,
            }, SidebarIcon)),
            slots.inject('main', () => slots.register({
              name: 'main',
              key: 'kaoyan-daily',
            }, Page)),
          ]
          return () => {
            for (const stop of stops.reverse()) {
              try {
                stop?.()
              } catch (error) {
                console.error('[kaoyan-daily] 注销失败', error)
              }
            }
          }
        }, 'kaoyan-daily.slots')
      },
    }
  },
})
