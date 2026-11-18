import { T, formatDate, formatDateTime, formatClock, methodLabel, statusLabel, isChoiceType, newAttemptId } from './common.js'
import { STUDY_FILE_ACCEPT, readStudyFile } from './import-file.js'
import { typeLabel } from '../lib/paper-types.js'

export function createComponents(React, { window, rpc, Markdown, useMathJaxStatus }) {
  const { createElement: h, useState, useEffect, useRef, useMemo, useCallback, useId } = React

  const ICON_PATHS = {
    close: 'M6 6l12 12M18 6L6 18',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z',
    refresh: 'M20 11a8 8 0 1 0-2.6 5.9M20 5v6h-6',
    check: 'M4 12.5l5 5L20 6.5',
    x: 'M6 6l12 12M18 6L6 18',
    chevron: 'M9 6l6 6-6 6',
    'chevron-left': 'M15 6l-6 6 6 6',
    send: 'M4 12l16-8-6 8 6 8z',
    book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z',
    subjects: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 17h6 M17 14v6',
    syllabus: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',
    papers: 'M5 5h11v13H5z M8 8h5 M8 11h5 M8 14h3 M19 8v13H8',
    backup: 'M18 8a5.5 5.5 0 0 0-9.5-2L7 8 M7 4v4h4 M4 12h16v3H4z M6 15v6h12v-6 M10 18h4',
    settings: 'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M9 16v4',
    info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 11v5 M12 8h.01',
    stats: 'M4 4v16h16 M8 16v-4m5 4V8m5 8V5',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
  }

  function Icon({ name, size = 15 }) {
    const path = ICON_PATHS[name]
    if (!path) return null
    return h('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': true,
    }, h('path', { d: path }))
  }

  function Btn({ children, onClick, variant = 'default', disabled, title, small, type = 'button', ariaLabel }) {
    return h('button', {
      type,
      className: `kd-btn kd-btn-${variant}${small ? ' kd-btn-sm' : ''}`,
      onClick,
      disabled,
      title,
      'aria-label': ariaLabel,
    }, children)
  }

  function Badge({ children, tone = 'neutral' }) {
    return h('span', { className: `kd-badge kd-badge-${tone}` }, children)
  }

  /** 统一的空状态：图标 + 标题 + 说明 + 操作。 */
  function EmptyState({ icon = 'spark', title, body, actions }) {
    return h('div', { className: 'kd-empty' },
      h('div', { className: 'kd-empty-icon' }, h(Icon, { name: icon, size: 20 })),
      title ? h('div', { className: 'kd-empty-title' }, title) : null,
      body ? h('div', { className: 'kd-empty-body' }, body) : null,
      actions ? h('div', { className: 'kd-actions' }, actions) : null)
  }

  function Presence({ children }) {
    const active = Array.isArray(children) ? children.some(Boolean) : Boolean(children)
    const [retained, setRetained] = useState(children)
    useEffect(() => {
      if (active) { setRetained(children); return undefined }
      const timer = setTimeout(() => setRetained([]), 160)
      return () => clearTimeout(timer)
    }, [children, active])
    return h('div', { className: 'kd-presence' + (active ? '' : ' is-leaving') }, active ? children : retained)
  }

  function NotificationBanner({ message, tone = 'ok', floating = false }) {
    const [phase, setPhase] = useState('visible')
    useEffect(() => {
      if (phase === 'hidden') return undefined
      const timeout = window.setTimeout(() => {
        setPhase(phase === 'visible' ? 'leaving' : 'hidden')
      }, phase === 'visible' ? 3000 : 180)
      return () => window.clearTimeout(timeout)
    }, [phase])
    if (phase === 'hidden') return null
    return h('div', { className: 'kd-notification-slot' + (floating ? ' is-floating' : '') },
      h('div', { className: `kd-notification kd-notification-${tone}${phase === 'leaving' ? ' is-leaving' : ''}` },
        h('span', { role: tone === 'bad' ? 'alert' : 'status' }, message),
        h('button', { type: 'button', className: 'kd-iconbtn', 'aria-label': '关闭通知',
          disabled: phase === 'leaving', onClick: () => setPhase('leaving') }, h(Icon, { name: 'close' }))))
  }

  function Modal({ title, children, footer, headerActions, dialog, notification, onClose, wide, embedded = false, settings = false, locked = false, explicitClose = settings }) {
    useEffect(() => {
      if (embedded || explicitClose || locked || dialog) return undefined
      const onKey = (event) => {
        if (event.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [onClose, embedded, explicitClose, locked, dialog])
    const body = h('div', { className: 'kd-modal-body', inert: dialog ? true : undefined }, children)
    const actions = footer ? h('div', { className: 'kd-modal-foot' }, footer) : null
    if (embedded) return h('section', { className: 'kd-settings-section', 'aria-label': title },
      h('div', { className: 'kd-modal-head', inert: dialog ? true : undefined },
        h('h2', { className: 'kd-modal-title' }, title),
        headerActions ? h('div', { className: 'kd-settings-header-actions' }, headerActions) : null),
      body, actions, notification, dialog)
    return h('div', {
      className: 'kd-overlay',
      onMouseDown: explicitClose || dialog ? undefined : (event) => { if (!locked && event.target === event.currentTarget) onClose() },
    }, h('div', {
      className: `kd-modal${wide ? ' kd-modal-wide' : ''}${settings ? ' kd-settings' : ''}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
    },
    h('div', { className: 'kd-modal-head' },
      h('div', { className: 'kd-modal-title' }, title),
      h('button', { className: 'kd-iconbtn', onClick: onClose, disabled: locked || Boolean(dialog), 'aria-label': T.close }, h(Icon, { name: 'close' }))),
    body, actions, notification, dialog))
  }

  function hostOf(url) {
    try {
      return new URL(url).host.replace(/^www\./, '')
    } catch {
      return ''
    }
  }

  function formatShort(iso) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return String(iso || '')
    const pad = (value) => String(value).padStart(2, '0')
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  /** 剩余不超过 30 天时省略按年、月拆分的时长。 */
  function CountdownLines({ countdown }) {
    const { year, days, approx, lines = {} } = countdown || {}
    const showDays = Number.isInteger(days) && days >= 0
    const duration = days === 0 ? '今日开考' : lines.secondary
    const spaceDigits = (line = '') => line.replace(/\p{Script=Han}(?=\d)|\d(?=\p{Script=Han})/gu, '$& ')
    return h('div', { className: 'kd-cd-lines' },
      h('div', { className: 'kd-cd-primary' }, showDays ? `距离 ${year} 考研还剩` : spaceDigits(lines.primary)),
      showDays ? h('div', { className: 'kd-cd-days' }, approx ? '约 ' : null, h('strong', null, String(days)), ' 天') : null,
      duration ? h('div', { className: 'kd-cd-secondary' }, spaceDigits(duration)) : null,
      h('div', { className: 'kd-cd-target' }, spaceDigits(lines.target)))
  }

  /** 年份、日期口径与来源：一条紧凑的状态带，横跨整个头部。 */
  function ExamStrip({ boot, busy, onRefresh, onYearChange }) {
    const cd = boot.countdown || {}
    const basis = cd.basis
    const statusTone = cd.status === 'official' ? 'ok' : cd.status === 'estimated' ? 'warn' : 'bad'
    const statusText = cd.status === 'official' ? '官方公布'
      : cd.status === 'estimated' ? '官方未公布 · 估算' : '尚未核实'
    const sourceUrl = cd.sourceUrl || (basis && basis.sourceUrl) || ''
    const sourceLabel = cd.status === 'official'
      ? `来源 ${hostOf(sourceUrl) || '官方'}`
      : basis ? `依据 ${basis.year} 官方（${hostOf(basis.sourceUrl) || '官方'}）` : '无来源记录'

    return h('div', { className: 'kd-exam-strip' },
      h('label', { className: 'kd-strip-item' },
        h('select', {
          className: 'kd-select kd-select-sm',
          value: boot.settings.targetYear,
          'aria-label': T.year,
          onChange: (event) => onYearChange(Number(event.target.value)),
        }, (boot.yearOptions || []).map((year) => h('option', { key: year, value: year }, `${year} 考研`)))),
      h('span', { className: 'kd-strip-item' }, h(Badge, { tone: statusTone }, statusText)),
      h('span', {
        className: 'kd-strip-item',
        title: cd.source ? `${cd.source}${sourceUrl ? `\n${sourceUrl}` : ''}` : '',
      }, sourceUrl
        ? h('a', { className: 'kd-link', href: sourceUrl, target: '_blank', rel: 'noreferrer noopener' }, sourceLabel)
        : h('span', null, sourceLabel)),
      cd.verifiedAt
        ? h('span', { className: 'kd-strip-item', title: formatDateTime(cd.verifiedAt) },
          `核验成功 ${formatShort(cd.verifiedAt)}`)
        : null,
      h(Btn, {
        small: true,
        variant: 'ghost',
        disabled: busy,
        title: '联网核验官方公布的考试日期',
        onClick: onRefresh,
      }, busy ? h('span', { className: 'kd-spinner' }) : h(Icon, { name: 'refresh', size: 13 }), '核验'),
      cd.expired
        ? h('span', { className: 'kd-strip-item kd-strip-warn' }, '目标日期已过，请重新选择考研年份')
        : cd.status === 'unverified'
          ? h('span', { className: 'kd-strip-item kd-strip-warn', title: cd.note || '' }, '官方日期尚未核实')
          : null)
  }

  /* ============================== 导航 ============================== */
  function UpdateCheck({ currentVersion }) {
    const [state,setState]=useState({busy:true,result:null,error:''})
    const checking=useRef(false)
    const active=useRef(true)
    const check=async(force=false)=>{
      if(checking.current)return
      checking.current=true
      setState((value)=>({...value,busy:true,error:''}))
      try {
        const result=await rpc('checkUpdates',{force})
        if(active.current)setState({busy:false,result,error:''})
      } catch(error) {
        if(active.current)setState((value)=>({...value,busy:false,error:error.message}))
      } finally {checking.current=false}
    }
    useEffect(()=>{
      active.current=true
      const automatic=()=>{if(!window.document.hidden)check(false)}
      automatic()
      const timer=window.setInterval(automatic,6*60*60*1000)
      window.addEventListener('focus',automatic)
      return ()=>{active.current=false;window.clearInterval(timer);window.removeEventListener('focus',automatic)}
    },[])
    return h('div',{className:'kd-update'},
      h(Btn,{variant:'ghost',disabled:state.busy,onClick:()=>check(true)},
        state.busy?h('span',{className:'kd-spinner'}):h(Icon,{name:'refresh'}),state.busy?'正在检查…':'检查更新'),
      h('div',{className:'kd-msg-meta',style:{padding:'0 8px'}},`当前版本 v${currentVersion||state.result?.currentVersion||'—'}`),
      h('div',{className:'kd-msg-meta',role:'status','aria-live':'polite',title:state.error||'',style:{padding:'4px 8px',overflowWrap:'anywhere'}},
        state.error?'暂时无法检查，请重试':state.result?.updateAvailable
          ? h('a',{className:'kd-link',href:state.result.packageUrl,target:'_blank',rel:'noreferrer noopener'},`发现新版本 v${state.result.latestVersion} ↗`)
          : state.result?'已是最新版本':null))
  }

  function SettingsModal({ active, ready, locked, dialog, onPick, onClose, children }) {
    const sections = [
      ['subjects', T.manageSubjects, 'subjects'],
      ['banks', T.manageBanks, 'book'],
      ['syllabuses', T.manageSyllabuses, 'syllabus'],
      ['past-papers', T.managePastPapers, 'papers'],
      ['backup', '备份与恢复', 'backup'],
      ['about', '关于', 'info'],
    ]
    return h(Modal, { title: '设置', settings: true, locked, dialog, onClose },
      h('div', { className: 'kd-settings-layout' },
        h('nav', { className: 'kd-settings-nav', 'aria-label': '设置选项' },
          ...sections.map(([id, label, icon]) => h('button', {
            key: id,
            type: 'button',
            className: 'kd-settings-option',
            'aria-current': active === id ? 'page' : undefined,
            disabled: locked || (!ready && !['backup', 'about'].includes(id)),
            onClick: () => { if (active !== id) onPick(id) },
          }, h(Icon, { name: icon }), label))),
        h('div', { className: 'kd-settings-content' }, children)))
  }

  function AboutPanel({ currentVersion }) {
    return h(Modal, { title: '关于', embedded: true },
      h('div', { className: 'kd-about' },
        h('div', { className: 'kd-about-brand' },
          h(PluginLogo, { size: 44 }),
          h('div', null, h('h3', null, T.title), h('p', null, '面向 DeepSeek Harness 的考研练习插件。支持每日出题、错题复习、收藏和逐题追问。'))),
        h('a', { className: 'kd-link', href: 'https://github.com/Scienmicroit/Daily-Question', target: '_blank', rel: 'noopener noreferrer' },
          'GitHub 仓库 ↗'),
        h(UpdateCheck, { currentVersion })))
  }

  function SubjectNav({ boot, subjectId, onPick, onSettings, onStats }) {
    const enabled = (boot.subjects || []).filter((subject) => subject.enabled)
    const subjectButton = (subject) => {
      const done = Boolean(boot.todayMap?.[subject.id])
      return h('button', {
        key: subject.id,
        type: 'button',
        className: `kd-nav-item${subject.id === subjectId ? ' is-active' : ''}`,
        onClick: () => onPick(subject.id),
        title: subject.name,
      },
      h('span', null, subject.name),
      h('span', { className: 'kd-nav-status' },
        h('span', { className: `kd-dot${done ? '' : ' kd-dot-idle'}` }),
        done ? '今日已出' : '待出题'))
    }
    return h('div', { className: 'kd-nav' },
      h('div', { className: 'kd-nav-group' },
        enabled.length ? enabled.map(subjectButton)
          : h('div', { className: 'kd-msg-meta', style: { padding: '4px 8px' } }, '还没有启用科目')),
      h('div', { className: 'kd-nav-spacer' }),
      h('div', { className: 'kd-nav-group' },
        h(Btn, { variant: 'ghost', onClick: onStats }, h(Icon, { name: 'stats' }), '统计'),
        h(Btn, { variant: 'ghost', onClick: onSettings }, h(Icon, { name: 'settings' }), '设置')))
  }

  function TabBar({ kind, counts, onPick, todayDisabled, onBack }) {
    const items = [
      ['today', T.tabs.today, null],
      ['review', T.tabs.review, counts?.review],
      ['all', T.tabs.all, counts?.all],
      ['favorite', T.tabs.favorite, counts?.favorite],
      ['wrong', T.tabs.wrong, counts?.wrong],
    ]
    return h('div', { className: 'kd-tabs' },
      h('div', { className: 'kd-tab-strip' },
        items.map(([value, label, count]) => h('button', {
          key: value,
          type: 'button',
          className: `kd-tab${kind === value ? ' is-active' : ''}`,
          disabled: value === 'today' && todayDisabled,
          onClick: () => onPick(value),
        }, label, count ? h('span', { className: 'kd-tab-count' }, String(count)) : null))),
      h('div', { className: 'kd-tab-return' + (onBack ? ' is-open' : ''), 'aria-hidden': onBack ? undefined : true },
        h('button', { type: 'button', className: 'kd-tab-return-button', title: '返回列表',
          'aria-label': '返回列表', disabled: !onBack, onClick: (event) => {
            event.currentTarget.closest('.kd-tabs')?.querySelector('.kd-tab.is-active')?.focus({ preventScroll: true })
            onBack?.()
          } },
        h(Icon, { name: 'chevron-left', size: 16 }))))
  }

  function MobileBar({ boot, subjectId, onPick, onSettings, onStats }) {
    const enabled = (boot.subjects || []).filter((subject) => subject.enabled)
    const active = enabled.some((subject) => subject.id === subjectId) ? subjectId : ''
    return h('div', { className: 'kd-mobilebar' },
      h('select', {
        className: 'kd-select',
        value: active,
        'aria-label': '切换科目',
        onChange: (event) => onPick(event.target.value),
      }, !active ? h('option', { value: '', disabled: true }, '选择科目') : null,
      enabled.map((subject) => h('option', { key: subject.id, value: subject.id }, subject.name))),
      h(Btn, { small: true, variant: 'ghost', onClick: onStats }, h(Icon, { name: 'stats', size: 13 }), '统计'),
      h(Btn, { small: true, variant: 'ghost', onClick: onSettings }, h(Icon, { name: 'settings', size: 13 }), '设置'))
  }

  /* ============================== 题目详情 ============================== */
  function ResultBanner({ attempt }) {
    if (!attempt) return null
    const status = statusLabel(attempt.result)
    const text = attempt.result === 'correct' ? '本题作答正确'
      : attempt.result === 'wrong' ? (attempt.mode === 'giveup' ? '本题标记为未能作答，已进入错题本' : '本题作答错误，已进入错题本')
        : '已查看答案，等待你判定「作答正确 / 作答错误」'
    return h('div', { className: 'kd-actions', style: { marginTop: '0', marginBottom: '10px' } },
      h(Badge, { tone: status.tone }, status.text),
      h('span', { className: 'kd-meta' }, text))
  }

  function AttemptHistory({ attempts, onInspect }) {
    return h('div', { className: 'kd-answer-block' },
      h('div', { className: 'kd-answer-label' }, '作答历史'),
      ...attempts.map((attempt, index) => h('div', { className: 'kd-row', key: attempt.id },
        h('span', { className: 'kd-meta' }, `${index + 1}. ${formatDateTime(attempt.at)} · ${statusLabel(attempt.result).text}`
          + `${attempt.mode === 'giveup' ? ' · 未能作答' : attempt.mode === 'done' ? ' · 作答完毕' : ''}`
          + `${attempt.choice ? ` · 选择 ${attempt.choice}` : ''}`),
        onInspect ? h(Btn, { small: true, variant: 'ghost', onClick: () => onInspect(attempt.id) }, '查看当时答案') : null)))
  }

  function AnswerBlock({ question, onRevise, revising, onRemoveWrong, onInspect }) {
    const answer = question.answer
    if (!answer) {
      if (question.answerState !== 'revealed') return null
      return h('div', { className: 'kd-answer' },
        h('div', { className: 'kd-verify' }, question.answerVersionUnknown
          ? '这条旧作答无法确认当时的答案版本。' : '这次作答没有可用的参考答案与解析。'),
        h(AttemptHistory, { attempts: question.attempts || [], onInspect }))
    }
    return h('div', { className: 'kd-answer' },
      h('div', { className: 'kd-answer-panel' },
        h('div', { className: 'kd-answer-panel-head' },
          h('span', null, question.historicalAnswer ? '本次作答的答案与解析' : '答案与解析'),
          h('span', { className: 'kd-tag' }, `版本 ${answer.versionId}`)),
        h('div', { className: 'kd-answer-panel-body' },
          answer.verified
            ? null
            : h('div', { className: 'kd-verify', style: { marginTop: 0 } },
              h(Badge, { tone: 'warn' }, answer.basis === 'imported' ? T.unverified : T.missing),
              ' 这份答案来自导入题库，尚未经过独立校验，请自行核对。'),
          h('div', { className: 'kd-answer-block kd-answer-copy' },
            h('div', { className: 'kd-answer-label' }, T.answer),
            h(Markdown, { text: answer.answer || '（题库未提供参考答案）' })),
          h('div', { className: 'kd-answer-block kd-answer-copy' },
            h('div', { className: 'kd-answer-label' }, T.explanation),
            h(Markdown, { text: answer.explanation || '（题库未提供解析）' })),
          h('div', { className: 'kd-answer-block' },
            h(AttemptHistory, { attempts: question.attempts || [], onInspect }),
            question.wrongEver
              ? h('div', { className: 'kd-actions', style: { marginTop: '10px' } },
                h(Btn, {
                  small: true,
                  variant: 'ghost',
                  title: '只把这道题移出错题本，历史上的错误作答记录仍然保留',
                  onClick: onRemoveWrong,
                }, '移出错题本'))
              : null),
          h('div', { className: 'kd-verify' },
            h('div', { className: 'kd-row-between' },
              h('span', null,
                h(Badge, { tone: answer.verified ? 'ok' : 'warn' }, answer.verified ? T.verified : T.unverified),
                ` 首次展示 ${answer.firstShownAt ? formatDateTime(answer.firstShownAt) : '—'}`,
                answer.superseded ? ` · 已有 ${answer.superseded} 个历史版本` : ''),
              h(Btn, {
                small: true,
                variant: 'ghost',
                disabled: revising,
                title: '生成候选新版本并重新做独立校验；只有校验通过才能替换正式版本',
                onClick: onRevise,
              }, revising ? h('span', { className: 'kd-spinner' }) : null, T.revision)),
            answer.verification?.summary
              ? h('div', null, `校验：${answer.verification.summary}（${methodLabel(answer.verification.method)}${answer.verification.at ? `，${formatDateTime(answer.verification.at)}` : ''}）`)
              : null,
            (() => {
              const trail = answer.verification?.trail
              if (!Array.isArray(trail)) return null
              const passes = trail.filter((entry) => entry && entry.independentAnswer)
              if (!passes.length) return null
              return h('div', null, passes.map((entry, index) => h('div', { key: index },
                `校验视角独立求解：${entry.independentAnswer}${entry.attempt ? `（第 ${entry.attempt} 次命题）` : ''}`)))
            })(),
            answer.verification?.issues?.length
              ? h('ul', null, answer.verification.issues.map((issue, index) => h('li', { key: index }, issue)))
              : null))))
  }

  function QuestionPane({
    q, busy, choice, onSelect, onReveal, onJudge, onFavorite, onRedo, localRedo,
    onRevise, revising, onToggleThread, threadOpen, onRemoveWrong, favoritePending,
    onCancel, onSkip, onInspectAttempt, onNextReview,
  }) {
    if (!q) return null
    const revealed = !localRedo && q.answerState === 'revealed' && q.attemptCount > 0
    const last = q.lastAttempt
    const isChoice = typeof q.isChoice === 'boolean' ? q.isChoice : isChoiceType(q.type)
    const canSelect = isChoice && (q.canSelect ?? q.options?.length >= 2)
    const answerKey = q.answer?.answerKey || ''
    const selected = revealed ? (last?.choice || '') : choice
    const difficultyUnverified = q.examAlignment?.status === 'difficulty-unverified'
    const meta = [q.subjectName, q.typeLabel]
    return h('div', null,
      h('div', { className: 'kd-card' },
        h('div', { className: 'kd-chips' },
          h('span', { className: 'kd-tag kd-tag-brand' }, q.typeLabel),
          h('span', { className: 'kd-tag' }, q.subjectName),
          difficultyUnverified ? h(Badge, { tone: 'warn' }, '未进行真题难度校验') : null,
          ['built-in','custom','subject-only'].includes(q.examAlignment?.scopeBasis)
            ? h(Badge, { tone: 'warn' }, '未进行考试大纲校验') : null,
          q.answerStatus === 'verified'
            ? h(Badge, { tone: 'ok' }, T.verified)
            : h(Badge, { tone: 'warn' }, q.answerStatus === 'missing' ? T.missing : T.unverified),
          q.repeated ? h(Badge, { tone: 'warn' }, '本题此前出过') : null,
          q.favorite ? h(Badge, { tone: 'brand' }, '已收藏') : null,
          q.wrongEver ? h(Badge, { tone: 'bad' }, '在错题本') : null,
          !difficultyUnverified
            ? h('span', { className: 'kd-tag', title: q.examAlignment ? '独立评审参考历年真题给出的难度' : '原始难度标签，尚无真题对照评审' }, `难度 ${q.difficulty}/5`) : null,
          h('span', { className: 'kd-tag' }, formatDate(q.assignedDate)),
          h('span', { className: 'kd-tag' }, `累计作答 ${q.attemptCount} 次`),
          h('span', { className: 'kd-tag' }, q.source?.kind === 'bank' ? q.source.label : '在线出题')),
        q.knowledge?.length
          ? h('div', { className: 'kd-meta', style: { marginTop: '10px' } },
            h('span', null, `${T.knowledge}：${q.knowledge.join('、')}`))
          : null,
        q.examAlignment ? h('details', { className: 'kd-verify' },
          h('summary', null, `${q.examAlignment.scopeBasis === 'subject-only' ? '出题依据' : '范围校验依据'} · ${q.examAlignment.scopeLabel || '大纲 '+q.examAlignment.outlineYear}${difficultyUnverified ? '' : ' · 独立真题对照'}`),
          h('div', null, q.examAlignment.note
            ?.replace('未通过真题难度校验。', '未进行真题难度校验。')
            .replace('未导入考试大纲，', '未进行考试大纲校验，')),
          h('div', null, q.examAlignment.basisSubject?.name || q.subjectName,
            q.examAlignment.checkedAt ? ` · 核验时间：${formatDateTime(q.examAlignment.checkedAt)}` : null),
          ...(q.examAlignment.sources || []).map((source) => h('div', { key: source.id },
            source.url ? h('a', { className: 'kd-link', href: source.url, target: '_blank', rel: 'noreferrer noopener' },
              `${source.year} ${source.title}（${source.official ? '官方来源' : source.kind === 'outline' ? source.verificationLabel || '非官方大纲转载' : '非官方真题转载'}）`)
              : source.manual && source.kind === 'paper' ? `${source.year} 年 · ${source.title}（手动导入）` : null,
            source.coverage ? h('div', null, source.coverage) : null,
            source.publisherUrl ? h('a', { className:'kd-link', href:source.publisherUrl, target:'_blank', rel:'noreferrer noopener' }, `出版社版本记录 · ISBN ${source.isbn}`) : null)),
          revealed ? h('div', null, q.examAlignment.rationale,
            ...(q.examAlignment.warnings || []).map((warning,i)=>h('div',{key:i,className:'kd-meta'},warning))) : null) : null,
        h('div', { className: 'kd-stem' }, h(Markdown, { text: q.stem })),
        isChoice && !canSelect ? h('div', { className: 'kd-msg-meta' }, '本题选项不完整，可跳过或查看答案后自行判定。') : null,
        canSelect
          ? h('div', { className: 'kd-options' }, q.options.map((option) => {
            const isSelected = selected.split('').includes(option.key)
            const isRight = revealed && answerKey.split('').includes(option.key)
            const isWrongPick = revealed && answerKey && isSelected && !isRight
            const cls = ['kd-option']
            if (isSelected && !revealed) cls.push('is-selected')
            if (isRight) cls.push('is-correct')
            if (isWrongPick) cls.push('is-wrong')
            return h('button', {
              key: option.key,
              type: 'button',
              className: cls.join(' '),
              disabled: revealed || busy === 'reveal',
              onClick: () => onSelect(option.key),
            },
            h('span', { className: 'kd-option-key' }, option.key),
            h('div', { className: 'kd-option-text' }, h(Markdown, { text: option.text })))
          }))
          : null,
        revealed ? h(ResultBanner, { attempt: last }) : null,
        h('div', { className: 'kd-actions' },
          !revealed && canSelect
            ? h(Btn, { variant: 'primary', disabled: busy === 'reveal' || !choice, onClick: () => onReveal('submit') },
              busy === 'reveal' ? h('span', { className: 'kd-spinner' }) : null, T.submit)
            : null,
          !revealed && !canSelect
            ? [
              h(Btn, { key: 'done', variant: 'primary', disabled: busy === 'reveal', onClick: () => onReveal('done') }, T.done),
              isChoice
                ? h(Btn, { key: 'skip', disabled: busy === 'reveal', onClick: onSkip }, '跳过本题')
                : h(Btn, { key: 'giveup', variant: 'danger', disabled: busy === 'reveal', onClick: () => onReveal('giveup') }, T.giveup),
            ]
            : null,
          revealed && last?.result === 'pending'
            ? h(Btn, { key: 'wait', variant: 'ghost', disabled: true }, '待判定：请在下方向答案区域做判定')
            : null,
          h(Btn, { onClick: onFavorite, disabled: favoritePending },
            h(Icon, { name: 'star' }), q.favorite ? T.unfavorite : T.favorite),
          revealed
            ? h(Btn, { variant: 'ghost', onClick: onRedo, disabled: busy === 'reveal' }, h(Icon, { name: 'refresh', size: 13 }), T.redo)
            : null,
          revealed ? h(Btn, { variant: 'ghost', onClick: onToggleThread }, h(Icon, { name: 'book' }), threadOpen ? '收起追问' : T.followup) : null),
        revealed ? h(AnswerBlock, { question: q, onRevise, revising, onRemoveWrong, onInspect: onInspectAttempt }) : null,
        revealed && last && last.result !== 'pending' && onNextReview
          ? h(Btn, { variant: 'primary', disabled: Boolean(busy), onClick: onNextReview }, '下一道复习') : null,
        revising && onCancel ? h(Btn,{variant:'ghost',onClick:onCancel},'取消修订') : null,
        revealed && last?.result === 'pending'
          ? h('div', { className: 'kd-actions', style: { marginTop: '12px' } },
            h('span', { className: 'kd-meta' }, '这道题由你自己判定（系统不会替你把“作答完毕”当成答对）：'),
            h(Btn, { variant: 'primary', disabled: busy === 'judge', onClick: () => onJudge('correct') }, T.correct),
            h(Btn, { variant: 'danger', disabled: busy === 'judge', onClick: () => onJudge('wrong') }, T.wrong))
          : null),
      q.publishVerification
        ? h('div', { className: 'kd-verify', style: { marginTop: '12px' } },
          h(Badge, { tone: q.publishVerification.status === 'passed' ? 'ok' : 'warn' },
            q.publishVerification.status === 'passed' ? '试题发布前已通过独立校验' : '试题发布状态：待核验'),
          // 校验结论里通常写着答案与关键推导，提交答案前不能展示，否则等于泄题。
          revealed
            ? ` ${q.publishVerification.summary}`
            : ' 结论在提交答案后显示',
          `（${methodLabel(q.publishVerification.method)}${q.publishVerification.at ? `，${formatDateTime(q.publishVerification.at)}` : ''}）`)
        : null)
  }

  /* ============================== 列表 ============================== */
  function previewFadePosition(element, lineHeight) {
    const bounds = element.getBoundingClientRect()
    const rects = []
    const document = element.ownerDocument
    const walker = document.createTreeWalker(element, 4) // 只测量正文文字，公式由 SVG 的外框参与定位。
    const range = document.createRange()
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('mjx-container,.kd-code-lang')) continue
      range.setStart(node, 0)
      range.setEnd(node, node.textContent.trimEnd().length)
      rects.push(...range.getClientRects())
    }
    for (const node of element.querySelectorAll('svg,img')) rects.push(node.getBoundingClientRect())
    const visible = rects.filter((rect) => rect.width > 0 && rect.height > 0
      && rect.top < bounds.bottom - 1 && rect.bottom > bounds.top
      && rect.left < bounds.right && rect.right > bounds.left)
    if (!visible.length) return null
    const lineOf = (rect) => Math.max(0, Math.min(1, Math.floor(((rect.top + rect.bottom) / 2 - bounds.top) / lineHeight)))
    const lastLine = Math.max(...visible.map(lineOf))
    const end = Math.min(bounds.width, Math.max(...visible.filter((rect) => lineOf(rect) === lastLine).map((rect) => rect.right - bounds.left)))
    return { top: lastLine * lineHeight, start: Math.max(0, end - 72), end }
  }

  function QuestionPreview({ text }) {
    const ref = useRef(null)
    const [truncated, setTruncated] = useState(false)
    const mathStatus = useMathJaxStatus()
    useEffect(() => {
      const element = ref.current
      if (!element) return undefined
      const measure = () => {
        let lineHeight = 28
        for (const svg of element.querySelectorAll('svg')) lineHeight = Math.max(lineHeight, Math.ceil(svg.getBoundingClientRect().height + 16))
        element.style.setProperty('--kd-preview-line-height', `${lineHeight}px`)
        const content = element.firstElementChild
        const clipped = element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1
          || (content && content.scrollHeight > content.clientHeight + 1)
        const fade = clipped && previewFadePosition(element, lineHeight)
        if (fade) {
          for (const [key, value] of Object.entries(fade)) element.style.setProperty(`--kd-preview-fade-${key}`, `${value}px`)
        }
        setTruncated(Boolean(fade))
      }
      measure()
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      if (element.firstElementChild) observer.observe(element.firstElementChild)
      const mutations = new MutationObserver(measure)
      mutations.observe(element, { childList: true, subtree: true })
      return () => { observer.disconnect(); mutations.disconnect() }
    }, [text, mathStatus])
    return h('div', { ref, className: 'kd-list-summary' + (truncated ? ' is-truncated' : '') }, h(Markdown, { text }))
  }

  function ListPane({ list, kind, subjectName, onOpen, managing, selected, onManage, onToggle, onSelectAll, onBulk, onPage, busy, filtered }) {
    if (!list) return h('div', { className: 'kd-loading' }, h('span', { className: 'kd-spinner' }), '加载中…')
    if (!list.items.length) {
      const icon = kind === 'favorite' ? 'star' : kind === 'wrong' ? 'check' : kind === 'all' ? 'book' : 'spark'
      return h(EmptyState, {
        icon,
        title: `${subjectName} · ${T.tabs[kind]}`,
        body: filtered ? '没有符合搜索或筛选条件的题目。' : T.tabEmpty[kind] || '暂无内容',
      })
    }
    const total = list.total ?? list.items.length
    return h('div', null,
      h('div', { className: 'kd-meta', style: { marginBottom: '10px' } },
        h('span', null, `${subjectName} · ${T.tabs[kind]} · 共 ${total} 道`),
        kind === 'review' ? null : h(Btn, { small: true, onClick: onManage, disabled: busy }, managing ? '完成管理' : '批量管理')),
      list.totalPages>1?h('div',{className:'kd-row',style:{marginBottom:'12px'},'aria-label':'题目分页'},
        h(Btn,{small:true,disabled:busy||list.page<=1,onClick:()=>onPage(list.page-1)},'上一页'),
        h('span',{className:'kd-meta'},`第 ${list.page} / ${list.totalPages} 页`),
        h(Btn,{small:true,disabled:busy||list.page>=list.totalPages,onClick:()=>onPage(list.page+1)},'下一页')):null,
      managing ? h('div', { className: 'kd-bulkbar', 'aria-label': '批量管理' },
        h('div', { className: 'kd-row' },
          h('strong', { 'aria-live': 'polite' }, `已选 ${selected.length} 道`),
          h(Btn, { small: true, disabled: busy || selected.length === total, onClick: () => onSelectAll(true) }, '全选'),
          h(Btn, { small: true, disabled: busy || !selected.length, onClick: () => onSelectAll(false) }, '全不选')),
        h('div', { className: 'kd-row' },
          ...[['favorite', '收藏'], ['unfavorite', '取消收藏'], ['wrong', '加入错题本'], ['unwrong', '移出错题本'], ['delete', '删除题目']].map(([action, label]) =>
            h(Btn, { key: action, small: true, variant: action === 'delete' ? 'danger' : 'default', disabled: busy || !selected.length, onClick: () => onBulk(action) }, label)))) : null,
      list.items.map((item) => h('div', {
        key: item.id,
        className: 'kd-list-row' + (managing && selected.includes(item.id) ? ' is-selected' : ''),
        role: managing ? undefined : 'button',
        tabIndex: managing ? undefined : 0,
        onClick: (event) => {
          if (event.target.closest('a,input')) return
          if (managing) {
            if (!busy) onToggle(item.id)
          } else {
            onOpen(item.id)
          }
        },
        onKeyDown: managing ? undefined : (event) => {
          if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onOpen(item.id) }
        },
      },
      managing ? h('input', { type: 'checkbox', checked: selected.includes(item.id), disabled: busy,
        'aria-label': '选择题目：' + (item.summary || item.id), onChange: () => onToggle(item.id) }) : null,
      h('div', { className: 'kd-list-body' },
        h(QuestionPreview, { text: item.stem || item.summary || '(无题干)' }),
        h('div', { className: 'kd-list-meta' },
          h(Badge, null, item.typeLabel),
          h('span', null, formatDate(item.assignedDate)),
          item.reviewDue ? h('span', null, `复习日期 ${formatDate(item.reviewDue)}`) : null,
          h('span', null, `作答 ${item.attemptCount} 次`),
          item.favorite ? h(Badge, { tone: 'brand' }, '收藏') : null,
          item.wrongEver ? h(Badge, { tone: 'bad' }, item.mastered ? '错题 · 已掌握' : '错题') : null,
          item.answerStatus !== 'verified' ? h(Badge, { tone: 'warn' }, T.unverified) : null,
          item.difficultyUnverified ? h(Badge, { tone: 'warn' }, '未进行真题难度校验') : h('span', null, `难度 ${item.difficulty}/5`))),
      !managing ? h('span', { className: 'kd-list-open', 'aria-hidden': true }, '查看题目', h(Icon, { name: 'chevron' })) : null)))
  }

  /* ============================== 追问侧栏 ============================== */
  function ThreadPane({ thread, questionId, busy, onSend, onClear, onClose, onCancel, narrow, ratio = 33, onRatioChange }) {
    const [draft, setDraft] = useState('')
    const [sending, setSending] = useState(false)
    const [localError, setLocalError] = useState('')
    const [pending, setPending] = useState(null)
    const scrollRef = useRef(null)
    const sendingRef = useRef(false)
    const sendingMessage = useRef(null)
    const messages = thread?.messages || []

    useEffect(() => {
      const node = scrollRef.current
      if (node) node.scrollTop = node.scrollHeight
    }, [messages.length, pending?.id])

    const send = useCallback(async (text, messageId) => {
      const value = String(text || '').trim()
      if (!value || sendingRef.current) return
      sendingRef.current = true
      sendingMessage.current = messageId
      setSending(true)
      setLocalError('')
      try {
        await onSend(value, messageId)
        setPending(null)
        setDraft('')
      } catch (error) {
        setLocalError(error.message)
        setPending({ id: messageId, text: value })
      } finally {
        sendingRef.current = false
        sendingMessage.current = null
        setSending(false)
      }
    }, [onSend])

    const rows = []
    for (const message of messages) {
      const failed = message.status === 'failed'
      rows.push(h('div', {
        key: message.id,
        className: `kd-msg kd-msg-${message.role}${failed ? ' kd-msg-failed' : ''}`,
      },
      h(Markdown, { text: message.text }),
      h('div', { className: 'kd-msg-meta' },
        `${message.role === 'user' ? '我' : '老师'} · ${formatClock(message.createdAt)}`,
        failed ? ' · 回复失败' : ''),
      failed
        ? h(Btn, {
          small: true,
          variant: 'ghost',
          disabled: sending,
          onClick: () => send(message.text, message.id),
        }, '重试')
        : null))
    }
    if (pending) {
      rows.push(h('div', { key: 'pending', className: 'kd-msg kd-msg-user kd-msg-failed' },
        h(Markdown, { text: pending.text }),
        h('div', { className: 'kd-msg-meta' }, '我 · 尚未送达'),
        h(Btn, { small: true, variant: 'ghost', disabled: sending, onClick: () => send(pending.text, pending.id) }, '重试')))
    }
    if (sending) {
      rows.push(h('div', { key: 'sending', className: 'kd-msg kd-msg-assistant' },
        h('span', { className: 'kd-spinner' }), T.sending))
    }

    const resize = (value) => onRatioChange(Math.max(20, Math.min(55, value)))
    return h('aside', { className: 'kd-thread', 'aria-label': T.followup, style: { '--kd-thread-ratio': ratio / 100 } },
      !narrow ? h('div', { className: 'kd-thread-resize', role: 'separator', tabIndex: 0,
        'aria-label': '调整题目与追问的宽度比例', 'aria-orientation': 'vertical',
        'aria-valuemin': 20, 'aria-valuemax': 55, 'aria-valuenow': Math.round(ratio),
        onPointerDown: (event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) },
        onPointerMove: (event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          const pane = event.currentTarget.parentElement
          const left = pane.closest('.kd-shell').querySelector('.kd-main').getBoundingClientRect().left
          const right = pane.getBoundingClientRect().right
          resize((right - event.clientX) / (right - left) * 100)
        },
        onPointerUp: (event) => event.currentTarget.releasePointerCapture(event.pointerId),
        onPointerCancel: (event) => event.currentTarget.releasePointerCapture(event.pointerId),
        onKeyDown: (event) => {
          const value = { ArrowLeft: ratio + 2, ArrowRight: ratio - 2, Home: 20, End: 55 }[event.key]
          if (value !== undefined) { event.preventDefault(); resize(value) }
        },
      }) : null,
      h('div', { className: 'kd-thread-head' },
        h('div', null,
          h('div', { className: 'kd-thread-title' }, T.followup),
          h('div', { className: 'kd-msg-meta' }, '围绕当前题目，一起理清思路')),
        h('div', { className: 'kd-row' },
          h(Btn, {
            small: true,
            variant: 'ghost',
            disabled: !messages.length || sending,
            onClick: onClear,
            title: '只清空本题的追问记录',
          }, T.clearThread),
          h('button', { className: 'kd-iconbtn', onClick: onClose, 'aria-label': T.close }, h(Icon, { name: 'close' })))),
      h('div', { className: 'kd-thread-hint' }, T.followupHint),
      h('div', { className: 'kd-thread-scroll', ref: scrollRef },
        rows.length ? rows : h('div', { className: 'kd-empty-body' }, '还没有追问。可以问某一步推导为什么成立、某个知识点怎么理解，或有没有别的解法。')),
      localError ? h('div', { className: 'kd-error-text', style: { padding: '0 14px' } }, localError) : null,
      h('div', { className: 'kd-thread-foot' },
        h('div', { className: 'kd-composer' },
          h('textarea', {
            className: 'kd-textarea',
            value: draft,
            placeholder: '围绕这道题继续追问…（Enter 发送，Shift+Enter 换行）',
            disabled: sending,
            onChange: (event) => setDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229) {
                event.preventDefault()
                if (!event.repeat) send(draft, newAttemptId())
              }
            },
          }),
          h('div', { className: 'kd-row', style: { justifyContent: 'flex-end', marginTop: '2px' } },
            sending && onCancel ? h(Btn,{small:true,variant:'ghost',onClick:()=>onCancel(sendingMessage.current)},'取消回复') : null,
            h(Btn, {
              variant: 'primary',
              small: true,
              disabled: sending || !draft.trim(),
              onClick: () => send(draft, newAttemptId()),
            }, h(Icon, { name: 'send', size: 13 }), T.send)))))
  }

  /* ============================== 弹窗 ============================== */
  function SubjectsModal({ boot, savedNotice, onClose, onDone, embedded, onBusyChange, onDirtyChange }) {
    const [draft, setDraft] = useState(() => ({ subjects: [...boot.settings.subjects],
      subjectSource: { ...boot.settings.subjectSource }, customSubjects: structuredClone(boot.customSubjects || []), deleteSubjectIds: [] }))
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState(null)
    const [name, setName] = useState('')
    const [types, setTypes] = useState([])
    const [customTypes, setCustomTypes] = useState([])
    const [typeDraft, setTypeDraft] = useState('')
    const [referenceSubjectId, setReferenceSubjectId] = useState('auto')
    const [referenceExamName, setReferenceExamName] = useState('')
    const [referenceExamCode, setReferenceExamCode] = useState('')
    const [subjectCode, setSubjectCode] = useState('')
    const [outlineDraft, setOutlineDraft] = useState('')
    const [deletion, setDeletion] = useState(null)
    const [undoOpen, setUndoOpen] = useState(false)
    const outlineEditor = (value, onChange, label) => h('label', { className:'kd-field', style:{marginBottom:0} },
      h('span',{className:'kd-meta'},label),
      h('textarea',{className:'kd-input kd-outline-input',rows:3,value,maxLength:2400,placeholder:'每行填写一个知识点，例如：链表、栈与队列',onChange:(event)=>onChange(event.target.value)}))
    const referenceExams = boot.referenceExams || (boot.subjects || []).filter((s) => !s.custom)
    const referenceEditor = (value, change, label) => h('div', { className:'kd-field', style:{ marginBottom:0 } },
      h('select', { className:'kd-select', 'aria-label':label, value:value.referenceSubjectId || 'auto',
        onChange:(event)=>change({referenceSubjectId:event.target.value}) },
        h('option', {value:'auto'}, '使用当前科目信息'),
        ...referenceExams.map((exam)=>h('option',{key:exam.id,value:exam.id},`${exam.name}${exam.code ? `（${exam.code}）` : ''}`)),
        h('option',{value:'independent'},'手动填写参考考试…')),
      !value.referenceSubjectId || value.referenceSubjectId === 'auto' ? h('input',{className:'kd-input','aria-label':`${label}代码（考试科目或专业）`,
        placeholder:'考试科目或专业代码（选填）',value:value.code || '',maxLength:20,onChange:(event)=>change({code:event.target.value})}) : null,
      value.referenceSubjectId === 'independent' ? [
        h('div',{className:'kd-row',key:'exam-fields'},
          h('input',{className:'kd-input kd-reference-name','aria-label':`${label}名称`,placeholder:'参考考试名称（必填）',value:value.referenceExamName || '',maxLength:100,
            onChange:(event)=>change({referenceExamName:event.target.value})}),
          h('input',{className:'kd-input','aria-label':`${label}代码`,placeholder:'科目代码（选填）',value:value.referenceExamCode || '',maxLength:20,style:{width:'150px',maxWidth:'100%'},
            onChange:(event)=>change({referenceExamCode:event.target.value})})),
        h('div',{className:'kd-meta',key:'exam-hint'},'院校自命题请在参考考试名称中写明院校，例如「某大学数据结构」。'),
      ] : null)
    const enabled = new Set(draft.subjects)
    const subjects = [...(boot.subjects || []), ...draft.customSubjects.filter((item) => !(boot.subjects || []).some((s) => s.id === item.id)).map((item) => ({
      ...item, custom: true, typeLabels: item.types.map((type) => ({ single: '单项选择题', multiple: '多项选择题', fill: '填空题', solution: '解答题' })[type] || type), bankItemCount: 0,
    }))].filter((subject) => !draft.deleteSubjectIds.includes(subject.id))
    const close = () => { if (!saving) onClose() }
    const toggleSubject = (id) => setDraft((current) => ({ ...current,
      subjects: current.subjects.includes(id) ? current.subjects.filter((value) => value !== id) : [...current.subjects, id] }))
    const toggleType = (type) => setTypes((current) => current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type])
    const addCustomType = () => {
      const value = typeDraft.trim().slice(0, 24)
      if (!value) return
      setCustomTypes((current) => (current.includes(value) ? current : [...current, value]))
      setTypes((current) => (current.includes(value) ? current : [...current, value]))
      setTypeDraft('')
    }
    const dropCustomType = (value) => {
      setCustomTypes((current) => current.filter((item) => item !== value))
      setTypes((current) => current.filter((item) => item !== value))
    }
    const selectedTypes = [...new Set([...types, ...(typeDraft.trim() ? [typeDraft.trim().slice(0, 24)] : [])])]
    const hasCustomInput = Boolean(name.trim() || selectedTypes.length || referenceSubjectId !== 'auto'
      || referenceExamName.trim() || referenceExamCode.trim() || subjectCode.trim() || outlineDraft.trim())
    const savedSubjects = boot.settings.subjects
    const savedSources = boot.settings.subjectSource || {}
    const savedCustomSubjects = boot.customSubjects || []
    const customSettings = ({ id, code, outline, referenceSubjectId, referenceExamName, referenceExamCode }) => [
      id, code || '', (outline || []).map((line) => line.trim()).filter(Boolean),
      referenceSubjectId || 'auto', referenceExamName?.trim() || '', referenceExamCode?.trim() || '',
    ]
    const hasChanges = hasCustomInput || draft.deleteSubjectIds.length > 0 || enabled.size !== savedSubjects.length
      || savedSubjects.some((id) => !enabled.has(id))
      || Object.keys(draft.subjectSource).some((id) => (draft.subjectSource[id] || 'auto') !== (savedSources[id] || 'auto'))
      || JSON.stringify(draft.customSubjects.map(customSettings)) !== JSON.stringify(savedCustomSubjects.map(customSettings))
    useEffect(() => { onDirtyChange?.(hasChanges) }, [onDirtyChange, hasChanges])
    const missingFields = [
      !name.trim() && '填写科目名称',
      !selectedTypes.length && '选择至少一种练习题型',
      referenceSubjectId === 'independent' && !referenceExamName.trim() && '填写参考考试名称',
    ].filter(Boolean)
    const canAdd = missingFields.length === 0
    const customInputError = hasCustomInput && !canAdd
      ? `添加自定义科目前，请${missingFields.join('，并')}。` : ''
    const withCustomSubject = (current) => {
      const subject = { id: 'custom_' + newAttemptId(), name: name.trim(), code:subjectCode.trim(), types: selectedTypes, referenceSubjectId, referenceExamName:referenceExamName.trim(), referenceExamCode:referenceExamCode.trim(),
        outline:outlineDraft.split('\n') }
      return { ...current, subjects: [...current.subjects, subject.id], customSubjects: [...current.customSubjects, subject] }
    }
    const showSaveError = (message, validation = false) => {
      setSaveError((previous) => ({ id: (previous?.id || 0) + 1, message, validation }))
    }
    const finish = async () => {
      if (saving || !hasChanges) return
      if (hasCustomInput && !canAdd) {
        showSaveError('', true)
        return
      }
      const next = canAdd ? withCustomSubject(draft) : draft
      if (next.customSubjects.some((s)=>s.referenceSubjectId === 'independent' && !s.referenceExamName?.trim())) {
        showSaveError('独立参考考试请填写准确的考试名称（院校自命题请包含院校名称）。')
        return
      }
      setSaving(true)
      onBusyChange?.(true)
      try { await onDone(next) }
      catch (error) { showSaveError(error.message || '保存失败，请重试') }
      finally { setSaving(false); onBusyChange?.(false) }
    }
    const submit = () => {
      if (!canAdd) return
      setDraft(withCustomSubject)
      setName('')
      setTypes([])
      setCustomTypes([])
      setTypeDraft('')
      setReferenceSubjectId('auto')
      setReferenceExamName('')
      setReferenceExamCode('')
      setSubjectCode('')
      setOutlineDraft('')
    }
    if (deletion) {
      const { subject, final } = deletion
      return h(ConfirmModal, {
        embedded,
        key: final ? 'final' : 'first',
        title: final ? '再次确认删除科目' : '删除科目',
        message: final
          ? `点击科目管理的「保存」后，将删除「${subject.name}」及已出题目、作答、收藏、错题和追问记录。删除前会保存一个恢复点。`
          : `确定删除「${subject.name}」吗？如果只是暂时不练习，可以取消勾选来停用。`,
        confirmLabel: final ? '确认永久删除' : '继续删除',
        danger: true,
        onClose: () => setDeletion(null),
        onConfirm: () => {
          if (!final) { setDeletion({subject,final:true}); return }
          setDraft((current) => ({
            ...current,
            subjects: current.subjects.filter((id) => id !== subject.id),
            customSubjects: current.customSubjects.filter((item) => item.id !== subject.id),
            deleteSubjectIds: (boot.subjects || []).some((item) => item.id === subject.id)
              ? [...new Set([...current.deleteSubjectIds,subject.id])] : current.deleteSubjectIds,
          }))
          setDeletion(null)
        },
      })
    }
    const setUndoDialog = (open) => {
      setUndoOpen(open)
      onBusyChange?.(open)
    }
    const subjectActions = [
      h(Btn, { key: 'undo', onClick: () => setUndoDialog(true), disabled: saving || !hasChanges }, '撤销'),
      h(Btn, { key: 'save', variant: 'primary', onClick: finish, disabled: saving || !hasChanges }, saving ? '保存中…' : '保存'),
    ]
    const errorMessage = saveError?.validation ? customInputError : saveError?.message
    return h(Modal, {
      embedded,
      title: T.manageSubjects,
      onClose: close,
      wide: true,
      headerActions: embedded ? subjectActions : null,
      footer: embedded ? null : subjectActions,
      notification: errorMessage ? h(NotificationBanner, { key: saveError.id, message: errorMessage, tone: 'bad' })
        : !saveError && savedNotice ? h(NotificationBanner, { key: 'saved', message: savedNotice }) : null,
      dialog: undoOpen ? h(ConfirmModal, {
        title: '撤销本次更改',
        explicitClose: true,
        message: '确定撤销本次的全部更改吗？已保存的科目设置会保留。',
        confirmLabel: '确认撤销',
        onClose: () => setUndoDialog(false),
        onConfirm: () => { setUndoDialog(false); close() },
      }) : null,
    },
    draft.deleteSubjectIds.length ? h('div', { className:'kd-error-text', role:'status' },
      `有 ${draft.deleteSubjectIds.length} 个科目待删除，点击「保存」后生效。`) : null,
    h('fieldset', { disabled: saving, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } },
    h('div', { className: 'kd-meta', style: { marginBottom: '12px' } },
      '点击「保存」统一应用科目设置，点击「撤销」可放弃本次更改。停用科目会保留历史题目、作答、收藏和追问。'),
    subjects.map((subject) => h('div', {
      key: subject.id,
      className: 'kd-row-between kd-manage-card' + (enabled.has(subject.id) ? ' is-enabled' : ''),
    },
    h('label', { className: 'kd-checkline', style: { flex: '1 1 240px', cursor: 'pointer' } },
      h('input', {
        type: 'checkbox',
        checked: enabled.has(subject.id),
        onChange: () => toggleSubject(subject.id),
      }),
      h('span', null,
        h('span', null, subject.name),
        subject.code ? h('span', { className: 'kd-msg-meta' }, ` · ${subject.code}`) : null,
        h('div', { className: 'kd-msg-meta' }, subject.typeLabels.join(' / ')))),
    enabled.has(subject.id)
      ? h('div', { className: 'kd-row' },
        subject.custom ? referenceEditor(draft.customSubjects.find((s)=>s.id === subject.id) || subject,
          (patch)=>setDraft((current)=>({...current,customSubjects:current.customSubjects.map((s)=>s.id === subject.id ? {...s,...patch} : s)})),`${subject.name} 参考考试科目`) : null,
        subject.custom ? outlineEditor((draft.customSubjects.find((s)=>s.id === subject.id)?.outline || []).join('\n'),
          (text)=>setDraft((current)=>({...current,customSubjects:current.customSubjects.map((s)=>s.id===subject.id ? {...s,outline:text.split('\n')} : s)})),`${subject.name} 练习范围`) : null,
        h('select', {
          className: 'kd-select',
          value: draft.subjectSource[subject.id] || 'auto',
          'aria-label': `${subject.name} 出题来源`,
          onChange: (event) => { const source = event.target.value; setDraft((current) => ({ ...current, subjectSource: { ...current.subjectSource, [subject.id]: source } })) },
        },
        h('option', { value: 'auto' }, '自动（优先题库）'),
        h('option', { value: 'online' }, '在线出题'),
        h('option', { value: 'bank' }, '题库出题')),
        subject.bankItemCount
          ? h('span', { className: 'kd-msg-meta' }, `题库 ${subject.bankItemCount} 题`)
          : h('span', { className: 'kd-msg-meta' }, '题库为空'))
      : null,
    h(Btn, { small:true, variant:'danger', ariaLabel:`删除${subject.name}`, onClick:() => setDeletion({subject,final:false}) }, '删除'))),
    h('div', { className: 'kd-divider' }),
    h('div', { className: 'kd-field kd-custom-subject' },
      h('h3', { className: 'kd-custom-subject-title' }, '添加自定义科目'),
      h('label', { className: 'kd-field' },
        h('span', { className: 'kd-field-label' }, '科目名称（必填）'),
        h('input', {
          className: 'kd-input',
          value: name,
          'aria-required': true,
          placeholder: '例如：数据结构（自命题）',
          onChange: (event) => setName(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') submit() },
        })),
      h('div', { className: 'kd-field-label' }, '练习题型（至少选一种）'),
      h('div', { className: 'kd-row', style: { marginTop: '6px' } },
        [['single', '单项选择题'], ['multiple', '多项选择题'], ['fill', '填空题'], ['solution', '解答题']]
          .map(([value, label]) =>
            h('label', { key: value, className: 'kd-checkline', style: { cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: types.includes(value),
                onChange: () => toggleType(value),
              }),
              h('span', null, label)))),
      customTypes.length
        ? h('div', { className: 'kd-row', style: { marginTop: '6px' } },
          customTypes.map((value) => h('span', { key: value, className: 'kd-chip' },
            h('label', { className: 'kd-checkline', style: { cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked: types.includes(value),
                onChange: () => toggleType(value),
              }),
              h('span', null, value)),
            h('button', {
              type: 'button',
              className: 'kd-iconbtn',
              title: '删除这个自定义题型',
              onClick: () => dropCustomType(value),
            }, h(Icon, { name: 'close', size: 12 })))))
        : null,
      h('div', { className: 'kd-row', style: { marginTop: '8px' } },
        h('input', {
          className: 'kd-input',
          style: { flex: '1 1 160px' },
          value: typeDraft,
          'aria-label': '自定义题型名称',
          placeholder: '自定义题型，例如：名词解释',
          onChange: (event) => setTypeDraft(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') addCustomType() },
        }),
        h(Btn, { small: true, disabled: !typeDraft.trim(), onClick: addCustomType }, '添加题型')),
      h('div', { className: 'kd-divider' }),
      h('div', { className: 'kd-field-label' }, '参考考试（选填）'),
      h('div', { className: 'kd-meta' }, '例如可选 408 作为参考考试，科目名称仍由上方的输入框决定。'),
      referenceEditor({referenceSubjectId,referenceExamName,referenceExamCode,code:subjectCode},(patch)=>{
        if (patch.referenceSubjectId !== undefined) setReferenceSubjectId(patch.referenceSubjectId)
        if (patch.referenceExamName !== undefined) setReferenceExamName(patch.referenceExamName)
        if (patch.referenceExamCode !== undefined) setReferenceExamCode(patch.referenceExamCode)
        if (patch.code !== undefined) setSubjectCode(patch.code)
      },'自定义科目的参考考试'),
      outlineEditor(outlineDraft,setOutlineDraft,'练习范围（选填）'),
      h('div',{className:'kd-meta'},'考试大纲和用于难度校验的真题，可分别在「大纲管理」和「真题管理」中导入。'),
      h('div', { className: 'kd-row-between kd-custom-subject-actions' },
        h('span', { className: 'kd-meta' }, '可以直接点「保存」。要继续添加其他科目，可先加入列表，再统一保存。'),
        h(Btn, { disabled: !canAdd, onClick: submit }, '加入科目列表')))))
  }

  function PdfImportPreview({ pages }) {
    const [selected, setSelected] = useState(0)
    if (!pages?.length) return null
    const failed = pages.filter((entry) => entry.source === 'failed')
    const labels = { text: '文字层提取', ocr: '模型识别', blank: '空白页', failed: '识别失败' }
    const current = pages[selected] || pages[0]
    return h('section', { className: 'kd-pdf-preview', 'aria-label': 'PDF 逐页预览' },
      failed.length ? h('div', { className: 'kd-error-text', role: 'alert' },
        h('strong', null, `识别失败页：${failed.map((entry) => entry.page).join('、')}。请修复这些页面后重新导入。`),
        h('ul', null, failed.map((entry) => h('li', { key: entry.page }, `第 ${entry.page} 页 · ${entry.reason}`)))) : null,
      h('label', { className: 'kd-row' }, h('span', null, '逐页预览'),
        h('select', { className: 'kd-select', value: selected, onChange: (event) => setSelected(Number(event.target.value)) },
          ...pages.map((entry, index) => h('option', { key: entry.page, value: index }, `第 ${entry.page} 页 · ${labels[entry.source]}`)))),
      current.text ? h('pre', { className: 'kd-import-text', tabIndex: 0 }, current.text)
        : h('p', { className: 'kd-meta' }, current.reason || '此页没有正文。'))
  }

  function StudyImportPreview({ preview, title, busy, error, embedded, onCancel, onConfirm }) {
    return h(Modal, { title, embedded, wide: true, locked: busy, onClose: onCancel,
      footer: [
        h(Btn, { key: 'cancel', disabled: busy, onClick: onCancel }, '返回'),
        h(Btn, { key: 'confirm', variant: 'primary', disabled: busy || !preview.canSave, onClick: onConfirm }, busy ? '正在保存…' : '确认导入'),
      ],
    },
    h('p', { className: 'kd-meta kd-import-filename' }, `${preview.subjectName} · ${preview.year ? `${preview.year} 年 · ` : ''}${preview.fileName}`),
    preview.issue || error ? h('p', { role: 'alert', className: 'kd-error-text' }, error || preview.issue) : null,
    preview.recognition ? h('section', { className: 'kd-pdf-preview', 'aria-label': '模型识别结果' },
      preview.recognition.warnings?.length ? h('ul', { className: 'kd-warn-text' },
        preview.recognition.warnings.map((warning, index) => h('li', { key: index }, warning))) : null,
      preview.recognition.scopeText ? h('details', { open: true },
        h('summary', null, '模型识别的考试范围'), h('pre', { className: 'kd-import-text', tabIndex: 0 }, preview.recognition.scopeText)) : null,
      Object.entries(preview.recognition.typeExcerpts || {}).map(([type, text]) => h('details', { key: type },
        h('summary', null, `识别题型 · ${typeLabel(type)}`), h('pre', { className: 'kd-import-text', tabIndex: 0 }, text)))) : null,
    preview.pages?.length ? h(PdfImportPreview, { pages: preview.pages })
      : h('pre', { className: 'kd-import-text', tabIndex: 0 }, preview.text))
  }

  function BankItemPreview({ item }) {
    const [open, setOpen] = useState(false)
    return h('details', { className: 'kd-bank-preview-stem', onToggle: (event) => setOpen(event.currentTarget.open) },
      h('summary', { className: 'kd-meta' }, '核对完整题目'),
      open ? [
        h(Markdown, { key: 'stem', text: item.stem }),
        ...item.options.map(({ key, text }, index) => h(Markdown, { key: index, text: `${key}. ${text}` })),
        item.answer ? h('div', { key: 'answer' }, h('strong', null, '参考答案'), h(Markdown, { text: item.answer })) : null,
        item.explanation ? h('div', { key: 'explanation' }, h('strong', null, '解析'), h(Markdown, { text: item.explanation })) : null,
      ] : null)
  }

  function BanksModal({ boot, importResult, onClose, onPickFile, onDelete, onCommit, onCancelImport, committing, embedded }) {
    const [excluded, setExcluded] = useState([])
    const [previewPage, setPreviewPage] = useState(0)
    if (importResult) {
      const pageSize = 60
      const pageCount = Math.ceil(importResult.items.length / pageSize)
      const selectedCount = importResult.usable - excluded.length
      return h(Modal, {
        embedded,
        title: `${T.preview}（${importResult.name}）`,
        onClose: onCancelImport,
        wide: true,
        footer: [
          h(Btn, { key: 'cancel', onClick: onCancelImport, disabled: committing }, T.cancel),
          h(Btn, {
            key: 'ok',
            variant: 'primary',
            disabled: !selectedCount || committing || Boolean(importResult.incomplete),
            onClick: () => onCommit(importResult, excluded),
          }, T.commit),
        ],
      },
      h('div', { className: 'kd-meta', style: { marginBottom: '10px' } },
        `模型识别 ${importResult.stats.total} 道，可用 ${importResult.usable} 道，已选 ${selectedCount} 道入库。`),
      importResult.pages?.length ? h(PdfImportPreview, { pages: importResult.pages }) : null,
      importResult.sourceText ? h('details', { className: 'kd-pdf-preview' },
        h('summary', null, '查看文件原文'),
        h('pre', { className: 'kd-import-text', tabIndex: 0 }, importResult.sourceText)) : null,
      importResult.warnings.length
        ? h('div', { className: 'kd-verify' },
          h('div', null, '解析提示：'),
          h('ul', null, importResult.warnings.map((item, index) => h('li', { key: index }, item))))
        : null,
      pageCount > 1
        ? h('div', { className: 'kd-actions' },
          h(Btn, { small: true, disabled: previewPage === 0, onClick: () => setPreviewPage(previewPage - 1) }, '上一页'),
          h('span', { className: 'kd-meta' }, `${previewPage + 1} / ${pageCount}`),
          h(Btn, { small: true, disabled: previewPage + 1 === pageCount, onClick: () => setPreviewPage(previewPage + 1) }, '下一页'))
        : null,
      h('div', { style: { marginTop: '12px' } },
        importResult.items.slice(previewPage * pageSize, (previewPage + 1) * pageSize).map((item) => h('div', { key: item.index, className: 'kd-preview-item' },
          h('div', { className: 'kd-meta' },
            h('input', {
              type: 'checkbox',
              'aria-label': `第 ${item.index} 题入库`,
              disabled: !item.usable || committing,
              checked: item.usable && !excluded.includes(item.index),
              onChange: (event) => {
                const checked = event.target.checked
                setExcluded((items) => checked ? items.filter((index) => index !== item.index) : [...items, item.index])
              },
            }),
            h(Badge, null, `第 ${item.index} 题`),
            h(Badge, null, item.typeLabel),
            item.usable === false ? h(Badge, { tone: 'warn' }, '不入库') : null,
            item.answerStatus === 'missing'
              ? h(Badge, { tone: 'warn' }, T.missing)
              : h(Badge, { tone: 'ok' }, '含参考答案（待核验）'),
            item.options.length ? h(Badge, null, `${item.options.length} 个选项`) : null),
          h('div', { className: 'kd-bank-preview-stem', style: { marginTop: '6px', fontSize: '13px' } },
            h(Markdown, { text: (item.stem || '(未识别到题干)').slice(0, 400) })),
          h(BankItemPreview, { item }),
          item.issues.length
            ? h('div', { className: 'kd-warn-text', style: { marginTop: '6px' } }, `问题：${item.issues.join('；')}`)
            : null))))
    }

    const importButton = h(Btn, { key: 'import', variant: 'primary', onClick: onPickFile }, h(Icon, { name: 'upload', size: 13 }), T.import)
    return h(Modal, {
      embedded,
      title: T.manageBanks,
      onClose,
      wide: true,
      headerActions: embedded ? importButton : null,
      footer: embedded ? null : [importButton, h(Btn, { key: 'close', onClick: onClose }, T.close)],
    },
    h('div', { className: 'kd-meta', style: { marginBottom: '12px' } }, T.importHint),
    (boot.banks || []).length
      ? boot.banks.map((bank) => h('div', {
        key: bank.id,
        className: 'kd-row-between kd-manage-card',
      },
      h('div', { style: { minWidth: 0 } },
        h('div', null, bank.name),
        h('div', { className: 'kd-msg-meta' },
          `${bank.itemCount} 道 · ${bank.kind === 'pdf' ? 'PDF' : 'Markdown'} · 导入于 ${formatDateTime(bank.importedAt)}`,
          bank.pendingAnswers ? ` · ${bank.pendingAnswers} 道答案待核验` : '')),
      h(Btn, { small: true, variant: 'danger', onClick: () => onDelete(bank) }, h(Icon, { name: 'trash', size: 13 }), T.deleteBank)))
      : h(EmptyState, {
        icon: 'upload',
        title: '还没有导入题库',
        body: '题库用于「题库出题」来源：每道题会被分配唯一题目 ID，同一题反复出现也不会在列表里产生重复记录。',
      }))
  }

  function SyllabusesModal({ boot, onClose, onSaved, embedded, onBusyChange }) {
    const subjects = boot.subjects || []
    const [selected, setSelected] = useState('')
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [preview, setPreview] = useState(null)
    const fileInput = useRef(null)
    const current = (boot.syllabuses || []).find((syllabus) => syllabus.subjectId === selected)
    const save = async (op, args) => {
      setBusy(true)
      onBusyChange?.(true)
      setError('')
      setMessage('')
      try {
        const payload = await args()
        const result = await rpc(op, {subjectId:selected,...payload})
        if (op === 'importSyllabus') setPreview(result)
        else {
          onSaved(result.syllabuses)
          setPreview(null)
          setMessage(op === 'commitStudyImport' ? '大纲已保存，下次在线出题时使用。' : '大纲已移除。')
        }
      } catch (issue) {
        setError(issue.message)
      } finally {
        setBusy(false)
        onBusyChange?.(false)
      }
    }
    const onFile = async (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file || !selected) return
      await save('importSyllabus', () => readStudyFile(file))
    }
    if (preview) return h(StudyImportPreview, { title: '大纲导入预览', preview, busy, error, embedded,
      onCancel: () => { setPreview(null); setError('') },
      onConfirm: () => save('commitStudyImport', () => ({ importId: preview.importId })),
    })
    return h(Modal, {title:T.manageSyllabuses,wide:true,embedded,onClose:() => { if (!busy) onClose() },
      footer:embedded ? null : h(Btn,{disabled:busy,onClick:onClose},T.close)},
    h('p',{className:'kd-meta'},'每科可导入一份 PDF、TXT 或 Markdown 大纲。DSH 默认模型会通读正文、识别考试范围，确认预览后保存。'),
    h('label',{className:'kd-field'},h('span',{className:'kd-field-label'},'科目'),
      h('select',{className:selected ? 'kd-select' : 'kd-select is-placeholder',value:selected,disabled:busy||!subjects.length,onChange:(event)=>{setSelected(event.target.value);setError('');setMessage('')}},
        h('option',{value:'',disabled:true},'选择一门科目'),
        ...subjects.map((subject)=>h('option',{key:subject.id,value:subject.id},subject.name)))),
    !subjects.length ? h('p',{className:'kd-meta'},'请先在科目管理添加科目。') : null,
    current ? h('div',{className:'kd-manage-card'},
      h('div',null,current.fileName),
      h('div',{className:'kd-msg-meta'},`导入于 ${formatDateTime(current.importedAt)} · ${current.characters} 字符`))
      : selected ? h('p',{className:'kd-meta'},'这个科目尚未导入大纲。') : null,
    h('input',{type:'file',accept:STUDY_FILE_ACCEPT,ref:fileInput,hidden:true,onChange:onFile}),
    h('div',{className:'kd-actions'},
      h(Btn,{variant:'primary',disabled:busy||!selected,onClick:()=>fileInput.current?.click()},h(Icon,{name:'upload'}),current?'替换大纲':'导入大纲'),
      current ? h(Btn,{variant:'danger',disabled:busy,onClick:()=>save('removeSyllabus',async()=>({}))},'移除大纲') : null),
    busy ? h('p',{className:'kd-meta',role:'status'},'正在读取文件并让模型识别考试范围…') : null,
    error ? h('p',{className:'kd-error-text',role:'alert'},error) : null,
    message ? h('p',{className:'kd-meta',role:'status'},message) : null)
  }

  function PastPapersModal({ boot, onClose, onSaved, embedded, onBusyChange }) {
    const subjects = boot.subjects || []
    const [selected, setSelected] = useState('')
    const [year, setYear] = useState('')
    const [type, setType] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [preview, setPreview] = useState(null)
    const fileInput = useRef(null)
    const subject = subjects.find((item) => item.id === selected)
    const papers = (boot.pastPapers || []).filter((paper) => paper.subjectId === selected)
    const maxYear = new Date().getFullYear() + 1
    const validYear = /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= maxYear
    const existing = papers.some((paper) => paper.year === Number(year))
    const typeName = (value) => subject?.typeLabels?.[(subject.types || []).indexOf(value)] || value
    const save = async (op, args, success) => {
      setBusy(true)
      onBusyChange?.(true)
      setError('')
      setMessage('')
      try {
        const result = await rpc(op,{subjectId:selected,...await args()})
        if (op === 'importPastPaper') setPreview(result)
        else {
          onSaved(result.pastPapers)
          setPreview(null)
          setMessage(success)
        }
      } catch (issue) {
        setError(issue.message)
      } finally {
        setBusy(false)
        onBusyChange?.(false)
      }
    }
    const onFile = async (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file || !subject || !validYear || busy) return
      await save('importPastPaper',async () => ({year:Number(year),type,...await readStudyFile(file)}))
    }
    if (preview) return h(StudyImportPreview, { title: '真题导入预览', preview, busy, error, embedded,
      onCancel: () => { setPreview(null); setError('') },
      onConfirm: () => save('commitStudyImport', () => ({ importId: preview.importId }), '真题已保存，可供后续出题校验难度。'),
    })
    return h(Modal,{title:T.managePastPapers,wide:true,embedded,onClose:()=>{if(!busy)onClose()},
      footer:embedded ? null : h(Btn,{disabled:busy,onClick:onClose},T.close)},
    h('p',{className:'kd-meta'},'支持 PDF、TXT 和 Markdown。同一科目每年保存一份真题。DSH 默认模型会通读正文并识别题型。'),
    h('div',{className:'kd-paper-fields'},
      h('label',{className:'kd-field'},h('span',{className:'kd-field-label'},'科目'),
        h('select',{className:selected ? 'kd-select' : 'kd-select is-placeholder',value:selected,disabled:busy||!subjects.length,onChange:(event)=>{setSelected(event.target.value);setType('');setError('');setMessage('')}},
          h('option',{value:'',disabled:true},'选择一门科目'),
          ...subjects.map((item)=>h('option',{key:item.id,value:item.id},item.name)))),
      h('label',{className:'kd-field'},h('span',{className:'kd-field-label'},'年份'),
        h('input',{className:'kd-input',type:'number',min:1900,max:maxYear,step:1,placeholder:'例如 2025',value:year,disabled:busy,onChange:(event)=>setYear(event.target.value)})),
      h('label',{className:'kd-field'},h('span',{className:'kd-field-label'},'题型提示（选填）'),
        h('select',{className:'kd-select',value:type,disabled:busy,onChange:(event)=>setType(event.target.value)},
          h('option',{value:''},'由模型识别'),
          ...(subject?.types || []).map((value)=>h('option',{key:value,value},typeName(value)))))),
    h('p',{className:'kd-msg-meta'},'可提供题型提示。至少两个年份的可核对同题型真题才能用于难度校验。'),
    h('input',{type:'file',accept:STUDY_FILE_ACCEPT,ref:fileInput,hidden:true,onChange:onFile}),
    h('div',{className:'kd-actions'},
      h(Btn,{variant:'primary',disabled:busy||!subject||!validYear,onClick:()=>fileInput.current?.click()},
        h(Icon,{name:'upload'}),existing?'替换该年份真题':'导入真题')),
    papers.map((paper)=>h('div',{key:paper.year,className:'kd-row-between kd-manage-card'},
      h('div',null,h('div',null,`${paper.year} 年 · ${paper.fileName}`),
        h('div',{className:'kd-msg-meta'},paper.types?.length ? paper.types.map(typeName).join('、') : '未识别题型')),
      h(Btn,{small:true,variant:'danger',disabled:busy,
        onClick:()=>save('removePastPaper',async()=>({year:paper.year}),'真题已移除。')},'移除'))),
    busy ? h('p',{className:'kd-meta',role:'status'},'正在读取文件并让模型识别真题题型…') : null,
    error ? h('p',{className:'kd-error-text',role:'alert'},error) : null,
    message ? h('p',{className:'kd-meta',role:'status'},message) : null)
  }

  function BackupModal({ onClose, onRestored, embedded, onBusyChange }) {
    const [points, setPoints] = useState(null)
    const [pointsError, setPointsError] = useState('')
    const [pending, setPending] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const fileInput = useRef(null)
    const labels = { 'before-delete': '删除科目前', 'before-restore': '恢复数据前' }
    useEffect(() => {
      let alive = true
      rpc('recoveryPoints').then((value) => { if (alive) setPoints(value) })
        .catch((issue) => { if (alive) setPointsError(issue.message) })
      return () => { alive = false }
    }, [])

    const chooseRestore = (source) => {
      setError('')
      setPending(source)
      onBusyChange?.(Boolean(source))
    }
    const run = async (action) => {
      setBusy(true)
      onBusyChange?.(true)
      setError('')
      try { await action() }
      catch (issue) { setError(issue.message) }
      finally { setBusy(false); if (!pending) onBusyChange?.(false) }
    }
    const download = () => run(async () => {
      const { data } = await rpc('exportBackup')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      try {
        const link = window.document.createElement('a')
        link.href = url
        link.download = `daily-question-backup-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
      } finally { window.setTimeout(() => window.URL.revokeObjectURL(url), 0) }
    })
    const pick = (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) chooseRestore({ file, label: file.name })
    }
    const restore = () => run(async () => {
      let data
      if (pending.file) {
        try { data = JSON.parse(await pending.file.text()) }
        catch { throw new Error('无法读取 JSON 备份，请检查文件') }
      }
      const result = await rpc('restoreBackup', { data, kind: pending.kind, confirmed: true })
      chooseRestore(null)
      onRestored(result.warning)
    })
    const dialog = pending ? h(ConfirmModal, {
      title: '确认恢复学习数据', confirmLabel: '确认恢复', danger: true, busy, explicitClose: true,
      onClose: () => { if (!busy) chooseRestore(null) },
      onConfirm: restore,
      message: h('div', { className: 'kd-backup-confirm' },
        h('p', null, pending.file ? '备份文件' : '本机恢复点'),
        h('strong', null, pending.label),
        pending.at ? h('p', { className: 'kd-meta' }, formatDateTime(pending.at)) : null,
        h('p', null, '恢复会替换当前全部学习数据。当前数据会先保存为恢复点。'),
        error ? h('p', { role: 'alert', className: 'kd-error-text' }, error) : null),
    }) : null
    return h(Modal, {
      title: '备份与恢复', embedded, dialog, onClose: () => { if (!busy) onClose() },
      footer: embedded ? null : h(Btn, { onClick: onClose, disabled: busy || Boolean(dialog) }, '关闭'),
      notification: !pending && error ? h(NotificationBanner, { message: error, tone: 'bad' }) : null,
    },
    h('div', { className: 'kd-backup-layout' },
      h('div', { className: 'kd-backup-actions' },
        h('section', { className: 'kd-backup-card' },
          h('h3', null, '导出备份'),
          h('p', { className: 'kd-meta' }, '将科目设置、题库和学习记录保存为 JSON 文件。'),
          h(Btn, { variant: 'primary', onClick: download, disabled: busy }, '下载备份')),
        h('section', { className: 'kd-backup-card' },
          h('h3', null, '从备份文件恢复'),
          h('p', { className: 'kd-meta' }, '选择之前导出的 JSON 文件，确认后恢复学习数据。'),
          h('input', { ref: fileInput, type: 'file', accept: '.json,application/json', disabled: busy, hidden: true, onChange: pick }),
          h(Btn, { onClick: () => fileInput.current?.click(), disabled: busy }, h(Icon, { name: 'upload' }), '选择备份文件'))),
      h('section', { className: 'kd-backup-card kd-backup-recovery' },
        h('h3', null, '本机恢复点'),
        h('p', { className: 'kd-meta' }, '删除科目和恢复数据前，插件会分别保留最近一次操作前的数据。'),
        pointsError ? h('p', { role: 'alert', className: 'kd-error-text' }, pointsError)
          : !points ? h('p', { role: 'status', className: 'kd-meta kd-backup-empty' }, '正在读取恢复点…')
          : points.length ? h('ul', { className: 'kd-recovery-list' },
            ...points.map((point) => h('li', { key: point.kind, className: 'kd-row-between' },
              h('div', null,
                h('strong', null, labels[point.kind]),
                h('div', { className: 'kd-meta' }, formatDateTime(point.at))),
              h(Btn, { small: true, disabled: busy, onClick: () => chooseRestore({ ...point, label: labels[point.kind] }) }, '使用此恢复点'))))
          : h('p', { className: 'kd-meta kd-backup-empty' }, '暂无恢复点。'))))
  }

  function AttemptModal({ record, onClose }) {
    const { lastAttempt, answer, answerVersionUnknown } = record
    return h(Modal, { title: '当时的答案与解析', onClose,
      footer: h(Btn, { onClick: onClose }, '关闭') },
      h('p', { className: 'kd-meta' }, `${formatDateTime(lastAttempt.at)} · ${statusLabel(lastAttempt.result).text}`
        + (lastAttempt.choice ? ` · 选择 ${lastAttempt.choice}` : '')),
      answer ? h('div', { className: 'kd-answer-copy' },
        answer.versionId ? h('p', { className: 'kd-meta' }, `版本 ${answer.versionId}`) : null,
        h(Markdown, { text: answer.answer || '（无参考答案）' }),
        h(Markdown, { text: answer.explanation || '（无解析）' }))
        : h('p', null, answerVersionUnknown ? '这条旧作答无法确认当时的答案版本。' : '这次作答没有可用的参考答案。'))
  }

  function RevisionModal({ question, onClose, onConfirm, onDiscard, busy }) {
    const candidate = question?.pendingRevision
    if (!candidate) return null
    return h(Modal, {
      title: T.revision,
      onClose,
      wide: true,
      footer: [
        h(Btn, { key: 'discard', onClick: onDiscard }, T.discardRevision),
        h(Btn, {
          key: 'ok',
          variant: 'primary',
          disabled: busy || candidate.verification?.status !== 'passed',
          onClick: onConfirm,
        }, T.confirmRevision),
      ],
    },
    h('div', { className: 'kd-verify' },
      h(Badge, { tone: candidate.verification?.status === 'passed' ? 'ok' : 'warn' },
        candidate.verification?.status === 'passed' ? '候选版本已通过独立校验' : '候选版本未通过校验'),
      ` ${candidate.verification?.summary || ''}（${candidate.verification?.method || ''}）`),
    h('div', { className: 'kd-answer-block kd-answer-copy', style: { marginTop: '14px' } },
      h('div', { className: 'kd-answer-label' }, '候选标准答案'),
      h(Markdown, { text: candidate.answer })),
    h('div', { className: 'kd-answer-block kd-answer-copy' },
      h('div', { className: 'kd-answer-label' }, '候选解析'),
      h(Markdown, { text: candidate.explanation })),
    h('div', { className: 'kd-msg-meta' }, '确认后才会替换正式版本；旧版本会保留在版本历史中。'))
  }

  function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose, danger, busy, embedded, explicitClose }) {
    return h(Modal, {
      title, embedded, explicitClose,
      onClose,
      footer: [
        h(Btn, { key: 'cancel', onClick: onClose, disabled: busy }, T.cancel),
        h(Btn, { key: 'ok', variant: danger ? 'danger' : 'primary', onClick: onConfirm, disabled: busy }, busy ? '正在处理…' : (confirmLabel || T.confirm)),
      ],
    }, h('div', { className: 'kd-md' }, message))
  }

  function PluginLogo({ size = 16, className }) {
    const gradientId = useId()
    return h('svg', {
      width: size,
      height: size,
      viewBox: '0 0 64 64',
      className,
      'aria-hidden': true,
    },
    h('defs', null,
      h('linearGradient', { id: gradientId, x1: 0, y1: 0, x2: 1, y2: 1 },
        h('stop', { offset: 0, stopColor: '#5676ff' }),
        h('stop', { offset: 1, stopColor: '#3b55e8' }))),
    h('rect', { x: 2, y: 2, width: 60, height: 60, rx: 16, fill: `url(#${gradientId})` }),
    h('g', { fill: 'none', stroke: '#fff', strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('rect', { x: 15.5, y: 20, width: 33, height: 30, rx: 6.5, strokeWidth: 3.6 }),
      h('path', { d: 'M23 15.5V23M41 15.5V23', strokeWidth: 3.6 }),
      h('path', { d: 'm27.4 33.2 5.5-3.9v13.3m-4.4 0h9.2', strokeWidth: 4 })))
  }

  return {
    Icon, Btn, EmptyState, Presence, NotificationBanner, CountdownLines, ExamStrip, UpdateCheck, SubjectNav, TabBar, MobileBar, SettingsModal, AboutPanel,
    QuestionPane, previewFadePosition, ListPane, ThreadPane, SubjectsModal, BanksModal, SyllabusesModal, PastPapersModal, BackupModal, AttemptModal, RevisionModal, ConfirmModal, PluginLogo,
  }
}
