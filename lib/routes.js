/** Host 侧的 HTTP 接口：本包 Client 通过同源 fetch 调用同一套业务方法。 */

import { readFile } from 'node:fs/promises'
import { readdirSync } from 'node:fs'

const RPC_PATH = '/api/daily-question/rpc'
const PING_PATH = '/api/daily-question/ping'
const MATHJAX_PATH = '/api/daily-question/vendor/mathjax-4.1.3'
const MAX_BODY_BYTES = 60 * 1024 * 1024

const MATHJAX_FILES = new URL('../vendor/mathjax/', import.meta.url)

function json(status, body) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return Buffer.concat(chunks, size).toString('utf8')
      size += value.byteLength
      if (size > MAX_BODY_BYTES) return null
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 注册路由。
 * @param {{fetch: {register: Function}}} connection ctx.connection
 * @param {import('./service.js').DailyQuestionService} service
 * @returns {() => Promise<void>} 注销函数
 */
export function registerRoutes(connection, service, logger = console) {
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
    importSyllabus: (args) => service.importSyllabus(args),
    removeSyllabus: (args) => service.removeSyllabus(args),
    importPastPaper: (args) => service.importPastPaper(args),
    removePastPaper: (args) => service.removePastPaper(args),
    importBank: (args) => service.importBank(args),
    commitBank: (args) => service.commitBank(args),
    deleteBank: (args) => service.deleteBank(args),
    refreshExamDate: (args) => service.refreshExamDate(args),
    examState: async () => {
      const { examInfo, countdown } = await service.examState()
      return { ok: true, examInfo, countdown }
    },
  }

  const disposeRpc = connection.fetch.register({
    path: RPC_PATH,
    methods: ['POST'],
    requestBody: 'streaming',
    fetch: async (request) => {
      let payload
      try {
        const body = await readBody(request)
        if (body === null) return json(413, { ok: false, error: { message: '请求体过大', code: 'BODY_TOO_LARGE' } })
        payload = JSON.parse(body)
      } catch (error) {
        return json(400, { ok: false, error: { message: `请求体解析失败：${error.message}`, code: 'BAD_BODY' } })
      }
      const op = typeof payload?.op === 'string' ? payload.op : ''
      if (!Object.hasOwn(ops, op)) {
        return json(400, { ok: false, error: { message: `未知操作：${op}`, code: 'UNKNOWN_OP' } })
      }
      const started = Date.now()
      try {
        const result = await ops[op](payload.args || {})
        return json(200, { ok: true, result })
      } catch (error) {
        const message = error?.message || String(error)
        logger.warn?.(`daily-question: ${op} 失败（${Date.now() - started}ms）：${message}`)
        return json(error?.code === 'ATTEMPT_CONFLICT' ? 409 : 500, {
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

  const disposePing = connection.fetch.register({
    path: PING_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => json(200, { ok: true, plugin: 'daily-question', version: 1 }),
  })

  // 只注册随包分发的资源，不接受请求指定文件路径。
  const assets = ['tex-svg.js', 'a11y/assistive-mml.js']
  for (const dir of ['newcm/svg/dynamic/', 'input/tex/extensions/']) {
    for (const file of readdirSync(new URL(dir, MATHJAX_FILES))) {
      if (file.endsWith('.js')) assets.push(dir + file)
    }
  }
  const disposeVendor = assets.map((asset) => connection.fetch.register({
    path: MATHJAX_PATH + '/' + asset,
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const mathjaxBytes = await readFile(new URL(asset, MATHJAX_FILES))
        return new Response(request.method === 'HEAD' ? null : mathjaxBytes, { headers: {
          'content-type': 'text/javascript; charset=utf-8',
          'content-length': String(mathjaxBytes.length),
          'cache-control': 'private, max-age=31536000, immutable',
        } })
      } catch (error) {
        logger.warn?.(`daily-question: 公式引擎不可用（${error.message}）`)
        return new Response(request.method === 'HEAD' ? null : 'MathJax not bundled', { status: 404 })
      }
    },
  }))

  logger.info?.(`daily-question: 接口已就绪 ${RPC_PATH}`)
  return async () => {
    await Promise.all([disposeRpc(), disposePing(), ...disposeVendor.map((dispose) => dispose())])
  }
}
