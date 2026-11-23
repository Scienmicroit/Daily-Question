import { fitResponse, generateWithLocalReferences as createVerifiedQuestion } from './reference-fixture.mjs'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { reviseAnswer, QuestionGenerationError } from '../lib/generate.js'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'

const subject = { id: 'math1', name: '数学一', types: ['single'], outline: [], guidance: '' }
const writer = { type: 'single', stem: '求下面函数在零点处的极限并选择正确答案。', options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }],
  answer: 'A', answerKey: 'A', explanation: 'WRITER_EXPLANATION：从函数定义出发，使用极限运算法则进行推导，得到选项 A。', knowledge: ['极限'], difficulty: 4 }
const solver = (key = 'A') => ({ solvable: true, answer: key, answerKey: key,
  explanation: 'SOLVER_EXPLANATION：独立使用函数定义和极限运算法则，逐步验证计算结果并说明判定依据。', issues: [] })
const agree = { agree: true, writerValid: true, solverValid: true, summary: '两方结论与推导一致', issues: [] }
const disagree = { agree: false, writerValid: false, solverValid: true, summary: '存在分歧', issues: ['需要主裁复核'] }
const decision = (winner) => ({ winner, questionValid: true, reason: '重新代入原式并逐步推导，已确认胜方答案和解析，另一方在展开时出现符号错误。', issues: [] })
const undecided = { winner: 'undecided', questionValid: false, reason: 'UNRESOLVED：条件是否充分尚不能确定', issues: ['需要重新检查已知条件'] }
const roleOf = (system) => system.includes('独立解题专家') ? 'solver' : system.includes('答案比对专家') ? 'compare' : system.includes('你是主裁') ? 'arbiter' : 'writer'
function scripted(steps) {
  const calls = [], fitCalls = []
  const ctx = { get(name) {
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'test', model: 'default-model' }) }
    if (name === 'llm') return { async *stream(options) {
      if (options.system.includes('独立的考研范围与难度评审员')) {
        fitCalls.push(options)
        yield { type: 'text-delta', text: JSON.stringify(fitResponse()) }
        return
      }
      const index = calls.length
      calls.push({ role: roleOf(options.system), ...options })
      const step = steps[index]
      if (!step) throw new Error('Unexpected model call')
      if (step.chunks) {
        yield* step.chunks
        return
      }
      yield { type: 'text-delta', text: typeof step === 'string' ? step : JSON.stringify(step) }
    } }
  } }
  return { ctx, calls, fitCalls }
}
async function generate(steps, options = {}) {
  const run = scripted(steps)
  const result = await createVerifiedQuestion({ ctx: run.ctx, subject, preferredType: 'single', ...options })
  return { ...run, result }
}
function roles(calls, expected) { assert.deepEqual(calls.map((c) => c.role), expected.split(' ')) }

const initialSuggestions = ['这道题用哪个条件判断极限是否存在？', '能直接用极限运算法则吗？', '怎样检查代入是否合理？']
const accepted = await generate([{ ...writer, followupSuggestions: initialSuggestions }, solver(), agree], {
  followupFocus: [{ topic: '极限的计算', recent: 3, wrong: 2 }],
})
roles(accepted.calls, 'writer solver compare')
const blindPrompt = accepted.calls[1].messages[0].content[0].text
assert.deepEqual(JSON.parse(blindPrompt), { stem: writer.stem, options: writer.options })
assert(!blindPrompt.includes('WRITER_EXPLANATION'))
assert(accepted.calls.every((c) => c.messages.length === 1 && c.model === 'default-model'))
assert.equal(accepted.result.question.answerKey, 'A')
assert.deepEqual(accepted.result.question.followupSuggestions, initialSuggestions)
const writerPrompt = accepted.calls[0].messages[0].content[0].text
assert(writerPrompt.includes('"followupSuggestions"') && writerPrompt.includes('"topic":"极限的计算","recent":3,"wrong":2'))
console.log('ok   命题调用同时预生成首轮建议并参考近期作答，盲解仍只接收题干和选项')
console.log('ok   盲解只接收题干与选项，所有角色独立调用默认模型；一致时发布')

const applicationType = '综合应用题'
const cs408 = { ...subject, id: 'custom_408', name: '计算机学科专业基础综合', types: ['single', applicationType] }
const application = { ...writer, type: applicationType, options: [], answer: '方案甲的平均等待时间更短。', answerKey: '' }
const genericApplication = { ...application, type: 'solution' }
const cs408Options = { subject: cs408, preferredType: applicationType, localReferences: { sources: [] } }
const correctedType = scripted([genericApplication, application, { ...solver(), answer: application.answer, answerKey: '' }, agree])
const customQuestion = await createVerifiedQuestion({ ...cs408Options, ctx: correctedType.ctx })
roles(correctedType.calls, 'writer writer solver compare')
const customPrompt = correctedType.calls[0].messages[0].content[0].text
assert(customPrompt.includes('"type": "综合应用题"') && customPrompt.includes('"options": []'))
const retryPrompt = correctedType.calls[1].messages[0].content[0].text
assert(retryPrompt.includes('本轮需采用指定题型：综合应用题；模型返回："solution"'))
assert(!retryPrompt.includes('选择题至少需要两个有效选项'))
assert.equal(customQuestion.question.type, applicationType)
assert.deepEqual(customQuestion.question.options, [])
for (const wrongType of [genericApplication, { ...application, type: 'single' }, { ...writer, type: undefined }]) {
  const wrongTypeRun = scripted([wrongType, wrongType])
  const requested = wrongType.type === undefined ? { ...cs408Options, preferredType: 'single' } : cs408Options
  await assert.rejects(createVerifiedQuestion({ ...requested, ctx: wrongTypeRun.ctx }), (error) =>
    error instanceof QuestionGenerationError && error.details.trail.length === 2
    && error.details.trail.every((entry) => entry.issues.length === 1 && entry.issues[0].includes('本轮需采用指定题型')))
  roles(wrongTypeRun.calls, 'writer writer')
}
console.log('ok   在线命题精确传递自定义题型，题型错误或缺失不回退成单选')

const hitOutputLimit = (partial) => ({ chunks: [
  { type: 'reasoning-delta', text: '模型正在推演' },
  ...(partial ? [{ type: 'text-delta', text: '{"type":"single","stem":' }] : []),
  { type: 'usage', usage: { outputTokens: 8000 } },
  { type: 'finish', reason: { kind: 'max-tokens' } },
] })
for (const partial of [false, true]) {
  const recovered = scripted([hitOutputLimit(partial), writer, solver(), agree])
  const result = await createVerifiedQuestion({ ctx: recovered.ctx, subject })
  roles(recovered.calls, 'writer writer solver compare')
  assert.deepEqual(recovered.calls.map((call) => call.maxTokens), [8000, 16000, 5000, 5000])
  assert(recovered.calls[1].messages[0].content[0].text.includes('已耗尽输出额度'))
  assert.equal(result.question.answerKey, 'A')
}
const twiceLimited = scripted([hitOutputLimit(false), hitOutputLimit(false)])
await assert.rejects(createVerifiedQuestion({ ctx: twiceLimited.ctx, subject }), /连续 2 次命题.*耗尽输出额度/)
roles(twiceLimited.calls, 'writer writer')
console.log('ok   命题推理耗尽预算或截断时扩大一次预算；两轮仍失败则不进入盲解')

const corrected = await generate([writer, solver('B'), disagree, decision('solver')])
roles(corrected.calls, 'writer solver compare arbiter')
assert.equal(corrected.result.question.answerKey, 'B')
assert.equal(corrected.result.question.explanation, solver('B').explanation)
assert.equal(corrected.result.question.stem, writer.stem)
assert.deepEqual(corrected.result.question.knowledge, writer.knowledge)
assert.equal(corrected.result.question.difficulty, 3)
assert.equal(corrected.fitCalls.length, 1)
assert(!Object.hasOwn(JSON.parse(corrected.fitCalls[0].messages[0].content[0].text).question, 'difficulty'))
console.log('ok   主裁选择盲解方后采用该方答案解析，并保留原题干与元数据')

const kept = await generate([writer, solver('B'), disagree, decision('writer')])
assert.equal(kept.result.question.explanation, writer.explanation)
console.log('ok   主裁选择命题方时保留命题答案解析')

const uncertain = await generate([writer, { ...solver('B'), solvable: false, issues: ['对已知条件存在疑问'] }, disagree, decision('solver')])
assert.equal(uncertain.result.question.answerKey, 'B')
console.log('ok   盲解方提出疑问但已给出完整解答时，允许主裁核实后采纳')

const incomplete = await generate([writer, { solvable: false, answer: '', explanation: '', issues: ['无法求解'] }, disagree, decision('solver'), decision('writer')])
assert.equal(incomplete.calls.length, 5)
assert.equal(incomplete.result.question.answerKey, 'A')
console.log('ok   主裁不能选择没有完整答案解析的盲解结果')

const secondRound = await generate([writer, solver('B'), disagree, undecided, decision('solver')])
assert.equal(secondRound.calls.length, 5)
assert(secondRound.calls[4].messages[0].content[0].text.includes('UNRESOLVED'))
assert.deepEqual(secondRound.result.verification.trail.filter((t) => t.stage === 'arbitration').map((t) => t.round), [1, 2])
console.log('ok   主裁第二轮收到第一轮的未解决问题，成功后结束裁决')

const newWriter = { ...writer, stem: '重新命题：计算另一个函数的极限并选择正确答案。' }
const regenerated = await generate([writer, solver('B'), disagree, undecided, undecided, newWriter, solver(), agree])
roles(regenerated.calls, 'writer solver compare arbiter arbiter writer solver compare')
assert.equal(regenerated.result.verification.attempts, 2)
assert.deepEqual(JSON.parse(regenerated.calls[6].messages[0].content[0].text), { stem: newWriter.stem, options: newWriter.options })
assert(!regenerated.calls[6].messages[0].content[0].text.includes('UNRESOLVED'))
assert(regenerated.calls[5].messages[0].content[0].text.includes('UNRESOLVED'))
console.log('ok   主裁两轮不确定后重新命题，反馈只给命题方，不污染新一轮盲解')

const reused = scripted([writer, solver('B'), disagree, undecided, undecided, writer])
await assert.rejects(createVerifiedQuestion({ ctx: reused.ctx, subject }), /必须换一道新题/)
assert.equal(reused.calls.length, 6)
console.log('ok   重新命题若原样复用已废弃题干，程序拒绝发布')

const falseAgreement = await generate([writer, solver('B'), agree, decision('solver')])
roles(falseAgreement.calls, 'writer solver compare arbiter')
assert.equal(falseAgreement.result.question.answerKey, 'B')
console.log('ok   选项不一致时，程序阻止比对模型错误放行并交主裁')

const failedComparison = await generate([writer, solver('B'), 'unparseable comparison', decision('writer')])
assert.equal(failedComparison.result.question.answerKey, 'A')
const failedBlind = await generate([writer, 'unparseable blind answer', newWriter, solver(), agree])
roles(failedBlind.calls, 'writer solver writer solver compare')
assert.equal(failedBlind.result.verification.attempts, 2)
console.log('ok   比对失败交主裁；盲解失败重新命题，均不直接放行')

for (const invalid of ['invalid json', { ...decision('solver'), issues: 'invalid' }, { ...decision('solver'), reason: '' }, { ...decision('writer'), questionValid: false }, decision('third-answer')]) {
  const retried = await generate([writer, solver('B'), disagree, invalid, decision('writer')])
  assert.equal(retried.calls.length, 5)
  assert.equal(retried.result.question.answerKey, 'A')
}
console.log('ok   主裁输出无效、缺少理由、题目有问题或选择第三方答案时不发布，改走第二轮')

const revisionRun = scripted([writer, solver('B'), disagree, decision('solver')])
const original = structuredClone(writer)
const revision = await reviseAnswer({ ctx: revisionRun.ctx, subject, question: { ...writer, subjectId: subject.id }, currentAnswer: writer })
assert.equal(revision.candidate.answerKey, 'B')
assert.deepEqual(writer, original)
assert.equal(revision.verification.trail.at(-1).winner, 'solver')
console.log('ok   答案修订同样走盲解与主裁，胜方只作为候选，不直接修改正式答案')

const failureSteps = [writer, solver('B'), disagree, undecided, undecided, newWriter, solver('B'), disagree, undecided, undecided]
const failure = scripted(failureSteps)
const temp = await mkdtemp(join(tmpdir(), 'daily-question-blind-'))
const service = new DailyQuestionService(failure.ctx)
try {
  service.store = new Store(temp)
  await service.saveSettings({ subjects: ['math1'], subjectSource: { math1: 'online' } })
  await assert.rejects(service.ensureDaily('math1', { manual: true }), /已阻止发布/)
  assert.equal(failure.calls.length, 10)
  const data = await service.data()
  assert.equal(Object.keys(data.questions).length, 0)
  assert.equal(Object.keys(data.daily).length, 0)
  assert(data.failures.math1)
  const errorRun = scripted(failureSteps)
  await assert.rejects(createVerifiedQuestion({ ctx: errorRun.ctx, subject }), (error) => error instanceof QuestionGenerationError
    && error.details.trail.filter((t) => t.stage === 'arbitration').length === 4)
  console.log('ok   两道题各裁决两轮仍不确定时终止，不保存题目或今日分配，并记录失败与裁决轨迹')
} finally {
  service.dispose()
  assert(resolve(temp).startsWith(resolve(tmpdir()) + sep))
  await rm(temp, { recursive: true, force: true })
}
console.log('全部通过')
