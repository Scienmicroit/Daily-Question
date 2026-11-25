import { QUESTION_TYPE_LABEL } from './subjects.js'
import { generateText, parseJsonLoose } from './llm-json.js'
import { memoryTopics } from './study-memory.js'

const SUGGESTION_MARKER = '<<<追问建议>>>'

function collectSuggestions(...lists) {
  const questions = new Map()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      const value = typeof entry === 'string' ? entry.trim().replace(/\s+/g, ' ') : ''
      if (value.length > 80 || !/[？?]$/.test(value)) continue
      const key = value.normalize('NFKC').replace(/\s+/g, '')
      if (!questions.has(key)) questions.set(key, value)
      if (questions.size === 3) return [...questions.values()]
    }
  }
  return [...questions.values()]
}

export function prepareOpeningSuggestions(question, proposed, focus = []) {
  const topics = memoryTopics(question).filter((topic) => topic.length <= 30)
  const topic = focus.find((row) => topics.includes(row.topic))?.topic || topics[0]
  return collectSuggestions(proposed, [
    topic ? `在这道题里，怎样判断何时应使用「${topic}」？` : '这道题应该从哪一个已知条件入手？',
    '解这道题时，哪一步最容易判断错？',
    '怎样用另一种思路检验本题的结论？',
  ])
}

export function openingSuggestionsForAttempt(question, attempt) {
  const prepared = prepareOpeningSuggestions(question, question.followupSuggestions)
  if (attempt?.result !== 'wrong') return prepared
  const prompt = /^[A-H]+$/.test(attempt.choice || '')
    ? `我选了 ${[...attempt.choice].join('、')}，这个判断哪里出了问题？`
    : attempt.mode === 'giveup' ? '这道题没能做出来，第一步应该怎么想？'
      : '能从本题最容易出错的推导开始帮我复盘吗？'
  return collectSuggestions([prompt], prepared)
}

export function continuedFollowupSuggestions(reply, proposed) {
  const section = /^#{1,6}[ \t]+([^\r\n]+)$/m.exec(reply || '')?.[1]?.trim()
  return collectSuggestions(proposed, [
    section && section.length <= 30 ? `能再解释一下「${section}」这一步的依据吗？` : '刚才的解释中，关键一步为什么成立？',
    '可以沿用刚才的思路举一个更简单的例子吗？',
    '如果改变题目中的一个条件，刚才的方法还适用吗？',
  ])
}

const TUTOR_SYSTEM = `你是中国大陆硕士研究生招生考试的辅导老师，正在回答学生针对“当前这一道题”的追问。

规则：
- 只讨论当前这道题：题干、选项、标准答案、解析以及由它们直接延伸的知识点。如果学生的提问明显超出这道题的范围，先说明它与本题的关系，再简短回答，不要把它当成跨题的通用聊天。
- 用 Markdown 回答；数学公式用 LaTeX（行内 $...$，独立公式 $$...$$）。
- 解释要一步步来，指出关键依据，不要只给结论。
- 你给出的解释是对当前题目参考答案的补充说明，不能宣称修改了已保存的答案与解析；模型生成、导入或修订的答案都不能称为“官方答案”。
- 如果题目资料里标记答案尚未核验或缺少参考答案，必须如实说明，不要把未核验的内容说成确定结论。
- 不要编造与题目无关的事实。
- 正文写完后，另起一行只写 ${SUGGESTION_MARKER}，下一行输出 JSON 对象 {"suggestions":["下一条可能的问题？","另一条可能的问题？"]}。给出 2–3 条符合本题、用户当前提问及刚写的回复的简短问题。使用学生口吻，避免重复已讨论的问题，不要在问题中直接提供结论。建议问句的公式用 $...$ 包裹，JSON 字符串内转义反斜杠，其余使用普通文本。正文中不要复述建议清单。`

/** 把一道题的资料整理成上下文文本。 */
export function describeQuestionContext(question, answerDetail) {
  const lines = []
  lines.push(`题目 ID：${question.id}`)
  lines.push(`科目：${question.subjectName || question.subjectId}`)
  lines.push(`题型：${QUESTION_TYPE_LABEL[question.type] || question.type}`)
  lines.push(`出题日期：${question.assignedDate || question.createdAt || ''}`)
  lines.push(`难度：${question.difficulty || 3}/5`)
  if (question.knowledge?.length) lines.push(`知识点：${question.knowledge.join('、')}`)
  lines.push('')
  lines.push('--- 题干 ---')
  lines.push(question.stem)
  if (question.options?.length) {
    lines.push('')
    lines.push('--- 选项 ---')
    for (const option of question.options) lines.push(`${option.key}. ${option.text}`)
  }
  lines.push('')
  if (answerDetail?.answer?.trim()) {
    const status=answerDetail.verified===true?'已通过独立校验，仍非官方认证':'尚未独立核验，可能有误，请先核对'
    lines.push(`--- 参考答案（${status}）---`)
    lines.push(answerDetail.answer)
    lines.push('')
    lines.push(`--- 参考解析（${status}）---`)
    lines.push(answerDetail.explanation||'（尚未提供解析）')
  } else {
    lines.push('--- 答案状态 ---')
    lines.push('本题的参考答案与解析尚未通过独立校验或尚未生成，请如实说明，不要给出确定的“标准答案”。')
  }
  return lines.join('\n')
}

/**
 * 生成一条追问回复。只使用当前题目的资料与该题的线程历史。
 */
export async function answerFollowup({ ctx, question, answerDetail, history, message, signal }) {
  const context = describeQuestionContext(question, answerDetail)
  const recent = (Array.isArray(history) ? history : [])
    .filter((item) => item && typeof item.text === 'string' && (item.role === 'user' || item.role === 'assistant'))
    .slice(-12)

  const conversation = []
  for (const item of recent) {
    conversation.push(`【${item.role === 'user' ? '学生' : '老师'}】${item.text}`)
  }
  conversation.push(`【学生】${message}`)

  const prompt = [
    '以下是这道题的全部资料：',
    '',
    context,
    '',
    '--- 本题此前的追问记录 ---',
    conversation.length > 1 ? conversation.slice(0, -1).join('\n\n') : '（暂无）',
    '',
    '--- 学生的新问题 ---',
    message,
    '',
    '请只针对这道题回答。',
  ].join('\n')

  const { text } = await generateText(ctx, {
    system: TUTOR_SYSTEM,
    prompt,
    maxTokens: 3000,
    temperature: 0.5,
    signal,
  })
  const marker = /^[ \t]*<<<追问建议>>>[ \t]*\r?$/m.exec(text)
  const reply = marker ? text.slice(0, marker.index).trimEnd() : text
  if (!reply) throw new Error('模型没有返回追问正文')
  let proposed
  if (marker) {
    try { proposed = parseJsonLoose(text.slice(marker.index + marker[0].length))?.suggestions }
    catch { /* 建议格式不完整时保留正常正文，并从本轮回复生成备选问题。 */ }
  }
  return { text: reply, suggestions: continuedFollowupSuggestions(reply, proposed) }
}
