// 手动联网验收使用本机已安装的 DSH 组件；不进入 npm test，也不写正式学习数据。
import { createRequire } from 'node:module'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

export async function liveHost() {
  const dshHome = process.env.DSH_HOME || join(homedir(),'.dsh')
  const profile = process.env.DQ_DSH_PROFILE || join(dshHome,'profiles','web')
  const require = createRequire(join(profile,'package.json'))
  const load = async (name) => import(pathToFileURL(require.resolve('@deepseek-ai/'+name)))
  const models = await load('dsh-llm-deepseek')
  const yaml = require('yaml')
  const credentials = yaml.parse(readFileSync(join(dshHome,'.credentials.yaml'),'utf8'))
  const key = process.env.DEEPSEEK_API_KEY || credentials.refs?.DEEPSEEK_API_KEY
  if (typeof key !== 'string' || !key) throw new Error('未找到本机 DSH 模型凭据')
  const patches = yaml.parse(readFileSync(join(profile,'cordis.patch.yml'),'utf8')) || []
  const selection = patches.find((p) => p.id === 'agent-default-model')?.config
  if (!selection?.model) throw new Error('未读取到宿主默认模型')
  const directory = mkdtempSync(join(tmpdir(),'daily-question-live-'))
  const connection = models.resolveAdapterOptions({})
  const adapter = new models.DeepSeekAdapter({options:()=>connection,
    resolveAuth:async()=>({headers:{'x-api-key':key,authorization:'Bearer '+key}}),
    resolveUserId:()=>randomUUID(),
    prepareExtensions:async()=>({fields:{},accept:async()=>{}})})
  const calls = []
  const llm = {resolveModelInfo:(provider,model,signal)=>adapter.resolveModel(provider,model,signal),async *stream(options) {
    const record={system:options.system.slice(0,90),images:options.messages[0].content.filter((p)=>p.type==='image').length,at:new Date().toISOString()}
    if (options.system.includes('独立解题专家')) {
      record.inputFields=Object.keys(JSON.parse(options.messages[0].content[0].text)).sort()
      assert.deepEqual(record.inputFields,['options','stem'],'真实盲解请求不得包含答案、解析或其他上下文')
    }
    calls.push(record)
    console.log('模型调用',calls.length,record.system.slice(0,35),record.images?'图片 '+record.images:'')
    let text = ''
    try { for await (const chunk of adapter.stream(options)) { if(chunk.type==='text-delta')text+=chunk.text; yield chunk } record.text=text }
    catch(error){record.error=error.message;throw error}
    finally {writeFileSync(join(directory,'calls.json'),JSON.stringify(calls,null,2))}
  }}
  console.log('验收目录',directory,'默认模型',selection.model)
  return {ctx:{get:(name)=>({llm,agentDefaultModel:{currentSelection:()=>selection}}[name])},directory,calls}
}
