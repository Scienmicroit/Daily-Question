import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpRoot = await mkdtemp(join(tmpdir(), 'daily-question-service-'))
process.env.DSH_PROFILE_DIR = join(tmpRoot, 'profile')

const { DailyQuestionService } = await import('../lib/service.js')
const { daysBetween, resolveExamDate, todayISO, yearOptions } = await import('../lib/exam-dates.js')

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
check('当前版本来自插件自身package.json',boot0.pluginVersion===(await import('../lib/updates.js')).PLUGIN_VERSION)
check('初始没有科目', boot0.settings.subjects.length === 0)
check('参考考试目录包含408但不强加每日科目', boot0.referenceExams.some((s)=>s.code==='408')&&!boot0.subjects.some((s)=>s.code==='408'))
check('提供宿主下次零点供页面调度', Date.parse(boot0.nextDayAt) > Date.parse(boot0.now)
  && Date.parse(boot0.nextDayAt) - Date.parse(boot0.now) <= 25 * 60 * 60 * 1000
  && new Date(boot0.nextDayAt).getHours() === 0)

const yearWindow = yearOptions()
const targetYear = yearWindow[0]
const saved = await service.saveSettings({ subjects: ['math1', 'math2'], targetYear })
check('保存科目与年份', saved.settings.subjects.length === 2 && saved.settings.targetYear === targetYear)
const targetExam = resolveExamDate(targetYear)
check('倒计时与目标日期一致',
  saved.countdown.days === daysBetween(todayISO(), targetExam.date)
  && saved.countdown.status === targetExam.status,
  JSON.stringify(saved.countdown.lines))
check('可选年份只有 3 个', yearWindow.length === 3, JSON.stringify(yearWindow))

const outOfWindow = await service.saveSettings({ targetYear: 2001 }).then(() => '').catch((error) => error.message)
check('窗口外的年份被拒绝', outOfWindow.includes('考研年份只能选'), outOfWindow)

await service.saveSettings({ subjectSource: { math1: 'bank' } })
const imported = await service.importBank({ name: '数学一题库', kind: 'md', text: bankMarkdown, fileName: 'math.md' })
check('导入识别题目', imported.items.length === 1, JSON.stringify(imported.stats))
const committed = await service.commitBank({ importId: imported.importId, name: '数学一题库', subjectId: 'math1' })
check('题库入库', committed.bank.itemCount === 1, JSON.stringify(committed.bank))

const daily1 = await service.ensureDaily('math1')
check('题库出题成功', Boolean(daily1.question?.id), JSON.stringify(daily1).slice(0, 200))
check('答案在提交前不下发', daily1.question.answer === null && daily1.question.answerState === 'locked')
const qid1 = daily1.question.id
check('按当日分配记录识别今日题目', (await service.getQuestion({ qid: qid1 })).isToday === true)
const previewStem = '完整题干\n\n$$x^2+1$$\n\n```js\n  return 42\n```'
const preview = service.summaryView(await service.data(), { ...(await service.data()).questions[qid1], stem: previewStem })
check('列表提供完整 Markdown 题干且不下发答案', preview.stem === previewStem && !Object.hasOwn(preview, 'answer') && !Object.hasOwn(preview, 'currentAnswer'))

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
const judged = await service.judge({ qid: solutionQid, verdict: 'wrong', attemptId:'sub1' })
check('判定错误后进入错题本', judged.question.lastAttempt.result === 'wrong' && judged.question.wrongEver)
const giveupSource = await service.listQuestions({ subjectId: 'math2', kind: 'wrong' })
check('错题本可读到该主观题', giveupSource.items.length === 1)

const concurrent = await Promise.all([1, 2].map(() => service.reveal({ qid: qid1, choice: 'B', attemptId: 'concurrent' })))
check('并发相同作答只计数一次', (await service.getQuestion({ qid: qid1 })).question.attemptCount === 3
  && concurrent.filter((item) => item.duplicated).length === 1)
const collision = await service.reveal({ qid: solutionQid, mode: 'done', attemptId: 'concurrent' }).catch((error) => error.message)
check('拒绝跨题复用作答 ID', typeof collision === 'string' && collision.includes('其他题目')
  && (await service.getQuestion({ qid: solutionQid })).question.attemptCount === 1)

const bankSubject = { id: 'math1' }
const selectionData = {
  customSubjects: [],
  banks: [{ id: 'selection', subjectId: 'math1', items: [
    ...['old', 'recent', 'new'].map((id) => ({ id, stem: `足够长的选择题 ${id}`, type: 'single', options: daily1.question.options })),
    { id: 'invalid', stem: '这道选择题缺少选项', type: 'single', options: [] },
  ] }],
  questions: {
    'bank:selection:old': { subjectId: 'math1', lastAssignedDate: '2026-11-01' },
    'bank:selection:recent': { subjectId: 'math1', lastAssignedDate: '2026-11-03' },
  },
}
const originalRandom = Math.random
try {
  Math.random = () => 0.999
  check('有新题时不会抽到旧题', service.pickFromBank(selectionData, bankSubject, '2026-11-04').item.id === 'new')
  selectionData.questions['bank:selection:new'] = { subjectId: 'math1', lastAssignedDate: '2026-11-02' }
  check('新题用完后抽最久未出的题', service.pickFromBank(selectionData, bankSubject, '2026-11-04').item.id === 'old')
  selectionData.banks[0].items = [selectionData.banks[0].items[0]]
  check('仅一题时允许重复并标记', service.pickFromBank(selectionData, bankSubject, '2026-11-04').repeated === true)
} finally { Math.random = originalRandom }

const studentThread = { before: (await service.data()).threads[qid1] }
check('追问初始为空', !studentThread.before || studentThread.before.messages.length === 0)

const deleted = await service.deleteBank({ bankId: committed.bank.id })
check('删除题库后保留历史题目', deleted.keptQuestions >= 1)
const afterDelete = await service.listQuestions({ subjectId: 'math1', kind: 'all' })
check('删除题库后全部列表仍可访问', afterDelete.items.length >= 1)

const noBank = await service.deleteBank({ bankId: committed.bank.id }).catch((error) => error.message)
check('重复删除同一题库会报错', typeof noBank === 'string')

const examRefresh = await service.refreshExamDate({ year: targetYear })
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
check('停用科目仍有历史列表计数且不继续出题', removed.counts.math1.all === kept.total
  && await service.ensureDaily('math1').then(() => false, (error) => /未启用/.test(error.message)))

// ---- 自定义科目与自定义题型 ----
const withCustom = await service.saveSettings({
  customSubjects: [{ id: 'custom_demo', name: '自命题科目', types: ['名词解释', 'multiple'], referenceSubjectId: 'math1' }],
})
const customView = withCustom.subjects.find((subject) => subject.id === 'custom_demo') || {}
check('自定义科目参考考试被保存并提供给界面', customView.referenceSubjectId === 'math1')
check('自定义题型被保存并正确显示',
  JSON.stringify(customView.typeLabels) === JSON.stringify(['名词解释', '多项选择题']),
  JSON.stringify(customView.typeLabels))
const enabledCustom = await service.addSubject({ subjectId: 'custom_demo' })
check('自定义科目可启用', enabledCustom.settings.subjects.includes('custom_demo'), JSON.stringify(enabledCustom.settings.subjects))

const previousCustom=structuredClone((await service.data()).customSubjects)
const automatic=await service.saveSettings({customSubjects:[...previousCustom,{id:'custom_auto',name:'计算机科学与技术',code:'081200',types:['single'],referenceSubjectId:'auto'}]})
check('自动检索配置及用户专业代码保存后保持原样',automatic.subjects.find((s)=>s.id==='custom_auto').referenceSubjectId==='auto'&&automatic.subjects.find((s)=>s.id==='custom_auto').code==='081200')
await service.saveSettings({customSubjects:previousCustom})
const profiles=await service.saveSettings({customSubjects:[...previousCustom,
  {id:'custom_408',name:'408复习',types:['single'],referenceSubjectId:'cs408'},
  {id:'custom_independent',name:'专业课专项',types:['solution'],referenceSubjectId:'independent',referenceExamName:' 示例大学数据结构 ',referenceExamCode:' 801 '}]})
check('408参考和独立考试持久化后提供给页面',profiles.subjects.find((s)=>s.id==='custom_408').referenceSubjectId==='cs408'
  &&profiles.subjects.find((s)=>s.id==='custom_independent').referenceExamName==='示例大学数据结构'
  &&profiles.subjects.find((s)=>s.id==='custom_independent').referenceExamCode==='801')
const reopened=new DailyQuestionService({get:()=>undefined,logger:{info(){},warn(){},error(){}}})
check('重新打开后独立考试配置不丢失',(await reopened.bootstrap()).customSubjects.find((s)=>s.id==='custom_independent').referenceExamCode==='801')
const beforeInvalid=JSON.stringify((await service.data()).customSubjects)
const invalidReference=await service.saveSettings({customSubjects:[{id:'invalid',name:'课程',referenceSubjectId:'independent'}]}).then(()=>false,()=>true)
check('独立考试缺少名称时拒绝保存并保留原设置',invalidReference&&JSON.stringify((await service.data()).customSubjects)===beforeInvalid)
await service.saveSettings({customSubjects:previousCustom})

// 批量管理：标记独立于作答，删除必须原子地清理关联记录。
await service.store.update((draft) => {
  for (const id of ['bulk1', 'bulk2', 'bulk3']) {
    draft.questions[id] = { ...structuredClone(draft.questions[qid1]), id, favoriteAt: null, wrongBookAdded: false, wrongBookRemoved: false }
  }
  draft.attempts.push({ id: 'bulk-attempt', questionId: 'bulk2', result: 'wrong' })
  draft.threads.bulk1 = { messages: [{ text: '保留到确认删除' }] }
  draft.daily['bulk-test'] = { questionId: 'bulk1' }
})
const bulkIds = ['bulk1', 'bulk2']
check('历史题即使出题日期相同也不是今日题目', (await service.getQuestion({ qid: 'bulk1' })).isToday === false)
await service.bulkQuestions({ qids: bulkIds, action: 'favorite' })
check('批量收藏同步到收藏列表', (await service.listQuestions({ subjectId: 'math1', kind: 'favorite' })).items.filter((q) => bulkIds.includes(q.id)).length === 2)
await service.bulkQuestions({ qids: bulkIds, action: 'unfavorite' })
check('批量取消收藏', bulkIds.every((id) => !(service.store.data.questions[id].favoriteAt)))
await service.bulkQuestions({ qids: bulkIds, action: 'wrong' })
check('手动加入错题本且不伪造作答', (await service.getQuestion({ qid: 'bulk1' })).question.wrongEver
  && (await service.getQuestion({ qid: 'bulk1' })).question.attemptCount === 0)
await service.bulkQuestions({ qids: bulkIds, action: 'unwrong' })
check('批量移除错题且保留历史作答', bulkIds.every((id) => !service.isWrong(service.store.data.questions[id], service.store.data.attempts))
  && service.store.data.attempts.some((a) => a.id === 'bulk-attempt'))
await service.bulkQuestions({ qids: bulkIds, action: 'wrong' })
check('移除后可以重新加入错题本', bulkIds.every((id) => service.isWrong(service.store.data.questions[id], service.store.data.attempts)))
await service.bulkQuestions({ qids: ['bulk1'], action: 'favorite' })
const guarded = await service.bulkQuestions({ qids: bulkIds, action: 'delete' })
check('收藏和错题删除前要求二次确认且不清理数据', guarded.requiresConfirmation && guarded.protectedCount === 2
  && service.store.data.questions.bulk1 && service.store.data.questions.bulk2 && service.store.data.threads.bulk1)
const invalidBulk = await service.bulkQuestions({ qids: ['bulk1', 'missing'], action: 'delete', confirmProtected: true }).catch((e) => e.message)
check('部分题目不存在时整批拒绝且不删除其他题', typeof invalidBulk === 'string' && Boolean(service.store.data.questions.bulk1))
const removedBulk = await service.bulkQuestions({ qids: [...bulkIds, 'bulk1'], action: 'delete', confirmProtected: true })
check('确认删除后去重计数并清理题目作答追问和今日引用', removedBulk.affected === 2
  && !service.store.data.questions.bulk1 && !service.store.data.questions.bulk2 && !service.store.data.threads.bulk1
  && !service.store.data.daily['bulk-test'] && !service.store.data.attempts.some((a) => bulkIds.includes(a.questionId)))
check('删除不影响其他题目', Boolean(service.store.data.questions.bulk3) && Boolean(service.store.data.questions[qid1]))
const savedWrite = service.store.write
service.store.write = async () => { throw new Error('模拟磁盘失败') }
const failedDelete = await service.bulkQuestions({ qids: ['bulk3'], action: 'delete' }).then(() => false, () => true)
service.store.write = savedWrite
check('批量删除保存失败不改变内存中的题目', failedDelete && Boolean(service.store.data.questions.bulk3))

let started, finishReply
const replyStarted = new Promise((resolve) => { started = resolve })
const replyReady = new Promise((resolve) => { finishReply = resolve })
const savedContext = service.ctx
service.ctx = { get(name) {
  if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'test', model: 'test' }) }
  if (name === 'llm') return { async *stream() {
    started()
    await replyReady
    yield { type: 'text-delta', text: '这条回复不应恢复已经删除的追问。' }
  } }
} }
const lateReply = service.followup({ qid: 'bulk3', message: '请解释', clientMessageId: 'late-reply' }).then(() => false, () => true)
await replyStarted
const plainDeletion = await service.bulkQuestions({ qids: ['bulk3'], action: 'delete' })
check('普通题目无需额外的保护确认', plainDeletion.affected === 1 && !plainDeletion.requiresConfirmation)
finishReply()
check('删除时仍在生成的回复不会恢复追问', await lateReply && !service.store.data.threads.bulk3)
service.ctx = savedContext
for (const args of [{ qids: [], action: 'delete' }, { qids: [null], action: 'favorite' }, { qids: [qid1], action: 'bad' }]) {
  const rejected = await service.bulkQuestions(args).then(() => false, () => true)
  check('非法批量请求被拒绝', rejected)
}

await service.store.update((draft) => {
  draft.questions['no-answer-choice'] = { id:'no-answer-choice',subjectId:'math1',type:'single',stem:'题库缺少答案的选择题',
    options:[{key:'A',text:'1'},{key:'B',text:'2'}],answerStatusRaw:'missing',currentAnswer:{answer:'',answerKey:'',explanation:''} }
})
const ungraded = await service.reveal({qid:'no-answer-choice',choice:'A',attemptId:'ungraded-choice'})
check('缺少选择题答案时记为待判定，保留选项且不加入错题本',ungraded.question.lastAttempt.result==='pending'
  &&ungraded.question.lastAttempt.choice==='A'&&!ungraded.question.wrongEver&&service.store.data.attempts.at(-1).judgedAt===null)
check('无法自动判分的选择题可由用户判定', (await service.judge({qid:'no-answer-choice',verdict:'correct',attemptId:'ungraded-choice'})).question.lastAttempt.result==='correct')

const malformedImport = await service.importBank({ kind: 'md', text: [
  '## 第 1 题\n题型：单选\n这是缺少选项的题目。\nA. 只有一个选项\n答案：A',
  '## 第 2 题\n题型：解答题\n求导数\n答案：1',
  '## 第 3 题\n题型：解答题\n请解释连续函数的性质。',
  '## 第 4 题\n题型：解答题\n请证明闭区间的最值定理。',
].join('\n\n---\n\n') })
const pickedImports = await Promise.allSettled([1, 2].map(() =>
  service.commitBank({ importId: malformedImport.importId, excludedIndexes: [4] })))
check('预览与入库共同拒绝短题干和残缺选项，允许缺答案的完整题干',
  malformedImport.usable === 2 && malformedImport.stats.blocked === 2
  && pickedImports[0].value?.bank.itemCount === 1
  && pickedImports[1].status === 'rejected'
  && (await service.data()).banks.find((bank) => bank.id === pickedImports[0].value.bank.id).items[0].stem.includes('连续函数'))

await service.store.update((draft) => {
  const legacy = { subjectId: 'english2', stem: '阅读下面的句子并选择。', assignedDate: '2026-01-01',
    currentAnswer: { answer: 'AB', answerKey: 'AB' }, options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }] }
  draft.questions['old-reading'] = { ...legacy, id: 'old-reading', type: 'reading', lastAssignedDate: '2026-01-03' }
  draft.questions['old-cloze'] = { ...legacy, id: 'old-cloze', type: 'cloze', assignedDate: '2026-01-02' }
  draft.questions['missing-options'] = { ...legacy, id: 'missing-options', type: 'reading', options: [] }
})
for (const qid of ['old-reading', 'old-cloze']) {
  const submitted = await service.reveal({ qid, choice: 'A' })
  check(`${qid} 拒绝多选提交，旧题多字母参考答案改为待判定`,
    await service.reveal({ qid, choice: 'AB' }).then(() => false, (error) => /只能选择一个/.test(error.message))
    && submitted.question.lastAttempt.result === 'pending' && submitted.question.answer.answerKey === '')
}
const fallback = await service.reveal({ qid: 'missing-options', mode: 'done' })
check('残缺选择题可查看答案并自判', !fallback.question.canSelect && fallback.question.answerState === 'revealed'
  && fallback.question.lastAttempt.result === 'pending')
const latestList = await service.listQuestions({ subjectId: 'english2' })
check('历史题按最近出题日期排序并显示该日期',
  latestList.items[0].id === 'old-reading' && latestList.items[0].assignedDate === '2026-01-03'
  && (await service.getQuestion({ qid: 'old-reading' })).question.assignedDate === '2026-01-03')

await rm(tmpRoot, { recursive: true, force: true })
console.log(failures ? `\n${failures} 个检查未通过` : '\n全部通过')
process.exit(failures ? 1 : 0)
