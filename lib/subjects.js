/**
 * 科目目录与考试大纲提示。
 *
 * 科目列表是可扩展数据，不是写死在页面里的常量：内置目录只是候选，
 * 用户的启用列表保存在 settings.subjects 里，自定义科目保存在 customSubjects。
 */

/** 题型标记 -> 中文名。 */
export const QUESTION_TYPE_LABEL = {
  single: '单项选择题',
  multiple: '多项选择题',
  cloze: '英语知识运用（完形填空）',
  reading: '阅读理解',
  fill: '填空题',
  solution: '解答题',
  analysis: '分析题',
  translation: '翻译',
  writing: '写作题',
  shortanswer: '简答题',
}

/** 选择题类题型（判分依据唯一选项）。完形填空与阅读理解同样按四选一判分。 */
export const CHOICE_TYPES = new Set(['single', 'multiple', 'cloze', 'reading'])

export function hasChoiceOptions(options) {
  return Array.isArray(options) && options.length >= 2
    && options.every((option) => /^[A-H]$/.test(option?.key) && typeof option.text === 'string' && option.text.trim())
    && new Set(options.map((option) => option.key)).size === options.length
}

export function validChoiceKey(type, key, options) {
  return typeof key === 'string' && /^[A-H]+$/.test(key) && (type === 'multiple' || key.length === 1)
    && new Set(key).size === key.length
    && [...key].every((letter) => options?.some((option) => option?.key === letter))
}

export const SUBJECT_CATALOG = [
  {
    id: 'politics',
    name: '思想政治理论',
    code: '101',
    types: ['single', 'multiple'],
    outline: [
      '马克思主义基本原理（约24分）',
      '毛泽东思想和中国特色社会主义理论体系概论（约30分）',
      '中国近现代史纲要（约14分）',
      '思想道德与法治（约16分）',
      '形势与政策以及当代世界经济与政治（约16分）',
    ],
    guidance: '单选题每题 1 分，多项选择题每题 2 分。多选题错选、多选、少选均不得分，因此正确选项必须由题面唯一确定（多选题可有多个正确选项，须在答案中写全）。',
  },
  {
    id: 'math1',
    name: '数学一',
    code: '301',
    types: ['single', 'fill', 'solution'],
    outline: [
      '高等数学（约56%）：函数极限连续、一元及多元微积分、向量代数与空间解析几何、级数、常微分方程',
      '线性代数（约22%）：行列式、矩阵、向量、线性方程组、特征值与特征向量、二次型',
      '概率论与数理统计（约22%）：随机事件与概率、随机变量及其分布、多维随机变量、数字特征、大数定律与中心极限定理、参数估计与假设检验',
    ],
    guidance: '数学一的知识范围最大，包含空间解析几何、级数（含傅里叶级数）、假设检验等内容；不得把数学二/三不考的内容强加给它们，也不得让数学一缺少应有内容。解答题必须给出完整、可独立验证的求解过程。',
  },
  {
    id: 'math2',
    name: '数学二',
    code: '302',
    types: ['single', 'fill', 'solution'],
    outline: [
      '高等数学（约78%）：函数极限连续、一元微积分、多元函数微积分（不含三重积分与曲线曲面积分）、常微分方程',
      '线性代数（约22%）：行列式、矩阵、向量、线性方程组、特征值与特征向量',
    ],
    guidance: '数学二不考概率论与数理统计，不考级数、空间解析几何、三重积分与曲线曲面积分；不得出现这些内容。',
  },
  {
    id: 'math3',
    name: '数学三',
    code: '303',
    types: ['single', 'fill', 'solution'],
    outline: [
      '微积分（约56%）：函数极限连续、一元及多元微积分、级数、常微分方程与差分方程',
      '线性代数（约22%）：行列式、矩阵、向量、线性方程组、特征值与特征向量、二次型',
      '概率论与数理统计（约22%）：随机事件与概率、随机变量及其分布、多维随机变量、数字特征、大数定律与中心极限定理、参数估计',
    ],
    guidance: '数学三为经济学门类，微积分侧重经济应用，概率统计不考假设检验；取值范围与数学一不同，不得混用。',
  },
]

const CATALOG_BY_ID = new Map(SUBJECT_CATALOG.map((item) => [item.id, item]))

// 旧自定义科目的参考考试转为独立引用，不再列为内置选项。
export const RETIRED_SUBJECTS = new Map([
  ['english1', { name: '英语一', code: '201' }],
  ['english2', { name: '英语二', code: '204' }],
])

export function migrateSubjectReference(subject) {
  const retired = RETIRED_SUBJECTS.get(subject?.referenceSubjectId)
  return retired ? { ...subject, referenceSubjectId: 'independent',
    referenceExamName: retired.name, referenceExamCode: retired.code } : subject
}

/** 参考考试独立于学习科目；不会因此在每日科目列表中新增408。 */
export const REFERENCE_EXAMS = [
  ...SUBJECT_CATALOG.map(({id,name,code}) => ({id,name,code})),
  {id:'cs408',name:'计算机学科专业基础',code:'408',
    outline:['数据结构','计算机组成原理','操作系统','计算机网络']},
]

export function referenceExamFor(subject) {
  if (!subject?.custom) return subject
  if (!subject.referenceSubjectId || subject.referenceSubjectId === 'auto') return {id:'auto_'+subject.id,name:subject.name,code:subject.code || ''}
  if (subject.referenceSubjectId === 'independent') {
    const name = typeof subject.referenceExamName === 'string' ? subject.referenceExamName.trim() : ''
    return name ? {id:'independent_'+subject.id,name,code:subject.referenceExamCode || ''} : undefined
  }
  return REFERENCE_EXAMS.find((exam) => exam.id === subject.referenceSubjectId)
}

/** 全部可选科目 = 内置目录 + 用户自定义。 */
export function allSubjects(customSubjects = []) {
  const extra = Array.isArray(customSubjects)
    ? customSubjects
      .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
      .map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code || '',
        types: Array.isArray(item.types) && item.types.length ? item.types : ['single', 'solution'],
        outline: Array.isArray(item.outline) ? item.outline : [],
        guidance: typeof item.guidance === 'string' ? item.guidance : '',
        custom: true,
        referenceSubjectId: typeof item.referenceSubjectId === 'string' ? item.referenceSubjectId : '',
        referenceExamName: typeof item.referenceExamName === 'string' ? item.referenceExamName : '',
        referenceExamCode: typeof item.referenceExamCode === 'string' ? item.referenceExamCode : '',
      }))
    : []
  return [...SUBJECT_CATALOG, ...extra]
}

export function findSubject(id, customSubjects = []) {
  return allSubjects(customSubjects).find((item) => item.id === id)
}

/** 科目允许的题型；未知科目退化为选择题 + 解答题。 */
export function subjectTypes(id, customSubjects = []) {
  const subject = findSubject(id, customSubjects)
  return subject && Array.isArray(subject.types) && subject.types.length
    ? subject.types
    : ['single', 'solution']
}

export function isKnownSubject(id) {
  return CATALOG_BY_ID.has(id)
}

/** 供在线出题使用的科目说明块。 */
export function describeSubjectForPrompt(subject) {
  if (!subject) return ''
  const lines = [`科目：${subject.name}${subject.code ? `（科目代码 ${subject.code}）` : ''}`]
  if (subject.outline.length) {
    lines.push(`考试范围：\n${subject.outline.map((line) => `- ${line}`).join('\n')}`)
  }
  if (subject.guidance) lines.push(`命题约束：${subject.guidance}`)
  lines.push(`允许题型：${subject.types.map((type) => QUESTION_TYPE_LABEL[type] || type).join('、')}`)
  return lines.join('\n')
}
