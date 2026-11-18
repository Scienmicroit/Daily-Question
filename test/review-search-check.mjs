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
} finally {
  service.dispose()
  assert.equal(dirname(resolve(root)), temp)
  assert(basename(root).startsWith('dq-review-search-'))
  await rm(root, { recursive: true, force: true })
}
