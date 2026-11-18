import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'

const dir = await mkdtemp(join(tmpdir(), 'dq-study-stats-'))
const OriginalDate = Date
globalThis.Date = class extends OriginalDate {
  constructor(...args) { super(...(args.length ? args : [2026, 10, 17, 12])) }
}
try {
  const service = new DailyQuestionService({})
  service.store = new Store(dir)
  const empty = await service.studyStats()
  assert.equal(empty.days.length, 7)
  assert.equal(empty.totals.attempts, 0)
  assert.equal(empty.streak, 0)
  assert.deepEqual(empty.subjects, [])

  await service.store.update((draft) => {
    draft.settings.subjects = ['math1', 'math3']
    draft.questions = {
      a: { id: 'a', subjectId: 'math1', favoriteAt: '2026-11-16' },
      b: { id: 'b', subjectId: 'math2', wrongBookRemoved: true },
      c: { id: 'c', subjectId: 'math1' },
    }
    draft.attempts = [
      { questionId: 'b', practiceDate: '2026-11-01', result: 'wrong' },
      { questionId: 'a', practiceDate: '2026-11-15', result: 'correct' },
      { questionId: 'a', practiceDate: '2026-11-16', result: 'wrong' },
      { questionId: 'b', at: new OriginalDate(2026, 10, 16, 12).toISOString(), result: 'pending' },
      { questionId: 'removed', practiceDate: '2026-11-17', result: 'correct' },
    ]
  })
  const result = await service.studyStats()
  assert.deepEqual(result.totals, { attempts: 4, correct: 1, wrong: 2, pending: 1,
    attempted: 2, favorite: 1, wrongBook: 1, review: 1 })
  assert.equal(result.streak, 2, '今天尚未作答时，从昨天计算连续练习')
  assert.deepEqual(result.days.at(-2), { date: '2026-11-16', attempts: 2, correct: 0, wrong: 1, pending: 1 })
  assert.deepEqual(result.subjects.map((row) => [row.id, row.enabled, row.attempted, row.all, row.attempts]),
    [['math1', true, 1, 2, 2], ['math3', true, 0, 0, 0], ['math2', false, 1, 1, 2]])
} finally {
  globalThis.Date = OriginalDate
  await rm(dir, { recursive: true, force: true })
}
