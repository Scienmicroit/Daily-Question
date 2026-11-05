/** 模型调用的最小封装：解析默认模型、聚合流式文本、容忍 JSON 噪声。 */
import { withTimeout } from './async.js'

export class ModelUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ModelUnavailableError'
    this.code = 'MODEL_UNAVAILABLE'
  }
}

/** 读取本 Host 的默认模型选择。 */
export function resolveModel(ctx) {
  const service = ctx.get?.('agentDefaultModel')
  if (!service || typeof service.currentSelection !== 'function') {
    throw new ModelUnavailableError('当前 Host 没有默认模型选择服务，无法执行在线出题')
  }
  let selection
  try {
    selection = service.currentSelection()
  } catch (error) {
    throw new ModelUnavailableError(`读取默认模型失败：${error?.message || error}`)
  }
  if (!selection || typeof selection.provider !== 'string' || typeof selection.model !== 'string') {
    throw new ModelUnavailableError('尚未配置默认模型，请先在 DSH 设置里选择模型后再在线出题')
  }
  return selection
}

/**
 * 一次非流式结果的模型调用。
 * @returns {Promise<string>} 拼接后的正文
 */
export async function generateText(ctx, { signal, timeoutMs = 5*60*1000, ...options }) {
  return withTimeout((signal)=>generateTextWithinDeadline(ctx,{...options,signal}),{
    signal,timeoutMs,message:'模型调用超时，请重试',
  })
}

async function generateTextWithinDeadline(ctx, { system, prompt, images = [], maxTokens = 4000, reasoningEffort, temperature, signal }) {
  const llm = ctx.get?.('llm')
  if (!llm || typeof llm.stream !== 'function') {
    throw new ModelUnavailableError('当前 Host 没有可用的 llm 服务，无法在线出题')
  }
  const selection = resolveModel(ctx)
  const basePrompt = prompt

  const call = async (promptText) => {
    const options = {
      provider: selection.provider,
      model: selection.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: promptText }, ...images.map((attachment) => ({ type: 'image', attachment }))] }],
      maxTokens: (reasoningEffort || selection.reasoningEffort) === 'max' ? Math.max(maxTokens,24000) : maxTokens,
      signal,
    }
    if (reasoningEffort || selection.reasoningEffort) options.reasoningEffort = reasoningEffort || selection.reasoningEffort
    if (typeof temperature === 'number') options.temperature = temperature

    let text = ''
    let reasoningChars = 0
    let usage = null
    let finish = null
    try {
      for await (const chunk of llm.stream(options)) {
        signal.throwIfAborted()
        if (chunk?.type === 'text-delta') text += chunk.text
        else if (chunk?.type === 'reasoning-delta') reasoningChars += chunk.text.length
        else if (chunk?.type === 'usage') usage = chunk.usage
        else if (chunk?.type === 'finish') finish = chunk.reason
      }
    } catch (error) {
      throw new Error(`模型调用失败：${error?.message || error}`)
    }
    if (finish && finish.kind === 'error') {
      throw new Error(`模型返回错误：${finish.failure?.message || '未知错误'}`)
    }
    if (finish && finish.kind === 'aborted') {
      throw new Error('模型调用被中断')
    }
    return { text: text.trim(), reasoningChars, usage, finish }
  }

  let result = await call(basePrompt)
  // 推理型模型有时把 token 预算全花在思考上，正文为空。补一句提示重试一次。
  if (!result.text && !signal?.aborted) {
    result = await call(`${basePrompt}\n\n注意：上一次没有返回任何正文。请直接给出最终正文（本任务要求的就是正文本身），不要只输出思考过程。`)
  }
  if (!result.text) {
    const error = new Error(`模型返回了空内容（${describeCall(result)}）。已自动重试一次仍为空，可以点「重试」，或把该科目的出题来源切换为题库。`)
    error.code = 'MODEL_EMPTY'
    error.callInfo = result
    throw error
  }
  return result
}

/** 把一次调用的结束原因、推理长度、token 用量写成一句话，便于定位问题。 */
export function describeCall({ finish, usage, reasoningChars } = {}) {
  const parts = []
  parts.push(finish ? `结束原因 ${finish.kind}` : '没有收到结束事件')
  if (reasoningChars) parts.push(`模型先写了 ${reasoningChars} 字推理`)
  if (usage?.outputTokens) {
    parts.push(`输出 ${usage.outputTokens} tokens${finish?.kind === 'max-tokens' ? '（已达上限）' : ''}`)
  }
  return parts.join('；')
}

/**
 * 模型在 JSON 字符串里写 LaTeX 时经常忘记转义反斜杠：
 * - `\alpha` 里的 `\a` 是非法转义 → JSON.parse 直接失败
 * - `\theta` 里的 `\t`、`\frac` 里的 `\f`、`\beta` 里的 `\b` 是**合法**转义
 *   → 能解析，但内容会被悄悄变成制表符 / 换页符等控制字符
 *
 * 前者在这里按“非法转义”补成字面反斜杠；后者在解析完成后按已知 LaTeX 命令表还原，
 * 只有明确像命令时才还原，避免把真正的换行也改掉。
 */
const ESCAPE_LETTER = { '\n': 'n', '\r': 'r', '\t': 't', '\b': 'b', '\f': 'f' }

const LATEX_COMMANDS = new Set([
  'nabla', 'neq', 'ne', 'ni', 'notin', 'not', 'nu', 'nleq', 'ngeq', 'nolimits', 'newline', 'nearrow', 'nwarrow',
  'rho', 'right', 'rightarrow', 'rightharpoonup', 'rightleftharpoons', 'rm', 'rangle', 'rceil', 'rfloor',
  'theta', 'tau', 'times', 'tan', 'tanh', 'to', 'top', 'therefore', 'triangle', 'tilde', 'text', 'textbf',
  'textrm', 'textit', 'tfrac', 'tbinom', 'twoheadrightarrow',
  'beta', 'bar', 'begin', 'bmatrix', 'bm', 'boldsymbol', 'because', 'bot', 'bigcup', 'bigcap', 'bigcirc',
  'bigotimes', 'bigoplus', 'bigvee', 'bigwedge', 'bullet', 'backslash', 'barwedge', 'binom',
  'frac', 'forall', 'fbox', 'flat', 'frown', 'fork', 'dfrac',
  'underline', 'uparrow', 'upsilon', 'uplus', 'underbrace', 'updownarrow', 'upharpoonright', 'ulcorner',
])

const CONTROL_ESCAPE_PATTERN = /[\n\r\t\b\f]([A-Za-z]+)/g

/** 把“被 JSON 吃掉的 LaTeX 命令”还原回反斜杠形式。 */
export function repairLatexEscapes(value) {
  if (typeof value === 'string') {
    if (!/[\n\r\t\b\f]/.test(value)) return value
    return value.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part,index) => index % 2 ? part : part.replace(CONTROL_ESCAPE_PATTERN, (match, letters) => {
      const first = ESCAPE_LETTER[match[0]]
      if (!first) return match
      const candidate = first + letters.toLowerCase()
      for (let length = candidate.length; length >= 2; length -= 1) {
        const prefix = candidate.slice(0, length)
        if (LATEX_COMMANDS.has(prefix)) {
          return `\\${prefix}${letters.slice(length - 1)}`
        }
      }
      return match
    })).join('')
  }
  if (Array.isArray(value)) return value.map((item) => repairLatexEscapes(item))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = repairLatexEscapes(item)
    return out
  }
  return value
}

/** 把非法的 JSON 转义与裸控制字符修成合法转义，保持原文字面内容不变。 */
export function escapeInvalidJsonEscapes(text) {
  let out = ''
  let inString = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (!inString) {
      if (char === '"') inString = true
      out += char
      continue
    }
    if (char === '"') {
      // 字符串里未转义的引号（例如 “即 "就地反转" 的做法”）会让 JSON 结构提前结束。
      // 只有后面紧跟 , } ] : 或输入结束时才当作字符串结束，否则按字面引号转义。
      let look = index + 1
      while (look < text.length && (text[look] === ' ' || text[look] === '\n' || text[look] === '\r' || text[look] === '\t')) {
        look += 1
      }
      const next = text[look]
      if (next === undefined || next === ',' || next === '}' || next === ']' || next === ':') {
        inString = false
        out += char
      } else {
        out += '\\"'
      }
      continue
    }
    if (char === '\\') {
      const next = text[index + 1]
      if (next === '"' || next === '\\' || next === '/' || next === 'b' || next === 'f'
        || next === 'n' || next === 'r' || next === 't') {
        out += char + next
        index += 1
        continue
      }
      if (next === 'u') {
        const hex = text.slice(index + 2, index + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += `\\u${hex}`
          index += 5
          continue
        }
      }
      // 非法转义（典型是 LaTeX 的 \alpha、\sqrt）：当成字面反斜杠
      out += '\\\\'
      continue
    }
    if (char === '\n') { out += '\\n'; continue }
    if (char === '\r') { out += '\\r'; continue }
    if (char === '\t') { out += '\\t'; continue }
    if (char < ' ') {
      out += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
      continue
    }
    out += char
  }
  return out
}

/** 从可能包含解释文字或代码围栏的回复里取出第一个 JSON 对象，并修复常见转义问题。 */
export function parseJsonLoose(text) {
  const raw = String(text || '').trim()
  if (!raw) throw new Error('模型没有返回可解析的 JSON')
  const fenced = /```(?:json|JSON)?\s*([\s\S]*)```/.exec(raw)
  // JSON题干自身可以包含代码围栏，只有对象之前的外层围栏才需要剥离。
  const body = fenced && (raw.indexOf('{') < 0 || fenced.index < raw.indexOf('{')) ? fenced[1].trim() : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型回复中没有 JSON 对象')
  const slice = body.slice(start, end + 1)
  const escaped = escapeInvalidJsonEscapes(slice)
  const attempts = [
    slice,
    slice.replace(/,\s*([}\]])/g, '$1'),
    escaped,
    escaped.replace(/,\s*([}\]])/g, '$1'),
  ]
  let lastError = null
  let lastCandidate = ''
  for (const candidate of attempts) {
    try {
      return repairLatexEscapes(JSON.parse(candidate))
    } catch (error) {
      lastError = error
      lastCandidate = candidate
    }
  }
  const position = Number((/position (\d+)/.exec(lastError?.message || '') || [])[1])
  const oneLine = (value) => value.replace(/[\r\n\t]+/g, '⏎')
  const snippet = Number.isFinite(position)
    ? `；位置 ${position} 附近：…${oneLine(lastCandidate.slice(Math.max(0, position - 40), position))}⟪错误在这里⟫${oneLine(lastCandidate.slice(position, position + 40))}…`
    : ''
  throw new Error(`模型返回的 JSON 无法解析${snippet}（常见原因：字符串里的引号没转义、LaTeX 反斜杠没转义、或输出被截断）`)
}

export function asString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

export function asStringArray(value, limit = 12) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit)
}
