import { parentPort,workerData } from 'node:worker_threads'
import { extractPdfText } from './pdf.js'

try {parentPort.postMessage({result:extractPdfText(workerData.bytes,workerData.limits)})}
catch(error){parentPort.postMessage({error:{message:error.message,code:error.code}})}
