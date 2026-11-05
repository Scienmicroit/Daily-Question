/** Host 侧的 HTTP 接口：本包 Client 通过同源 fetch 调用同一套业务方法。 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const RPC_PATH = '/api/daily-question/rpc'
const PING_PATH = '/api/daily-question/ping'
const MATHJAX_PATH = '/api/daily-question/vendor/tex-svg.js'
const MAX_BODY_BYTES = 60 * 1024 * 1024

/** MathJax 3.2.2 的单文件 bundle（Apache-2.0），见 vendor/mathjax 内的许可文件。 */
const MATHJAX_FILE = fileURLToPath(new URL('../vendor/mathjax/tex-svg.js', import.meta.url))
let mathjaxBytes = null

/** 最小 CSRF 防护：带 Origin 的请求必须与 Host 同源。 */
function trusted(req) {
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * 注册路由。
 * @param {{register: Function}} webServer ctx.webServer
 * @param {import('./service.js').DailyQuestionService} service
 * @returns {() => void} 注销函数
 */
export function registerRoutes(webServer, service, logger = console) {
  const ops = {
    bootstrap: () => service.bootstrap(),
    checkUpdates: (args) => service.checkUpdates(args),
    cancelTask: (args) => service.cancelTask(args),
    saveSettings: (args) => service.saveSettings(args),
    addSubject: (args) => service.addSubject(args),
    removeSubject: (args) => service.removeSubject(args),
    ensureDaily: (args) => service.ensureDaily(args?.subjectId),
    listQuestions: (args) => service.listQuestions(args),
    getQuestion: (args) => service.getQuestion(args),
    reveal: (args) => service.reveal(args),
    judge: (args) => service.judge(args),
    favorite: (args) => service.favorite(args),
    removeFromWrongBook: (args) => service.removeFromWrongBook(args),
    bulkQuestions: (args) => service.bulkQuestions(args),
    revise: (args) => service.revise(args),
    confirmRevision: (args) => service.confirmRevision(args),
    discardRevision: (args) => service.discardRevision(args),
    followup: (args) => service.followup(args),
    clearThread: (args) => service.clearThread(args),
    importBank: (args) => service.importBank(args),
    commitBank: (args) => service.commitBank(args),
    deleteBank: (args) => service.deleteBank(args),
    refreshExamDate: (args) => service.refreshExamDate(args),
    examState: async () => {
      const { examInfo, countdown } = await service.examState()
      return { ok: true, examInfo, countdown }
    },
  }

  const disposeRpc = webServer.register({
    kind: 'exact',
    path: RPC_PATH,
    handler: async (req, res) => {
      if (!trusted(req)) {
        sendJson(res, 403, { ok: false, error: { message: 'forbidden', code: 'FORBIDDEN' } })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: { message: '只接受 POST', code: 'METHOD' } })
        return
      }
      let payload
      try {
        payload = JSON.parse(await readBody(req))
      } catch (error) {
        sendJson(res, 400, { ok: false, error: { message: `请求体解析失败：${error.message}`, code: 'BAD_BODY' } })
        return
      }
      const op = typeof payload?.op === 'string' ? payload.op : ''
      const handler = ops[op]
      if (!handler) {
        sendJson(res, 400, { ok: false, error: { message: `未知操作：${op}`, code: 'UNKNOWN_OP' } })
        return
      }
      const started = Date.now()
      try {
        const result = await handler(payload.args || {})
        sendJson(res, 200, { ok: true, result })
      } catch (error) {
        const message = error?.message || String(error)
        logger.warn?.(`daily-question: ${op} 失败（${Date.now() - started}ms）：${message}`)
        sendJson(res, 500, {
          ok: false,
          error: {
            message,
            code: error?.code || error?.name || 'ERROR',
            details: error?.details ? { issues: error.details.trail } : undefined,
          },
        })
      }
    },
  })

  const disposePing = webServer.register({
    kind: 'exact',
    path: PING_PATH,
    handler: (req, res) => {
      if (!trusted(req)) {
        sendJson(res, 403, { ok: false })
        return
      }
      sendJson(res, 200, { ok: true, plugin: 'daily-question', version: 1 })
    },
  })

  // 公式引擎：MathJax 3 的单文件 bundle（SVG 输出，自带字形路径，不需要字体文件）。
  const disposeVendor = webServer.register({
    kind: 'exact',
    path: MATHJAX_PATH,
    handler: async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' })
        res.end()
        return
      }
      try {
        if (!mathjaxBytes) mathjaxBytes = await readFile(MATHJAX_FILE)
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'content-length': String(mathjaxBytes.length),
          'cache-control': 'public, max-age=31536000, immutable',
        })
        if (req.method === 'HEAD') res.end()
        else res.end(mathjaxBytes)
      } catch (error) {
        logger.warn?.(`daily-question: 公式引擎不可用（${error.message}）`)
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('MathJax not bundled')
      }
    },
  })

  logger.info?.(`daily-question: 接口已就绪 ${RPC_PATH}`)
  return () => {
    disposeRpc()
    disposePing()
    disposeVendor()
  }
}
