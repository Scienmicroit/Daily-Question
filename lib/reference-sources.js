import { createHash } from 'node:crypto'
import { downloadReference } from './reference-reader.js'

// 固定已审校的转录版本；升级年份时必须重新与该版原书核对，不能自动追随 main。
const COMMIT = '6fbc88aeb0d01592dcb41839563853e5e8a4c049'
const FILES = [
  ['高等数学','881191e277cc0bbcc5448137e57ec28742e5b52e701092c9c8aaccc953cb720b'],
  ['线性代数','a18f9edc7e2e44f263824e892f72f4c96e6656e64ef8cce26737fed582dc1d5a'],
  ['概率论与数理统计','fdbc3f85949ae8c1b1fd7eb896f4394b622afe8cdc163554b3e8eacdeab9d983'],
]
export const MATH1_PAPERS = [
  {year:2025,title:'2025年考研301数学（一）真题及答案',url:'https://kaoyan.eol.cn/shiti/shuxue/202508/t20250828_2686951.shtml'},
  {year:2024,title:'2024年考研数学（一）真题及答案解析（完整版）',url:'https://kaoyan.eol.cn/shiti/shuxue/202312/t20231226_2551143.shtml'},
]
export const CS408_PAPERS = [
  {year:2024,title:'2024年考研408计算机学科专业基础综合真题',url:'https://kaoyan.eol.cn/shiti/zhuanyeke/202508/t20250828_2687042.shtml'},
  {year:2023,title:'2023年考研408计算机学科专业基础综合真题',url:'https://kaoyan.eol.cn/shiti/zhuanyeke/202508/t20250828_2687036.shtml'},
]

export async function loadCuratedOutline({ web, basis, latestYear, signal }) {
  if (basis.id === 'cs408') return loadCurated408Outline({web,latestYear,signal})
  if (basis.id !== 'math1' || latestYear < 2027) return null
  const publisherUrl = 'https://www.hep.com.cn/book/show/2097490366090555393'
  const metadata = await web.fetch({url:'https://www.hep.com.cn/api/v1/books/2097490366090555393'},signal)
  const book = JSON.parse(metadata.body.content)?.data
  if (book?.identity?.isbn !== '978-7-04-068404-9' || book.author !== '教育部教育考试院' || book.title !== '2027年全国硕士研究生招生考试数学考试大纲') {
    throw new Error('出版社版本核验未通过，不能使用大纲转载')
  }
  const files = await Promise.all(FILES.map(async ([name,hash]) => {
    const url = `https://raw.githubusercontent.com/DzmingLi/kaoyan-math-official-resources/${COMMIT}/` + encodeURI(`考试大纲/数学一/${name}.org`)
    const page = await web.fetch({url},signal)
    const text = page?.body?.content
    if (typeof text !== 'string' || createHash('sha256').update(text).digest('hex') !== hash) throw new Error('大纲转录与已核对版本不一致')
    return {url,hash,text}
  }))
  return {kind:'outline',year:2027,official:false,title:'2027年数学一考试大纲（原书核对转录，非官方托管）',
    url:`https://github.com/DzmingLi/kaoyan-math-official-resources/tree/${COMMIT}/`+encodeURI('考试大纲/数学一'),
    publisherUrl,isbn:book.identity.isbn,extraction:'reviewed-transcription',
    verificationLabel:'核对原书的第三方转录，非官方托管',
    provenance:{commit:COMMIT,files:files.map(({text,...file})=>file),
      scanSha256:'8921743d80430af98697769b2a1b5febf3ea0501cde130ae71e35c8793f9f3fc',pages:'原书数学一考试内容及要求第6至24页',verifiedAt:'2026-11-05',
      verificationMethod:'人工核对封面、版权页与出版社ISBN；默认视觉模型逐条比对19页正文与三份转录，未报告实质差异'},
    text:'2027年数学一考试大纲；教育部教育考试院；ISBN 978-7-04-068404-9。以下为第三方转录，非官方托管。\n'+files.map((f)=>f.text).join('\n')}
}

export const CS408_OUTLINE_URL = 'https://zhenti.beokayy.club/outline'
export const CS408_COMPARISON_URL = 'https://oss-hqwx-video.hqwx.com/'+encodeURIComponent('考研计算机大纲（2027年）_4ce2c7d68ab421c767cdb8c3fac8eda0915e3426.pdf')
const CS408_TEXT_HASH = 'ba30de6479e485cf38b2d6996ad5ce67619789d7308396000bcff07c84d70536'
const CS408_PDF_HASH = 'dc9c3773a507c75a7a7347157ef120cbfc35e5646cdb9bdd451f913e829276e9'
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function checkedCs408Text(html) {
  const article = /<article\b[^>]*class="outline-document"[^>]*>([\s\S]*?)<\/article>/.exec(html)?.[1]
  if (!article || !/2027 年计算机学科专业基础408考试大纲/.test(article)) throw new Error('408大纲页面结构或年份与核对版本不一致')
  // 排除网站导航、目录和未经验证的“无变化”声明，仅固定四模块正文。
  const text = article.replace(/<header\b[^>]*>[\s\S]*?<\/header>/i,'').replace(/<[^>]+>/g,' ')
    .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()
  if (sha256(text) !== CS408_TEXT_HASH) throw new Error('408大纲正文与已交叉核对版本不一致，需重新核验')
  return text
}

async function loadCurated408Outline({web,latestYear,signal}) {
  if (latestYear < 2027) return null
  const publisherUrl = 'https://www.hep.com.cn/book/show/2099763850751057921'
  const metadata = await web.fetch({url:'https://www.hep.com.cn/api/v1/books/2099763850751057921'},signal)
  const book = JSON.parse(metadata.body.content)?.data
  if (book?.identity?.isbn !== '978-7-04-068451-3' || book.author !== '教育部教育考试院' || book.title !== '2027年全国硕士研究生招生考试计算机学科专业基础考试大纲') throw new Error('408出版社版本记录核验未通过')
  const [page,pdf] = await Promise.all([
    downloadReference(CS408_OUTLINE_URL,{signal,maxBytes:2*1024*1024}),
    downloadReference(CS408_COMPARISON_URL,{signal,maxBytes:2*1024*1024}),
  ])
  const text = checkedCs408Text(page.bytes.toString('utf8'))
  if (sha256(pdf.bytes) !== CS408_PDF_HASH) throw new Error('408交叉来源PDF与核对版本不一致，需重新核验')
  return {kind:'outline',year:2027,official:false,title:'2027标注408大纲（多源交叉核对转载）',url:CS408_OUTLINE_URL,
    publisherUrl,isbn:book.identity.isbn,extraction:'cross-checked-transcription',
    coverage:'四模块知识点正文；未与2027官方原书逐字核验',
    verificationLabel:'标注2027的多源交叉核对转载，非官方原文；未与2027原书逐字核验',
    provenance:{verifiedAt:'2026-11-05',verificationLevel:'cross-source-content-check',publisherOriginalVerified:false,
      textSha256:CS408_TEXT_HASH,comparisonSources:[{url:CS408_COMPARISON_URL,sha256:CS408_PDF_HASH,year:2027,label:'环球网校公开转载PDF，14页，含广告与若干转写错误'},
        {url:'https://www.uwh.edu.cn/uploads/article/20250609/660428d58334252302af691bf99e064e.pdf',sha256:'8ee1e0c917675bdc3a51fa283fd50dcd4f652a962370762704d50f05b23100a5',year:2025,label:'高校公开版，11页，仅用于交叉核对知识内容，不能证明2027版本'}],
      verificationMethod:'视觉模型逐条核对2027转载PDF，并以高校2025版核对差异；四模块均获内容支持，无实质知识范围冲突。出版社接口仅核对2027版书目。非官方认证，不能据此确认无年度变化。'},
    text:'2027标注408计算机学科专业基础考试大纲。以下为多源交叉核对转载，不是官方托管；年份由转载标注，未与2027官方原书逐字核验。\n'+text}
}
