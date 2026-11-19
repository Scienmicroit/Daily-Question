import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { addDays, todayISO } from '../lib/exam-dates.js'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'

const temp = resolve(tmpdir())
const root = await mkdtemp(join(temp, 'dq-review-search-'))
const service = new DailyQuestionService({})
service.store = new Store(root)
const today = todayISO()
const list = (kind, extras = {}) => service.listQuestions({ subjectId: 'math1', kind, ...extras })
try {
  await service.store.update((draft) => {
    draft.settings.subjects = ['math1']
    const questions = [
      ['overdue', '矩阵的秩和极限混合练习 A2', 'single', ['线性代数']],
      ['pending', '行列式的计算方法', 'solution', ['线性代数']],
      ['new-wrong', '矩阵的秩新题', 'fill', ['线性代数']],
      ['trained', '矩阵的秩旧题 A2', 'single', ['线性代数']],
      ['removed', '矩阵的秩已移出', 'single', ['线性代数']],
      ['manual', '行列式专项', 'solution', []],
      ['other', '矩阵的秩属于数学二 A2', 'single', ['线性代数']],
    ]
    for (const [id, stem, type, knowledge] of questions) {
      draft.questions[id] = { id, subjectId: id === 'other' ? 'math2' : 'math1', stem, type, knowledge,
        options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }],
        currentAnswer: { versionId: 'v', answer: 'A', answerKey: 'A' },
        assignedDate: today, favoriteAt: id === 'overdue' ? today : null }
    }
    draft.questions.removed.wrongBookRemoved = true
    draft.questions.manual.wrongBookAdded = true
    const add = (id, delta, result) => draft.attempts.push({
      id: id + draft.attempts.length, questionId: id, result, practiceDate: addDays(today, delta),
    })
    add('overdue', -5, 'wrong')
    add('pending', -1, 'wrong')
    add('pending', 0, 'pending')
    add('new-wrong', 0, 'wrong')
    add('trained', -10, 'wrong')
    add('trained', -9, 'correct')
    add('trained', -9, 'correct')
    add('trained', -1, 'correct')
    add('removed', -8, 'wrong')
    add('other', -8, 'wrong')
  })
  const due = await list('review')
  assert.deepEqual(due.items.map(({ id }) => id), ['overdue', 'pending', 'manual'])
  assert.equal(due.items[0].reviewDue, addDays(today, -4))
  assert.equal((await service.bootstrap()).counts.math1.review, 3)
  assert.deepEqual(new Set((await list('wrong', { mastery: 'due', idsOnly: true })).ids), new Set(due.items.map(({ id }) => id)))
  await service.reveal({ qid: 'overdue', choice: 'A', attemptId: 'review-r1' })
  assert.deepEqual((await list('review', { idsOnly: true })).ids, ['pending', 'manual'])
  await service.reveal({ qid: 'overdue', choice: 'B', attemptId: 'review-r2' })
  assert(!((await list('review', { idsOnly: true })).ids.includes('overdue')), '今天再错，明天重新排入')
  await service.removeFromWrongBook({ qid: 'pending' })
  assert.deepEqual((await list('review', { idsOnly: true })).ids, ['manual'])

  const filters = { query: '线性代数 Ａ２', type: 'single', pageSize: 1 }
  const first = await list('all', filters)
  const second = await list('all', { ...filters, page: 2 })
  assert.equal(first.total, 2)
  assert.equal(first.totalPages, 2)
  assert.notEqual(first.items[0].id, second.items[0].id)
  const ids = await list('all', { ...filters, idsOnly: true })
  assert.deepEqual(ids.ids, [first.items[0].id, second.items[0].id], '筛选列表与跨页全选使用同一范围')
  assert.deepEqual((await list('favorite', { ...filters, idsOnly: true })).ids, ['overdue'])
  assert.deepEqual((await list('wrong', { ...filters, mastery: 'mastered', idsOnly: true })).ids, ['trained'])
  assert.deepEqual((await list('wrong', { ...filters, mastery: 'unmastered', idsOnly: true })).ids, ['overdue'])
  assert.equal((await list('all', { query: '不存在的内容' })).total, 0)

  const RealDate = Date
  let clock = RealDate.now()
  const atDay = (delta) => { clock = new RealDate(addDays(today, delta) + 'T12:00:00').getTime() }
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock])) }
    static now() { return clock }
  }
  try {
    await service.store.update((draft) => {
      for (const [id, type] of [['streak', 'single'], ['direct', 'single'], ['subjective', 'solution']]) {
        draft.questions[id] = { ...draft.questions.overdue, id, type, wrongBookAdded: true, favoriteAt: null }
        draft.attempts.push({ id: id + '-initial', questionId: id, result: 'wrong', practiceDate: addDays(today, -1) })
      }
    })
    const answer = (qid, day, attemptId, choice = 'A', fromReview = true) => {
      atDay(day)
      return service.reveal({ qid, attemptId, choice, fromReview })
    }
    for (const day of [0, 3, 10]) {
      const direct = await answer('direct', day, 'direct-' + day, 'A', false)
      assert.equal(direct.question.wrongEver, true)
      assert.equal(direct.reviewRemovalId, null)
    }
    assert.equal((await answer('streak', 0, 'correct-initial')).question.wrongEver, true)
    assert.equal((await answer('streak', 0, 'early-repeat')).question.wrongEver, true)
    await answer('streak', 3, 'wrong-reset', 'B')
    assert.equal((await answer('streak', 4, 'correct-first')).question.wrongEver, true)
    assert.equal((await answer('streak', 7, 'correct-second')).question.wrongEver, true)
    const removed = await answer('streak', 14, 'correct-third')
    assert.equal(removed.question.wrongEver, false)
    assert.equal(removed.reviewRemovalId, 'correct-third')
    assert(!(await list('wrong', { idsOnly: true })).ids.includes('streak'))
    assert.equal((await answer('streak', 14, 'correct-third')).duplicated, true)
    await service.undoReviewRemoval({ qid: 'streak', removalId: removed.reviewRemovalId })
    assert((await list('wrong', { idsOnly: true })).ids.includes('streak'))
    await assert.rejects(service.undoReviewRemoval({ qid: 'streak', removalId: removed.reviewRemovalId }), /无法撤销/)
    assert.equal((await answer('streak', 28, 'after-undo')).question.wrongEver, true)

    for (const day of [0, 3, 10]) {
      atDay(day)
      const attemptId = 'subjective-' + day
      const pending = await service.reveal({ qid: 'subjective', attemptId, mode: 'done', fromReview: true })
      assert.equal(pending.reviewRemovalId, null)
      assert.equal(pending.question.wrongEver, true)
      const judged = await service.judge({ qid: 'subjective', attemptId, verdict: 'correct' })
      assert.equal(judged.question.wrongEver, day < 10)
      assert.equal(judged.reviewRemovalId, day === 10 ? attemptId : null)
    }
  } finally { globalThis.Date = RealDate }
} finally {
  service.dispose()
  assert.equal(dirname(resolve(root)), temp)
  assert(basename(root).startsWith('dq-review-search-'))
  await rm(root, { recursive: true, force: true })
}
