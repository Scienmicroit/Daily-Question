import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpRoot = await mkdtemp(join(tmpdir(), 'daily-question-service-'))
process.env.DSH_PROFILE_DIR = join(tmpRoot, 'profile')

const { DailyQuestionService } = await import('../lib/service.js')
const { daysBetween, todayISO } = await import('../lib/exam-dates.js')

let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log(`ok   ${name}`)
  else { failures += 1; console.log(`FAIL ${name} :: ${detail}`) }
}

const service = new DailyQuestionService({ get: () => undefined, logger: { info() {}, warn() {}, error() {} } })

const bankMarkdown = `# 题库

## 第 1 题
设 $f(x)=x^2$，则 $f'(1)=$？

A. 1
B. 2
C. 3
D. 4

答案：B
解析：$f'(x)=2x$，故 $f'(1)=2$。
知识点：导数
难度：2
`

const boot0 = await service.bootstrap()
check('初始没有科目', boot0.settings.subjects.length === 0)

const saved = await service.saveSettings({ subjects: ['math1', 'math2'], targetYear: 2028 })
check('保存科目与年份', saved.settings.subjects.length === 2 && saved.settings.targetYear === 2028)
check('倒计时使用估算日期', saved.countdown.status === 'estimated'
  && saved.countdown.days === daysBetween(todayISO(), '2027-12-19'),
  JSON.stringify(saved.countdown.lines))

await service.saveSettings({ subjectSource: { math1: 'bank' } })
const imported = await service.importBank({ name: '数学一题库', kind: 'md', text: bankMarkdown, fileName: 'math.md' })
check('导入识别题目', imported.items.length === 1, JSON.stringify(imported.stats))
const committed = await service.commitBank({ importId: imported.importId, name: '数学一题库', subjectId: 'math1' })
check('题库入库', committed.bank.itemCount === 1, JSON.stringify(committed.bank))

const daily1 = await service.ensureDaily('math1')
check('题库出题成功', Boolean(daily1.question?.id), JSON.stringify(daily1).slice(0, 200))
check('答案在提交前不下发', daily1.question.answer === null && daily1.question.answerState === 'locked')
const qid1 = daily1.question.id

const daily1b = await service.ensureDaily('math1')
check('同一天重复进入不换题', daily1b.question.id === qid1)

// 提交答案前，任何带答案的文本（校验结论、独立求解结果）都不能下发。
const lockedVerification = daily1b.question.publishVerification || {}
check('未作答时不泄露校验结论',
  Boolean(lockedVerification.status)
  && lockedVerification.summary === ''
  && (lockedVerification.trail || []).length === 0,
  JSON.stringify(lockedVerification).slice(0, 160))
check('未作答时题干里不含"标准答案"', !JSON.stringify(daily1b.question).includes('标准答案'))

const wrong = await service.reveal({ qid: qid1, mode: 'submit', choice: 'A', attemptId: 'a1' })
check('提交后公布答案', wrong.question.answerState === 'revealed' && Boolean(wrong.question.answer))
check('提交后才给出校验结论', Boolean(wrong.question.publishVerification.summary))
check('错误提交判定为错', wrong.question.lastAttempt.result === 'wrong' && wrong.question.wrongEver)
check('作答次数为 1', wrong.question.attemptCount === 1)

const dedupe = await service.reveal({ qid: qid1, mode: 'submit', choice: 'A', attemptId: 'a1' })
check('同一 attemptId 不重复计数', dedupe.question.attemptCount === 1 && dedupe.duplicated === true, JSON.stringify(dedupe.duplicated))

const again = await service.reveal({ qid: qid1, mode: 'submit', choice: 'B', attemptId: 'a2' })
check('重新作答新增一次记录', again.question.attemptCount === 2 && again.question.lastAttempt.result === 'correct')
check('答对后仍是历史错题（已掌握）', again.question.wrongEver === true && again.question.mastered === true)

const favorites = await service.favorite({ qid: qid1, value: true })
check('收藏生效', favorites.question.favorite === true && favorites.counts.math1.favorite === 1)

const wrongList = await service.listQuestions({ subjectId: 'math1', kind: 'wrong' })
check('错题本包含该题', wrongList.items.length === 1 && wrongList.items[0].id === qid1)
const favList = await service.listQuestions({ subjectId: 'math1', kind: 'favorite' })
check('收藏列表包含该题', favList.items.length === 1)
const allList = await service.listQuestions({ subjectId: 'math1', kind: 'all' })
check('全部列表不重复', allList.items.length === 1)

// 主观题流程：数学二只出题库里的证明题 -> 作答完毕 -> 待判定 -> 判定错误
const csBank = await service.importBank({
  name: '数学二题库',
  kind: 'md',
  text: `## 第 1 题\n证明：若 $f$ 在 $[a,b]$ 上连续，则 $f$ 在 $[a,b]$ 上取到最大值。\n\n答案：由最值定理直接可得。\n解析：闭区间上的连续函数有界且能取到上下确界，因此存在最大值与最小值。\n`,
  fileName: 'math2.md',
})
const csCommitted = await service.commitBank({ importId: csBank.importId, name: '数学二题库', subjectId: 'math2' })
await service.saveSettings({ subjectSource: { math2: 'bank' } })
const csDaily = await service.ensureDaily('math2')
check('数学二从题库出题', csDaily.question.type === 'solution', csDaily.question.type)
const solutionQid = csDaily.question.id
const done = await service.reveal({ qid: solutionQid, mode: 'done', attemptId: 'sub1' })
check('作答完毕记为待判定', done.question.lastAttempt.result === 'pending' && done.question.answerState === 'revealed')
const before = await service.listQuestions({ subjectId: 'math2', kind: 'wrong' })
check('待判定不进入错题本', before.items.every((item) => item.id !== solutionQid))
const judged = await service.judge({ qid: solutionQid, verdict: 'wrong' })
check('判定错误后进入错题本', judged.question.lastAttempt.result === 'wrong' && judged.question.wrongEver)
const giveupSource = await service.listQuestions({ subjectId: 'math2', kind: 'wrong' })
check('错题本可读到该主观题', giveupSource.items.length === 1)

const studentThread = { before: (await service.data()).threads[qid1] }
check('追问初始为空', !studentThread.before || studentThread.before.messages.length === 0)

const deleted = await service.deleteBank({ bankId: committed.bank.id })
check('删除题库后保留历史题目', deleted.keptQuestions >= 1)
const afterDelete = await service.listQuestions({ subjectId: 'math1', kind: 'all' })
check('删除题库后全部列表仍可访问', afterDelete.items.length >= 1)

const noBank = await service.deleteBank({ bankId: committed.bank.id }).catch((error) => error.message)
check('重复删除同一题库会报错', typeof noBank === 'string')

const examRefresh = await service.refreshExamDate({ year: 2028 })
check('无 web 服务时如实报告未核验', examRefresh.ok === false && typeof examRefresh.reason === 'string', JSON.stringify(examRefresh))

let modelError = ''
await service.saveSettings({ subjects: ['math1', 'math2', 'english1'] })
try {
  await service.ensureDaily('english1')
} catch (error) {
  modelError = error.message
}
check('无法在线出题时给出明确原因', modelError.includes('llm') || modelError.includes('模型'), modelError)
const data = await service.data()
check('出题失败不会写入正式题目', Object.values(data.questions).every((question) => question.subjectId !== 'english1'))
check('失败原因被记录', Boolean(data.failures.english1?.message))

const removed = await service.removeSubject({ subjectId: 'math1' })
check('删除科目保留历史数据', removed.settings.subjects.length === 2 && !removed.settings.subjects.includes('math1') && Object.values(data.questions).some((q) => q.subjectId === 'math1'), JSON.stringify(removed.settings.subjects))
const kept = await service.listQuestions({ subjectId: 'math1', kind: 'all' })
check('删除科目后仍可查看历史题目', kept.items.length >= 1)

// ---- 自定义科目与自定义题型 ----
const withCustom = await service.saveSettings({
  customSubjects: [{ id: 'custom_demo', name: '自命题科目', types: ['名词解释', 'multiple'] }],
})
const customView = withCustom.subjects.find((subject) => subject.id === 'custom_demo') || {}
check('自定义题型被保存并正确显示',
  JSON.stringify(customView.typeLabels) === JSON.stringify(['名词解释', '多项选择题']),
  JSON.stringify(customView.typeLabels))
const enabledCustom = await service.addSubject({ subjectId: 'custom_demo' })
check('自定义科目可启用', enabledCustom.settings.subjects.includes('custom_demo'), JSON.stringify(enabledCustom.settings.subjects))

await rm(tmpRoot, { recursive: true, force: true })
console.log(failures ? `\n${failures} 个检查未通过` : '\n全部通过')
process.exit(failures ? 1 : 0)
