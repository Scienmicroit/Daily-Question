import assert from 'node:assert/strict'
import { deflateSync,deflateRawSync } from 'node:zlib'
import { extractPdfText,extractPdfTextAsync } from '../lib/pdf.js'
import { extractBankPdf } from '../lib/bank.js'
import { pdfDocument,twoPages,stream,page } from './pdf-fixture.mjs'

const expected='FIRST\n\nSECOND'
assert.equal(extractPdfText(pdfDocument(twoPages())).text,expected,'遵循实际页树顺序，而非对象编号')
const nested=twoPages();nested.set(2,'<< /Type /Pages /Count 2 /Kids [6 0 R 3 0 R] >>');nested.set(6,'<< /Type /Pages /Parent 2 0 R /Count 1 /Kids [10 0 R] >>')
assert.equal(extractPdfText(pdfDocument(nested)).text,expected)
const indirect=twoPages();indirect.set(2,'<< /Type /Pages /Count 2 /Kids 8 0 R >>');indirect.set(8,'[10 0 R 3 0 R]')
assert.equal(extractPdfText(pdfDocument(indirect)).text,expected)
const cyclic=twoPages();cyclic.set(2,'<< /Type /Pages /Kids [2 0 R] >>')
assert.throws(()=>extractPdfText(pdfDocument(cyclic)),/循环/)
console.log('ok   PDF页序：实际Kids顺序、嵌套页树、间接Kids数组与循环引用拒绝')

const safe=pdfDocument(twoPages())
for(const limits of [{inputBytes:8},{objects:3},{pages:1},{depth:0},{textChars:8},{streamBytes:10},{totalStreamBytes:40}]) {
  assert.throws(()=>extractPdfText(safe,limits),e=>e.code==='PDF_LIMIT',JSON.stringify(limits))
}
const reused=twoPages();reused.set(3,page(11))
assert.equal(extractPdfText(pdfDocument(reused),{totalStreamBytes:30}).text,'FIRST\n\nFIRST','同一内容流复用时只解码一次')
const expanded=Buffer.from('BT /F1 12 Tf ('+'A'.repeat(8192)+') Tj ET')
for(const [bytes,filters] of [[deflateSync(expanded),'/Filter /FlateDecode'],[deflateRawSync(expanded),'/Filter /FlateDecode'],
  [Buffer.from(deflateSync(expanded).toString('hex')),'/Filter [/ASCIIHexDecode /FlateDecode]']]) {
  const compressed=twoPages();compressed.set(4,stream(bytes.toString('latin1'),filters))
  assert.throws(()=>extractPdfText(pdfDocument(compressed),{streamBytes:1024,totalStreamBytes:4096}),e=>e.code==='PDF_LIMIT','压缩膨胀不能被当成坏页面跳过')
  await assert.rejects(extractPdfTextAsync(pdfDocument(compressed),{limits:{streamBytes:1024,totalStreamBytes:4096}}),e=>e.code==='PDF_LIMIT')
}
const emptyFilters=twoPages();emptyFilters.set(4,stream(expanded.toString(),'/Filter []'))
assert.throws(()=>extractPdfText(pdfDocument(emptyFilters),{streamBytes:1024}),e=>e.code==='PDF_LIMIT')
const objectBomb=twoPages();objectBomb.set(6,stream('7 0 test','/Type /ObjStm /N 1000000 /First 4'))
assert.throws(()=>extractPdfText(pdfDocument(objectBomb)),e=>e.code==='PDF_LIMIT')
const fontBomb=twoPages();fontBomb.set(5,'<< /Type /Font /Subtype /Type0 /ToUnicode 6 0 R >>')
fontBomb.set(6,stream(deflateSync(expanded).toString('latin1'),'/Filter /FlateDecode'))
assert.throws(()=>extractPdfText(pdfDocument(fontBomb),{streamBytes:1024}),e=>e.code==='PDF_LIMIT')
const defaultBomb=twoPages()
defaultBomb.set(4,stream(deflateSync(Buffer.alloc(8*1024*1024+1,65)).toString('latin1'),'/Filter /FlateDecode'))
await assert.rejects(extractPdfTextAsync(pdfDocument(defaultBomb)),e=>e.code==='PDF_LIMIT','生产默认上限拦截小文件展开为超过8MiB的内容流')

assert.equal((await extractPdfTextAsync(safe)).text,expected)
assert.equal((await extractBankPdf(safe,'顺序测试.pdf')).text,expected,'题库调用受限异步解析且保持页序')
const controller=new AbortController()
const cancelled=extractPdfTextAsync(safe,{signal:controller.signal});controller.abort(new Error('取消PDF读取'))
await assert.rejects(cancelled,/取消PDF读取/)
await assert.rejects(extractPdfTextAsync(safe,{timeoutMs:1}),/PDF解析超时/)
const waitingController=new AbortController()
const first=extractPdfTextAsync(safe),second=extractPdfTextAsync(safe),queued=extractPdfTextAsync(safe,{signal:waitingController.signal})
const rejected=assert.rejects(queued,/取消排队/)
await new Promise(r=>setImmediate(r));waitingController.abort(new Error('取消排队'))
await Promise.all([first,second,rejected])
assert.equal((await extractPdfTextAsync(safe)).text,expected,'超时或取消后线程名额可以继续使用')
const burst=await Promise.allSettled(Array.from({length:12},()=>extractPdfTextAsync(safe)))
assert(burst.some(result=>result.status==='rejected'&&result.reason.code==='PDF_LIMIT'),'并发工作线程和排队文件数量有界')
assert.equal((await extractPdfTextAsync(safe)).text,expected,'排队达到限制后仍能恢复使用')
console.log('ok   PDF资源边界：单流/累计展开、过滤链、对象流、字体、页数、文本量、工作线程超时/取消及排队恢复')
