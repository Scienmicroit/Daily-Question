import { PDFiumLibrary } from '@hyzyla/pdfium'
import { PNG } from 'pngjs'

export async function processPdfPages(bytes, job, pageNumber) {
  const library = await PDFiumLibrary.init()
  try {
    const document = await library.loadDocument(bytes)
    try {
      const count = document.getPageCount()
      if (!count || count > 1000) throw new Error('PDF 页数无效或超过 1000 页')
      if (job === 'render') {
        const page = document.getPage(pageNumber - 1)
        const { originalWidth, originalHeight } = page.getOriginalSize()
        const longest = Math.max(originalWidth, originalHeight)
        if (!Number.isFinite(longest) || longest <= 0) throw new Error('页面尺寸无效')
        const image = await page.render({
          scale: 2000 / longest,
          colorSpace: 'Gray',
          transparent: false,
          render: async ({ data, width, height }) => PNG.sync.write(
            { data: Buffer.from(data), width, height },
            { inputColorType: 0, colorType: 0, inputHasAlpha: false }
          ),
        })
        return image.data
      }
      let characters = 0
      return Array.from({ length: count }, (_, index) => {
        let text = ''
        try { text = document.getPage(index).getText().trim() }
        catch { /* This page will be rendered and sent for recognition instead. */ }
        characters += text.length
        if (characters > 4 * 1024 * 1024) throw new Error('PDF 提取文本超过安全限制')
        return { page: index + 1, text }
      })
    } finally {
      document.destroy()
    }
  } finally {
    library.destroy()
  }
}
