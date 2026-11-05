import { inflateSync, inflateRawSync } from 'node:zlib'
import { Worker } from 'node:worker_threads'
import { withTimeout } from './async.js'

/**
 * 极简 PDF 文本提取器（只处理文本型 PDF）。
 *
 * 覆盖范围：
 * - 经典 `N 0 obj ... endobj` 与对象流（/ObjStm）里的对象
 * - FlateDecode / ASCIIHexDecode 过滤链
 * - 文字显示算子：Tj / TJ / ' / "，并按 Td / TD / Tm / T* 推断换行
 * - Type0(Identity-H) 等字体的 /ToUnicode CMap（bfchar / bfrange）
 * - UTF-16BE(BOM) 十六进制字符串
 *
 * 明确不支持：扫描版（纯图片）PDF、需要 OCR 的内容、加密 PDF。
 * 遇到这类文件会返回空文本与具体原因，由调用方提示用户，绝不伪装成导入成功。
 */

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])
const PDF_LIMITS={inputBytes:40*1024*1024,streamBytes:8*1024*1024,totalStreamBytes:32*1024*1024,objects:50000,pages:1000,depth:64,textChars:4*1024*1024}
const limitError=(message)=>Object.assign(new Error('PDF解析超过安全限制：'+message),{code:'PDF_LIMIT'})
function checkLimit(error){if(error?.code==='PDF_LIMIT')throw error}
function consume(bytes,budget) {
  if(bytes>budget.limits.streamBytes)throw limitError('单个内容流过大')
  budget.expanded+=bytes
  if(budget.expanded>budget.limits.totalStreamBytes)throw limitError('内容流展开总量过大')
}

function latin1(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')
}

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value)
}

let activeWorkers=0
let queuedBytes=0
const workerQueue=[]
function acquireWorker(signal,bytes) {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason);return}
    const stop=()=>{
      const index=workerQueue.indexOf(start)
      if(index>=0){workerQueue.splice(index,1);queuedBytes-=bytes}
      reject(signal.reason)
    }
    const start=()=>{
      signal.removeEventListener('abort',stop)
      if(signal.aborted){reject(signal.reason);return}
      activeWorkers++
      resolve(()=>{
        activeWorkers--
        let next
        while(activeWorkers<2&&(next=workerQueue.shift())){queuedBytes-=next.bytes;next()}
      })
    }
    start.bytes=bytes
    if(activeWorkers>=2&&(workerQueue.length>=8||queuedBytes+bytes>64*1024*1024)){reject(limitError('等待解析的文件过多，请稍后重试'));return}
    signal.addEventListener('abort',stop,{once:true})
    if(activeWorkers<2)start();else {queuedBytes+=bytes;workerQueue.push(start)}
  })
}

/** 在线资料和题库解析在受限工作线程中执行，超时/取消会终止线程。 */
export async function extractPdfTextAsync(input,{signal,timeoutMs=20_000,limits={}}={}) {
  const bytes=asBuffer(input)
  if(bytes.length>(limits.inputBytes??PDF_LIMITS.inputBytes))throw limitError('文件过大')
  return withTimeout(async(signal)=>{
    const release=await acquireWorker(signal,bytes.length)
    try {
      return await new Promise((resolve,reject)=>{
        const worker=new Worker(new URL('./pdf-worker.js',import.meta.url),{workerData:{bytes,limits},
          resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16},
          execArgv:process.execArgv.filter(arg=>!arg.startsWith('--input-type'))})
        let finished=false
        const finish=(error,result)=>{
          if(finished)return
          finished=true
          signal.removeEventListener('abort',stop)
          worker.terminate().then(()=>error?reject(error):resolve(result),()=>error?reject(error):resolve(result))
        }
        const stop=()=>finish(signal.reason)
        worker.once('message',(message)=>finish(message.error?Object.assign(new Error(message.error.message),{code:message.error.code}):null,message.result))
        worker.once('error',(error)=>finish(error.code==='ERR_WORKER_OUT_OF_MEMORY'?limitError('工作线程内存用量过大'):error))
        worker.once('exit',()=>finish(new Error('PDF解析线程提前结束')))
        signal.addEventListener('abort',stop,{once:true})
        if(signal.aborted)stop()
      })
    } finally {release()}
  },{signal,timeoutMs,message:'PDF解析超时，已终止读取，请更换资料或简化文件'})
}

export function extractPdfText(input,limits={}) {
  const bytes = asBuffer(input)
  const budget={limits:{...PDF_LIMITS,...limits},expanded:0,decoded:new Map()}
  if(bytes.length>budget.limits.inputBytes)throw limitError('文件过大')
  if (bytes.length < 8 || latin1(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error('文件不是有效的 PDF（缺少 %PDF- 头）')
  }
  const source = latin1(bytes)
  // 带有 /Encrypt 的文档可能是“仅限制权限”的空口令加密：不直接拒绝，
  // 先尝试提取，提取不到时再如实说明原因。
  const encrypted = /\/Encrypt\s/.test(source)

  const warnings = []
  const objects = scanObjects(source,budget)
  expandObjectStreams(source, objects, warnings,budget)

  const fontMapGlobal = new Map()
  for (const body of objects.values()) {
    collectFontsFromDict(source, objects, body, fontMapGlobal,budget)
  }

  const pages = orderedPages(objects,budget)

  const chunks = []
  let characters=0
  const append=(text)=>{
    characters+=text.length
    if(characters>budget.limits.textChars)throw limitError('提取文本过长')
    if(text.trim())chunks.push(text.trim())
  }
  if (pages.length) {
    for (const [num, body] of pages) {
      try {
        const text = extractPage(source, objects, num, body, fontMapGlobal,budget)
        append(text)
      } catch (error) {
        checkLimit(error)
        warnings.push(`第 ${num} 号页面解析失败：${error.message}`)
      }
    }
  } else {
    // 找不到页面树时，退化为对全部内容流做一次提取。
    warnings.push('未识别到页面树，已退化为整体内容流提取')
    for (const body of objects.values()) {
      const stream = decodeStreamFromBody(source, body,budget)
      if (!stream || !/BT[\s\S]*ET/.test(stream)) continue
      const text = renderTextOperators(stream, fontMapGlobal)
      append(text)
    }
  }

  const text = chunks.join('\n\n')
  if (!text.trim()) {
    throw new Error(encrypted
      ? '该 PDF 带有加密或权限保护，无法提取文本层；请解除保护后再导入，或改用 Markdown'
      : 'PDF 中没有可提取的文本层（很可能是扫描版/图片型 PDF，需要 OCR 后才能导入）')
  }
  if (encrypted) warnings.push('该 PDF 带加密/权限保护，文本为尽力提取的结果，请务必在预览中核对')
  return { text, pages: pages.length || chunks.length, warnings }
}

function orderedPages(objects,budget) {
  const catalog=[...objects.values()].find((body)=>/\/Type\s*\/Catalog\b/.test(body))
  const rootValue=catalog?findDictValue(catalog,'Pages'):''
  let root=Number(/^(\d+)\s+\d+\s+R/.exec(rootValue)?.[1])
  if(!root)root=[...objects.entries()].find(([,body])=>/\/Type\s*\/Pages\b/.test(body)&&!/\/Parent\b/.test(body))?.[0]
  if(!root) {
    if([...objects.values()].some(body=>/\/Type\s*\/Page\b/.test(body)))throw new Error('PDF页树缺失，无法确认正确页序')
    return []
  }
  const pages=[],visited=new Set()
  const walk=(num,depth=0)=>{
    if(depth>budget.limits.depth)throw limitError('页树嵌套过深')
    if(visited.has(num))throw new Error('PDF页树存在循环或重复引用')
    visited.add(num)
    const body=objects.get(num)
    if(!body)throw new Error('PDF页树引用了不存在的对象')
    if(/\/Type\s*\/Page\b/.test(body)){
      pages.push([num,body])
      if(pages.length>budget.limits.pages)throw limitError('页数过多')
      return
    }
    if(!/\/Type\s*\/Pages\b/.test(body))throw new Error('PDF页树节点无效')
    const value=findDictValue(body,'Kids')
    const kids=value.trim().startsWith('[')?value:resolveRef(objects,value)
    if(!kids?.trim().startsWith('['))throw new Error('PDF页树缺少有效的Kids列表')
    for(const ref of kids.matchAll(/(\d+)\s+\d+\s+R/g))walk(Number(ref[1]),depth+1)
  }
  walk(root)
  if(!pages.length)throw new Error('PDF页树没有可读取的页面')
  return pages
}

function scanObjects(source,budget) {
  const map = new Map()
  const pattern = /(?:^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g
  let match
  while ((match = pattern.exec(source))) {
    const num = Number(match[1])
    const bodyStart = pattern.lastIndex
    const endIndex = source.indexOf('endobj', bodyStart)
    if (endIndex < 0) break
    const body = source.slice(bodyStart, endIndex)
    map.set(num, body)
    if(map.size>budget.limits.objects)throw limitError('对象数量过多')
    pattern.lastIndex = endIndex + 'endobj'.length
  }
  return map
}

function expandObjectStreams(source, objects, warnings,budget) {
  const stmObjects = [...objects.entries()].filter(([, body]) => /\/Type\s*\/ObjStm/.test(body))
  for (const [, body] of stmObjects) {
    try {
      const stream = decodeStreamFromBody(source, body,budget)
      if (!stream) continue
      const count = Number((/\/N\s+(\d+)/.exec(body) || [])[1] || 0)
      if(count>budget.limits.objects)throw limitError('对象流声明的对象数量过多')
      const first = Number((/\/First\s+(\d+)/.exec(body) || [])[1] || 0)
      if (!count || !first) continue
      const header = stream.slice(0, first).trim().split(/\s+/).map(Number)
      const payload = stream.slice(first)
      for (let index = 0; index < count; index += 1) {
        const num = header[index * 2]
        const offset = header[index * 2 + 1]
        const next = header[(index + 1) * 2 + 1]
        if (!Number.isFinite(num) || !Number.isFinite(offset)) continue
        const end = Number.isFinite(next) ? next : payload.length
        if (!objects.has(num)) objects.set(num, payload.slice(offset, end))
        if(objects.size>budget.limits.objects)throw limitError('展开后的对象数量过多')
      }
    } catch (error) {
      checkLimit(error)
      warnings.push(`对象流展开失败：${error.message}`)
    }
  }
}

function decodeStreamFromBody(source, body,budget) {
  if(budget.decoded.has(body))return budget.decoded.get(body)
  const dictEnd = body.indexOf('stream')
  if (dictEnd < 0) return null
  const dict = body.slice(0, dictEnd)
  let start = dictEnd + 'stream'.length
  if (body[start] === '\r') start += 1
  if (body[start] === '\n') start += 1
  let end = body.lastIndexOf('endstream')
  if (end < 0) end = body.length
  let raw = Buffer.from(body.slice(start, end), 'latin1')
  while (raw.length && (raw[raw.length - 1] === 0x0a || raw[raw.length - 1] === 0x0d)) {
    raw = raw.subarray(0, raw.length - 1)
  }
  const text=applyFilters(raw, dict,budget)
  budget.decoded.set(body,text)
  return text
}

function applyFilters(raw, dict,budget) {
  const filterMatch = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)
  if (!filterMatch) {consume(raw.length,budget);return raw.toString('latin1')}
  const names = (filterMatch[1].match(/\/\w+/g) || []).map((name) => name.slice(1))
  if(!names.length)consume(raw.length,budget)
  let data = raw
  for (const name of names) {
    if (name === 'FlateDecode' || name === 'Fl') {
      try {
        data = inflateAny(data,budget)
      } catch (error) {
        checkLimit(error)
        // 加密或损坏的流：跳过这一条，不影响其它页面。
        return null
      }
    } else if (name === 'ASCIIHexDecode' || name === 'AHx') {
      data = Buffer.from(data.toString('latin1').replace(/[^0-9A-Fa-f]/g, ''), 'hex')
    } else {
      return null
    }
    consume(data.length,budget)
  }
  return data.toString('latin1')
}

function inflateAny(data,budget) {
  const remaining=Math.min(budget.limits.streamBytes,budget.limits.totalStreamBytes-budget.expanded)
  if(remaining<1)throw limitError('内容流展开总量过大')
  const options={maxOutputLength:remaining}
  try {
    return inflateSync(data,options)
  } catch (error) {
    if(error.code==='ERR_BUFFER_TOO_LARGE')throw limitError('压缩内容流展开过大')
    try {
      return inflateRawSync(data,options)
    } catch (error) {
      if(error.code==='ERR_BUFFER_TOO_LARGE')throw limitError('压缩内容流展开过大')
      try{return inflateSync(data, { ...options,finishFlush: 2 })}
      catch(error){if(error.code==='ERR_BUFFER_TOO_LARGE')throw limitError('压缩内容流展开过大');throw error}
    }
  }
}

function resolveRef(objects, value) {
  const match = /^\s*(\d+)\s+\d+\s+R/.exec(value || '')
  if (!match) return null
  return objects.get(Number(match[1])) || null
}

function findDictValue(body, key) {
  const index = body.indexOf(`/${key}`)
  if (index < 0) return ''
  let cursor = index + key.length + 1
  while (cursor < body.length && WHITESPACE.has(body.charCodeAt(cursor))) cursor += 1
  if (body[cursor] === '[') {
    let depth = 0
    let end = cursor
    for (; end < body.length; end += 1) {
      if (body[end] === '[') depth += 1
      else if (body[end] === ']') {
        depth -= 1
        if (depth === 0) { end += 1; break }
      }
    }
    return body.slice(cursor, end)
  }
  if (body[cursor] === '<' && body[cursor + 1] === '<') {
    let depth = 0
    let end = cursor
    for (; end < body.length; end += 1) {
      if (body[end] === '<' && body[end + 1] === '<') { depth += 1; end += 1 } else if (body[end] === '>' && body[end + 1] === '>') {
        depth -= 1
        end += 1
        if (depth === 0) { end += 1; break }
      }
    }
    return body.slice(cursor, end)
  }
  const end = body.indexOf('\n', cursor)
  return body.slice(cursor, end < 0 ? body.length : end).trim()
}

function collectFontsFromDict(source, objects, body, target,budget) {
  const fontDict = findDictValue(body, 'Font')
  if (!fontDict) return
  const refs = fontDict.match(/\/([A-Za-z0-9#_.-]+)\s+(\d+)\s+\d+\s+R/g) || []
  for (const entry of refs) {
    const match = /\/([A-Za-z0-9#_.-]+)\s+(\d+)\s+\d+\s+R/.exec(entry)
    if (!match) continue
    const name = match[1]
    if (target.has(name)) continue
    const fontBody = objects.get(Number(match[2]))
    if (!fontBody) continue
    const cmap = readToUnicode(source, objects, fontBody,budget)
    if (cmap) target.set(name, cmap)
  }
}

function readToUnicode(source, objects, fontBody,budget) {
  const value = findDictValue(fontBody, 'ToUnicode')
  const refMatch = /(\d+)\s+\d+\s+R/.exec(value || '')
  if (!refMatch) return null
  const cmapBody = objects.get(Number(refMatch[1]))
  if (!cmapBody) return null
  const stream = decodeStreamFromBody(source, cmapBody,budget)
  if (!stream) return null
  return parseCMap(stream)
}

function hexToCode(hex) {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '')
  if (!clean) return null
  return { code: Number.parseInt(clean, 16), bytes: Math.max(1, clean.length / 2) }
}

function codeToUnicode(hex) {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '')
  if (!clean) return ''
  const buffer = Buffer.from(clean.length % 4 ? clean.padStart(Math.ceil(clean.length / 4) * 4, '0') : clean, 'hex')
  // UTF-16BE 常见于 CMap 目标值
  let out = ''
  for (let index = 0; index + 1 < buffer.length; index += 2) {
    out += String.fromCharCode(buffer.readUInt16BE(index))
  }
  return out
}

function parseCMap(text) {
  const map = new Map()
  let codeBytes = 2
  for (const block of text.match(/beginbfchar([\s\S]*?)endbfchar/g) || []) {
    const pairs = block.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) || []
    for (const pair of pairs) {
      const [src, dst] = pair.match(/<([0-9A-Fa-f]+)>/g).map((item) => item.slice(1, -1))
      const parsed = hexToCode(src)
      if (!parsed) continue
      codeBytes = parsed.bytes
      map.set(parsed.code, codeToUnicode(dst))
    }
  }
  for (const block of text.match(/beginbfrange([\s\S]*?)endbfrange/g) || []) {
    const rows = block.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g) || []
    for (const row of rows) {
      const match = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/.exec(row)
      if (!match) continue
      const lo = hexToCode(match[1])
      const hi = hexToCode(match[2])
      if (!lo || !hi) continue
      codeBytes = lo.bytes
      if (match[3].startsWith('[')) {
        const targets = match[3].match(/<[0-9A-Fa-f]+>/g) || []
        targets.forEach((target, offset) => {
          map.set(lo.code + offset, codeToUnicode(target.slice(1, -1)))
        })
      } else {
        const base = match[3].slice(1, -1)
        const baseBuffer = Buffer.from(base.length % 4 ? base.padStart(Math.ceil(base.length / 4) * 4, '0') : base, 'hex')
        for (let code = lo.code; code <= hi.code && code - lo.code < 65536; code += 1) {
          const copy = Buffer.from(baseBuffer)
          if (copy.length >= 2) {
            copy.writeUInt16BE((copy.readUInt16BE(copy.length - 2) + (code - lo.code)) & 0xffff, copy.length - 2)
          }
          let out = ''
          for (let index = 0; index + 1 < copy.length; index += 2) out += String.fromCharCode(copy.readUInt16BE(index))
          map.set(code, out)
        }
      }
    }
  }
  if (!map.size) return null
  return { map, codeBytes }
}

function extractPage(source, objects, pageNum, pageBody, globalFonts,budget) {
  const fontMap = new Map(globalFonts)
  collectFontsFromDict(source, objects, pageBody, fontMap,budget)
  const resourcesValue = findDictValue(pageBody, 'Resources')
  const resourcesBody = /^\s*\d+\s+\d+\s+R/.test(resourcesValue)
    ? resolveRef(objects, resourcesValue)
    : resourcesValue
  if (resourcesBody) collectFontsFromDict(source, objects, resourcesBody, fontMap,budget)

  const contentValue = findDictValue(pageBody, 'Contents')
  const contentRefs = contentValue.match(/\d+\s+\d+\s+R/g) || []
  const texts = []
  for (const ref of contentRefs) {
    const num = Number(ref.split(/\s+/)[0])
    const contentBody = objects.get(num)
    if (!contentBody) continue
    const stream = decodeStreamFromBody(source, contentBody,budget)
    if (!stream) continue
    texts.push(renderTextOperators(stream, fontMap))
  }
  if (!texts.length) return ''
  return texts.join('\n')
}

function decodePdfString(raw, font) {
  if (raw.startsWith('<')) {
    const hex = raw.slice(1, -1).replace(/[^0-9A-Fa-f]/g, '')
    if (font && font.map) {
      let out = ''
      const step = font.codeBytes * 2
      for (let index = 0; index + step <= hex.length; index += step) {
        const code = Number.parseInt(hex.slice(index, index + step), 16)
        out += font.map.get(code) ?? ''
      }
      return out
    }
    if (hex.length >= 4 && /^feff/i.test(hex)) return codeToUnicode(hex.slice(4))
    let out = ''
    for (let index = 0; index + 1 < hex.length; index += 2) out += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16))
    return out
  }

  const body = raw.slice(1, -1)
  const bytes = []
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char !== '\\') {
      bytes.push(char.charCodeAt(0))
      continue
    }
    index += 1
    const next = body[index]
    if (next === 'n') bytes.push(0x0a)
    else if (next === 'r') bytes.push(0x0d)
    else if (next === 't') bytes.push(0x09)
    else if (next === 'b') bytes.push(0x08)
    else if (next === 'f') bytes.push(0x0c)
    else if (next === '(' || next === ')' || next === '\\') bytes.push(next.charCodeAt(0))
    else if (/[0-7]/.test(next || '')) {
      let octal = next
      while (octal.length < 3 && /[0-7]/.test(body[index + 1] || '')) {
        octal += body[index + 1]
        index += 1
      }
      bytes.push(Number.parseInt(octal, 8) & 0xff)
    } else if (next === '\n') { /* 续行 */ } else if (next !== undefined) bytes.push(next.charCodeAt(0))
  }

  if (font && font.map) {
    const { codeBytes } = font
    let out = ''
    if (codeBytes === 2) {
      for (let index = 0; index + 1 < bytes.length; index += 2) {
        out += font.map.get((bytes[index] << 8) | bytes[index + 1]) ?? ''
      }
    } else {
      for (const byte of bytes) out += font.map.get(byte) ?? ''
    }
    return out
  }
  return Buffer.from(bytes).toString('latin1')
}

function renderTextOperators(content, fontMap) {
  const tokens = tokenizeContent(content)
  let currentFont = null
  let output = ''
  let lastY = null
  let pendingSpace = false

  const flushLine = () => {
    if (!output.endsWith('\n') && output.trim()) output += '\n'
  }

  for (const token of tokens) {
    if (token.type === 'font') {
      currentFont = fontMap.get(token.name) || null
    } else if (token.type === 'string') {
      const text = decodePdfString(token.value, currentFont)
      if (pendingSpace && output && !/\s$/.test(output)) output += ' '
      output += text
      pendingSpace = false
    } else if (token.type === 'newline') {
      flushLine()
      pendingSpace = false
    } else if (token.type === 'move') {
      if (lastY !== null && Math.abs(token.y - lastY) > 0.5) flushLine()
      lastY = token.y
    } else if (token.type === 'space') {
      pendingSpace = true
    }
  }
  return output.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ')
}

function tokenizeContent(content) {
  const tokens = []
  let index = 0
  const length = content.length
  while (index < length) {
    const char = content[index]
    if (char === '(') {
      let depth = 1
      let cursor = index + 1
      while (cursor < length && depth > 0) {
        if (content[cursor] === '\\') { cursor += 2; continue }
        if (content[cursor] === '(') depth += 1
        else if (content[cursor] === ')') depth -= 1
        cursor += 1
      }
      tokens.push({ type: 'string', value: content.slice(index, cursor) })
      index = cursor
      continue
    }
    if (char === '<' && content[index + 1] !== '<') {
      const end = content.indexOf('>', index)
      if (end > index) {
        tokens.push({ type: 'string', value: content.slice(index, end + 1) })
        index = end + 1
        continue
      }
    }
    if (char === '[') {
      // TJ 数组：逐个字符串累积，数组内的正数位移表示间隙
      let cursor = index + 1
      let text = ''
      let gap = false
      while (cursor < length && content[cursor] !== ']') {
        if (content[cursor] === '(') {
          let depth = 1
          let inner = cursor + 1
          while (inner < length && depth > 0) {
            if (content[inner] === '\\') { inner += 2; continue }
            if (content[inner] === '(') depth += 1
            else if (content[inner] === ')') depth -= 1
            inner += 1
          }
          tokens.push({ type: 'string', value: content.slice(cursor, inner) })
          cursor = inner
          continue
        }
        if (content[cursor] === '<') {
          const end = content.indexOf('>', cursor)
          if (end > cursor) {
            tokens.push({ type: 'string', value: content.slice(cursor, end + 1) })
            cursor = end + 1
            continue
          }
        }
        const numberMatch = /^-?\d+(?:\.\d+)?/.exec(content.slice(cursor, cursor + 12))
        if (numberMatch) {
          if (Number(numberMatch[0]) < -150) gap = true
          cursor += numberMatch[0].length
          continue
        }
        cursor += 1
      }
      if (gap) tokens.push({ type: 'space' })
      index = cursor + 1
      continue
    }
    const commandMatch = /^(Tf|Td|TD|Tm|T\*|TJ|Tj|'|"|BT|ET|TL)\b/.exec(content.slice(index, index + 4))
    if (commandMatch) {
      const command = commandMatch[1]
      const back = content.slice(Math.max(0, index - 40), index)
      const numbers = back.match(/-?\d+(?:\.\d+)?/g) || []
      if (command === 'Tf') {
        const nameMatch = /(\/[A-Za-z0-9#_.-]+)\s*[\d.]+\s*$/.exec(back)
        if (nameMatch) tokens.push({ type: 'font', name: nameMatch[1].slice(1) })
      } else if (command === 'Td' || command === 'TD') {
        const y = numbers.length >= 2 ? Number(numbers[numbers.length - 1]) : 0
        tokens.push({ type: 'move', y })
        if (y < 0) tokens.push({ type: 'newline' })
      } else if (command === 'Tm') {
        const y = numbers.length >= 6 ? Number(numbers[numbers.length - 1]) : 0
        tokens.push({ type: 'move', y })
      } else if (command === 'T*') {
        tokens.push({ type: 'newline' })
      } else if (command === "'" || command === '"') {
        tokens.push({ type: 'newline' })
      } else if (command === 'ET') {
        tokens.push({ type: 'newline' })
      }
      index += command.length
      continue
    }
    index += 1
  }
  return tokens
}
