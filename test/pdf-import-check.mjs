import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { Store } from '../lib/store.js'
import { DailyQuestionService } from '../lib/service.js'
import { readPdfImportPages } from '../lib/pdf.js'
import { pdfImportFixtures } from './pdf-import-fixtures.mjs'

const fixtures = await pdfImportFixtures()
assert.deepEqual((await readPdfImportPages(fixtures.scanned)).map((page) => Boolean(page.text)), [false])
assert.deepEqual((await readPdfImportPages(fixtures.mixed)).map((page) => Boolean(page.text)), [true, false])

let calls = 0
let reviews = 0
let fail = false
const images = new Map()
const host = {
  agentDefaultModel: { currentSelection: () => ({ provider: 'test-dsh', model: 'vision' }) },
  attachments: {
    async saveImage({ data, mediaType, name }) {
      assert.equal(mediaType, 'image/png')
      const png = PNG.sync.read(Buffer.from(data))
      assert(png.data.some((value) => value < 50), '实际渲染出扫描图上的深色笔画')
      const attachment = { attachmentId: name }
      images.set(name, attachment)
      return attachment
    },
  },
  llm: {
    async resolveModelInfo() { return { inputModalities: ['text', 'image'] } },
    async *stream({ provider, model, messages }) {
      assert.equal(provider, 'test-dsh')
      assert.equal(model, 'vision')
      const attachment = messages[0].content.find((block) => block.type === 'image')?.attachment
      if (!attachment) {
        reviews++
        const { source, preferredType, year, filename } = JSON.parse(messages[0].content[0].text)
        assert(source.includes('Compute the limit'))
        if (year) {
          yield { type: 'text-delta', text: JSON.stringify({ complete: true, sections: [{ type: preferredType, quote: 'Compute the limit of sin(x)/x.' }] }) }
        } else if (filename === 'syllabus.pdf') {
          yield { type: 'text-delta', text: JSON.stringify({ complete: true, excerpts: ['Compute the limit of sin(x)/x.'] }) }
        } else {
          yield { type: 'text-delta', text: JSON.stringify({ complete: true, items: [
            { type: 'single', stem: 'Compute the limit of sin(x)/x.', options: [{ key: 'A', text: '1' }, { key: 'B', text: '0' }],
              answer: 'A', answerEvidence: '答案：A', answerKey: 'A' },
          ] }) }
        }
        return
      }
      calls++
      assert.equal(attachment, images.get(attachment?.attachmentId))
      yield { type: 'text-delta', text: JSON.stringify(fail ? { status: 'failed', text: '' } : {
        status: 'complete', text: '## 第 2 题\nCompute the limit of sin(x)/x.\n\nA. 1\nB. 0\nC. 2\nD. 4\n\n答案：A',
      }) }
    },
  },
}
const dir = await mkdtemp(join(tmpdir(), 'dq-pdf-import-'))
const service = new DailyQuestionService({ get: (name) => host[name] })
service.store = new Store(dir)
try {
  for (const [name, bytes] of Object.entries(fixtures)) {
    const args = { kind: 'pdf', base64: bytes.toString('base64'), fileName: name + '.pdf', subjectId: 'math1' }
    const expectedSources = name === 'mixed' ? ['text', 'ocr'] : ['ocr']
    const before = calls
    const reviewsBefore = reviews
    const bank = await service.importBank(args)
    const syllabus = await service.previewStudyImport({ ...args, fileName: 'syllabus.pdf', document: 'syllabus' })
    const paper = await service.previewStudyImport({ ...args, document: 'pastPaper', year: 2025, type: 'single' })
    for (const preview of [bank, syllabus, paper]) {
      assert.deepEqual(preview.pages.map((page) => page.source), expectedSources, JSON.stringify(preview.pages.map((page) => page.reason)))
      assert(preview.pages.at(-1).text.includes('Compute the limit'))
    }
    assert.equal(calls - before, 3, '每份文件只调用一次 OCR，对有文字的页直接提取')
    assert.equal(reviews - reviewsBefore, 3, '每份 PDF 提取后还会由模型通读整份正文')
    const previous = await service.exportBackup()
    await service.commitBank({ importId: bank.importId, subjectId: 'math1' })
    await service.commitStudyImport({ importId: syllabus.importId })
    await service.commitStudyImport({ importId: paper.importId })
    const current = await service.exportBackup()
    assert.equal(current.data.banks.length, previous.data.banks.length + 1)
    assert(current.data.syllabuses.math1.text.includes('Compute the limit'))
    assert(current.data.pastPapers[0].text.includes('Compute the limit'))
  }
  fail = true
  const args = { kind: 'pdf', base64: fixtures.mixed.toString('base64'), fileName: 'failure.pdf', subjectId: 'math1' }
  const bank = await service.importBank(args)
  assert(bank.incomplete)
  assert.deepEqual(bank.pages.filter((page) => page.source === 'failed').map((page) => page.page), [2])
  await assert.rejects(service.commitBank({ importId: bank.importId, subjectId: 'math1' }), /页面识别失败/)
  const failedScan = await service.importBank({ ...args, base64: fixtures.scanned.toString('base64') })
  assert.equal(failedScan.usable, 0)
  assert.equal(failedScan.pages[0].source, 'failed', '纯扫描全部失败也返回带页码的预览')
  const preview = await service.previewStudyImport({ ...args, document: 'syllabus' })
  assert.equal(preview.canSave, false)
  assert.equal(preview.importId, null)
  assert.equal(preview.pages[1].page, 2)
  assert.equal(preview.pages[1].source, 'failed')
  await assert.rejects(service.commitStudyImport({ importId: preview.importId }), /预览已失效/)
} finally {
  await rm(dir, { recursive: true, force: true })
}
