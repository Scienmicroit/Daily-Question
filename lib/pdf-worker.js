import { parentPort,workerData } from 'node:worker_threads'
import { extractPdfText } from './pdf.js'

try {
  const { bytes, limits, job, page } = workerData
  const result = job
    ? await (await import('./pdf-import-pages.js')).processPdfPages(bytes, job, page)
    : extractPdfText(bytes, limits)
  parentPort.postMessage({ result })
}
catch(error){parentPort.postMessage({error:{message:error.message,code:error.code}})}
