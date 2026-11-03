import { describeSubjectForPrompt, QUESTION_TYPE_LABEL, CHOICE_TYPES, subjectTypes } from './subjects.js'
import { asString, asStringArray, generateText, parseJsonLoose, resolveModel } from './llm-json.js'

/**
 * 在线出题 = 三个互相独立的步骤：
 *   1. 出题      —— 生成题干、选项、标准答案与解析
 *   2. 独立校验  —— 换一个视角、独立求解后再比对答案，检查条件/唯一性/判分规则
 *   3. 定稿      —— 只有校验通过的内容才会被写库并展示
 * 校验不通过时带着问题重出一次；仍不通过则抛错，绝不把未通过校验的题目当成正式题目。
 */

export const MAX_GENERATION_ATTEMPTS = 2

export class QuestionGenerationError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'QuestionGenerationError'
    this.details = details
  }
}

const WRITER_SYSTEM = `你是一位中国大陆硕士研究生招生考试的命题老师，专长是依据最新考试大纲编写高质量、可判定、可验证的练习题目。

硬性要求：
- 只输出一个 JSON 对象，不要输出任何解释文字或代码围栏。
- 题目难度必须与全国硕士研究生招生考试的实际水平一致：不能过于简单，也不能超纲。
- 题目必须可解且答案唯一确定（多项选择题除外）。不得出现条件矛盾、条件不足、结论不唯一却要求唯一答案的情况。
- 数学与理工题的计算结果必须可以通过独立推导或代入验证。
- 题干、选项、答案、解析全部使用 Markdown；数学公式使用 LaTeX：行内用 $...$，独立公式用 $$...$$。
- 解析必须包含：关键思路、必要的推导或计算步骤、涉及的核心知识点、易错点说明。不能只给答案。
- 不要编造不确定的事实、数据或“官方表述”。`

const VERIFIER_SYSTEM = `你是一位独立于命题人的审题与答案校验专家。你的任务不是重写题目，而是判断这道题能不能作为正式题目发布。

校验流程（请按顺序在内部执行）：
1. 先不看给出的答案，自己独立把题做一遍，得到你确信的结论。
2. 再与给出的标准答案比对：结论是否一致。
3. 检查题干：已知条件是否完整、是否互相矛盾、是否有歧义、是否缺少必要假设。
4. 检查题目可解性：给定条件下是否确实存在唯一确定的答案（多项选择题除外）。
5. 检查标准答案：是否正确、是否唯一。
6. 检查解析：是否能严谨推出该答案，是否只有答案而没有必要步骤，是否有与题干冲突的表述。
7. 检查题型判分规则：单项选择题必须恰好有一个正确选项，其余选项必须确实错误且具有合理迷惑性；多项选择题必须写明正确选项集合；填空题/解答题必须能按答案判定。
8. 检查是否符合该科目的考试范围（不超纲）。

判定原则：
- 只要存在会导致考生被误导或无法作答通过的问题，就必须判为不通过。
- 你不确定的地方也算问题，必须写进 issues。
- 不能因为“看起来差不多”就放过。

只输出一个 JSON 对象，不要输出任何解释文字或代码围栏。`

/**
 * 出题并独立校验。
 *
 * @returns {{question: object, verification: object}}
 */
export async function createVerifiedQuestion({ ctx, subject, examInfo, signal, preferredType }) {
  const allowed = subjectTypes(subject.id, [])
  const allowedLabels = allowed.map((type) => QUESTION_TYPE_LABEL[type] || type)
  const typeHint = preferredType && allowed.includes(preferredType) ? preferredType : allowed[Math.floor(Math.random() * allowed.length)]
  const trail = []
  let feedback = ''
  let modelIdentity = ''
  try {
    const selection = resolveModel(ctx)
    modelIdentity = `${selection.provider}/${selection.model}`
  } catch { /* 模型信息缺失不影响出题，校验记录里留空即可 */ }

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw new QuestionGenerationError('出题已取消')
    let draft
    try {
      draft = await writeQuestion({ ctx, subject, examInfo, allowed, allowedLabels, typeHint, feedback, signal })
    } catch (error) {
      if (error instanceof QuestionGenerationError && error.details?.raw !== undefined) {
        // 输出无法解析成 JSON：带上错误重试一次，而不是直接失败。
        trail.push({
          attempt,
          stage: 'parse',
          passed: false,
          issues: [error.message],
          summary: '模型输出无法解析',
        })
        feedback = `上一次输出的 JSON 无法解析（${error.message}）。请重新输出完整 JSON，并确保字符串里的 LaTeX 反斜杠写成两个。`
        continue
      }
      throw error
    }
    const candidate = normalizeCandidate(draft, allowed)
    const problems = structuralProblems(candidate, allowed)
    if (problems.length) {
      feedback = `上一次生成的题目存在结构问题，请修正后重新命题：\n${problems.map((item) => `- ${item}`).join('\n')}`
      trail.push({ attempt, stage: 'structure', passed: false, issues: problems, summary: '结构检查未通过' })
      continue
    }

    const review = await verifyQuestion({ ctx, subject, examInfo, candidate, signal })
    trail.push({
      attempt,
      stage: 'independent-verification',
      passed: review.pass,
      issues: review.issues,
      summary: review.summary,
      independentAnswer: review.independentAnswer || '',
    })

    if (review.pass) {
      const verification = {
        status: 'passed',
        at: new Date().toISOString(),
        method: 'two-step: 出题 (generate) + 独立视角校验 (independent-verify)',
        summary: review.summary || '独立校验通过',
        issues: review.issues,
        attempts: attempt,
        model: modelIdentity,
        trail,
      }
      return { question: candidate, verification }
    }

    feedback = `上一次命题未通过独立校验，请针对下列问题重新命题（不要只改措辞，必要时换一个题目）：\n${review.issues.map((item) => `- ${item}`).join('\n')}`
  }

  const last = trail[trail.length - 1]
  throw new QuestionGenerationError(
    `连续 ${MAX_GENERATION_ATTEMPTS} 次命题都没有通过独立答案校验，已阻止发布该题。${last?.issues?.length ? `最近一次的问题：${last.issues.join('；')}` : ''}`,
    { trail },
  )
}

async function writeQuestion({ ctx, subject, examInfo, allowed, allowedLabels, typeHint, feedback, signal }) {
  const prompt = [
    '请为下面的考研科目出一道“每日一题”。',
    '',
    describeSubjectForPrompt(subject),
    '',
    `目标考研年份：${examInfo?.year || ''} 考研（初试实际日期：${examInfo?.date || '以官方公布为准'}）`,
    `本题题型：${QUESTION_TYPE_LABEL[typeHint] || typeHint}（只能从以下题型中选择：${allowedLabels.join('、')}）`,
    '',
    feedback ? `上一轮反馈（必须修正）：\n${feedback}\n` : '',
    '输出字段（严格的 JSON）：',
    '{',
    '  "type": "single | multiple | fill | solution | analysis | translation | writing | shortanswer",',
    '  "stem": "题干（Markdown + LaTeX）",',
    '  "options": [{"key": "A", "text": "选项内容（Markdown + LaTeX）"}],   // 选择题必填，其他题型为空数组',
    '  "answer": "标准答案（Markdown）。选择题为正确选项字母，例如 B；填空题为最终结果；解答题给出最终结论",',
    '  "answerKey": "单选题的正确选项字母；多选题为按字母升序拼接的字符串，例如 \\"ABD\\"；其他题型为空字符串",',
    '  "explanation": "完整解析（Markdown + LaTeX），必须含关键思路、推导步骤、核心知识点与易错点",',
    '  "knowledge": ["知识点标签", "..."],',
    '  "difficulty": 1,  // 1 到 5 的整数，3 为考研平均水平',
    '  "syllabusCheck": "一句话说明本题对应大纲的哪一部分"',
    '}',
    '',
    'JSON 转义要求：字符串里的每个反斜杠都要写成两个。例如 LaTeX 的 \\frac{1}{2} 在 JSON 里要写成 \\\\frac{1}{2}，\\alpha 要写成 \\\\alpha，换行写成 \\n。否则整段 JSON 会解析失败。',
  ].filter(Boolean).join('\n')

  const { text, finish } = await generateText(ctx, {
    system: WRITER_SYSTEM,
    prompt,
    maxTokens: 8000,
    temperature: 0.8,
    signal,
  })
  try {
    return parseJsonLoose(text)
  } catch (error) {
    const truncated = finish?.kind === 'max-tokens' ? '（输出可能在写解析时被 max-tokens 截断）' : ''
    throw new QuestionGenerationError(
      `出题模型没有返回可解析的 JSON${truncated}：${error.message}。回复结尾：…${text.slice(-120)}`,
      { raw: text.slice(0, 2000) },
    )
  }
}

async function verifyQuestion({ ctx, subject, examInfo, candidate, signal }) {
  const optionText = candidate.options.length
    ? `\n选项：\n${candidate.options.map((option) => `${option.key}. ${option.text}`).join('\n')}`
    : ''
  const prompt = [
    '下面是待校验的题目。请独立求解后判断它是否可以发布。',
    '',
    describeSubjectForPrompt(subject),
    `目标考研年份：${examInfo?.year || ''} 考研`,
    '',
    '--- 题目 ---',
    candidate.stem,
    optionText,
    '',
    `题型：${QUESTION_TYPE_LABEL[candidate.type] || candidate.type}`,
    `命题人给出的标准答案：${candidate.answer}`,
    candidate.answerKey ? `命题人给出的正确选项：${candidate.answerKey}` : '',
    '',
    '--- 命题人给出的解析 ---',
    candidate.explanation,
    '',
    '--- 校验结果输出（严格 JSON）---',
    '{',
    '  "independentAnswer": "你自己独立求解得到的答案（不要参考上面的标准答案）",',
    '  "pass": true,',
    '  "summary": "一句话结论",',
    '  "issues": ["发现的问题；若通过则为空数组"]',
    '}',
  ].filter(Boolean).join('\n')

  let text = ''
  try {
    const result = await generateText(ctx, {
      system: VERIFIER_SYSTEM,
      prompt,
      maxTokens: 3000,
      temperature: 0,
      signal,
    })
    text = result.text
  } catch (error) {
    // 校验环节自己没能完成时按“未通过”处理：无法确认正确性就不能发布。
    return {
      pass: false,
      issues: [`校验环节未能完成：${error?.message || error}`],
      summary: '校验结果无效',
      independentAnswer: '',
    }
  }

  let parsed
  try {
    parsed = parseJsonLoose(text)
  } catch {
    // 校验环节自己没给出可解析结果时，按“未通过”处理，避免把未校验内容当成已校验。
    return {
      pass: false,
      issues: ['校验环节返回的内容无法解析，无法确认答案正确性'],
      summary: '校验结果无效',
      independentAnswer: '',
    }
  }
  const issues = asStringArray(parsed.issues, 12)
  const pass = parsed.pass === true && issues.length === 0
  return {
    pass,
    issues: pass ? [] : (issues.length ? issues : ['校验环节未明确判定通过']),
    summary: asString(parsed.summary, pass ? '独立校验通过' : '独立校验未通过'),
    independentAnswer: asString(parsed.independentAnswer),
  }
}

/** 归一化类型、选项、字母，保证下游只面对一种形状。 */
export function normalizeCandidate(raw, allowedTypes) {
  const type = normaliseType(asString(raw?.type, 'single'), allowedTypes)
  const options = Array.isArray(raw?.options)
    ? raw.options
      .map((option, index) => {
        if (option && typeof option === 'object') {
          const key = asString(option.key, String.fromCharCode(65 + index)).toUpperCase().slice(0, 1)
          return { key, text: asString(option.text) }
        }
        return { key: String.fromCharCode(65 + index), text: asString(option) }
      })
      .filter((option) => option.text)
      .slice(0, 8)
    : []
  const optionKeys = options.map((option) => option.key)
  const lettersOnly = (value) => asString(value).toUpperCase().replace(/[^A-Z]/g, '')
  const sane = (value) => value && value.length > 0
    && value.split('').every((letter) => optionKeys.includes(letter))
  let answerKey = ''
  if (CHOICE_TYPES.has(type)) {
    const declared = lettersOnly(raw?.answerKey)
    const fromAnswer = lettersOnly(raw?.answer)
    if (sane(declared)) answerKey = declared
    else if (sane(fromAnswer) && fromAnswer.length <= optionKeys.length) answerKey = fromAnswer
    else answerKey = ''
  }
  const difficulty = Number(raw?.difficulty)
  return {
    type,
    stem: asString(raw?.stem),
    options: CHOICE_TYPES.has(type) ? options : [],
    answer: asString(raw?.answer),
    answerKey,
    explanation: asString(raw?.explanation),
    knowledge: asStringArray(raw?.knowledge, 8),
    difficulty: Number.isFinite(difficulty) ? Math.min(5, Math.max(1, Math.round(difficulty))) : 3,
    syllabusCheck: asString(raw?.syllabusCheck),
  }
}

function normaliseType(value, allowedTypes) {  const key = value.toLowerCase()
  const alias = {
    choice: 'single',
    'single-choice': 'single',
    'multi-choice': 'multiple',
    judgment: 'single',
    proof: 'solution',
    calculation: 'solution',
    computation: 'solution',
    essay: 'analysis',
    short: 'shortanswer',
  }
  const mapped = alias[key] || key
  if (allowedTypes.includes(mapped)) return mapped
  return allowedTypes.includes('single') ? 'single' : allowedTypes[0]
}

/** 结构性检查：这里不做学术判断，只拦下明显残缺的产出。 */
export function structuralProblems(candidate, allowedTypes) {
  const problems = []
  if (!candidate.stem || candidate.stem.length < 8) problems.push('题干缺失或过短')
  if (!candidate.answer) problems.push('缺少标准答案')
  if (!candidate.explanation || candidate.explanation.length < 20) problems.push('解析缺失或过短（缺少必要推导）')
  if (!allowedTypes.includes(candidate.type)) problems.push(`题型 ${candidate.type} 不在本科目允许范围内`)
  if (CHOICE_TYPES.has(candidate.type)) {
    if (candidate.options.length < 2) problems.push('选择题至少需要 2 个选项')
    const keys = candidate.options.map((option) => option.key)
    if (new Set(keys).size !== keys.length) problems.push('选项字母重复')
    if (candidate.type === 'single') {
      if (candidate.answerKey.length !== 1) problems.push('单项选择题必须有且仅有一个正确选项')
      else if (!keys.includes(candidate.answerKey)) problems.push('正确选项不在选项列表中')
    } else if (!candidate.answerKey) {
      problems.push('多项选择题必须写明正确选项集合')
    }
    const sorted = candidate.answerKey.split('').sort()
    if (sorted.join('') !== candidate.answerKey) problems.push('多选题正确选项必须按字母升序排列')
  }
  return problems
}

const REVISER_SYSTEM = `你是一位考研命题组的答案复核老师。你的任务是为一道已经存在的题目重新求解并撰写标准答案与解析。

要求：
- 题目本身不变：不要改写题干，也不要新增或删除选项。
- 先自己独立解一遍，再写出标准答案。
- 新答案必须可以被独立验证，不得为了“看起来不同”而改动本来正确的结论。
- 解析必须包含关键思路、必要的推导步骤、核心知识点与易错点。
- 数学公式使用 LaTeX（行内 $...$，独立公式 $$...$$）。
- 只输出一个 JSON 对象，不要输出解释文字或代码围栏。`

/**
 * 为已有题目生成候选的新答案详解，并走一遍独立校验。
 * 只有校验通过的候选才允许替换正式版本。
 */
export async function reviseAnswer({ ctx, subject, examInfo, question, currentAnswer, reason, signal }) {
  const allowed = subjectTypes(question.subjectId, [])
  let feedback = ''
  let lastReview = null
  let modelIdentity = ''
  try {
    const selection = resolveModel(ctx)
    modelIdentity = `${selection.provider}/${selection.model}`
  } catch { /* 同上 */ }

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const prompt = [
      '请为下面这道题重新求解，给出标准答案与完整解析。',
      '',
      describeSubjectForPrompt(subject),
      `目标考研年份：${examInfo?.year || ''} 考研`,
      '',
      '--- 题干（不要改动）---',
      question.stem,
      question.options?.length ? `\n选项：\n${question.options.map((option) => `${option.key}. ${option.text}`).join('\n')}` : '',
      '',
      `题型：${QUESTION_TYPE_LABEL[question.type] || question.type}`,
      '',
      '--- 当前正式答案（用户认为它可能有问题）---',
      currentAnswer?.answer || '（无）',
      '',
      '--- 当前正式解析 ---',
      currentAnswer?.explanation || '（无）',
      '',
      reason ? `用户给出的修订原因/线索：${reason}` : '',
      feedback ? `上一轮校验反馈（必须修正）：\n${feedback}` : '',
      '',
      '输出字段（严格 JSON）：',
      '{',
      '  "answer": "标准答案（Markdown）",',
      '  "answerKey": "选择题的正确选项字母（多选按字母升序），非选择题为空字符串",',
      '  "explanation": "完整解析（Markdown + LaTeX）"',
      '}',
    ].filter(Boolean).join('\n')

    let text = ''
    try {
      const result = await generateText(ctx, { system: REVISER_SYSTEM, prompt, maxTokens: 5000, temperature: 0.3, signal })
      text = result.text
    } catch (error) {
      throw new QuestionGenerationError(`修订环节的模型调用失败：${error?.message || error}`)
    }
    let draft
    try {
      draft = parseJsonLoose(text)
    } catch (error) {
      throw new QuestionGenerationError(`修订模型没有返回可解析的 JSON：${error.message}`)
    }
    const candidate = normalizeCandidate(
      { ...draft, type: question.type, stem: question.stem, options: question.options },
      allowed,
    )
    const problems = structuralProblems(candidate, allowed)
    if (problems.length) {
      feedback = problems.map((item) => `- ${item}`).join('\n')
      lastReview = { pass: false, issues: problems, summary: '结构检查未通过' }
      continue
    }
    const review = await verifyQuestion({ ctx, subject, examInfo, candidate, signal })
    lastReview = review
    if (review.pass) {
      return {
        candidate,
        verification: {
          status: 'passed',
          at: new Date().toISOString(),
          method: 'two-step: 重新求解 (revise) + 独立视角校验 (independent-verify)',
          summary: review.summary || '独立校验通过',
          issues: [],
          attempts: attempt,
          model: modelIdentity,
        },
      }
    }
    feedback = review.issues.map((item) => `- ${item}`).join('\n')
  }

  throw new QuestionGenerationError(
    `候选新答案没有通过独立校验，已保留原正式版本。${lastReview?.issues?.length ? `问题：${lastReview.issues.join('；')}` : ''}`,
  )
}

