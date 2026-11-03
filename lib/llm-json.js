/** 模型调用的最小封装：解析默认模型、聚合流式文本、容忍 JSON 噪声。 */

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
export async function generateText(ctx, { system, prompt, maxTokens = 4000, temperature, signal }) {
  const llm = ctx.get?.('llm')
  if (!llm || typeof llm.stream !== 'function') {
    throw new ModelUnavailableError('当前 Host 没有可用的 llm 服务，无法在线出题')
  }
  const selection = resolveModel(ctx)
  const options = {
    provider: selection.provider,
    model: selection.model,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    maxTokens,
    signal,
  }
  if (selection.reasoningEffort) options.reasoningEffort = selection.reasoningEffort
  if (typeof temperature === 'number') options.temperature = temperature

  let text = ''
  let finish = null
  try {
    for await (const chunk of llm.stream(options)) {
      if (chunk?.type === 'text-delta') text += chunk.text
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
  const trimmed = text.trim()
  if (!trimmed) throw new Error('模型返回了空内容')
  return trimmed
}

/** 从可能包含解释文字或代码围栏的回复里取出第一个 JSON 对象。 */
export function parseJsonLoose(text) {
  const raw = String(text || '').trim()
  if (!raw) throw new Error('模型没有返回可解析的 JSON')
  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(raw)
  const body = fenced ? fenced[1].trim() : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型回复中没有 JSON 对象')
  const slice = body.slice(start, end + 1)
  const attempts = [slice, slice.replace(/,\s*([}\]])/g, '$1')]
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate)
    } catch { /* 尝试下一种修复方式 */ }
  }
  throw new Error('模型返回的 JSON 无法解析')
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
