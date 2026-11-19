import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addDays, todayISO } from '../lib/exam-dates.js'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'

const dir = await mkdtemp(join(tmpdir(), 'dq-memory-'))
const RealDate = Date
const start = todayISO()
let date = start
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [date + 'T12:00:00'])) }
  static now() { return new RealDate(date + 'T12:00:00').getTime() }
}
const moves = (offset) => { date = addDays(start, offset) }
const topic = '分段点的连续性'
const nextTopic = '单侧极限'
const otherTopic = '导数的定义'
const note = '我容易忘记先检查分段点。'
const calls = []
let rejectCoverage = false
let waitAnalysis
let signalAnalysis
let writers = 0
const solver = { solvable: true, answer: 'A', answerKey: 'A',
  explanation: '由连续性定义核对左右极限与函数值，计算可知正确选项是 A。', issues: [] }
const service = new DailyQuestionService({ get(name) {
  if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'test', model: 'default' }) }
  if (name === 'llm') return { async *stream(options) {
    const prompt = options.messages[0].content[0].text
    const system = options.system
    let role, response
    if (system.includes('学习教练')) {
      role = 'analysis'
      signalAnalysis?.()
      await waitAnalysis
      response = { topics: [{ topic, suggestion: '先核对左极限、右极限及函数值。' }, { topic: '没有证据的题型', suggestion: '不应显示' }] }
    } else if (system.includes('独立解题专家')) {
      role = 'blind'
      response = solver
    } else if (system.includes('答案比对专家')) {
      role = 'compare'
      response = { agree: true, writerValid: true, solverValid: true, summary: '结论一致', issues: [] }
    } else if (system.includes('范围评审员')) {
      role = 'scope'
      response = { inScope: null, coverageMatched: !rejectCoverage, rationale: '已核对题干和解法', issues: [], outlineEvidence: [] }
    } else {
      role = 'writer'
      response = { ...solver, type: 'single',
        stem: ['分段函数在连接点左右极限相等时，还需要检验哪个条件才能确定连续？',
          '已知若干函数在区间内满足一致收敛条件，下列关于积分值的说法何者正确？',
          '已知函数定义于闭区间，如何利用介值性质确定某个常数的存在性？',
          '若一个函数在原点附近满足给定的渐近展开，求与该展开相关的系数。'][writers++],
        options: [{ key: 'A', text: '函数值也等于该极限' }, { key: 'B', text: '两侧导数必须不相等' }], knowledge: [topic] }
    }
    calls.push({ role, prompt })
    yield { type: 'text-delta', text: JSON.stringify(response) }
  } }
} })
service.store = new Store(dir)

try {
  await service.store.update((draft) => {
    draft.settings.subjects = ['math1', 'memory-test']
    draft.settings.subjectSource = { math1: 'bank', 'memory-test': 'online' }
    draft.customSubjects = [{ id: 'memory-test', name: '自定义微积分', types: ['single'] }]
    const seed = (subjectId, tag, results) => {
      results.forEach((result, index) => {
        const id = subjectId + ':' + tag + ':' + index
        draft.questions[id] = { id, subjectId, stem: '本地历史题，题干不应发给学习分析模型', type: 'single', knowledge: [tag] }
        if (result === 'wrong') draft.attempts.push({ id: id + '-earlier', questionId: id, practiceDate: addDays(start, -4), result })
        draft.attempts.push({ id: id + '-last', questionId: id, practiceDate: addDays(start, -3), result })
      })
    }
    for (const tag of [topic, nextTopic, otherTopic]) seed('math1', tag, ['wrong', 'wrong', 'correct'])
    seed('math1', '未判定知识点', ['pending', 'wrong'])
    seed('memory-test', topic, ['wrong', 'wrong', 'correct'])
    draft.banks = [{ id: 'memory-test-bank', name: '练习库', subjectId: 'math1',
      items: [topic, nextTopic, otherTopic, '普通主题'].map((tag, index) => ({
        id: String(index), type: 'single', stem: `以下哪一项符合相关定义：${tag}？`, knowledge: [tag],
        options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }], answer: 'A', answerKey: 'A',
      })) }]
  })
  assert.deepEqual(await service.getStudyMemory({ subjectId: 'math1' }), { enabled: false, reinforce: false })
  await assert.rejects(service.analyzeStudyMemory({ subjectId: 'math1' }), /请先开启/)
  assert.equal(calls.length, 0)
  await service.saveMemoryPreferences({ enabled: true })
  const memory = () => service.getStudyMemory({ subjectId: 'math1' })
  const first = await memory()
  const row = first.rows.find((row) => row.topic === topic)
  assert.deepEqual([row.recent, row.wrong, row.due, row.status], [3, 2, 2, 'weak'])
  assert.equal(first.rows.find((row) => row.topic === '未判定知识点').status, 'insufficient')
  const related = await service.listQuestions({ subjectId: 'math1', kind: 'review', topic, idsOnly: true })
  assert.equal(related.total, 2)
  assert(related.ids.every((id) => id.includes(topic)))
  await service.saveMemoryNote({ subjectId: 'math1', topic, note })
  assert.equal(calls.length, 0, '读取、写笔记与本地统计不调用模型')
  const advice = await service.analyzeStudyMemory({ subjectId: 'math1' })
  assert.equal(advice.topics.length, 1, '丢弃没有作答证据的模型输出')
  assert.equal(advice.topics[0].latestWrong, 2)
  assert(calls[0].prompt.includes(note) && !calls[0].prompt.includes('本地历史题'))
  assert.deepEqual((await memory()).analysis, advice)

  let releaseAnalysis
  let started
  waitAnalysis = new Promise((resolve) => { releaseAnalysis = resolve })
  const analysisStarted = new Promise((resolve) => { started = resolve })
  signalAnalysis = started
  const interrupted = assert.rejects(service.analyzeStudyMemory({ subjectId: 'math1' }), /取消/)
  await analysisStarted
  await service.saveMemoryPreferences({ enabled: false })
  await interrupted
  releaseAnalysis()
  signalAnalysis = null
  waitAnalysis = null
  const backup = await service.exportBackup()
  assert.equal(backup.data.studyMemory.math1.notes[topic], note)
  assert.deepEqual(backup.data.studyMemory.math1.analysis, advice)
  await service.restoreBackup({ data: backup.data, confirmed: true })
  await service.saveMemoryPreferences({ enabled: true, reinforce: true })
  assert.equal((await memory()).rows.find((row) => row.topic === topic).note, note)

  for (let day = 0; day <= 2; day++) {
    moves(day)
    const result = await service.ensureDaily('math1')
    assert(result.created)
    assert.equal((await service.ensureDaily('math1')).question.id, result.question.id)
  }
  const bankDays = Object.values((await service.exportBackup()).data.daily).filter((entry) => entry.subjectId === 'math1')
  assert.equal(bankDays.length, 3)
  assert(bankDays[0].reinforcementTopic && bankDays[1].reinforcementTopic)
  assert.notEqual(bankDays[0].reinforcementTopic, bankDays[1].reinforcementTopic)
  assert.equal(bankDays[2].reinforcementTopic, undefined, '连续 7 天窗口内第三题按普通规则选')

  await service.saveMemoryNote({ subjectId: 'memory-test', topic, note })
  const online = await service.ensureDaily('memory-test')
  const onlineDay = (await service.exportBackup()).data.daily[date + '|memory-test']
  assert.equal(onlineDay.questionId, online.question.id)
  assert.equal(onlineDay.reinforcementTopic, topic)
  assert(calls.find((call) => call.role === 'writer').prompt.includes(note))
  for (const call of calls.filter((call) => call.role === 'blind')) {
    assert.deepEqual(Object.keys(JSON.parse(call.prompt)), ['stem', 'options'])
    assert(!call.prompt.includes(note))
  }
  assert.equal(JSON.parse(calls.find((call) => call.role === 'scope').prompt).coverageTarget, topic)

  moves(4)
  rejectCoverage = true
  await service.store.update((draft) => {
    draft.daily[addDays(start, 3) + '|memory-test'] = { date: addDays(start, 3), subjectId: 'memory-test', questionId: 'ordinary' }
  })
  const fallback = await service.ensureDaily('memory-test')
  assert(fallback.created)
  const after = (await service.exportBackup()).data
  assert.equal(after.daily[date + '|memory-test'].reinforcementTopic, undefined, '指定知识点未通过独立校验后回退常规出题')
  assert.equal(calls.filter((call) => call.role === 'scope').length, 3)
  assert(!calls.filter((call) => call.role === 'writer').at(-1).prompt.includes(note))
} finally {
  service.dispose()
  globalThis.Date = RealDate
  await rm(dir, { recursive: true, force: true })
}
