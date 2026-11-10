export const T = {
  title: '考研每日一题',
  subtitle: '每天每科一道题，答案独立校验后才会发布',
  tabs: { today: '今日题目', all: '全部', favorite: '收藏', wrong: '错题本' },
  tabEmpty: {
    all: '这个科目还没有历史题目。先在「今日题目」完成今天的题，或导入题库。',
    favorite: '还没有收藏任何题目。查看答案后点「收藏」即可加入收藏列表。',
    wrong: '错题本是空的。答错或选择「未能作答」的题目会自动进入错题本。',
    today: '今天还没有分配题目。',
  },
  noSubjects: '还没有启用任何科目',
  noSubjectsHint: '先添加你要复习的科目（例如数学一、408），系统会为每个科目每天分配一道题。',
  addSubject: '添加科目',
  manageSubjects: '科目管理',
  manageBanks: '题库管理',
  manageSyllabuses: '大纲管理',
  managePastPapers: '真题管理',
  year: '考研年份',
  generating: '正在出题并做独立答案校验…',
  generateFailed: '出题失败',
  retry: '重试',
  submit: '提交答案',
  done: '作答完毕',
  giveup: '未能作答',
  correct: '作答正确',
  wrong: '作答错误',
  favorite: '收藏',
  unfavorite: '取消收藏',
  redo: '重新作答',
  answer: '标准答案',
  explanation: '解析',
  verified: '已通过独立校验',
  unverified: '答案待核验',
  missing: '缺少参考答案',
  attempts: '作答次数',
  assigned: '出题日期',
  difficulty: '难度',
  knowledge: '知识点',
  source: '来源',
  followup: '本题追问',
  followupHint: '只讨论当前这道题。追问不会修改正式答案详解。',
  send: '发送',
  sending: '回复生成中…',
  clearThread: '清空对话',
  close: '关闭',
  cancel: '取消',
  confirm: '确认',
  import: '导入题库',
  importHint: '支持 Markdown（.md/.txt）与文本型 PDF。导入后先预览，确认识别正确再入库。',
  preview: '识别预览',
  commit: '确认入库',
  deleteBank: '删除题库',
  deleteSubject: '移出每日出题',
  revision: '修订答案详解',
  revisionRunning: '正在生成候选版本并做独立校验…',
  confirmRevision: '确认替换',
  discardRevision: '放弃候选版本',
}

export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return String(iso || '')
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`
}

export function formatDateTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso || '')
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 把内部方法串换成可读说法，避免面板里出现英文流水账。 */
export function methodLabel(method) {
  const value = String(method || '')
  if (!value) return '独立校验'
  if (value.startsWith('two-step')) return '两步：出题 → 独立视角校验'
  if (value.startsWith('blind-solve')) return '盲解 → 比对 → 分歧主裁'
  if (value === 'import-parse') return '题库导入解析'
  if (value === 'online-search') return '官方渠道联网核验'
  if (value === 'catalog') return '内置官方日期表'
  return value
}

export function formatClock(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function statusLabel(result) {
  if (result === 'correct') return { text: '正确', tone: 'ok' }
  if (result === 'wrong') return { text: '错误', tone: 'bad' }
  if (result === 'pending') return { text: '待判定', tone: 'warn' }
  return { text: '未作答', tone: 'idle' }
}

export function newAttemptId() {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function isChoiceType(type) {
  return type === 'single' || type === 'multiple' || type === 'cloze' || type === 'reading'
}
