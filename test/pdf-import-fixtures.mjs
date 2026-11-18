import { deflateSync } from 'node:zlib'
import { PNG } from 'pngjs'
import { renderPdfImportPage } from '../lib/pdf.js'
import { pdfDocument, stream } from './pdf-fixture.mjs'

export const firstPage = [
  '1. Differentiate f(x) = x squared at x = 1.',
  'A. 1', 'B. 2', 'C. 3', 'D. 4', 'Answer: B',
]
export const secondPage = [
  '2. Compute the limit of sin(x)/x as x approaches zero.',
  'A. 1', 'B. 0', 'C. 2', 'D. 4', 'Answer: A',
]

export function makeImportPdf(pages) {
  const objects = new Map([[1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']])
  const children = pages.map((page, index) => {
    const id = 4 + index * 3
    const resources = page.raster ? `/XObject << /Scan ${id + 2} 0 R >>` : '/Font << /F1 3 0 R >>'
    objects.set(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 640] /Resources << ${resources} >> /Contents ${id + 1} 0 R >>`)
    if (page.raster) {
      const { width, height, data } = page.raster
      const gray = Buffer.alloc(width * height)
      for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4]
      objects.set(id + 1, stream('q 480 0 0 640 0 0 cm /Scan Do Q'))
      objects.set(id + 2, stream(deflateSync(gray).toString('latin1'),
        `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`))
    } else {
      const lines = page.lines.map((line) => `(${line.replace(/[\\()]/g, '\\$&')}) Tj T*`).join('\n')
      objects.set(id + 1, stream(`BT /F1 15 Tf 23 TL 35 585 Td\n${lines}\nET`))
    }
    return `${id} 0 R`
  })
  objects.set(2, `<< /Type /Pages /Count ${pages.length} /Kids [${children.join(' ')}] >>`)
  return pdfDocument(objects)
}

export async function pdfImportFixtures() {
  const raster = PNG.sync.read(Buffer.from(await renderPdfImportPage(makeImportPdf([{ lines: secondPage }]), 1)))
  return {
    scanned: makeImportPdf([{ raster }]),
    mixed: makeImportPdf([{ lines: firstPage }, { raster }]),
  }
}
