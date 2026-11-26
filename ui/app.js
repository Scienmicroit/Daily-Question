import { T } from './common.js'
import { CSS } from './styles.js'
import { createMarkdown } from './markdown.js'
import { createComponents } from './components.js'
import { createPage } from './page.js'

async function readFollowupStream(response, onDelta) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) throw new Error('追问回复中断，请重试')
      buffer += decoder.decode(value, { stream: true })
      let end
      while ((end = buffer.indexOf('\n')) !== -1) {
        const event = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        if (event.type === 'delta') onDelta(event.text)
        else if (event.type === 'result') return event.result
        else if (event.type === 'error') throw new Error(event.error.message)
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function createClient(React, { window = globalThis.window, fetch = globalThis.fetch, styles } = {}) {
  const styleState = { injected: false }
  async function rpc(op, args, onDelta) {
    let response
    const slowPdf = op === 'importBank' || op === 'importSyllabus' || op === 'importPastPaper'
    try {
      response = await fetch('/api/daily-question/rpc', {
        method: 'POST',
        signal: AbortSignal.timeout(op === 'ensureDaily' || op === 'revise' || slowPdf ? 16*60*1000 : ['followup', 'analyzeStudyMemory', 'suggestMemoryMerges'].includes(op) ? 6*60*1000 : 60_000),
        headers: { 'content-type': 'application/json', ...(onDelta ? { accept: 'application/x-ndjson' } : {}) },
        body: JSON.stringify({ op, args: args || {} }),
      })
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error('等待服务响应超时，请重试')
      throw new Error(`无法连接插件后端（${error.message}）。请确认「考研每日一题」插件已启用。`)
    }
    if (onDelta && response.ok && response.headers?.get('content-type')?.startsWith('application/x-ndjson')) {
      return readFollowupStream(response, onDelta)
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

  const markdown = createMarkdown(React, { window })
  const components = createComponents(React, { window, rpc, ...markdown })
  const page = createPage(React, { window, rpc, components, styleState })
  const { Page } = page
  const { PluginLogo } = components

  const plugin = {
    inject: ['slots'],
    apply(ctx) {
      const slots = ctx.slots
      if (!slots || typeof slots.inject !== 'function') {
        console.error('[daily-question] slots 服务不可用，界面没有注册')
        return
      }
      ctx.effect(() => {
        // 优先用宿主提供的样式注入（带 CSP nonce 等处理）；不可用时由 Page 渲染 <style>。
        if (typeof styles?.insert === 'function') {
          try {
            const dispose = styles.insert(CSS)
            styleState.injected = true
            return () => {
              try {
                dispose?.()
              } catch (error) {
                console.error('[daily-question] 注销样式失败', error)
              }
            }
          } catch (error) {
            styleState.injected = false
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

  return { plugin, ...components, ...page, mathState: markdown.mathState }
}
