import { DailyQuestionService } from './lib/service.js'
import { registerRoutes } from './lib/routes.js'

/**
 * 「考研每日一题」的 Host 半。
 *
 * 职责：题库与学习数据的持久化、在线出题 + 独立答案校验、
 * 答案详解的固定版本、按题目隔离的追问线程、考研日期核验，
 * 以及把这些能力通过 ctx.webServer 的同源接口暴露给本包的 Client 半。
 *
 * 界面全部由 client.js 以 Slot 组件渲染；这里不提供 HTML 页面。
 */

const PREFIX = 'daily-question'

function createLogger(ctx) {
  const scoped = typeof ctx.logger === 'function' ? ctx.logger(PREFIX) : undefined
  if (scoped && typeof scoped.info === 'function') return scoped
  return {
    info: (...args) => console.log(`[${PREFIX}]`, ...args),
    warn: (...args) => console.warn(`[${PREFIX}]`, ...args),
    error: (...args) => console.error(`[${PREFIX}]`, ...args),
  }
}

export function apply(ctx) {
  const logger = createLogger(ctx)
  // 服务只通过 ctx.get(name) 探测可选服务（llm / web / agentDefaultModel），
  // 因此这里给它一个最小的宿主外观，而不是整个 Context。
  const service = new DailyQuestionService({ get: (name) => ctx.get?.(name), logger })

  ctx.effect(() => {
    let stopped = false
    service.store.load().then(
      () => { if (!stopped) logger.info?.('数据文件已加载:', service.store.file) },
      (error) => logger.error?.('数据文件加载失败:', error),
    )
    return () => { stopped = true }
  }, `${PREFIX}.store`)

  ctx.inject(['webServer'], (scoped) => {
    const webServer = scoped.webServer
    if (!webServer || typeof webServer.register !== 'function') {
      logger.warn?.('webServer 不可用，界面接口没有启动')
      return undefined
    }
    return registerRoutes(webServer, service, logger)
  })
}

export { DailyQuestionService }
