import { abortable } from './async.js'

/**
 * 考研日期的权威性处理。
 *
 * 规则（对应需求第三节）：
 * 1. 先核验研招网，再查教育部和教育部教育考试院公布的初试日期。
 * 2. “2028 考研”指 2028 年入学，初试在上一年 12 月举行，因此实际考试日期是 2027 年 12 月。
 * 3. 官方已公布 -> status 'official'，不带“约”。
 * 4. 本年度及未来的初试日期未公布 -> 估算为实际考试年份 12 月的倒数第二个周六及次日。
 * 5. 往年的初试缺少官方记录 -> status 'unverified'。
 */

/** 已确认的官方日期表。键是“报考年份”（入学年份）。 */
export const OFFICIAL_EXAM_DATES = {
  2027: {
    date: '2026-12-19',
    endDate: '2026-12-20',
    status: 'official',
    source: '研招网转载教育部《2027年全国硕士研究生招生工作管理规定》',
    sourceUrl: 'https://yz.chsi.com.cn/kyzx/jybzc/202609/20260924/2293971511.html',
    publishedAt: '2026-09-24',
    verifiedAt: '2026-11-03',
    schedule: [
      '12月19日 8:30—11:30 思想政治理论或管理类综合能力',
      '12月19日 14:00—17:00 外国语',
      '12月20日 8:30—11:30 业务课（一）或专业基础综合',
      '12月20日 14:00 业务课（二）',
    ],
  },
}

/** 核验顺序：研招网、教育部、教育考试院。 */
const OFFICIAL_HOSTS = ['yz.chsi.com.cn', 'moe.gov.cn', 'neea.edu.cn']

export function pad2(value) {
  return String(value).padStart(2, '0')
}

/** 宿主本地时区的今天，格式 YYYY-MM-DD。 */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function utcMillis(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day)
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function daysBetween(fromISO, toISO) {
  const from = parseISODate(fromISO)
  const to = parseISODate(toISO)
  if (!from || !to) return null
  return Math.round((utcMillis(to) - utcMillis(from)) / 86400000)
}

/** 同月同日推后 months 个月，日期超出目标月长度时取该月最后一天。 */
export function addMonths(parts, months) {
  const total = parts.year * 12 + (parts.month - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const day = Math.min(parts.day, daysInMonth(year, month))
  return { year, month, day }
}

function toISOString(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

/**
 * 自然年 / 自然月 / 剩余天数的日历差。
 *
 * 以“从起始日按月推进”的方式计算，不做总天数除以 365/30 的近似，
 * 因此“剩余天数”与“x 年 y 个月 z 天”永远指向同一个目标日期。
 */
export function calendarDiff(fromISO, toISO) {
  const from = parseISODate(fromISO)
  const to = parseISODate(toISO)
  if (!from || !to) return null
  const totalDays = daysBetween(fromISO, toISO)
  if (totalDays === null) return null
  if (totalDays < 0) return { years: 0, months: 0, days: totalDays }

  let totalMonths = (to.year - from.year) * 12 + (to.month - from.month)
  let probe = addMonths(from, totalMonths)
  if (utcMillis(probe) > utcMillis(to)) {
    totalMonths -= 1
    probe = addMonths(from, Math.max(0, totalMonths))
  }
  const days = daysBetween(toISOString(probe), toISO) ?? 0
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days,
  }
}

/**
 * 解析某一年考研的目标日期。
 *
 * @param {number} year 报考年份（入学年份）
 * @param {Record<string, object>} overrides 本地保存的核验记录
 * @param {string} today 宿主本地日期，用于区分往年与当前可估算的届次
 * @returns 目标日期记录；status 为 official / estimated / unverified
 */
export function resolveExamDate(year, overrides = {}, today = todayISO()) {
  const override = overrides[String(year)]
  const officialDate = override?.status === 'official' && parseISODate(override.date)
  if (officialDate) {
    return {
      year,
      examYear: officialDate.year,
      date: override.date,
      endDate: override.endDate || override.date,
      status: 'official',
      source: override.source || '',
      sourceUrl: override.sourceUrl || '',
      publishedAt: override.publishedAt || '',
      verifiedAt: override.verifiedAt || '',
      method: override.method || 'manual',
      schedule: Array.isArray(override.schedule) ? override.schedule : [],
      basis: override.basis || null,
      note: override.note || '',
    }
  }

  const official = OFFICIAL_EXAM_DATES[year]
  if (official) {
    return {
      year,
      examYear: parseISODate(official.date).year,
      date: official.date,
      endDate: official.endDate || official.date,
      status: 'official',
      source: official.source,
      sourceUrl: official.sourceUrl,
      publishedAt: official.publishedAt || '',
      verifiedAt: official.verifiedAt || '',
      method: 'catalog',
      schedule: official.schedule || [],
      basis: null,
      note: '',
    }
  }

  const examYear = year - 1
  const currentYear = parseISODate(today)?.year ?? new Date().getFullYear()
  if (Number.isInteger(examYear) && examYear >= currentYear && examYear <= 9999) {
    // 按周六所在月份计数，月末周六也计入。
    const lastDay = new Date(Date.UTC(examYear, 11, 31))
    const daysSinceSaturday = (lastDay.getUTCDay() + 1) % 7
    const saturday = 31 - daysSinceSaturday - 7
    return {
      year,
      examYear,
      date: `${examYear}-12-${pad2(saturday)}`,
      endDate: `${examYear}-12-${pad2(saturday + 1)}`,
      status: 'estimated',
      source: '',
      sourceUrl: '',
      publishedAt: '',
      verifiedAt: '',
      method: 'estimate',
      schedule: [],
      basis: null,
      note: `${year} 考研的官方初试日期尚未公布，暂按 ${examYear} 年 12 月的倒数第二个周六及次日估算。`,
    }
  }

  return {
    year,
    examYear,
    date: null,
    endDate: null,
    status: 'unverified',
    source: '',
    sourceUrl: '',
    publishedAt: '',
    verifiedAt: '',
    method: 'none',
    schedule: [],
    basis: null,
    note: `${year} 考研的初试日期尚缺官方核验记录。`,
  }
}

/**
 * 生成倒计时文案与数值。三行数据来自同一个目标日期。
 */
export function computeCountdown(year, examInfo, today = todayISO()) {
  const base = {
    year,
    targetDate: examInfo.date,
    status: examInfo.status,
    approx: examInfo.status !== 'official',
    expired: false,
    days: null,
    calendar: null,
    lines: { primary: '', secondary: '', target: '' },
    basis: examInfo.basis || null,
    note: examInfo.note || '',
    source: examInfo.source || '',
    sourceUrl: examInfo.sourceUrl || '',
    verifiedAt: examInfo.verifiedAt || '',
    schedule: examInfo.schedule || [],
    today,
  }

  if (!examInfo.date) {
    base.lines = {
      primary: `${year}考研日期尚未核实`,
      secondary: '官方考试日期尚未公布，也缺少可用的估算依据',
      target: '目标日：待官方公布',
    }
    return base
  }

  const target = parseISODate(examInfo.date)
  const approxPrefix = base.approx ? '约' : ''
  const targetText = `目标日：${approxPrefix}${target.year}年${target.month}月${target.day}日`

  const remaining = daysBetween(today, examInfo.date)
  base.days = remaining

  if (remaining < 0) {
    const daysUntilEnd = daysBetween(today, examInfo.endDate)
    if (daysUntilEnd !== null && daysUntilEnd >= 0) {
      base.lines = {
        primary: `${year}考研初试${base.approx ? '（估算）' : ''}进行中`,
        secondary: '',
        target: targetText,
      }
      return base
    }
    const passed = Math.abs(remaining)
    base.expired = true
    base.lines = {
      primary: `${year}考研的考试日期已过（${target.year}年${target.month}月${target.day}日）`,
      secondary: `已过去 ${passed} 天，请确认是否需要重新选择考研年份`,
      target: targetText,
    }
    return base
  }

  base.calendar = calendarDiff(today, examInfo.date)
  const years = Math.floor(remaining / 365)
  const months = Math.floor((remaining % 365) / 30)
  const days = (remaining % 365) % 30
  base.lines = {
    primary: `距离${year}考研还剩${approxPrefix}${remaining}天`,
    secondary: remaining <= 30 ? '' : `${approxPrefix}${years ? `${years}年` : ''}${months ? `${months}个月` : ''}${days ? `${days}天` : ''}`,
    target: targetText,
  }
  if (remaining === 0) {
    base.lines.primary = `距离${year}考研还剩${approxPrefix}0天（${base.approx ? '预计' : ''}今日开考）`
  }
  return base
}

function stripHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(head|title|script|style|nav|aside|footer|a)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>|<br\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|#160|#xa0);/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function officialUrl(value, host) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (url.hostname !== host && !url.hostname.endsWith('.' + host)) return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

function examSessions(text) {
  return Array.from(text.matchAll(/(\d{4})年?(?:(?:全国)?硕士研究生招生|考研|研考)/g), (match) => Number(match[1]))
}

function readExamDates(body, year) {
  if (typeof body?.content !== 'string' || !['html', 'text'].includes(body.kind)) return null
  const html = body.kind === 'html'
  const title = html ? stripHtml(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(body.content)?.[1] || '').trim() : ''
  const heading = html ? stripHtml(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1\s*>/i.exec(body.content)?.[2] || '') : ''
  const paragraphs = html ? stripHtml(body.content.replace(/<h([1-6])\b[^>]*>[\s\S]*?<\/h\1\s*>/gi, '<br>')) : body.content
  const text = paragraphs.normalize('NFKC').replace(/[^\S\r\n]+/g, '')
  const titleYears = examSessions(title.normalize('NFKC').replace(/\s+/g, ''))
  const pageYears = titleYears.length ? titleYears : examSessions(heading.normalize('NFKC').replace(/\s+/g, '') + '\n' + text)
  if (!pageYears.includes(year)) return null

  const examYear = year - 1
  const pattern = new RegExp(`初试时间(?:为|是|定于|安排在|调整为)?:?${examYear}年12月(\\d{1,2})日?(?:至|到|[-–—~])(?:(?:${examYear}年)?12月)?(\\d{1,2})日`, 'g')
  let result = null
  for (const sentence of text.split(/[\r\n。；;，,]+/)) {
    const years = examSessions(sentence)
    if (years.length && !years.includes(year)) continue
    for (const match of sentence.matchAll(pattern)) {
      const start = Number(match[1])
      const end = Number(match[2])
      if (start < 1 || end < start || end > 31) continue
      const date = `${examYear}-12-${pad2(start)}`
      const endDate = `${examYear}-12-${pad2(end)}`
      if (result && (result.date !== date || result.endDate !== endDate)) return null
      result = { date, endDate, title, snippet: match[0] }
    }
  }
  return result
}

/** 仅采信目标届次的官方正文明确给出的完整初试区间。 */
export async function verifyExamDateOnline({ year, web, signal, fetchLimit = 3 }) {
  const checked = []
  if (typeof web?.search !== 'function' || typeof web?.fetch !== 'function') {
    return { ok: false, reason: 'web 服务不可用，无法联网核验官方日期', checked }
  }
  if (!Number.isInteger(year) || year < 1001 || year > 9999) return { ok: false, reason: '考研届次无效', checked }
  const expectYear = year - 1
  const visited = new Set()
  const earlierSources = []
  let searched = false
  let searchError
  for (const host of OFFICIAL_HOSTS) {
    if (signal?.aborted) break
    const subject = host === 'neea.edu.cn' ? '招生考试' : '招生工作管理规定'
    const query = `site:${host} ${year}年全国硕士研究生${subject} 初试时间 ${expectYear}年12月`
    let sources = []
    try {
      const result = await abortable(() => web.search({ query, maxResults: 8 }, signal), signal)
      searched = true
      sources = Array.isArray(result?.sources) ? result.sources : []
    } catch (error) {
      searchError = error
    }
    // 检索服务可能混入其他站点的结果，留到该站点的核验阶段再使用。
    const candidates = [...sources, ...earlierSources]
    earlierSources.push(...sources)
    let fetched = 0
    for (const source of candidates) {
      if (signal?.aborted || fetched >= fetchLimit) break
      const url = officialUrl(source?.url, host)
      if (!url || visited.has(url)) continue
      visited.add(url)
      fetched++
      try {
        const page = await abortable(() => web.fetch({ url }, signal), signal)
        const finalUrl = officialUrl(page?.url || url, host)
        const found = finalUrl && readExamDates(page?.body, year)
        checked.push(url)
        if (!found) continue
        return {
          ok: true,
          record: {
            date: found.date,
            endDate: found.endDate,
            status: 'official',
            source: found.title || source.title || finalUrl,
            sourceUrl: finalUrl,
            publishedAt: source.publishedAt || '',
            verifiedAt: new Date().toISOString(),
            method: 'online-search',
            note: `由官方渠道页面核验：${finalUrl}`,
          },
          checked,
          snippet: found.snippet,
        }
      } catch (error) {
        checked.push(`${url} (${error?.message || error})`)
      }
    }
  }
  if (signal?.aborted) return { ok: false, reason: '联网核验已超时或取消', checked }
  if (!searched) return { ok: false, reason: `联网检索失败：${searchError?.message || searchError}`, checked }
  return { ok: false, reason: `未能从官方正文确认 ${year} 考研（${expectYear}年12月）的初试起止日期`, checked }
}

export function addDays(iso, days) {
  const parts = parseISODate(iso)
  if (!parts) return null
  const millis = utcMillis(parts) + days * 86400000
  const date = new Date(millis)
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/**
 * 可选的考研年份：只给 3 个，而且不会给出初试已经结束的年份。
 *
 * “N 考研”的初试在前一年 12 月（2028 考研 = 2027 年 12 月初试），所以
 * 今年 12 月那场考试对应的入学年份是 year + 1。一旦这场初试结束，窗口整体
 * 后移一年：
 *   2026-11-04（初试前）→ 2027 / 2028 / 2029
 *   2026-12-21（初试后）→ 2028 / 2029 / 2030
 */
export function yearOptions(today = todayISO(), overrides = {}) {
  const parts = parseISODate(today)
  const year = parts?.year ?? new Date().getFullYear()
  const session = year + 1
  const exam = resolveExamDate(session, overrides, today)
  const endDate = exam.endDate || exam.date
  const finished = Boolean(endDate) && daysBetween(endDate, today) > 0
  const first = finished ? session + 1 : session
  return [first, first + 1, first + 2]
}
