import { T, formatDate, newAttemptId } from './common.js'
import { CSS } from './styles.js'
import { STUDY_FILE_ACCEPT, readBankFile } from './import-file.js'
import { createStudyStatsPage } from './study-stats.js'
import { createStudyMemoryPage } from './study-memory.js'

const SETTINGS_SECTIONS = new Set(['subjects', 'banks', 'syllabuses', 'past-papers', 'practice', 'backup', 'about'])
const MANAGEMENT_SECTIONS = new Set(['subjects', 'banks', 'syllabuses', 'past-papers'])
const MAX_NOTIFICATIONS = 3
const LIST_ROW_SELECTOR = '.kd-list-row[data-question-id]'

export function createPage(React, { window, rpc, components, styleState }) {
  const { createElement: h, useState, useEffect, useRef, useMemo, useCallback } = React
  const useScrollEffect = React.useLayoutEffect ?? useEffect
  const navigator = window?.navigator
  const platform = navigator?.userAgentData?.platform || navigator?.platform || ''
  const codePlatform = /^win/i.test(platform) ? 'windows' : /^mac/i.test(platform) ? 'macos' : undefined
  const {
    Icon, Btn, EmptyState, Presence, NotificationBanner, CountdownLines, ExamStrip, SubjectNav, TabBar, MobileBar, QuestionPane,
    ListPane, ThreadPane, SettingsModal, AboutPanel, SubjectsModal, BanksModal, SyllabusesModal, PastPapersModal, BackupModal,
    AttemptModal, RevisionModal, ConfirmModal, PluginLogo,
  } = components
  const StudyStatsPage = createStudyStatsPage(React, { window, rpc, Btn, Icon })
  const StudyMemoryPage = createStudyMemoryPage(React, { window, rpc, Btn, Icon })

  function watchDayChange(snapshot, onSnapshot, load = () => rpc('bootstrap', { practiceOnly: true })) {
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
        const fresh = await load()
        if (!fresh) retry = true
        else if (!stopped) { snapshot = fresh; onSnapshot?.(fresh) }
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
    const [toasts, setToasts] = useState([])
    const toastSerial = useRef(0)
    const [modal, setModal] = useState(null)
    const [choice, setChoice] = useState('')
    const [localRedo, setLocalRedo] = useState(false)
    const [threadOpen, setThreadOpen] = useState(false)
    const [threadRatio, setThreadRatio] = useState(33)
    const fileRef = useRef(null)
    const attemptRef = useRef(newAttemptId())
    const mainScroll = useRef(null)
    const listScroll = useRef(0)
    const listEntry = useRef(null)
    const listReturn = useRef(null)
    const redoQuestions = useRef(new Set())
    const dailyRequest = useRef(0)
    const lastDay = useRef(null)
    const currentView = useRef(null)
    const bootRequest = useRef(0)
    const threadRequest = useRef(0)
    const selectionRequest = useRef(0)
    const historyRequest = useRef(0)
    const [filters, setFilters] = useState({})
    const [queryDraft, setQueryDraft] = useState('')
    const [listError, setListError] = useState('')
    const [settingsBusy, setSettingsBusy] = useState(false)
    const [scheduleBusy, setScheduleBusy] = useState(false)
    const [studyPage, setStudyPage] = useState('')
    const [favoritePending, setFavoritePending] = useState(null)
    const statsTrigger = useRef(null)
    const subjectsDirty = useRef(false)
    const [focusedQuestionId, setFocusedQuestionId] = useState(null)
    const pageRef = useRef(null)
    const fullScreenRequest = useRef(null)
    const countsRequest = useRef(0)
    const [management, setManagement] = useState(null)
    const [managementAttempt, setManagementAttempt] = useState(0)
    const managementSection = MANAGEMENT_SECTIONS.has(modal?.kind) ? modal.kind : null
    const questionFocused = Boolean(focusedQuestionId && view === 'detail' && question?.id === focusedQuestionId
      && !modal && !studyPage)
    currentView.current = { subjectId, kind, view, page:list?.page||1, loading:busy==='list', filters, failures: boot?.failures }
    const skipToday = Boolean(boot?.dailyPlans?.[boot.settings.subjects[0]]?.todaySkipped)

    useScrollEffect(function restorePracticeScroll() {
      const scroll = mainScroll.current
      if (!scroll) return undefined
      if (view === 'detail') { scroll.scrollTop = 0; return undefined }
      if (view !== 'list' || !list || listError) return undefined
      const position = listReturn.current
      listReturn.current = null
      const rows = position ? [...scroll.querySelectorAll(LIST_ROW_SELECTOR)] : []
      const rowIndex = rows.findIndex((row) => row.dataset.questionId === position.qid)
      if (rowIndex < 0) { scroll.scrollTop = listScroll.current; return undefined }

      const row = rows[rowIndex]
      const place = () => {
        const offset = row.getBoundingClientRect().top - scroll.getBoundingClientRect().top
        if (Math.abs(offset - position.offset) > 0.5) scroll.scrollTop += offset - position.offset
      }
      place()
      // 公式和预览陆续渲染时，上方卡片的高度仍可能改变。
      const observer = window.ResizeObserver ? new window.ResizeObserver(place) : null
      if (observer) {
        if (scroll.firstElementChild) observer.observe(scroll.firstElementChild)
        for (const preceding of rows.slice(0, rowIndex + 1)) observer.observe(preceding)
      }
      const animatedView = row.closest('.kd-view')
      animatedView?.addEventListener('animationend', place, { once: true })
      const userEvents = ['wheel', 'pointerdown', 'touchstart', 'keydown', 'focusin']
      const stop = () => {
        observer?.disconnect()
        animatedView?.removeEventListener('animationend', place)
        for (const event of userEvents) scroll.removeEventListener(event, stop)
      }
      for (const event of userEvents) scroll.addEventListener(event, stop, { passive: true })
      return stop
    }, [view, list, listError])

    const closeQuestionFocus = useCallback(() => {
      fullScreenRequest.current = null
      setFocusedQuestionId(null)
      if (pageRef.current && window.document?.fullscreenElement === pageRef.current) {
        window.document.exitFullscreen?.().catch(() => {})
      }
    }, [])

    useEffect(() => {
      if (focusedQuestionId && !questionFocused) closeQuestionFocus()
      if (!questionFocused) return undefined
      const document = window.document
      let wasFullScreen = document.fullscreenElement === pageRef.current
      const onFullscreenChange = () => {
        const isFullScreen = document.fullscreenElement === pageRef.current
        if (wasFullScreen && !isFullScreen) closeQuestionFocus()
        wasFullScreen = isFullScreen
      }
      const onKeyDown = (event) => { if (event.key === 'Escape') closeQuestionFocus() }
      document.addEventListener('fullscreenchange', onFullscreenChange)
      window.addEventListener('keydown', onKeyDown)
      return () => {
        document.removeEventListener('fullscreenchange', onFullscreenChange)
        window.removeEventListener('keydown', onKeyDown)
      }
    }, [focusedQuestionId, questionFocused, closeQuestionFocus])

    const toggleQuestionFocus = () => {
      if (questionFocused) { closeQuestionFocus(); return }
      setFocusedQuestionId(question.id)
      const page = pageRef.current
      const document = window.document
      if (!page?.requestFullscreen || document?.fullscreenElement) return
      const request = {}
      fullScreenRequest.current = request
      page.requestFullscreen().then(() => {
        if (fullScreenRequest.current === null && document.fullscreenElement === page) return document.exitFullscreen()
      }).catch(() => {})
    }

    const notify = useCallback((message, tone = 'ok', onUndo) => {
      const id = ++toastSerial.current
      setToasts((previous) => [...previous, { id, message, tone, onUndo }].slice(-MAX_NOTIFICATIONS))
    }, [])
    const dismissToast = useCallback((id) => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id))
    }, [])

    const refreshBoot = useCallback(async () => {
      const request = ++bootRequest.current
      const countsVersion = ++countsRequest.current
      try {
        const result = await rpc('bootstrap', { practiceOnly: true })
        if (request === bootRequest.current) {
          setBoot((current) => ({
            ...current, ...result,
            counts: countsVersion === countsRequest.current ? result.counts : current?.counts,
          }))
        }
        return result
      } catch {
        return null
      }
    }, [])

    const refreshCounts = useCallback(async () => {
      const request = ++countsRequest.current
      try {
        const { counts } = await rpc('practiceCounts')
        if (counts && request === countsRequest.current) setBoot((current) => ({ ...current, counts }))
      } catch { /* The next practice snapshot refresh can still update the counts. */ }
    }, [])

    useEffect(function loadManagementSection() {
      if (!managementSection || !boot?.practiceOnly) return undefined
      let cancelled = false
      setManagement(null)
      rpc('managementData', { section: managementSection }).then((data) => {
        if (!cancelled) setManagement({ section: managementSection, data })
      }).catch((issue) => {
        if (!cancelled) setManagement({ section: managementSection, error: issue.message })
      })
      return () => { cancelled = true }
    }, [managementSection, boot?.practiceOnly, managementAttempt])

    const loadToday = useCallback(async (sid, manual = false) => {
      if (!sid) return
      const request = ++dailyRequest.current
      // 高亮必须跟着视图走：从「全部 / 收藏 / 错题本」切回今日题目时要一起复位
      setKind('today')
      setThreadOpen(false)
      setView('detail')
      const previousFailure = !manual && currentView.current.failures?.[sid]?.message
      setBusy(previousFailure ? '' : 'daily')
      setFail(previousFailure || '')
      setQuestion(null)
      setThread(null)
      setLocalRedo(false)
      setChoice('')
      attemptRef.current = newAttemptId()
      try {
        const result = await rpc('ensureDaily', { subjectId: sid, ...(manual ? { manual: true } : {}) })
        if (request === dailyRequest.current) {
          setFail(result.status === 'failed' ? result.message : '')
          setQuestion(result.question || null)
          setLocalRedo(Boolean(result.question && redoQuestions.current.has(result.question.id)))
          setThread(result.thread || null)
        }
      } catch (issue) {
        if (request === dailyRequest.current) setFail(issue.message)
      } finally {
        if (request === dailyRequest.current) setBusy('')
        await refreshBoot()
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
      return watchDayChange(boot, null, refreshBoot)
    }, [boot?.today, refreshBoot])

    useEffect(() => {
      if (!boot?.today || !boot.dailyPlans) return undefined
      let cancelled = false
      const active = currentView.current.subjectId
      const subjects = boot.settings.subjects.filter((id) => {
        const plan = boot.dailyPlans[id]
        return id !== active && plan && !plan.pendingStart && !plan.todaySkipped && !boot.todayMap?.[id] && !boot.failures?.[id]
      })
      const generate = async () => {
        for (const id of subjects) {
          if (cancelled) return
          try { await rpc('ensureDaily', { subjectId: id, date: boot.today }) }
          catch { /* The failure is shown when the user opens this subject. */ }
          if (!cancelled) await refreshBoot()
        }
      }
      generate()
      return () => { cancelled = true }
    }, [boot?.today, skipToday, refreshBoot])

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
        const result = await rpc('listQuestions', { subjectId: sid, kind: current.kind, page:current.page, ...current.filters })
        const latest = currentView.current
        if (!cancelled && request===dailyRequest.current && !latest.loading && latest.page===current.page && latest.subjectId === sid && latest.kind === current.kind && latest.view === 'list') {
          listScroll.current = mainScroll.current?.scrollTop || 0
          setList(result)
        }
      }).catch((issue) => { if (!cancelled) notify(`今日题目更新失败：${issue.message}`, 'warn') })
      return () => { cancelled = true }
    }, [boot?.today, loadToday, refreshBoot, notify])

    const loadQuestion = useCallback(async (qid, entryKind, request) => {
      const result = await rpc('getQuestion', { qid })
      if (request !== dailyRequest.current) return
      const canResume = entryKind !== 'review' && result.isToday && result.question.answerState === 'revealed'
        && result.question.attemptCount > 0 && !redoQuestions.current.has(qid)
      if (!canResume) redoQuestions.current.add(qid)
      setQuestion(result.question)
      setThread(result.thread || null)
      setView('detail')
      setLocalRedo(!canResume)
      setChoice('')
      setThreadOpen(false)
      attemptRef.current = newAttemptId()
    }, [])

    const loadList = useCallback(async (sid, nextKind, page = 1, nextFilters = {}) => {
      if (!sid) return
      const request = ++dailyRequest.current
      listScroll.current = 0
      listEntry.current = null
      listReturn.current = null
      setKind(nextKind)
      setFilters(nextFilters)
      setQueryDraft(nextFilters.query || '')
      setListError('')
      setThreadOpen(false)
      setView('list')
      setFail('')
      setBusy('list')
      setList(null)
      try {
        const result = await rpc('listQuestions', { subjectId: sid, kind: nextKind, page, ...nextFilters })
        if (request !== dailyRequest.current) return
        if (nextKind === 'review' && !nextFilters.topic && result.total === 1) {
          await loadQuestion(result.items[0].id, nextKind, request)
        }
        if (request === dailyRequest.current) setList(result)
      } catch (issue) {
        if (request === dailyRequest.current) setListError(issue.message)
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [loadQuestion])

    const applyFilters = (patch) => {
      if (bulkLock.current) return
      setSelected([])
      loadList(subjectId, kind, 1, { ...filters, ...patch })
    }

    useEffect(() => { setSelected([]); setManaging(false) }, [subjectId, kind, view])

    const pickSubject = useCallback((sid) => {
      if (!sid || sid === subjectId || !boot.settings.subjects.includes(sid)) return
      rpc('saveSettings', { activeSubject: sid }).catch(() => {})
      showSubject(sid)
    }, [boot, subjectId, showSubject])

    const openQuestion = useCallback(async (qid) => {
      const request = ++dailyRequest.current
      if (currentView.current.view === 'list') {
        const scroll = mainScroll.current
        const row = scroll && [...scroll.querySelectorAll(LIST_ROW_SELECTOR)].find((item) => item.dataset.questionId === qid)
        listScroll.current = scroll?.scrollTop || 0
        listEntry.current = { qid, offset: row ? row.getBoundingClientRect().top - scroll.getBoundingClientRect().top : 0 }
      }
      setBusy('question')
      try {
        await loadQuestion(qid, kind, request)
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [kind, loadQuestion, notify])

    const backToList = async () => {
      const request = ++dailyRequest.current
      const position = listEntry.current
      setThreadOpen(false)
      try {
        const result = await rpc('listQuestions', { subjectId, kind, page: list?.page || 1, ...filters,
          ...(position ? { anchorId: position.qid } : {}) })
        if (request !== dailyRequest.current) return
        listEntry.current = null
        listReturn.current = position
        setListError('')
        setList(result)
        setView('list')
      } catch (issue) {
        if (request !== dailyRequest.current) return
        setListError(issue.message)
        setView('list')
      }
    }

    const nextReview = async () => {
      const request = ++dailyRequest.current
      setBusy('question')
      try {
        const result = await rpc('listQuestions', { subjectId, kind: 'review', page: 1, ...filters })
        if (request !== dailyRequest.current) return
        setList(result)
        if (result.items.length) await openQuestion(result.items[0].id)
        else { setThreadOpen(false); setView('list') }
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally { if (request === dailyRequest.current) setBusy('') }
    }

    const inspectAttempt = async (attemptId) => {
      const request = dailyRequest.current
      const history = ++historyRequest.current
      try {
        const result = await rpc('getQuestion', { qid: question.id, attemptId })
        if (request !== dailyRequest.current || history !== historyRequest.current) return
        if (result.question.lastAttempt?.id !== attemptId) throw new Error('本次作答记录已不可用')
        setModal({ kind: 'attempt', record: result.question })
      } catch (issue) {
        if (request === dailyRequest.current && history === historyRequest.current) notify(issue.message, 'bad')
      }
    }

    useEffect(function initialize() {
      let cancelled = false
      rpc('bootstrap', { practiceOnly: true, includeToday: true }).then(({ todayQuestion, ...result }) => {
        if (cancelled) return
        setBoot(result)
        const preferred = result.settings?.activeSubject
        const first = result.settings.subjects.includes(preferred) ? preferred : (result.settings.subjects[0] || null)
        setSubjectId(first)
        setLoading(false)
        if (first && todayQuestion?.question) {
          setQuestion(todayQuestion.question)
          setThread(todayQuestion.thread || null)
          setView('detail')
        } else if (first && result.failures?.[first]?.message && !result.dailyPlans?.[first]?.todaySkipped) {
          setFail(result.failures[first].message)
          setView('detail')
        } else if (first) loadToday(first)
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

    const showReviewRemoval = useCallback((qid, removalId) => {
      if (!removalId) return
      notify('连续三次复习答对，已自动移出错题本', 'ok', async () => {
        try {
          await rpc('undoReviewRemoval', { qid, removalId })
          setQuestion((current) => current?.id === qid ? { ...current, wrongEver: true } : current)
          notify('已撤销操作，题目已恢复到错题本')
          refreshCounts()
          const current = currentView.current
          const request = dailyRequest.current
          if (current.view === 'list' && ['review', 'wrong'].includes(current.kind)) {
            const list = await rpc('listQuestions', { subjectId: current.subjectId, kind: current.kind,
              page: current.page, ...current.filters }).catch(() => null)
            if (list && request === dailyRequest.current) setList(list)
          }
        } catch (issue) { notify(issue.message, 'bad') }
      })
    }, [notify, refreshCounts])

    const optionKeys = question?.options?.map((option) => option.key).join('') || ''
    const attemptId = attemptRef.current
    const optionOrder = useMemo(() => {
      if (!boot?.settings?.shuffleOptions || !['single', 'multiple'].includes(question?.type)) return ''
      const keys = [...optionKeys]
      for (let i = keys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[keys[i], keys[j]] = [keys[j], keys[i]]
      }
      return keys.join('')
    }, [attemptId, optionKeys, question?.type, boot?.settings?.shuffleOptions])

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
          fromReview: kind === 'review',
          ...(optionOrder ? { optionOrder, positionalLabels: true } : {}),
        })
        if (request === dailyRequest.current) showSaved(result.question)
        showReviewRemoval(question.id, result.reviewRemovalId)
        refreshCounts()
      } catch (issue) {
        if (request !== dailyRequest.current) return
        const saved = await rpc('getQuestion', { qid: question.id, attemptId }).catch(() => null)
        if (request !== dailyRequest.current) return
        if (saved?.question?.lastAttempt?.id === attemptId) {
          showSaved(saved.question)
          const last = saved.question.lastAttempt
          const changed = last.mode !== mode || (mode === 'submit' && last.choice !== choice)
          if (saved.reviewRemovalId) showReviewRemoval(question.id, saved.reviewRemovalId)
          else notify(changed ? '已找回先前保存的作答。本次改选未提交，可点击「重新作答」再提交。' : '已找回本轮保存的作答', changed ? 'warn' : 'ok')
          refreshCounts()
        } else {
          notify(`${issue.message}。未确认本轮是否保存，可再次提交以核对。`, 'warn')
        }
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [question, choice, kind, optionOrder, notify, refreshCounts, showReviewRemoval])

    const judge = useCallback(async (verdict) => {
      if (!question) return
      if (!question.lastAttempt?.id) { notify('缺少本次作答记录，请重新打开题目后判定','bad'); return }
      const request = dailyRequest.current
      setBusy('judge')
      try {
        const result = await rpc('judge', { qid: question.id, verdict, attemptId:question.lastAttempt.id })
        if (request === dailyRequest.current) setQuestion(result.question)
        showReviewRemoval(question.id, result.reviewRemovalId)
        refreshCounts()
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally {
        if (request === dailyRequest.current) setBusy('')
      }
    }, [question, notify, refreshCounts, showReviewRemoval])

    const favorite = useCallback(async () => {
      if (!question || favoritePending === question.id) return
      const request = dailyRequest.current
      setFavoritePending(question.id)
      try {
        const result = await rpc('favorite', { qid: question.id, value: !question.favorite })
        if (request === dailyRequest.current) {
          setQuestion((current) => current?.id === question.id
            ? { ...current, favorite: result.question.favorite } : current)
          notify(question.favorite ? '已取消收藏' : '已加入收藏')
        }
        refreshCounts()
      } catch (issue) {
        if (request === dailyRequest.current) notify(issue.message, 'bad')
      } finally {
        setFavoritePending((value) => value === question.id ? null : value)
      }
    }, [question, favoritePending, notify, refreshCounts])

    const sendFollowup = useCallback(async (text, messageId, onDelta) => {
      if (!question) throw new Error('没有打开任何题目')
      const request = dailyRequest.current
      const threadVersion = ++threadRequest.current
      const isCurrent = () => request === dailyRequest.current && threadVersion === threadRequest.current
      const result = await rpc('followup', { qid: question.id, message: text, clientMessageId: messageId }, (delta) => {
        if (isCurrent()) onDelta?.(delta)
      })
      if (isCurrent()) setThread(result.thread)
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

    const resetSubjectsEditor = () => {
      subjectsDirty.current = false
      setModal((current) => current?.kind === 'subjects'
        ? { kind: 'subjects', edit: (current.edit || 0) + 1 } : current)
    }

    const saveSubjects = async (draft) => {
      const preferred = draft.subjects.includes(subjectId) ? subjectId : (draft.subjects[0] || null)
      const result = await rpc('saveSettings', { ...draft, activeSubject: preferred })
      const next = result.settings.activeSubject
      bootRequest.current++
      countsRequest.current++
      setBoot((current) => ({ ...current, ...result }))
      setManagement((current) => current?.section === 'subjects' && result.customSubjects
        ? { ...current, data: {
          customSubjects: result.customSubjects,
          bankItemCounts: Object.fromEntries(result.subjects.map(({ id, bankItemCount }) => [id, bankItemCount])),
        } } : current)
      resetSubjectsEditor()
      notify(draft.deleteSubjectIds?.length ? '科目设置已保存，所选科目及其历史题目已删除' : '科目设置已保存')
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
        if (saved.banks) setManagement({ section: 'banks', data: { banks: saved.banks } })
        notify(`题库《${saved.bank.name}》已入库，共 ${saved.bank.itemCount} 道题`)
      } catch (issue) {
        notify(issue.message, 'bad')
      } finally {
        setBusy('')
      }
    }, [subjectId, notify])

    const deleteBank = useCallback(async (bank) => {
      setBusy('delete-bank')
      try {
        const result = await rpc('deleteBank', { bankId: bank.id })
        if (result.banks) setManagement({ section: 'banks', data: { banks: result.banks } })
        setModal({ kind: 'banks' })
        notify(result.message)
      } catch (issue) {
        notify(issue.message, 'bad')
      } finally {
        setBusy('')
      }
    }, [notify])

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
          if (request !== dailyRequest.current) { refreshCounts(); return }
          if (result.requiresConfirmation) {
            setModal({ kind: 'confirm', title: '再次确认删除收藏或错题', danger: true,
              message: `选中的题目中有 ${result.protectedCount} 道已收藏或在错题本中。继续将永久删除所选 ${qids.length} 道题及其作答和追问，无法恢复。确定仍要删除吗？`,
              confirmLabel: '仍要永久删除', onConfirm: () => execute(true) })
            return
          }
          setModal(null)
          setSelected([])
          const loading = loadList(subjectId, kind, list?.page||1, filters)
          const listRequest = dailyRequest.current
          await loading
          await refreshCounts()
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
    const dailyPlan = subjectVisible ? boot.dailyPlans?.[subjectId] : null
    const changeDailySkip = async (date, skip) => {
      if (scheduleBusy) return
      setScheduleBusy(true)
      try {
        const result = await rpc('setDailySkip', { date, skip })
        bootRequest.current++
        setBoot((current) => current.today === dailyPlan.today ? { ...current, dailyPlans: result.dailyPlans } : current)
        const isToday = date === dailyPlan.today
        const dayLabel = isToday ? '今天' : '明天'
        notify(skip ? `已跳过${dayLabel}，所有已启用科目当天暂停出题` : `已取消跳过${dayLabel}，恢复所有科目的出题安排`)
        if (isToday) {
          const current = currentView.current
          if (result.dailyPlans[current.subjectId]?.today === date) {
            if (current.kind === 'today') loadToday(current.subjectId)
            else {
              await rpc('ensureDaily', { subjectId: current.subjectId, date }).catch(() => {})
              await refreshBoot()
            }
          } else {
            await refreshBoot()
          }
        }
      } catch (issue) {
        notify(issue.message, 'bad')
        await refreshBoot()
      } finally {
        setScheduleBusy(false)
      }
    }
    const counts = subjectVisible ? boot.counts?.[subjectId] : null
    const selectAllQuestions = async (value) => {
      if(bulkLock.current)return
      const request=dailyRequest.current,selection=++selectionRequest.current
      const isCurrent=()=>request===dailyRequest.current&&selection===selectionRequest.current
      if(!value){setSelected([]);setBusy(current=>current==='selection'?'':current);return}
      setBusy('selection')
      try {
        const result=await rpc('listQuestions',{subjectId,kind,idsOnly:true,...filters})
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
          actions: h('div', { className: 'kd-row' },
            h(Btn, { onClick: () => window.location.reload() }, '重新加载页面'),
            h(Btn, { onClick: () => setModal({ kind: 'backup' }) }, h(Icon, { name: 'backup' }), '备份与恢复')),
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
      if (kind === 'today' && !question && dailyPlan?.todaySkipped) {
        const relative = dailyPlan.nextDate === dailyPlan.tomorrow ? '明天' : '后天'
        return h(EmptyState, {
          icon: 'book',
          title: '今天已跳过出题',
          body: `${dailyPlan.pendingStart ? '可手动出题的最早时间' : '下次出题'}：${relative}（${formatDate(dailyPlan.nextDate)}）`,
        })
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
              onClick: () => loadToday(subjectId, true),
            }, h(Icon, { name: 'refresh', size: 13 }), T.retry),
            h(Btn, { key: 'src', onClick: () => setModal({ kind: 'subjects' }) }, '切换出题来源'),
            h(Btn, { key: 'bank', onClick: () => setModal({ kind: 'banks' }) }, T.manageBanks),
          ],
        })
      }
      if (kind === 'today' && !question && dailyPlan?.pendingStart) {
        return h(EmptyState, {
          icon: 'spark',
          title: '准备开始练习',
          body: '点击开始出题。首次出题成功后，科目保持启用时会自动安排每日题目。',
          actions: h(Btn, { variant: 'primary', onClick: () => loadToday(subjectId, true) }, '开始出题'),
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
        const hasFilters = Boolean(filters.query || filters.type || filters.mastery)
        const types = new Map((currentSubject?.types || []).map((value, index) => [value, currentSubject.typeLabels?.[index] || value]))
        for (const option of list?.types || []) types.set(option.value, option.label)
        if (filters.type && !types.has(filters.type)) types.set(filters.type, filters.type)
        const search = kind !== 'review' ? h('form', { className: 'kd-row kd-question-filters',
          onSubmit: (event) => { event.preventDefault(); applyFilters({ query: queryDraft.trim() }) } },
          h('input', { className: 'kd-input', type: 'search', 'aria-label': '搜索题目', placeholder: '搜索题干或知识点',
            value: queryDraft, maxLength: 120, onChange: (event) => setQueryDraft(event.target.value) }),
          h(Btn, { type: 'submit', disabled: bulkLock.current }, '搜索'),
          h('select', { className: 'kd-select', 'aria-label': '筛选题型', value: filters.type || '',
            disabled: bulkLock.current, onChange: (event) => applyFilters({ type: event.target.value }) },
          h('option', { value: '' }, '全部题型'), ...[...types].map(([value, label]) => h('option', { key: value, value }, label))),
          kind === 'wrong' ? h('select', { className: 'kd-select', 'aria-label': '筛选掌握状态', value: filters.mastery || '',
            disabled: bulkLock.current, onChange: (event) => applyFilters({ mastery: event.target.value }) },
          h('option', { value: '' }, '全部状态'), h('option', { value: 'due' }, '今日待复习'), h('option', { value: 'unmastered' }, '未掌握'),
          h('option', { value: 'mastered' }, '已掌握')) : null,
          hasFilters || queryDraft ? h(Btn, { variant: 'ghost', disabled: bulkLock.current,
            onClick: () => applyFilters({ query: '', type: '', mastery: '' }) }, '清除筛选') : null) : null
        const topicFilter = filters.topic ? h('div', { className: 'kd-row kd-memory-filter' },
          h('span', { className: 'kd-meta' }, '知识点：', filters.topic),
          h(Btn, { variant: 'ghost', disabled: bulkLock.current, onClick: () => applyFilters({ topic: '' }) }, '清除知识点筛选')) : null
        return h('div', null, topicFilter, search, listError ? h(EmptyState, { icon: 'refresh', title: '题目列表加载失败', body: listError,
          actions: h(Btn, { onClick: listEntry.current ? backToList : () => loadList(subjectId, kind, list?.page || 1, filters) }, '重试') }) : h(ListPane, {
          list,
          kind,
          subjectName: currentSubject?.name || '',
          onOpen: openQuestion,
          filtered: hasFilters,
          managing, selected, busy: busy === 'bulk' || busy === 'selection',
          onManage: () => { setManaging(!managing); setSelected([]) },
          onToggle: (id) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]),
          onSelectAll: selectAllQuestions,
          onPage: (page) => loadList(subjectId,kind,page,filters),
          onBulk: bulkQuestions,
        }))
      }
      if (view === 'detail' && question) {
        return h(QuestionPane, {
          q: question,
          optionOrder,
          focused: questionFocused,
          onToggleFocus: toggleQuestionFocus,
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
          onInspectAttempt: inspectAttempt,
          onNextReview: kind === 'review' ? nextReview : undefined,
          onFavorite: favorite,
          favoritePending: favoritePending === question.id,
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
              refreshCounts()
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

    const singleReview = kind === 'review' && !filters.topic && list?.total === 1
    const pickTab = (value) => {
      if (!subjectVisible) return
      if (value === kind && (value === 'today' || view === 'list' || singleReview)) return
      if (value === 'today') {
        if (boot?.settings.subjects.includes(subjectId)) loadToday(subjectId)
      }
      else loadList(subjectId, value)
    }
    const showThread = !questionFocused && subjectVisible && view === 'detail' && question && threadOpen && !localRedo
      && question.answerState === 'revealed' && question.attemptCount > 0
    const finishSettingsNavigation = (destination) => {
      subjectsDirty.current = false
      setModal(destination === 'close' ? null : { kind: destination })
    }
    const requestSettingsNavigation = (destination) => {
      if (modal.kind === 'subjects' && subjectsDirty.current) {
        setModal({ ...modal, leaveTo: destination })
      } else {
        finishSettingsNavigation(destination)
      }
    }
    const reportSubjectsDirty = useCallback((value) => { subjectsDirty.current = value }, [])
    const closeSettings = () => requestSettingsNavigation('close')
    const settingsOpen = SETTINGS_SECTIONS.has(modal?.kind)
    const settingsPanel = () => {
      const embedded = { embedded: true, onClose: closeSettings, onBusyChange: setSettingsBusy }
      let panelBoot = boot
      if (boot?.practiceOnly && managementSection) {
        if (management?.section === managementSection && management.error) {
          return h(EmptyState, { icon: 'refresh', title: '设置资料加载失败', body: management.error,
            actions: h(Btn, { onClick: () => setManagementAttempt((attempt) => attempt + 1) }, T.retry) })
        }
        if (management?.section !== managementSection || !management.data) {
          return h('div', { className: 'kd-loading' }, h('span', { className: 'kd-spinner' }), '正在加载设置资料…')
        }
        panelBoot = { ...boot, ...management.data }
        if (managementSection === 'subjects') {
          panelBoot.subjects = boot.subjects.map((subject) => ({
            ...subject, bankItemCount: management.data.bankItemCounts[subject.id] || 0,
          }))
        }
      }
      switch (modal.kind) {
        case 'subjects':
          return panelBoot && h(SubjectsModal, { ...embedded, boot: panelBoot, key: modal.edit || 0,
            onClose: resetSubjectsEditor, onDone: saveSubjects, onDirtyChange: reportSubjectsDirty, onNotify: notify })
        case 'banks':
          if (modal.deleting) {
            const bank = modal.deleting
            return h(ConfirmModal, {
              embedded: true, danger: true, busy: busy === 'delete-bank',
              title: `${T.deleteBank}：${bank.name}`,
              message: `确认删除题库《${bank.name}》吗？已出题目、作答、收藏和追问会保留。删除后该题库将无法再用于抽题。`,
              confirmLabel: T.deleteBank,
              onConfirm: () => deleteBank(bank),
              onClose: () => setModal({ kind: 'banks' }),
            })
          }
          return panelBoot && h(BanksModal, {
            ...embedded, boot: panelBoot, key: modal.importResult?.importId || 'banks', importResult: modal.importResult,
            committing: busy === 'commit', onPickFile: pickFile, onCommit: commitBank,
            onDelete: (bank) => setModal({ kind: 'banks', deleting: bank }),
            onCancelImport: () => setModal({ kind: 'banks' }),
          })
        case 'syllabuses':
          return panelBoot && h(SyllabusesModal, { ...embedded, boot: panelBoot,
            onSaved: (syllabuses) => setManagement({ section: 'syllabuses', data: { syllabuses } }) })
        case 'past-papers':
          return panelBoot && h(PastPapersModal, { ...embedded, boot: panelBoot,
            onSaved: (pastPapers) => setManagement({ section: 'past-papers', data: { pastPapers } }) })
        case 'backup':
          return h(BackupModal, { ...embedded, onNotify: notify, onRestored: (warning) => {
            if (warning) window.alert(warning)
            window.location.reload()
          } })
        case 'practice':
          return h(components.Modal, { title: '作答设置', embedded: true },
            h('label', { className: 'kd-manage-card kd-row' },
              h('input', { type: 'checkbox', checked: boot?.settings?.shuffleOptions === true, disabled: settingsBusy,
                onChange: async (event) => {
                  const shuffleOptions = event.target.checked
                  setSettingsBusy(true)
                  try {
                    const result = await rpc('saveSettings', { shuffleOptions })
                    setBoot((current) => ({ ...current, settings: { ...current.settings, shuffleOptions: result.settings.shuffleOptions } }))
                  } catch (issue) { notify(issue.message, 'bad') }
                  finally { setSettingsBusy(false) }
                } }),
              '随机排列单选题和多选题的选项'))
        case 'about':
          return h(AboutPanel, { currentVersion: boot?.pluginVersion })
      }
    }

    const openStudyPage = (event, page) => {
      statsTrigger.current = event.currentTarget
      setStudyPage(page)
    }
    const closeStudyPage = () => {
      setStudyPage('')
      window.requestAnimationFrame?.(() => statsTrigger.current?.focus({ preventScroll: true }))
    }
    const openRelated = (sid, tab, topic) => {
      closeStudyPage()
      setSubjectId(sid)
      if (sid !== subjectId) rpc('saveSettings', { activeSubject: sid }).catch(() => {})
      loadList(sid, tab, 1, { topic })
    }
    return h('div', { ref: pageRef, className: questionFocused ? 'kd-page is-question-focus' : 'kd-page',
      'data-code-platform': codePlatform },
      styleState.injected ? null : h('style', null, CSS),
      h('div', { className: 'kd-practice-screen', inert: Boolean(studyPage) || settingsOpen || undefined },
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
        onSettings: () => setModal({ kind: 'subjects' }),
        onStats: (event) => openStudyPage(event, 'stats'),
        onMemory: (event) => openStudyPage(event, 'memory'),
      }) : null,
      h('div', { className: 'kd-shell' },
        boot ? h(SubjectNav, {
          boot,
          subjectId,
          onPick: pickSubject,
          onSettings: () => setModal({ kind: 'subjects' }),
          onStats: (event) => openStudyPage(event, 'stats'),
          onMemory: (event) => openStudyPage(event, 'memory'),
        }) : null,
        h('main', { className: 'kd-main' },
          h('div', { className: 'kd-main-toolbar' },
            boot ? h(TabBar, {
              kind,
              counts,
              onPick: pickTab,
              todayDisabled: !boot.settings.subjects.includes(subjectId),
              onBack: subjectVisible && kind !== 'today' && !singleReview && view === 'detail' ? backToList : undefined,
            }) : null,
            dailyPlan ? h('div', { className: 'kd-daily-schedule', 'aria-label': '全局出题计划' },
              dailyPlan.todaySkipped ? h(Btn, { disabled: scheduleBusy,
                onClick: () => changeDailySkip(dailyPlan.today, false) }, '取消跳过今天') : null,
              h(Btn, { disabled: scheduleBusy,
                onClick: () => changeDailySkip(dailyPlan.tomorrow, !dailyPlan.tomorrowSkipped) },
              dailyPlan.tomorrowSkipped ? '取消跳过明天' : '跳过明天')) : null),
          h('div', { className: 'kd-main-scroll', ref: mainScroll },
            h('div', { className: 'kd-main-inner' },
              h('div', { className: 'kd-view', key: `${subjectId}|${kind}|${view}|${question?.id || ''}` }, mainContent)))),
        h(Presence, null, showThread
          ? h(ThreadPane, {
            key: question.id,
            thread,
            openingSuggestions: question.openingSuggestions,
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
      settingsOpen ? h(SettingsModal, {
        active: modal.kind, ready: Boolean(boot),
        locked: settingsBusy || ['import', 'commit', 'delete-bank'].includes(busy),
        onPick: requestSettingsNavigation, onClose: closeSettings,
        dialog: modal.leaveTo ? h(ConfirmModal, {
          title: '放弃本次更改',
          message: modal.leaveTo === 'close'
            ? '科目管理还有未保存的更改。确定放弃更改并关闭设置吗？'
            : '科目管理还有未保存的更改。确定放弃更改并切换设置项吗？',
          explicitClose: true,
          confirmLabel: '放弃更改',
          onClose: () => setModal({ ...modal, leaveTo: undefined }),
          onConfirm: () => finishSettingsNavigation(modal.leaveTo),
        }) : null,
      }, settingsPanel()) : null,
      modal?.kind === 'attempt' ? h(AttemptModal, { record: modal.record, onClose: () => setModal(null) }) : null,
      modal?.kind === 'revision' ? h(RevisionModal, {
        question,
        busy: busy === 'revise',
        onClose: () => setModal(null),
        onConfirm: confirmRevision,
        onDiscard: discardRevision,
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
      studyPage === 'stats' ? h(StudyStatsPage, { today: boot?.today, onClose: closeStudyPage }) : null,
      studyPage === 'memory' ? h(StudyMemoryPage, { subjects: boot?.subjects || [],
        onClose: closeStudyPage, onRelated: openRelated }) : null,
      ),
      toasts.length ? h('div', { className: 'kd-notification-stack' }, toasts.map((toast) =>
        h(NotificationBanner, { key: toast.id, ...toast, onDismiss: dismissToast }))) : null,
      busy === 'import' || busy === 'commit'
        ? h('div', { className: 'kd-loading', style: { position: 'absolute', inset: 'auto 0 60px 0', zIndex: 45, pointerEvents: 'none' } },
          h('span', { className: 'kd-spinner' }), busy === 'import' ? '正在读取文件并让模型识别题目…' : '正在入库…')
        : null))
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
