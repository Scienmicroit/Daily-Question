import { BANK_PDF_BYTES, BANK_TEXT_LIMIT } from '../lib/import-limits.js'

export const STUDY_FILE_ACCEPT = '.pdf,.txt,.md,.markdown'

async function readImport(file, pdfLimit, textLimit) {
  const isPdf = /\.pdf$/i.test(file.name)
  if (!isPdf && !/\.(txt|md|markdown)$/i.test(file.name)) {
    throw new Error('请选择文本型 PDF、TXT 或 Markdown 文件')
  }
  if (file.size === 0) throw new Error('文件为空，请选择有内容的文件')
  if (file.size > (isPdf ? pdfLimit : textLimit)) {
    const max = isPdf ? pdfLimit : textLimit
    const limit = max >= 1024 * 1024 ? `${max / (1024 * 1024)} MB` : `${max / 1024} KB`
    throw new Error(`文件过大（上限 ${limit}），请精简后重试`)
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败，请重试'))
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(isPdf ? { kind: 'pdf', base64: result.slice(result.indexOf(',') + 1) }
        : { kind: 'md', text: result })
    }
    if (isPdf) reader.readAsDataURL(file)
    else reader.readAsText(file, 'utf-8')
  })
}

export function readBankFile(file) {
  return readImport(file, BANK_PDF_BYTES, BANK_TEXT_LIMIT)
}

export async function readStudyFile(file) {
  return { fileName: file.name, ...await readImport(file, 16 * 1024 * 1024, 512 * 1024) }
}
