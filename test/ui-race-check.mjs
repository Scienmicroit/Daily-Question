import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source=readFileSync(new URL('../client.js',import.meta.url),'utf8')
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
const tick=()=>new Promise(r=>setImmediate(r))
function fixture(responder,detail=false) {
  let components,index,refIndex
  const boot={settings:{subjects:['math1']},subjects:[],counts:{math1:{all:2}}}
  const state=new Map([[0,boot],[1,false],[3,'math1'],[4,detail?'all':'today'],[5,detail?'detail':'empty'],
    [6,detail?{id:'A',type:'single',favorite:false,answerState:'revealed',attemptCount:1,lastAttempt:{id:'attempt-A'}}:null],[8,{items:[]}]])
  const refs=[]
  const h=(type,props,...children)=>({type,props:props||{},children:children.flat(10)})
  const window={__ModuleLoader__:{load(module){components=module.factory(()=>({createElement:h,
    useState(value){const i=index++;if(!state.has(i))state.set(i,typeof value==='function'?value():value);return [state.get(i),v=>state.set(i,typeof v==='function'?v(state.get(i)):v)]},
    useRef(value){return refs[refIndex++]??={current:value}},useEffect(){},useCallback:f=>f,useMemo:f=>f()}))}}}
  new Function('window','fetch',source.replace("    return {\n      inject: ['slots'],","    return { Page };\n    return {\n      inject: ['slots'],"))(window,async(_url,options)=>{
    const {op,args}=JSON.parse(options.body)
    const result=op==='bootstrap'?boot:await responder(op,args)
    return {ok:true,json:async()=>({ok:true,result})}
  })
  function find(node,name){if(node?.type?.name===name)return node;for(const child of node?.children||[]){const found=find(child,name);if(found)return found}}
  return {state,props(name){index=refIndex=0;const node=find(components.Page(),name);assert(node,`缺少${name}`);return node.props}}
}

const all=deferred(),favorite=deferred()
let f=fixture((_op,args)=>args.kind==='all'?all.promise:favorite.promise)
f.props('TabBar').onPick('all');f.props('TabBar').onPick('favorite')
favorite.resolve({kind:'favorite',items:[]});await tick()
all.resolve({kind:'all',items:[]});await tick()
assert.equal(f.state.get(4),'favorite');assert.equal(f.state.get(8).kind,'favorite')

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
await f.props('SubjectsModal').onDone({subjects:['math2'],customSubjects:[]})
await tick()
assert.equal(f.state.get(3),'math2')
assert.deepEqual(switchCalls.map(([op,args])=>[op,args.activeSubject||args.subjectId]),[['saveSettings','math2'],['ensureDaily','math2']])

const lateThread=deferred()
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
