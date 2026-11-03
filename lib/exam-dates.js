/**
 * 考研日期的权威性处理。
 *
 * 规则（对应需求第三节）：
 * 1. 只采信教育部 / 教育部教育考试院 / 研招网公布的初试日期。
 * 2. “2028 考研”指 2028 年入学，初试在上一年 12 月举行，因此实际考试日期是 2027 年 12 月。
 * 3. 官方已公布 -> status 'official'，不带“约”。
 * 4. 未公布 -> 以上一年同一考试的官方日期为估算依据（同一日期推后 1 年），status 'estimated'，三行文字都带“约”。
 * 5. 找不到任何官方依据 -> status 'unverified'，明确显示“官方日期尚未核实”，不编造日期。
 */

/** 已确认的官方日期表。键是“报考年份”（入学年份）。 */
export const OFFICIAL_EXAM_DATES = {
  2027: {
    date: '2026-12-19',
    endDate: '2026-12-20',
    status: 'official',
    source: '教育部《2027年全国硕士研究生招生工作管理规定》',
    sourceUrl: 'http://edu-app.people.cn/n1/2026/0924/c1006-40805040.html',
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

/** 采信为官方来源的域名（教育部、教育考试院、研招网）。 */
const OFFICIAL_HOSTS = ['moe.gov.cn', 'chsi.com.cn', 'neea.edu.cn']

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

/** 同月同日，推后 years 年。2 月 29 日退化为 2 月 28 日。 */
export function addYears(iso, years) {
  const parts = parseISODate(iso)
  if (!parts) return null
  const year = parts.year + years
  const day = Math.min(parts.day, daysInMonth(year, parts.month))
  return `${year}-${pad2(parts.month)}-${pad2(day)}`
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
 * @param {Record<string, object>} overrides 用户/联网核验后保存的记录
 * @returns 目标日期记录；status 为 official / estimated / unverified
 */
export function resolveExamDate(year, overrides = {}) {
  const override = overrides[String(year)]
  if (override && parseISODate(override.date)) {
    return {
      year,
      examYear: parseISODate(override.date).year,
      date: override.date,
      endDate: override.endDate || override.date,
      status: override.status === 'official' ? 'official' : 'estimated',
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

  // 未公布：以最近一个已确认年份的官方日期为估算依据，按年推后。
  const knownYears = Object.keys(OFFICIAL_EXAM_DATES)
    .map(Number)
    .concat(Object.keys(overrides).map(Number).filter((item) => Number.isFinite(item)
      && overrides[String(item)] && overrides[String(item)].status === 'official'))
    .filter((item) => Number.isFinite(item) && item < year)
    .sort((a, b) => b - a)

  for (const baseYear of knownYears) {
    const base = resolveExamDate(baseYear, overrides)
    if (!base.date) continue
    const estimate = addYears(base.date, year - baseYear)
    if (!estimate) continue
    return {
      year,
      examYear: parseISODate(estimate).year,
      date: estimate,
      endDate: addYears(base.endDate || base.date, year - baseYear),
      status: 'estimated',
      source: base.source,
      sourceUrl: base.sourceUrl,
      publishedAt: '',
      verifiedAt: base.verifiedAt,
      method: 'estimate',
      schedule: [],
      basis: { year: baseYear, date: base.date, source: base.source, sourceUrl: base.sourceUrl },
      note: `${year} 考研的官方考试日期尚未公布，以上一年同一考试（${baseYear} 考研 ${base.date}）的官方日期推后 ${year - baseYear} 年作为估算依据。`,
    }
  }

  return {
    year,
    examYear: year - 1,
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
    note: `${year} 考研的考试日期尚未核实：没有找到可验证的官方公布记录，也没有可用的上一年官方日期作为估算依据。请勿把未核实的日期当作官方日期使用。`,
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
    const passed = Math.abs(remaining)
    base.expired = true
    base.lines = {
      primary: `${year}考研的考试日期已过（${target.year}年${target.month}月${target.day}日）`,
      secondary: `已过去 ${passed} 天，请确认是否需要重新选择考研年份`,
      target: targetText,
    }
    return base
  }

  const diff = calendarDiff(today, examInfo.date) || { years: 0, months: 0, days: 0 }
  base.calendar = diff
  base.lines = {
    primary: `距离${year}考研还剩${approxPrefix}${remaining}天`,
    secondary: `距离${year}考研还剩${approxPrefix}${diff.years}年${diff.months}个月${diff.days}天`,
    target: targetText,
  }
  if (remaining === 0) {
    base.lines.primary = `距离${year}考研还剩${approxPrefix}0天（今日开考）`
    base.lines.secondary = `距离${year}考研还剩${approxPrefix}0年0个月0天`
  }
  return base
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

function isOfficialHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return OFFICIAL_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  } catch {
    return false
  }
}

/**
 * 联网核验某年的考试日期。
 *
 * 只在教育部 / 教育考试院 / 研招网域名命中“初试时间为 YYYY 年 12 月 D 日”时
 * 才认定为官方公布；否则如实返回未核实，不做任何猜测。
 */
export async function verifyExamDateOnline({ year, web, signal, fetchLimit = 3 }) {
  const checked = []
  const now = new Date().toISOString()
  if (!web || typeof web.search !== 'function') {
    return { ok: false, reason: 'web 服务不可用，无法联网核验官方日期', checked }
  }
  const expectYear = year - 1
  let sources = []
  try {
    const result = await web.search({ query: `${year}年全国硕士研究生招生考试 初试时间 12月`, maxResults: 8 }, signal)
    sources = Array.isArray(result?.sources) ? result.sources : []
  } catch (error) {
    return { ok: false, reason: `联网检索失败：${error?.message || error}`, checked }
  }

  const official = sources.filter((item) => item && item.url && isOfficialHost(item.url)).slice(0, fetchLimit)
  if (!official.length) {
    return {
      ok: false,
      reason: `没有检索到 ${year} 考研在官方渠道（moe.gov.cn / chsi.com.cn / neea.edu.cn）发布的初试日期，保持“尚未核实/估算”状态`,
      checked: sources.map((item) => item.url).slice(0, 8),
    }
  }

  for (const source of official) {
    checked.push(source.url)
    try {
      const page = await web.fetch({ url: source.url }, signal)
      const text = page?.body?.kind === 'html' ? stripHtml(page.body.content) : String(page?.body?.content || '')
      const match = new RegExp(`初试时间[^。；]{0,40}?${expectYear}年12月(\\d{1,2})日`).exec(text)
        || new RegExp(`${expectYear}年12月(\\d{1,2})日至`).exec(text)
      if (!match) continue
      const day = Number(match[1])
      if (!(day >= 1 && day <= 31)) continue
      const date = `${expectYear}-12-${pad2(day)}`
      return {
        ok: true,
        record: {
          date,
          endDate: addDays(date, 1),
          status: 'official',
          source: source.title || source.url,
          sourceUrl: source.url,
          publishedAt: source.publishedAt || '',
          verifiedAt: now,
          method: 'online-search',
          note: `由官方渠道页面核验：${source.url}`,
        },
        checked,
        snippet: match[0],
      }
    } catch (error) {
      checked.push(`${source.url} (${error?.message || error})`)
    }
  }

  return {
    ok: false,
    reason: `检索到官方渠道页面，但未能在其中确认 ${expectYear}年12月的初试日期`,
    checked,
  }
}

export function addDays(iso, days) {
  const parts = parseISODate(iso)
  if (!parts) return null
  const millis = utcMillis(parts) + days * 86400000
  const date = new Date(millis)
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/** 可选目标年份：当前年份到 +6 年。 */
export function yearOptions(today = todayISO()) {
  const year = parseISODate(today)?.year || new Date().getFullYear()
  const list = []
  for (let value = year; value <= year + 6; value += 1) list.push(value)
  return list
}
