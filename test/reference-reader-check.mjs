import assert from 'node:assert/strict'
import { allowedReferenceUrl, articleBody, articleImages, readReferencePage, recognisePaperImages, downloadReference,decodeReferenceText } from '../lib/reference-reader.js'
import { generateText } from '../lib/llm-json.js'
import { loadCuratedOutline, checkedCs408Text, CS408_OUTLINE_URL, CS408_COMPARISON_URL } from '../lib/reference-sources.js'

for (const url of ['http://neea.edu.cn/a','https://eol.cn.evil.test/a','https://127.0.0.1/a','https://eol.cn:444/a','https://user:secret@eol.cn/a',
  'https://raw.githubusercontent.com/another/repository/main/a','https://raw.githubusercontent.com/DzmingLi/kaoyan-math-official-resources-evil/a']) assert.equal(allowedReferenceUrl(url),false,url)
assert(allowedReferenceUrl('https://kaoyan.eol.cn/a'))
assert.equal(decodeReferenceText({bytes:Buffer.from([0xd6,0xd0,0xce,0xc4]),charset:'gb2312'}),'中文')
assert.equal(decodeReferenceText({bytes:Buffer.from('<meta charset="gbk">'+String.fromCharCode(0xd6,0xd0,0xce,0xc4),'latin1')}),'<meta charset="gbk">中文')
assert.throws(()=>decodeReferenceText({bytes:Buffer.from('text'),charset:'imaginary-codec'}),/编码不受支持/)
await assert.rejects(downloadReference('https://127.0.0.1/'),/允许/)
const html='<html>广告<img src="https://evil.test/x.jpg"><div class=TRS_Editor><p>试卷正文</p><img src="./page1.jpg"><img src="https://evil.test/x.jpg"></div><footer>页脚</footer></html>'
assert(!articleBody(html).includes('广告'))
assert.deepEqual(articleImages(html,'https://kaoyan.eol.cn/a/index.shtml'),['https://kaoyan.eol.cn/a/page1.jpg'])
const plain='设 $0 < x < 1$，且 $a > 0$，求极限。'
assert.equal((await readReferencePage({ctx:{get:()=>({fetch:async()=>({body:{kind:'text',content:plain}})})},source:{url:'https://neea.edu.cn/a',title:'测试'}})).text,plain)
await assert.rejects(recognisePaperImages({ctx:{get:()=>undefined},urls:[],title:'测试'}),/附件服务/)
await assert.rejects(recognisePaperImages({ctx:{get:n=>({attachments:{saveImage(){}},llm:{resolveModelInfo:async()=>({inputModalities:['text']})},agentDefaultModel:{currentSelection:()=>({provider:'p',model:'m'})}}[n])},urls:[],title:'测试'}),/不支持图片/)
await assert.rejects(recognisePaperImages({ctx:{get:n=>({attachments:{saveImage(){}},llm:{resolveModelInfo:async()=>({inputModalities:['image']})},agentDefaultModel:{currentSelection:()=>({provider:'p',model:'m'})}}[n])},urls:Array(13).fill('https://eol.cn/a.png'),title:'2024年408真题'}),/超过12张/)
let call
const ctx={get:n=>({agentDefaultModel:{currentSelection:()=>({provider:'p',model:'m',reasoningEffort:'max'})},llm:{async *stream(options){call=options;yield{type:'text-delta',text:'ok'}}}}[n])}
const ref={attachmentId:'test',mediaType:'image/png',width:10,height:10,bytes:10}
await generateText(ctx,{prompt:'读取',images:[ref],reasoningEffort:'off',maxTokens:600})
assert.equal(call.maxTokens,600);assert.equal(call.reasoningEffort,'off');assert.equal(call.messages[0].content[1].attachment,ref)
await generateText(ctx,{prompt:'解题',maxTokens:600})
assert.equal(call.maxTokens,24000);assert.equal(call.reasoningEffort,'max')
const publisher={data:{identity:{isbn:'978-7-04-068404-9'},title:'2027年全国硕士研究生招生考试数学考试大纲',author:'教育部教育考试院'}}
await assert.rejects(loadCuratedOutline({basis:{id:'math1'},latestYear:2027,web:{fetch:async({url})=>({body:{content:url.includes('/api/')?JSON.stringify(publisher):'已被篡改的转录'}})}}),/版本不一致/)
publisher.data.identity.isbn='wrong'
await assert.rejects(loadCuratedOutline({basis:{id:'math1'},latestYear:2027,web:{fetch:async()=>({body:{content:JSON.stringify(publisher)}})}}),/出版社版本核验/)
assert(allowedReferenceUrl(CS408_OUTLINE_URL));assert(allowedReferenceUrl(CS408_COMPARISON_URL))
assert(!allowedReferenceUrl('https://zhenti.beokayy.club/other'))
assert(!allowedReferenceUrl('https://oss-hqwx-video.hqwx.com/another.pdf'))
assert.throws(()=>checkedCs408Text('<article class="outline-document"><header>2026 年计算机学科专业基础408考试大纲</header>正文</article>'),/结构或年份/)
assert.throws(()=>checkedCs408Text('<article class="outline-document"><header>2027 年计算机学科专业基础408考试大纲</header>已篡改正文</article>'),/重新核验/)
await assert.rejects(loadCuratedOutline({basis:{id:'cs408'},latestYear:2027,web:{fetch:async()=>({body:{content:JSON.stringify(publisher)}})}}),/408出版社版本/)
console.log('ok   来源边界、正文定位、公式不等号、视觉能力、图片传递、推理预算及转录完整性校验')
