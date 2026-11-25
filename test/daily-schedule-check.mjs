import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DailyQuestionService } from '../lib/service.js'
import { Store } from '../lib/store.js'
import { recognizeFixtureBank } from './bank-parser-fixture.mjs'

const dir = await mkdtemp(join(tmpdir(), 'daily-question-schedule-'))
const SystemDate = Date
let day = 17
globalThis.Date = class extends SystemDate {
  constructor(...args) {
    super(...(args.length ? args : [2026, 10, day, 12]))
  }
}

try {
  const service = new DailyQuestionService({ get: () => undefined }, { recognizeBank: recognizeFixtureBank })
  service.store = new Store(dir)
  await service.store.update((draft) => {
    draft.settings.subjects = ['politics']
    draft.settings.subjectSource.politics = 'bank'
  })
  const initial = await service.saveSettings({
    subjects: ['politics', 'math1'], subjectSource: { math1: 'bank' },
  })
  assert.equal(initial.dailyPlans.politics.pendingStart, false, '升级前已启用的科目继续自动出题')
  assert.equal(initial.dailyPlans.math1.pendingStart, true)
  assert.equal((await service.ensureDaily('math1')).status, 'manual')
  await assert.rejects(service.ensureDaily('math1', { manual: true }), /题库中没有/)
  const failed = await service.ensureDaily('math1')
  assert.equal(failed.status, 'failed', '首次出题失败后保留失败状态')
  assert.match(failed.message, /题库中没有/)
  await service.store.update((draft) => { delete draft.failures.math1.date })
  assert.equal((await service.ensureDaily('math1')).status, 'failed', '兼容旧版同一天的失败记录')
  const bankText = [
    '## 第 1 题', '求函数 f(x)=x^2 在 x=1 处的导数。', '', 'A. 1', 'B. 2', 'C. 3', 'D. 4', '', '答案：B', '解析：导数为 2x。',
  ].join('\n')
  for (const id of ['math1', 'math2', 'politics']) {
    const imported = await service.importBank({ name: id, kind: 'md', fileName: 'test.md', text: bankText })
    await service.commitBank({ importId: imported.importId, name: id, subjectId: id })
  }
  const first = await service.ensureDaily('math1', { manual: true })
  assert(first.created)
  assert.equal((await service.bootstrap()).dailyPlans.math1.pendingStart, false)

  const skip = (date, value) => service.setDailySkip({ date: `2026-11-${date}`, skip: value })
  let result = await skip(18, true)
  assert.equal(result.dailyPlans.math1.tomorrowSkipped, true)
  assert.equal(result.dailyPlans.politics.tomorrowSkipped, true)
  assert.equal((await skip(18, false)).dailyPlans.politics.tomorrowSkipped, false)
  await skip(18, true)
  day = 18
  const reopened = new DailyQuestionService({ get: () => undefined })
  reopened.store = new Store(dir)
  assert.equal((await reopened.ensureDaily('math1')).status, 'skipped')
  assert.equal((await reopened.ensureDaily('politics')).status, 'skipped')
  assert.equal((await reopened.ensureDaily('math1', { manual: true })).status, 'skipped')
  assert.equal((await reopened.bootstrap()).dailyPlans.math1.nextDate, '2026-11-19')
  result = await skip(19, true)
  assert.equal(result.dailyPlans.math1.todaySkipped, true)
  assert.equal(result.dailyPlans.math1.tomorrowSkipped, true)
  assert.equal(result.dailyPlans.math1.nextDate, '2026-11-20')
  assert.equal((await skip(18, false)).dailyPlans.math1.tomorrowSkipped, true)
  assert((await service.ensureDaily('math1')).created, '取消跳过当天后恢复自动出题')
  assert((await service.ensureDaily('politics')).created, '取消跳过今天同样恢复其他科目')

  day = 19
  assert.equal((await service.ensureDaily('math1')).status, 'skipped')
  day = 20
  assert((await service.ensureDaily('math1')).created, '跳过日期以外自动出题')
  await service.store.update((draft) => {
    draft.banks = draft.banks.filter((bank) => bank.subjectId !== 'politics')
  })
  await assert.rejects(service.ensureDaily('politics'), /题库中没有/)
  const imported = await service.importBank({ name: 'politics', kind: 'md', fileName: 'test.md', text: bankText })
  await service.commitBank({ importId: imported.importId, name: 'politics', subjectId: 'politics' })
  assert.equal((await service.ensureDaily('politics')).status, 'failed', '即使资料已修复，当天仍等待点击重试')
  await service.saveSettings({ subjects: ['politics'] })
  await service.saveSettings({ subjects: ['politics', 'math1'] })
  assert.equal((await service.ensureDaily('math1')).question.id, first.question.id, '重新启用仍可查看已分配的当天题目')
  day = 21
  assert.equal((await service.bootstrap()).failures.politics, undefined, '次日不显示前一天的失败')
  assert((await service.ensureDaily('politics')).created, '次日恢复每日本来安排')
  assert.equal((await service.ensureDaily('math1')).status, 'manual')
  assert((await service.ensureDaily('math1', { manual: true })).created)
  assert.equal((await service.bootstrap()).counts.math1.all, 1, '重新启用保留历史题目')
  await service.store.update((draft) => {
    delete draft.settings.dailySkippedDates
    draft.settings.dailySchedule.math1.skippedDates = ['2026-11-22']
  })
  const migrated = new DailyQuestionService({ get: () => undefined })
  migrated.store = new Store(dir)
  const migratedPlans = (await migrated.bootstrap()).dailyPlans
  assert(migratedPlans.math1.tomorrowSkipped && migratedPlans.politics.tomorrowSkipped, '旧的跳过日期合并到全局日程')

  day = 23
  await migrated.saveSettings({ subjects: ['politics'] })
  await migrated.setDailySkip({ date: '2026-11-24', skip: true })
  const enabledBeforeSkip = await migrated.saveSettings({
    subjects: ['politics', 'math2'], subjectSource: { math2: 'bank' },
  })
  assert(enabledBeforeSkip.dailyPlans.math2.pendingStart && enabledBeforeSkip.dailyPlans.math2.tomorrowSkipped)
  day = 24
  const enabledDuringSkip = await migrated.saveSettings({ subjects: ['politics', 'math2', 'math1'] })
  for (const id of ['math2', 'math1']) {
    assert(enabledDuringSkip.dailyPlans[id].pendingStart && enabledDuringSkip.dailyPlans[id].todaySkipped)
    assert.equal((await migrated.ensureDaily(id)).status, 'skipped')
    assert.equal((await migrated.ensureDaily(id, { manual: true })).status, 'skipped')
  }
  day = 25
  const afterSkip = await migrated.bootstrap()
  for (const id of ['math2', 'math1']) {
    assert(afterSkip.dailyPlans[id].pendingStart && !afterSkip.dailyPlans[id].todaySkipped)
    assert.equal((await migrated.ensureDaily(id)).status, 'manual', '跳过结束后仍等待首次手动出题')
    assert((await migrated.ensureDaily(id, { manual: true })).created)
  }
} finally {
  globalThis.Date = SystemDate
  await rm(dir, { recursive: true, force: true })
}
