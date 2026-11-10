import { T, formatDate, newAttemptId } from './common.js'
import { CSS } from './styles.js'
import { STUDY_FILE_ACCEPT, readBankFile } from './import-file.js'

export function createPage(React, { window, rpc, components, styleState }) {
  const { createElement: h, useState, useEffect, useRef, useMemo, useCallback } = React
  const {
    Icon, Btn, EmptyState, Presence, CountdownLines, ExamStrip, SubjectNav, TabBar, MobileBar, QuestionPane,
    ListPane, ThreadPane, SubjectsModal, BanksModal, SyllabusesModal, PastPapersModal, RevisionModal, ConfirmModal, PluginLogo,
  } = components

  function watchDayChange(snapshot, onSnapshot) {
    let timer, stopped = false, checking = false
    const schedule = (retry = false) => {
      const delay = Date.parse(snapshot.nextDayAt) - Date.parse(snapshot.now)
      timer = window.setTimeout(check, retry || !Number.isFinite(delay) ? 60_000 : Math.max(1000, delay))
    }
    const check = async () => {
      if (stopped || checking) return
      checking = true
      window.clearTimeout(timer)
      let retry = false
      try {
        const fresh = await rpc('bootstrap')
        if (!stopped) { snapshot = fresh; onSnapshot(fresh) }
      } catch { retry = true }
      finally { checking = false; if (!stopped) schedule(retry) }
    }
    const onVisible = () => { if (window.document.visibilityState === 'visible') check() }
    schedule()
    window.addEventListener('focus', check)
    window.document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.removeEventListener('focus', check)
      window.document.removeEventListener('visibilitychange', onVisible)
    }
  }

  function Page() {
    const [boot, setBoot] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [subjectId, setSubjectId] = useState(null)
    const [kind, setKind] = useState('today')
    const [view, setView] = useState('empty')
    const [question, setQuestion] = useState(null)
    const [thread, setThread] = useState(null)
    const [list, setList] = useState(null)
    const [busy, setBusy] = useState('')
    const [managing, setManaging] = useState(false)
    const [selected, setSelected] = useState([])
    const bulkLock = useRef(false)
    const [fail, setFail] = useState('')
    const [toast, setToast] = useState(null)
    const [modal, setModal] = useState(null)
    const [choice, setChoice] = useState('')
    const [localRedo, setLocalRedo] = useState(false)
    const [threadOpen, setThreadOpen] = useState(false)
    const [threadRatio, setThreadRatio] = useState(33)
    const fileRef = useRef(null)
    const attemptRef = useRef(newAttemptId())
    const toastTimer = useRef(null)
    const mainScroll = useRef(null)
    const listScroll = useRef(0)
    const redoQuestions = useRef(new Set())
    const dailyRequest = useRef(0)
    const lastDay = useRef(null)
    const currentView = useRef(null)
    const bootRequest = useRef(0)
    const threadRequest = useRef(0)
    const selectionRequest = useRef(0)
    currentView.current = { subjectId, kind, view, page:list?.page||1, loading:busy==='list' }

    useEffect(() => {
      if (view === 'list' && list && mainScroll.current) mainScroll.current.scrollTop = listScroll.current
      if (view === 'detail' && mainScroll.current) mainScroll.current.scrollTop = 0
    }, [view, list])

    const notify = useCallback((message, tone = 'ok') => {
      setToast({ message, tone })
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 4200)
    }, [])

    useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

    const refreshBoot = useCallback(async () => {
      const request = ++bootRequest.current
      try {
        const result = await rpc('bootstrap')
        if (request === bootRequest.current) setBoot(result)
        return result
      } catch {
        return null
      }
    }, [])

    const loadToday = useCallback(async (sid) => {
      if (!sid) return
      const request = ++dailyRequest.current
      // 高亮必须跟着视图走：从「全部 / 收藏 / 错题本」切回今日题目时要一起复位
      setKind('today')
      setThreadOpen(false)
      setView('detail')
      setBusy('daily')
      setFail('')
      setQuestion(null)
      setThread(null)
      setLocalRedo(false)
      setChoice('')
      attemptRef.current = newAttemptId()
      try {
        const result = await rpc('ensureDaily', { subjectId: sid })
        if (request === dailyRequest.current) {
          setQuestion(result.question)
          setLocalRedo(redoQuestions.current.has(result.question.id))
          setThread(result.thread || null)
        }
        await refreshBoot()
      } catch (issue) {
        if (request === dailyRequest.current) setFail(issue.message)
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [refreshBoot])

    const showSubject = useCallback((sid) => {
      setSubjectId(sid)
      setList(null)
      if (sid) {
        loadToday(sid)
        return
      }
      dailyRequest.current++
      setBusy(''); setFail(''); setQuestion(null); setThread(null); setThreadOpen(false); setView('empty')
    }, [loadToday])

    useEffect(() => {
      if (subjectId && boot && !boot.settings.subjects.includes(subjectId)) {
        showSubject(boot.settings.subjects[0] || null)
      }
    }, [boot?.settings.subjects, subjectId, showSubject])

    useEffect(() => {
      if (!boot?.today) return undefined
      return watchDayChange(boot, setBoot)
    }, [boot?.today])

    useEffect(() => {
      if (!boot?.today || lastDay.current === boot.today) return undefined
      const previous = lastDay.current
      lastDay.current = boot.today
      if (!previous) return undefined
      redoQuestions.current.clear()
      const { subjectId: sid, kind: activeKind } = currentView.current
      if (!sid || !boot.settings.subjects.includes(sid)) return undefined
      if (activeKind === 'today') { loadToday(sid); return undefined }
      let cancelled = false
      const request=dailyRequest.current
      rpc('ensureDaily', { subjectId: sid }).then(async () => {
        if (cancelled) return
        await refreshBoot()
        const current = currentView.current
        if (cancelled || request!==dailyRequest.current || current.loading || current.subjectId !== sid || current.kind === 'today' || current.view !== 'list') return
        const result = await rpc('listQuestions', { subjectId: sid, kind: current.kind, page:current.page })
        const latest = currentView.current
        if (!cancelled && request===dailyRequest.current && !latest.loading && latest.page===current.page && latest.subjectId === sid && latest.kind === current.kind && latest.view === 'list') {
          listScroll.current = mainScroll.current?.scrollTop || 0
          setList(result)
        }
      }).catch((issue) => { if (!cancelled) notify(`今日题目更新失败：${issue.message}`, 'warn') })
      return () => { cancelled = true }
    }, [boot?.today, loadToday, refreshBoot, notify])

    const loadList = useCallback(async (sid, nextKind, page = 1) => {
      if (!sid) return
      const request = ++dailyRequest.current
      listScroll.current = 0
      setKind(nextKind)
      setThreadOpen(false)
      setView('list')
      setFail('')
      setBusy('list')
      setList(null)
      try {
        const result = await rpc('listQuestions', { subjectId: sid, kind: nextKind, page })
        if (request === dailyRequest.current) setList(result)
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [notify])

    useEffect(() => { setSelected([]); setManaging(false) }, [subjectId, kind, view])

    const pickSubject = useCallback((sid) => {
      if (!sid || sid === subjectId || !boot.settings.subjects.includes(sid)) return
      rpc('saveSettings', { activeSubject: sid }).catch(() => {})
      showSubject(sid)
    }, [boot, subjectId, showSubject])

    const openQuestion = useCallback(async (qid) => {
      const request = ++dailyRequest.current
      listScroll.current = mainScroll.current?.scrollTop || 0
      setBusy('question')
      try {
        const result = await rpc('getQuestion', { qid })
        if (request !== dailyRequest.current) return
        const canResume = result.isToday && result.question.answerState === 'revealed'
          && result.question.attemptCount > 0 && !redoQuestions.current.has(qid)
        if (!canResume) redoQuestions.current.add(qid)
        setQuestion(result.question)
        setThread(result.thread || null)
        setView('detail')
        setLocalRedo(!canResume)
        setChoice('')
        setThreadOpen(false)
        attemptRef.current = newAttemptId()
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [notify])

    const backToList = async () => {
      const request = ++dailyRequest.current
      setThreadOpen(false)
      setView('list')
      try {
        const result = await rpc('listQuestions', { subjectId, kind, page:list?.page||1 })
        if (request === dailyRequest.current) setList(result)
      } catch (issue) { if (request === dailyRequest.current) notify(issue.message, 'bad') }
    }

    useEffect(() => {
      let cancelled = false
      rpc('bootstrap').then((result) => {
        if (cancelled) return
        setBoot(result)
        const preferred = result.settings?.activeSubject
        const first = result.settings.subjects.includes(preferred) ? preferred : (result.settings.subjects[0] || null)
        setSubjectId(first)
        setLoading(false)
        if (first) loadToday(first)
        else setView('empty')
      }).catch((issue) => {
        if (cancelled) return
        setError(issue.message)
        setLoading(false)
      })
      return () => { cancelled = true }
    }, [loadToday])

    const currentSubject = useMemo(() => (boot?.subjects || []).find((subject) => subject.id === subjectId) || null,
      [boot, subjectId])

    const reveal = useCallback(async (mode) => {
      if (!question) return
      const request = dailyRequest.current
      const attemptId = attemptRef.current
      setBusy('reveal')
      const showSaved = (saved) => {
        setQuestion(saved)
        redoQuestions.current.delete(question.id)
        setLocalRedo(false)
      }
      try {
        const result = await rpc('reveal', {
          qid: question.id,
          mode,
          choice: mode === 'submit' ? choice : '',
          attemptId,
        })
        if (request === dailyRequest.current) showSaved(result.question)
        refreshBoot()
      } catch (issue) {
        if (request !== dailyRequest.current) return
        const saved = await rpc('getQuestion', { qid: question.id, attemptId }).catch(() => null)
        if (request !== dailyRequest.current) return
        if (saved?.question?.lastAttempt?.id === attemptId) {
          showSaved(saved.question)
          const last = saved.question.lastAttempt
          const changed = last.mode !== mode || (mode === 'submit' && last.choice !== choice)
          notify(changed ? '已找回先前保存的作答。本次改选未提交，可点击「重新作答」再提交。' : '已找回本轮保存的作答', changed ? 'warn' : 'ok')
          refreshBoot()
        } else {
          notify(`${issue.message}。未确认本轮是否保存，可再次提交以核对。`, 'warn')
        }
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [question, choice, notify, refreshBoot])

    const judge = useCallback(async (verdict) => {
      if (!question) return
      if (!question.lastAttempt?.id) { notify('缺少本次作答记录，请重新打开题目后判定','bad'); return }
      const request = dailyRequest.current
      setBusy('judge')
      try {
        const result = await rpc('judge', { qid: question.id, verdict, attemptId:question.lastAttempt.id })
        if (request === dailyRequest.current) setQuestion(result.question)
        refreshBoot()
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [question, notify, refreshBoot])

    const favorite = useCallback(async () => {
      if (!question) return
      const request = dailyRequest.current
      setBusy('favorite')
      try {
        const result = await rpc('favorite', { qid: question.id, value: !question.favorite })
        if (request === dailyRequest.current) {
          setQuestion(result.question)
          notify(question.favorite ? '已取消收藏' : '已加入收藏')
        }
        refreshBoot()
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [question, notify, refreshBoot])

    const sendFollowup = useCallback(async (text, messageId) => {        if (!question) throw new Error('没有打开任何题目')
      const request = dailyRequest.current
      const threadVersion = ++threadRequest.current
      const result = await rpc('followup', { qid: question.id, message: text, clientMessageId: messageId })
      if (request === dailyRequest.current && threadVersion === threadRequest.current) setThread(result.thread)
    }, [question])

    const clearThread = useCallback(async () => {
      if (!question) return
      setModal({
        kind: 'confirm',
        title: '清空本题追问',
        message: '只会清空当前这道题的追问记录，不会删除题目、作答记录或其他题目的对话。',
        confirmLabel: '清空',
        danger: true,
        onConfirm: async () => {
          const request = dailyRequest.current
          const threadVersion = ++threadRequest.current
          setModal(null)
          try {
            const result = await rpc('clearThread', { qid: question.id })
            if (request === dailyRequest.current && threadVersion === threadRequest.current) {
              setThread(result.thread)
              notify('本题追问已清空')
            }
          } catch (issue) {
            notify(issue.message, 'bad')
          }
        },
      })
    }, [question, notify])

    const cancelWork = async (kind, qid, clientMessageId) => {
      try { await rpc('cancelTask',{kind,subjectId,qid,clientMessageId}) }
      catch (issue) { notify(issue.message,'bad') }
    }

    const revise = useCallback(async () => {
      if (!question) return
      const request = dailyRequest.current
      setBusy('revise')
      try {
        const result = await rpc('revise', { qid: question.id })
        if (request !== dailyRequest.current) return
        setQuestion(result.question)
        setModal({ kind: 'revision' })
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [question, notify])

    const confirmRevision = useCallback(async () => {
      if (!question?.pendingRevision) return
      const request = dailyRequest.current
      setBusy('revise')
      try {
        const result = await rpc('confirmRevision', {
          qid: question.id,
          candidateId: question.pendingRevision.candidateId,
        })
        if (request !== dailyRequest.current) return
        setQuestion(result.question)
        setModal(null)
        notify('已替换为通过校验的新版本，旧版本已保留')
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [question, notify])

    const discardRevision = useCallback(async () => {
      if (!question) return
      const request = dailyRequest.current
      setModal(null)
      try {
        const result = await rpc('discardRevision', { qid: question.id })
        if (request !== dailyRequest.current) return
        setQuestion(result.question)
        notify('已放弃候选版本，正式答案保持不变')
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      }
    }, [question, notify])

    const changeYear = useCallback(async (year) => {
      setBusy('year')
      try {
        const result = await rpc('saveSettings', { targetYear: year })
        await refreshBoot()
        if (result.countdown?.expired) notify('该年份的考试日期已过，请重新选择考研年份', 'warn')
        else notify(`已切换到 ${year} 考研`)
      } catch (issue) {
        notify(issue.message, 'bad')
      } finally {
        setBusy('')
      }
    }, [notify, refreshBoot])

    const refreshExam = useCallback(async () => {
      setBusy('exam')
      try {
        const result = await rpc('refreshExamDate', { year: boot?.settings?.targetYear })
        if (result.ok) {
          notify('已核验到官方公布的考试日期')
          await refreshBoot()
        } else {
          notify(result.reason || '暂未核验到官方公布的日期', 'warn')
          await refreshBoot()
        }
      } catch (issue) {
        notify(issue.message, 'bad')
      } finally {
        setBusy('')
      }
    }, [boot, notify, refreshBoot])

    const saveSubjects = async (draft) => {
      const preferred = draft.subjects.includes(subjectId) ? subjectId : (draft.subjects[0] || null)
      const result = await rpc('saveSettings', { ...draft, activeSubject: preferred })
      const next = result.settings.activeSubject
      bootRequest.current++
      setBoot((current) => ({ ...current, ...result }))
      setModal(null)
      notify(draft.deleteSubjectIds?.length ? '已删除所选科目及其历史题目' : '科目设置已保存')
      if (next !== subjectId) showSubject(next)
    }

    const pickFile = useCallback(() => {
      if (fileRef.current) {
        fileRef.current.value = ''
        fileRef.current.click()
      }
    }, [])

    const onFile = useCallback(async (event) => {
      const file = event.target.files?.[0]
      if (!file) return
      setBusy('import')
      try {
        const payload = await readBankFile(file)
        const result = await rpc('importBank', {
          name: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          kind: payload.kind,
          text: payload.text,
          base64: payload.base64,
          subjectId: subjectId || '',
        })
        setModal({ kind: 'banks', importResult: result })
      } catch (issue) {
        notify(issue.message, 'bad')
      } finally {
        setBusy('')
      }
    }, [subjectId, notify])

    const commitBank = useCallback(async (result, excludedIndexes) => {
      setBusy('commit')
      try {
        const saved = await rpc('commitBank', { importId: result.importId, name: result.name, subjectId: subjectId || '', excludedIndexes })
        setModal({ kind: 'banks' })
        await refreshBoot()
        notify(`题库《${saved.bank.name}》已入库，共 ${saved.bank.itemCount} 道题`)
      } catch (issue) {
        notify(issue.message, 'bad')
      } finally {
        setBusy('')
      }
    }, [subjectId, notify, refreshBoot])

    const deleteBank = useCallback((bank) => {
      setModal({
        kind: 'confirm',
        title: `${T.deleteBank}：${bank.name}`,
        message: `确认删除题库《${bank.name}》吗？\n\n- 已由该题库出过的题目、作答记录、收藏与追问都会保留，仍可在“全部”里打开。\n- 删除后无法再从这个题库抽题（需要重新导入）。`,
        confirmLabel: T.deleteBank,
        danger: true,
        onConfirm: async () => {
          setModal(null)
          try {
            const result = await rpc('deleteBank', { bankId: bank.id })
            await refreshBoot()
            notify(result.message)
          } catch (issue) {
            notify(issue.message, 'bad')
          }
        },
      })
    }, [notify, refreshBoot])

    const bulkQuestions = async (action) => {
      if (bulkLock.current || !selected.length) return
      const request = dailyRequest.current
      const qids = [...selected]
      const execute = async (confirmProtected = false) => {
        if (bulkLock.current || request !== dailyRequest.current) return
        bulkLock.current = true
        setBusy('bulk')
        try {
          const result = await rpc('bulkQuestions', { qids, action, confirmProtected })
          if (request !== dailyRequest.current) { refreshBoot(); return }
          if (result.requiresConfirmation) {
            setModal({ kind: 'confirm', title: '再次确认删除收藏或错题', danger: true,
              message: `选中的题目中有 ${result.protectedCount} 道已收藏或在错题本中。继续将永久删除所选 ${qids.length} 道题及其作答和追问，无法恢复。确定仍要删除吗？`,
              confirmLabel: '仍要永久删除', onConfirm: () => execute(true) })
            return
          }
          setModal(null)
          setSelected([])
          const loading = loadList(subjectId, kind, list?.page||1)
          const listRequest = dailyRequest.current
          await loading
          await refreshBoot()
          if (listRequest === dailyRequest.current) notify(`已处理 ${result.affected} 道题目`)
        } catch (issue) {
          if (request === dailyRequest.current) { setModal(null); notify(issue.message, 'bad') }
        } finally { bulkLock.current = false; if (request === dailyRequest.current) setBusy('') }
      }
      if (action === 'delete') {
        setModal({ kind: 'confirm', title: '删除所选题目', danger: true,
          message: `将永久删除 ${qids.length} 道题及其作答、收藏、错题标记和追问，无法恢复。题库原文件仍会保留，未来可能重新抽到其中的题目。`,
          confirmLabel: '确认删除', onConfirm: () => execute() })
      } else await execute()
    }

    const subjectVisible = boot?.settings.subjects.includes(subjectId)
    const counts = subjectVisible ? boot.counts?.[subjectId] : null
    const selectAllQuestions = async (value) => {
      if(bulkLock.current)return
      const request=dailyRequest.current,selection=++selectionRequest.current
      const isCurrent=()=>request===dailyRequest.current&&selection===selectionRequest.current
      if(!value){setSelected([]);setBusy(current=>current==='selection'?'':current);return}
      setBusy('selection')
      try {
        const result=await rpc('listQuestions',{subjectId,kind,idsOnly:true})
        if(isCurrent())setSelected(result.ids)
      } catch(issue){if(isCurrent())notify(issue.message,'bad')}
      finally{if(isCurrent())setBusy(current=>current==='selection'?'':current)}
    }
    const narrow = useMediaQuery('(max-width: 1180px)')

    const mainContent = (() => {
      if (error) {
        return h(EmptyState, {
          icon: 'x',
          title: '插件加载失败',
          body: error,
          actions: h(Btn, { onClick: () => window.location.reload() }, '重新加载页面'),
        })
      }
      if (loading) return h('div', { className: 'kd-loading' }, h('span', { className: 'kd-spinner' }), '正在读取学习数据…')
      if (!boot?.settings?.subjects?.length) {
        return h(EmptyState, {
          icon: 'plus',
          title: T.noSubjects,
          body: T.noSubjectsHint,
          actions: [
            h(Btn, {
              key: 'add',
              variant: 'primary',
              onClick: () => setModal({ kind: 'subjects' }),
            }, h(Icon, { name: 'plus', size: 13 }), T.addSubject),
            h(Btn, { key: 'bank', onClick: () => setModal({ kind: 'banks' }) }, T.manageBanks),
          ],
        })
      }
      if (!subjectVisible) return null
      if (busy === 'daily' && !question) {
        return h('div', { className: 'kd-loading' },
          h('span', { className: 'kd-spinner' }),
          T.generating,
          h('div', { className: 'kd-msg-meta', style: { marginTop: '8px' } },
            '先出题，再仅凭题干和选项盲解并比对答案；分歧交由主裁，仍无法确定就重新出题或阻止发布。首次出题可能需要较长时间。'),
          h(Btn,{variant:'ghost',onClick:()=>cancelWork('daily')},'取消生成'))
      }
      if (fail) {
        return h(EmptyState, {
          icon: 'refresh',
          title: T.generateFailed,
          body: fail,
          actions: [
            h(Btn, {
              key: 'retry',
              variant: 'primary',
              onClick: () => loadToday(subjectId),
            }, h(Icon, { name: 'refresh', size: 13 }), T.retry),
            h(Btn, { key: 'src', onClick: () => setModal({ kind: 'subjects' }) }, '切换出题来源'),
            h(Btn, { key: 'bank', onClick: () => setModal({ kind: 'banks' }) }, T.manageBanks),
          ],
        })
      }
      if (!subjectId) {
        return h(EmptyState, {
          icon: 'book',
          title: '先选择一个科目',
          body: '左侧列出的科目都可以切换；没有想要的科目就先去「科目管理」添加。',
        })
      }
      if (kind !== 'today' && view === 'list') {
        return h(ListPane, {
          list,
          kind,
          subjectName: currentSubject?.name || '',
          onOpen: openQuestion,
          managing, selected, busy: busy === 'bulk' || busy === 'selection',
          onManage: () => { setManaging(!managing); setSelected([]) },
          onToggle: (id) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]),
          onSelectAll: selectAllQuestions,
          onPage: (page) => loadList(subjectId,kind,page),
          onBulk: bulkQuestions,
        })
      }
      if (view === 'detail' && question) {
        return h(QuestionPane, {
          q: question,
          busy,
          choice,
          localRedo,
          threadOpen,
          onSelect: (key) => {
            setChoice((current) => {
              if (question.type !== 'multiple') return key
              const set = new Set(current.split('').filter(Boolean))
              if (set.has(key)) set.delete(key)
              else set.add(key)
              return [...set].sort().join('')
            })
          },
          onReveal: reveal,
          onSkip: () => kind === 'today' ? loadList(subjectId, 'all') : backToList(),
          onJudge: judge,
          onFavorite: favorite,
          onRedo: () => {
            dailyRequest.current++
            setBusy('')
            redoQuestions.current.add(question.id)
            setLocalRedo(true)
            setThreadOpen(false)
            setChoice('')
            attemptRef.current = newAttemptId()
          },
          onRevise: revise,
          onCancel: () => cancelWork('revise',question.id),
          revising: busy === 'revise',
          onToggleThread: () => setThreadOpen((value) => !value),
          onRemoveWrong: async () => {
            if (!question) return
            const request = dailyRequest.current
            try {
              const result = await rpc('removeFromWrongBook', { qid: question.id })
              if (request === dailyRequest.current) {
                setQuestion(result.question)
                notify('已移出错题本，历史作答记录仍然保留')
              }
              refreshBoot()
            } catch (issue) {
              if (request === dailyRequest.current) notify(issue.message, 'bad')
            }
          },
        })
      }
      return h(EmptyState, {
        icon: 'spark',
        title: '选择一个入口开始',
        body: '左侧「今日题目 / 全部 / 收藏 / 错题本」分别对应今天这道题、历史题目、收藏和错题。',
      })
    })()

    const pickTab = (value) => {
      if (!subjectVisible) return
      if (value === kind && (value === 'today' || view === 'list')) return
      if (value === 'today') {
        if (boot?.settings.subjects.includes(subjectId)) loadToday(subjectId)
      }
      else loadList(subjectId, value)
    }
    const showThread = subjectVisible && view === 'detail' && question && threadOpen && !localRedo
      && question.answerState === 'revealed' && question.attemptCount > 0

    return h('div', { className: 'kd-page' },
      styleState.injected ? null : h('style', null, CSS),
      h('div', { className: 'kd-header' },
        h('div', { className: 'kd-header-top' },
          h('div', { className: 'kd-header-left' },
            h(PluginLogo, { size: 40, className: 'kd-brand' }),
            h('div', { style: { minWidth: 0 } },
              h('h1', { className: 'kd-title' }, T.title),
              h('div', { className: 'kd-sub', title: T.subtitle },
                boot?.today ? `今日日期：${formatDate(boot.today)}\u00a0\u00a0` : '',
                '每日一题，稳步向前'))),
          boot ? h(CountdownLines, { countdown: boot.countdown }) : null),
        boot ? h(ExamStrip, {
          boot,
          busy: busy === 'exam',
          onRefresh: refreshExam,
          onYearChange: changeYear,
        }) : null),
      boot ? h(MobileBar, {
        boot,
        subjectId,
        onPick: pickSubject,
        onManage: () => setModal({ kind: 'subjects' }),
        onBanks: () => setModal({ kind: 'banks' }),
        onSyllabuses: () => setModal({ kind:'syllabuses' }),
        onPastPapers: () => setModal({ kind:'past-papers' }),
      }) : null,
      h('div', { className: 'kd-shell' },
        boot ? h(SubjectNav, {
          boot,
          subjectId,
          onPick: pickSubject,
          onManage: () => setModal({ kind: 'subjects' }),
          onBanks: () => setModal({ kind: 'banks' }),
          onSyllabuses: () => setModal({ kind:'syllabuses' }),
          onPastPapers: () => setModal({ kind:'past-papers' }),
        }) : null,
        h('main', { className: 'kd-main' },
          h('div', { className: 'kd-main-toolbar' },
            boot ? h(TabBar, {
              kind,
              counts,
              onPick: pickTab,
              todayDisabled: !boot.settings.subjects.includes(subjectId),
            }) : null,
            subjectVisible && kind !== 'today' && view === 'detail'
              ? h(Btn, { small: true, onClick: backToList, title: '返回列表', ariaLabel: '返回列表' }, h(Icon, { name: 'chevron-left', size: 16 })) : null),
          h('div', { className: 'kd-main-scroll', ref: mainScroll },
            h('div', { className: 'kd-main-inner' },
              h('div', { className: 'kd-view', key: `${subjectId}|${kind}|${view}|${question?.id || ''}` }, mainContent)))),
        h(Presence, null, showThread
          ? h(ThreadPane, {
            thread,
            questionId: question.id,
            busy,
            narrow,
            ratio: threadRatio,
            onRatioChange: setThreadRatio,
            onSend: sendFollowup,
            onClear: clearThread,
            onCancel: (messageId) => cancelWork('followup',question.id,messageId),
            onClose: () => setThreadOpen(false),
          })
          : null)),
      h('input', {
        ref: fileRef,
        type: 'file',
        accept: STUDY_FILE_ACCEPT,
        style: { display: 'none' },
        onChange: onFile,
      }),
      h(Presence, null,
      modal?.kind === 'subjects' && boot
        ? h(SubjectsModal, {
          boot,
          onClose: () => setModal(null),
          onDone: saveSubjects,
        })
        : null,
      modal?.kind === 'banks' && boot
        ? h(BanksModal, {
          key: modal.importResult?.importId || 'banks',
          boot,
          importResult: modal.importResult,
          committing: busy === 'commit',
          onClose: () => setModal(null),
          onPickFile: pickFile,
          onDelete: deleteBank,
          onCommit: commitBank,
          onCancelImport: () => setModal({ kind: 'banks' }),
        })
        : null,
      modal?.kind === 'revision' ? h(RevisionModal, {
        question,
        busy: busy === 'revise',
        onClose: () => setModal(null),
        onConfirm: confirmRevision,
        onDiscard: discardRevision,
      }) : null,
      modal?.kind === 'syllabuses' && boot ? h(SyllabusesModal,{
        boot,subjectId,onClose:()=>setModal(null),
        onSaved:(syllabuses)=>{bootRequest.current++;setBoot((current)=>({...current,syllabuses}))},
      }) : null,
      modal?.kind === 'past-papers' && boot ? h(PastPapersModal,{
        boot,subjectId,onClose:()=>setModal(null),
        onSaved:(pastPapers)=>{bootRequest.current++;setBoot((current)=>({...current,pastPapers}))},
      }) : null,
      modal?.kind === 'confirm' ? h(ConfirmModal, {
        key: modal.title,
        title: modal.title,
        message: modal.message,
        confirmLabel: modal.confirmLabel,
        danger: modal.danger,
        busy: busy === 'bulk',
        onConfirm: modal.onConfirm,
        onClose: () => { if (!bulkLock.current) setModal(null) },
      }) : null,
      ),
      toast ? h('div', { className: `kd-toast kd-toast-${toast.tone}` }, toast.message) : null,
      busy === 'import' || busy === 'commit'
        ? h('div', { className: 'kd-loading', style: { position: 'absolute', inset: 'auto 0 60px 0' } },
          h('span', { className: 'kd-spinner' }), busy === 'import' ? '正在解析文件…' : '正在入库…')
        : null)
  }

  function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => {
      try {
        return window.matchMedia(query).matches
      } catch {
        return false
      }
    })
    useEffect(() => {
      let media
      try {
        media = window.matchMedia(query)
      } catch {
        return undefined
      }
      const onChange = () => setMatches(media.matches)
      onChange()
      media.addEventListener ? media.addEventListener('change', onChange) : media.addListener(onChange)
      return () => {
        media.removeEventListener ? media.removeEventListener('change', onChange) : media.removeListener(onChange)
      }
    }, [query])
    return matches
  }

  return { Page, watchDayChange }
}
