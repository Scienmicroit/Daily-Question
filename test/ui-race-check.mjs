import assert from 'node:assert/strict'
import { createClient } from '../ui/app.js'
import { BANK_PDF_BYTES, BANK_TEXT_LIMIT } from '../lib/import-limits.js'
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const tick=()=>new Promise(r=>setImmediate(r))
function fixture(responder,detail=false) {
  let index,refIndex
  const boot={settings:{subjects:['math1']},subjects:[],counts:{math1:{all:2}}}
  const state=new Map([[0,boot],[1,false],[3,'math1'],[4,detail?'all':'today'],[5,detail?'detail':'empty'],
    [6,detail?{id:'A',type:'single',favorite:false,answerState:'revealed',attemptCount:1,lastAttempt:{id:'attempt-A'}}:null],[8,{items:[]}]])
  const refs=[]
  const h=(type,props,...children)=>({type,props:props||{},children:children.flat(10)})
  const React = {
    createElement: h,
    useState(value){const i=index++;if(!state.has(i))state.set(i,typeof value==='function'?value():value);return [state.get(i),v=>state.set(i,typeof v==='function'?v(state.get(i)):v)]},
    useRef(value){return refs[refIndex++]??={current:value}},useEffect(){},useCallback:f=>f,useMemo:f=>f(),
  }
  const components = createClient(React, { window: {}, fetch: async (_url, options) => {
    const {op,args}=JSON.parse(options.body)
    const result=op==='bootstrap'?boot:await responder(op,args)
    return {ok:true,json:async()=>({ok:true,result})}
  } })
  function find(node,name){if(typeof name==='function'?name(node):node?.type===name||node?.type?.name===name)return node;for(const child of node?.children||[]){const found=find(child,name);if(found)return found}}
  return {state,props(name){index=refIndex=0;const node=find(components.Page(),name);assert(node,`缺少${name}`);return node.props}}
}

{
  const requests = []
  const reads = []
  const original = globalThis.FileReader
  globalThis.FileReader = class {
    readAsText(file) { reads.push('text'); this.result = file.content; this.onload() }
    readAsDataURL(file) { reads.push('pdf'); this.result = file.content; this.onload() }
  }
  try {
    const importer = fixture((op, args) => { requests.push({ op, args }); return {} })
    const pick = (file) => importer.props('input').onChange({ target: { files: [file] } })
    for (const [name, size] of [['photo.png', 1], ['empty.txt', 0], ['large.pdf', BANK_PDF_BYTES + 1], ['large.md', BANK_TEXT_LIMIT + 1]]) {
      await pick({ name, size })
    }
    assert.deepEqual(reads, [], '空文件、不支持的类型和超限文件不会读取')
    assert.deepEqual(requests, [], '无效文件不会上传到插件后端')
    await pick({ name: 'exam.MARKDOWN', size: BANK_TEXT_LIMIT, content: '题目' })
    await pick({ name: 'paper.PDF', size: BANK_PDF_BYTES, content: 'data:application/pdf;base64,JVBERg==' })
    assert.deepEqual(reads, ['text', 'pdf'])
    assert.deepEqual(requests.map(({ op, args }) => [op, args.kind, args.text ?? args.base64]),
      [['importBank', 'md', '题目'], ['importBank', 'pdf', 'JVBERg==']])
  } finally {
    if (original === undefined) delete globalThis.FileReader
    else globalThis.FileReader = original
  }
}

{
  const requests = []
  const search = fixture((op, args) => {
    requests.push({ op, args })
    if (op === 'getQuestion') return { isToday: true, question: { id: args.qid, type: 'single',
      answerState: 'revealed', attemptCount: 1, lastAttempt: { id: args.attemptId || 'prior', result: 'correct' } } }
    if (op === 'reveal') return { question: { id: args.qid, type: 'single',
      answerState: 'revealed', attemptCount: 2, lastAttempt: { id: args.attemptId, result: 'correct' } } }
    return args.idsOnly ? { ids: ['A'] } : { items: [{ id: 'A' }], total: 1, page: args.page || 1 }
  })
  search.props('TabBar').onPick('all')
  await tick()
  search.props('input').onChange({ target: { value: '矩阵' } })
  search.props('form').onSubmit({ preventDefault() {} })
  await tick()
  assert.equal(requests.at(-1).args.query, '矩阵')
  await search.props('ListPane').onSelectAll(true)
  assert.deepEqual(requests.at(-1).args, { subjectId: 'math1', kind: 'all', idsOnly: true, query: '矩阵' })
  assert.deepEqual(search.props('ListPane').selected, ['A'])
  search.props('select').onChange({ target: { value: 'single' } })
  await tick()
  assert.deepEqual(search.props('ListPane').selected, [])
  assert.equal(requests.at(-1).args.type, 'single')

  search.props('TabBar').onPick('review')
  await tick()
  assert.equal(requests.at(-1).args.kind, 'review')
  assert.equal(requests.at(-1).args.query, undefined)
  await search.props('ListPane').onOpen('A')
  assert.equal(search.props('QuestionPane').localRedo, true, '从复习入口打开今日题也先隐藏答案')
  search.props('QuestionPane').onSelect('A')
  search.props('QuestionPane').onToggleFocus()
  assert.equal(search.props('QuestionPane').focused, true)
  assert.equal(search.props('QuestionPane').choice, 'A')
  await search.props('QuestionPane').onReveal('submit')
  assert.equal(search.props('QuestionPane').localRedo, false)
  assert.equal(search.props('QuestionPane').focused, true)
  search.props('QuestionPane').onToggleFocus()
  assert.equal(search.props('QuestionPane').focused, false)
  await search.props('QuestionPane').onInspectAttempt('prior')
  assert.equal(search.props('AttemptModal').record.lastAttempt.id, 'prior')
}

const all=deferred(),favorite=deferred()
let f=fixture((_op,args)=>args.kind==='all'?all.promise:favorite.promise)
f.props('TabBar').onPick('all');f.props('TabBar').onPick('favorite')
favorite.resolve({kind:'favorite',items:[]});await tick()
all.resolve({kind:'all',items:[]});await tick()
assert.equal(f.state.get(4),'favorite');assert.equal(f.state.get(8).kind,'favorite')

{
  const requests = []
  const memory = fixture((op, args) => {
    requests.push({ op, args })
    return { items: [{ id: 'A' }], total: 1, page: 1 }
  })
  memory.props('SubjectNav').onMemory({ currentTarget: {} })
  const panel = memory.props('StudyMemoryPage')
  assert(Array.isArray(panel.subjects))
  assert(memory.props((node) => node?.type?.name === 'Presence'
    && node.children.some((child) => child?.type?.name === 'StudyMemoryPage')))
  assert.equal(memory.props((node) => node?.props?.className === 'kd-practice-screen').inert, true)
  assert.equal(requests.length, 0)
  panel.onRelated('math1', 'review', '分段点的连续性')
  await tick()
  assert.deepEqual(requests.at(-1), { op: 'listQuestions', args: { subjectId: 'math1', kind: 'review', page: 1, topic: '分段点的连续性' } })
  assert.equal(memory.props((node) => node?.props?.className === 'kd-practice-screen').inert, undefined)
  memory.props('SubjectNav').onStats({ currentTarget: {} })
  assert(memory.props((node) => node?.type?.name === 'Presence'
    && node.children.some((child) => child?.type?.name === 'StudyStatsPage')))
}

{
  const requests = []
  const pending = deferred()
  const settings = fixture((op, args) => { requests.push({ op, args }); return pending.promise })
  settings.props('SubjectNav').onSettings()
  assert.equal(settings.props('SettingsModal').active, 'subjects')
  assert.equal(settings.props((node) => node?.props?.className === 'kd-practice-screen').inert, true)
  assert(settings.props('SubjectsModal').embedded)
  settings.props('SettingsModal').onPick('about')
  assert.equal(settings.props('SettingsModal').active, 'about')
  assert(settings.props('AboutPanel'))
  settings.props('SettingsModal').onPick('banks')
  settings.props('BanksModal').onDelete({ id: 'test-bank', name: '示例题库' })
  assert.equal(settings.props('SettingsModal').active, 'banks')
  assert(settings.props('ConfirmModal').embedded)
  settings.props('ConfirmModal').onClose()
  assert(settings.props('BanksModal'))
  assert.equal(requests.length, 0)
  settings.props('BanksModal').onDelete({ id: 'test-bank', name: '示例题库' })
  const deletion = settings.props('ConfirmModal').onConfirm()
  assert.equal(settings.props('SettingsModal').locked, true)
  assert.deepEqual(requests[0], { op: 'deleteBank', args: { bankId: 'test-bank' } })
  pending.resolve({ message: '已删除示例题库' })
  await deletion
  assert(settings.props('BanksModal'))
  assert.equal(settings.props('SettingsModal').locked, false)
}

const first=deferred(),second=deferred()
f=fixture((_op,args)=>args.qid==='A'?first.promise:second.promise)
f.state.set(4,'all');f.state.set(5,'list')
const pA=f.props('ListPane').onOpen('A'),pB=f.props('ListPane').onOpen('B')
first.resolve({question:{id:'A'}});await pA
assert.equal(f.state.get(9),'question','旧详情请求不能提前解除新请求的加载状态')
second.resolve({question:{id:'B'}});await pB
assert.equal(f.state.get(6).id,'B')

for(const operation of ['favorite','judge','followup','revise','removeFromWrongBook']) {
  const late=deferred()
  f=fixture((op,args)=>{if(op==='judge')assert.equal(args.attemptId,'attempt-A');return op===operation?late.promise:{question:{id:'B'},items:[]}},true)
  const pending=operation==='followup'
    ? (f.state.set(17,true),f.props('ThreadPane').onSend('问题','message-id'))
    : operation==='favorite'?f.props('QuestionPane').onFavorite():operation==='revise'?f.props('QuestionPane').onRevise()
    : operation==='removeFromWrongBook'?f.props('QuestionPane').onRemoveWrong():f.props('QuestionPane').onJudge('correct')
  f.props('TabBar').onPick('favorite');await tick()
  await f.props('ListPane').onOpen('B')
  late.resolve({question:{id:'A'},thread:{questionId:'A',messages:[]}});await pending
  assert.equal(f.state.get(6).id,'B',`${operation}旧回复不能替换新题`)
  assert.notEqual(f.state.get(7)?.questionId,'A',`${operation}不能串入旧题追问`)
}
const oldBulk=deferred()
f=fixture((op,args)=>op==='bulkQuestions'?oldBulk.promise:{kind:args.kind,items:[]})
f.state.set(4,'all');f.state.set(5,'list');f.state.set(11,['A'])
const bulk=f.props('ListPane').onBulk('favorite')
f.state.set(12,'上一次今日出题失败')
f.props('TabBar').onPick('wrong');await tick()
assert.equal(f.state.get(12),'','进入列表清理旧出题错误')
oldBulk.resolve({affected:1});await bulk
assert.equal(f.state.get(4),'wrong');assert.equal(f.state.get(8).kind,'wrong','旧批量操作完成后不会跳回旧栏目')
console.log('ok   页面竞态：栏目、连续开题、收藏、判分与追问的旧响应不会覆盖新页面')

const retries = []
let persisted
f = fixture((op, args) => {
  if (op === 'reveal') {
    retries.push(args)
    persisted ??= { id: args.attemptId, mode: args.mode, choice: args.choice }
    throw new Error(retries.length === 1 ? '响应丢失' : '本轮已保存另一份作答')
  }
  assert.equal(op, 'getQuestion')
  assert.equal(args.attemptId, persisted.id)
  return { question: { id: 'A', lastAttempt: retries.length === 1 ? null : persisted } }
}, true)
f.state.set(15, 'A')
await f.props('QuestionPane').onReveal('submit')
f.state.set(15, 'B')
await f.props('QuestionPane').onReveal('submit')
assert.equal(retries[0].attemptId, retries[1].attemptId)
assert.deepEqual(retries.map((item) => item.choice), ['A', 'B'])
assert.equal(f.state.get(6).lastAttempt.choice, 'A')
assert.match(f.state.get(13).message, /本次改选未提交/)

const archiveCalls = []
f = fixture((op, args) => {
  archiveCalls.push([op, args])
  return { kind: args.kind, items: [] }
})
f.state.get(0).subjects = [{ id: 'math2', name: '数学二', enabled: false }]
f.state.get(0).counts.math2 = { all: 2 }
f.props('SubjectNav').onPick('math2')
await tick()
assert.equal(f.state.get(3), 'math1')
assert.equal(f.state.get(4), 'today')
assert.deepEqual(archiveCalls,[],'停用科目不能通过旧导航回调进入')

const switchCalls=[]
f=fixture((op,args)=>{
  switchCalls.push([op,args])
  if(op==='saveSettings')return {settings:{subjects:['math2'],activeSubject:'math2'}}
  if(op==='ensureDaily')return {question:{id:'math2-q'}}
})
f.state.set(14,{kind:'subjects'})
f.props('SubjectsModal').onClose()
assert.deepEqual(f.state.get(14),{kind:'subjects',edit:1},'取消科目修改只重置功能页')
assert.equal(switchCalls.length,0)
await f.props('SubjectsModal').onDone({subjects:['math2'],customSubjects:[]})
await tick()
assert.deepEqual(f.state.get(14),{kind:'subjects',edit:2,notice:'科目设置已保存'},'保存科目修改后仍停留在设置并显示提示')
assert.equal(f.state.get(3),'math2')
assert.deepEqual(switchCalls.map(([op,args])=>[op,args.activeSubject||args.subjectId]),[['saveSettings','math2'],['ensureDaily','math2']])

const settingsNav = fixture(() => { throw new Error('放弃草稿不应提交设置') })
settingsNav.state.set(14,{kind:'subjects'})
settingsNav.props('SettingsModal').onPick('banks')
assert.deepEqual(settingsNav.state.get(14),{kind:'banks'},'无修改时直接切换')
settingsNav.props('SettingsModal').onPick('subjects')
settingsNav.props('SubjectsModal').onDirtyChange(true)
settingsNav.props('SettingsModal').onClose()
let discard = settingsNav.props('SettingsModal').dialog.props
assert.match(discard.message,/关闭设置/)
discard.onClose()
assert.equal(settingsNav.state.get(14).kind,'subjects','取消关闭后保留草稿页')
settingsNav.props('SettingsModal').onPick('about')
discard = settingsNav.props('SettingsModal').dialog.props
assert.match(discard.message,/切换设置项/)
assert.equal(discard.explicitClose,true)
discard.onConfirm()
assert.deepEqual(settingsNav.state.get(14),{kind:'about'},'确认放弃后切到目标设置项')
settingsNav.props('SettingsModal').onPick('subjects')
settingsNav.props('SubjectsModal').onDirtyChange(true)
settingsNav.props('SettingsModal').onClose()
settingsNav.props('SettingsModal').dialog.props.onConfirm()
assert.equal(settingsNav.state.get(14),null,'确认放弃后关闭设置')
settingsNav.state.set(14,{kind:'subjects'})
settingsNav.props('SubjectsModal').onDirtyChange(true)
settingsNav.props('SubjectsModal').onDirtyChange(false)
settingsNav.props('SettingsModal').onClose()
assert.equal(settingsNav.state.get(14),null,'改回原设置后直接关闭')

const scheduleCalls = []
const plan = { today: '2026-11-18', tomorrow: '2026-11-19', pendingStart: true,
  todaySkipped: false, tomorrowSkipped: false, nextDate: '2026-11-18' }
const schedule = fixture((op, args) => {
  scheduleCalls.push([op, args])
  if (op === 'ensureDaily') return { status: 'manual' }
  if (op === 'setDailySkip') return { dailyPlans: { math1: { ...plan, tomorrowSkipped: args.skip } } }
})
const setSchedule = (patch) => schedule.state.set(0, { ...schedule.state.get(0),
  today: plan.today, dailyPlans: { math1: { ...plan, ...patch } } })
const scheduleButton = (label) => schedule.props((node) => node?.type?.name === 'Btn' && node.children.includes(label))
setSchedule({})
assert.equal(scheduleCalls.length, 0)
assert.deepEqual(schedule.props('EmptyState').actions.children,['开始出题'])
await schedule.props('EmptyState').actions.props.onClick()
assert.deepEqual(scheduleCalls.at(-1), ['ensureDaily', { subjectId: 'math1', manual: true }])
setSchedule({})
await scheduleButton('跳过明天').onClick()
assert.deepEqual(scheduleCalls.at(-1), ['setDailySkip', { date: '2026-11-19', skip: true }])
assert.match(schedule.props('NotificationBanner').message,/跳过明天.*所有已启用科目/)
await scheduleButton('取消跳过明天').onClick()
assert.deepEqual(scheduleCalls.at(-1), ['setDailySkip', { date: '2026-11-19', skip: false }])
assert.match(schedule.props('NotificationBanner').message,/取消跳过明天.*所有科目/)
setSchedule({ pendingStart: false, todaySkipped: true, tomorrowSkipped: true, nextDate: '2026-11-20' })
assert.equal(schedule.props('EmptyState').body, '下次出题：后天（2026年11月20日）')
assert(scheduleButton('取消跳过明天'))
await scheduleButton('取消跳过今天').onClick()
assert.deepEqual(scheduleCalls.at(-2), ['setDailySkip', { date: '2026-11-18', skip: false }])
assert.deepEqual(scheduleCalls.at(-1), ['ensureDaily', { subjectId: 'math1' }])
assert.match(schedule.props('NotificationBanner').message,/取消跳过今天.*所有科目/)

const lateThread=deferred()
{
  const changes = []
  const reader = fixture((op, args) => {
    changes.push([op, args])
    return { question: { id: 'A', favorite: args.value, answerState: 'revealed', answer: { answer: '旧答案' } } }
  }, true)
  reader.state.set(6, { id: 'A', answerState: 'locked', answer: null })
  await reader.props('QuestionPane').onFavorite()
  assert.deepEqual(reader.state.get(6), { id: 'A', answerState: 'locked', answer: null, favorite: true })
  await reader.props('QuestionPane').onFavorite()
  assert.deepEqual(changes,[['favorite',{qid:'A',value:true}],['favorite',{qid:'A',value:false}]])
  assert.equal(reader.state.get(6).answerState, 'locked', '未看答案也可收藏和取消，收藏响应不覆盖作答状态')
}
f=fixture((op)=>op==='followup'?lateThread.promise:{thread:{messages:[]}},true)
f.state.set(17,true)
const sending=f.props('ThreadPane').onSend('解释','old-message')
await f.props('ThreadPane').onClear()
await f.props('ConfirmModal').onConfirm()
lateThread.resolve({thread:{messages:[{role:'assistant',text:'清空前的回复'}]}});await sending
assert.deepEqual(f.state.get(7).messages,[],'清空后不能被网络迟到的旧追问响应恢复')

const cancellations=[]
f=fixture((op,args)=>{cancellations.push({op,args});return {ok:true}},true)
await f.props('QuestionPane').onCancel()
f.state.set(17,true);await f.props('ThreadPane').onCancel('message-id')
f.state.set(4,'today');f.state.set(6,null);f.state.set(9,'daily')
await f.props('Btn').onClick()
assert.deepEqual(cancellations.map(x=>[x.op,x.args.kind]),[['cancelTask','revise'],['cancelTask','followup'],['cancelTask','daily']])
assert.equal(cancellations[1].args.clientMessageId,'message-id')
console.log('ok   页面取消入口：出题、修订、追问均调用对应任务的取消接口')

const pageRequests=[]
f=fixture((op,args)=>{pageRequests.push({op,args});return args.idsOnly?{ids:['A','B','off-page']}:{page:args.page,totalPages:2,total:60,items:[]}})
f.state.set(4,'all');f.state.set(5,'list');f.state.set(10,true)
f.state.set(8,{page:1,totalPages:2,total:60,items:[{id:'A'}]})
await f.props('ListPane').onSelectAll(true)
assert.deepEqual(f.state.get(11),['A','B','off-page'],'全选包含其他页')
await f.props('ListPane').onPage(2)
assert.equal(f.state.get(8).page,2);assert.equal(pageRequests.at(-1).args.page,2)
assert.equal(f.state.get(11).length,3,'翻页保留跨页选择')
await f.props('ListPane').onSelectAll(false);assert.deepEqual(f.state.get(11),[])
console.log('ok   分页操作：切换页码、跨页全选、保留选择和全不选')
const lateSelection=deferred()
f=fixture((_op,args)=>args.idsOnly?lateSelection.promise:{kind:args.kind,page:1,total:1,totalPages:1,items:[]})
f.state.set(4,'all');f.state.set(5,'list')
const selecting=f.props('ListPane').onSelectAll(true)
f.props('TabBar').onPick('favorite');await tick()
lateSelection.resolve({ids:['old-page-id']});await selecting
assert.equal(f.state.get(4),'favorite');assert.deepEqual(f.state.get(11),[],'全选的迟到结果不串入新栏目')
