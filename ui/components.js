import { T, formatDate, formatDateTime, formatClock, methodLabel, statusLabel, isChoiceType, newAttemptId } from './common.js'
import { STUDY_FILE_ACCEPT, readStudyFile } from './import-file.js'

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

  function Modal({ title, children, footer, onClose, wide }) {
    useEffect(() => {
      const onKey = (event) => {
        if (event.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [onClose])
    return h('div', {
      className: 'kd-overlay',
      onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() },
    }, h('div', {
      className: `kd-modal${wide ? ' kd-modal-wide' : ''}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
    },
    h('div', { className: 'kd-modal-head' },
      h('div', { className: 'kd-modal-title' }, title),
      h('button', { className: 'kd-iconbtn', onClick: onClose, 'aria-label': T.close }, h(Icon, { name: 'close' }))),
    h('div', { className: 'kd-modal-body' }, children),
    footer ? h('div', { className: 'kd-modal-foot' }, footer) : null))
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

  function SubjectNav({ boot, subjectId, onPick, onManage, onBanks, onSyllabuses, onPastPapers }) {
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
        h('div', { className: 'kd-nav-group-label', style:{fontSize:'14px',fontWeight:700} }, '设置'),
        h(Btn, { variant: 'ghost', onClick: onManage }, h(Icon, { name: 'subjects' }), T.manageSubjects),
        h(Btn, { variant: 'ghost', onClick: onBanks }, h(Icon, { name: 'book' }), T.manageBanks),
        h(Btn, { variant: 'ghost', onClick: onSyllabuses }, h(Icon, { name: 'syllabus' }), T.manageSyllabuses),
        h(Btn, { variant: 'ghost', onClick: onPastPapers }, h(Icon, { name: 'papers' }), T.managePastPapers),
        h(UpdateCheck,{currentVersion:boot.pluginVersion})))
  }

  function TabBar({ kind, counts, onPick, todayDisabled }) {
    const items = [
      ['today', T.tabs.today, null],
      ['all', T.tabs.all, counts?.all],
      ['favorite', T.tabs.favorite, counts?.favorite],
      ['wrong', T.tabs.wrong, counts?.wrong],
    ]
    return h('div', { className: 'kd-tabs' },
      items.map(([value, label, count]) => h('button', {
        key: value,
        type: 'button',
        className: `kd-tab${kind === value ? ' is-active' : ''}`,
        disabled: value === 'today' && todayDisabled,
        onClick: () => onPick(value),
      }, label, count ? h('span', { className: 'kd-tab-count' }, String(count)) : null)))
  }

  function MobileBar({ boot, subjectId, onPick, onManage, onBanks, onSyllabuses, onPastPapers }) {
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
      // 窄屏隐藏了左侧栏，科目的增删与题库入口必须在这里保留。
      h(Btn, { small: true, variant: 'ghost', onClick: onManage }, h(Icon, { name: 'subjects', size: 13 }), T.manageSubjects),
      h(Btn, { small: true, variant: 'ghost', onClick: onBanks }, h(Icon, { name: 'book', size: 13 }), T.manageBanks),
      h(Btn, { small: true, variant: 'ghost', onClick: onSyllabuses }, h(Icon, { name: 'syllabus', size: 13 }), T.manageSyllabuses),
      h(Btn, { small: true, variant: 'ghost', onClick: onPastPapers }, h(Icon, { name: 'papers', size: 13 }), T.managePastPapers))
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

  function AnswerBlock({ question, onRevise, revising, onRemoveWrong }) {
    if (!question.answer) {
      if (question.answerState !== 'revealed') return null
      return h('div', { className: 'kd-answer' },
        h('div', { className: 'kd-verify' }, '这道题没有可用的参考答案与解析。系统不会用猜测的内容冒充标准答案。'))
    }
    const answer = question.answer
    return h('div', { className: 'kd-answer' },
      h('div', { className: 'kd-answer-panel' },
        h('div', { className: 'kd-answer-panel-head' },
          h('span', null, '答案与解析'),
          h('span', { className: 'kd-tag' }, `版本 ${answer.versionId}`)),
        h('div', { className: 'kd-answer-panel-body' },
          answer.verified
            ? null
            : h('div', { className: 'kd-verify', style: { marginTop: 0 } },
              h(Badge, { tone: 'warn' }, answer.basis === 'imported' ? T.unverified : T.missing),
              ' 这份答案来自导入题库，尚未经过独立校验，请自行核对。'),
          h('div', { className: 'kd-answer-block' },
            h('div', { className: 'kd-answer-label' }, T.answer),
            h(Markdown, { text: answer.answer || '（题库未提供参考答案）' })),
          h('div', { className: 'kd-answer-block' },
            h('div', { className: 'kd-answer-label' }, T.explanation),
            h(Markdown, { text: answer.explanation || '（题库未提供解析）' })),
          h('div', { className: 'kd-answer-block' },
            h('div', { className: 'kd-answer-label' }, '作答历史'),
            h('div', {
              className: 'kd-meta',
              style: { flexDirection: 'column', alignItems: 'flex-start', gap: '3px' },
            },
            question.attempts.map((attempt, index) => h('div', { key: attempt.id },
              `${index + 1}. ${formatDateTime(attempt.at)} · ${statusLabel(attempt.result).text}`
              + `${attempt.mode === 'giveup' ? ' · 未能作答' : attempt.mode === 'done' ? ' · 作答完毕' : ''}`
              + `${attempt.choice ? ` · 选择 ${attempt.choice}` : ''}`))),
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
    onRevise, revising, onToggleThread, threadOpen, onRemoveWrong,
    onCancel, onSkip,
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
          revealed
            ? h(Btn, { onClick: onFavorite, disabled: busy === 'favorite' },
              h(Icon, { name: 'star' }), q.favorite ? T.unfavorite : T.favorite)
            : null,
          revealed
            ? h(Btn, { variant: 'ghost', onClick: onRedo, disabled: busy === 'reveal' }, h(Icon, { name: 'refresh', size: 13 }), T.redo)
            : null,
          revealed ? h(Btn, { variant: 'ghost', onClick: onToggleThread }, h(Icon, { name: 'book' }), threadOpen ? '收起追问' : T.followup) : null),
        revealed ? h(AnswerBlock, { question: q, onRevise, revising, onRemoveWrong }) : null,
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

  function ListPane({ list, kind, subjectName, onOpen, managing, selected, onManage, onToggle, onSelectAll, onBulk, onPage, busy }) {
    if (!list) return h('div', { className: 'kd-loading' }, h('span', { className: 'kd-spinner' }), '加载中…')
    if (!list.items.length) {
      const icon = kind === 'favorite' ? 'star' : kind === 'wrong' ? 'check' : kind === 'all' ? 'book' : 'spark'
      return h(EmptyState, {
        icon,
        title: `${subjectName} · ${T.tabs[kind]}`,
        body: T.tabEmpty[kind] || '暂无内容',
      })
    }
    const total = list.total ?? list.items.length
    return h('div', null,
      h('div', { className: 'kd-meta', style: { marginBottom: '10px' } },
        h('span', null, `${subjectName} · ${T.tabs[kind]} · 共 ${total} 道`),
        h(Btn, { small: true, onClick: onManage, disabled: busy }, managing ? '完成管理' : '批量管理')),
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
  function SubjectsModal({ boot, onClose, onDone }) {
    const [draft, setDraft] = useState(() => ({ subjects: [...boot.settings.subjects],
      subjectSource: { ...boot.settings.subjectSource }, customSubjects: structuredClone(boot.customSubjects || []), deleteSubjectIds: [] }))
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
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
    const outlineEditor = (value, onChange, label) => h('label', { className:'kd-field', style:{marginBottom:0} },
      h('span',{className:'kd-meta'},label),
      h('textarea',{className:'kd-textarea',rows:3,value,maxLength:2400,placeholder:'每行填写一个知识点，例如：链表、栈与队列',onChange:(event)=>onChange(event.target.value)}))
    const referenceExams = boot.referenceExams || (boot.subjects || []).filter((s) => !s.custom)
    const referenceEditor = (value, change, label) => h('div', { className:'kd-field', style:{ marginBottom:0 } },
      h('select', { className:'kd-select', 'aria-label':label, value:value.referenceSubjectId || 'auto',
        onChange:(event)=>change({referenceSubjectId:event.target.value}) },
        h('option', {value:'auto'}, '使用本科学习范围'),
        ...referenceExams.map((exam)=>h('option',{key:exam.id,value:exam.id},`${exam.name}${exam.code ? `（${exam.code}）` : ''}`)),
        h('option',{value:'independent'},'另行指定参考考试名称…')),
      !value.referenceSubjectId || value.referenceSubjectId === 'auto' ? h('input',{className:'kd-input','aria-label':`${label}代码（考试科目或专业）`,
        placeholder:'考试科目或专业代码（选填）',value:value.code || '',maxLength:20,onChange:(event)=>change({code:event.target.value})}) : null,
      value.referenceSubjectId === 'independent' ? h('div',{className:'kd-row'},
        h('input',{className:'kd-input','aria-label':`${label}名称`,placeholder:'考试名称，院校自命题请包含院校',value:value.referenceExamName || '',maxLength:100,
          onChange:(event)=>change({referenceExamName:event.target.value})}),
        h('input',{className:'kd-input','aria-label':`${label}代码`,placeholder:'科目代码（选填）',value:value.referenceExamCode || '',maxLength:20,style:{width:'150px'},
          onChange:(event)=>change({referenceExamCode:event.target.value})})) : null)
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
    const canAdd = Boolean(name.trim()) && selectedTypes.length > 0 && (referenceSubjectId !== 'independent' || Boolean(referenceExamName.trim()))
    const withCustomSubject = (current) => {
      const subject = { id: 'custom_' + newAttemptId(), name: name.trim(), code:subjectCode.trim(), types: selectedTypes, referenceSubjectId, referenceExamName:referenceExamName.trim(), referenceExamCode:referenceExamCode.trim(),
        outline:outlineDraft.split('\n') }
      return { ...current, subjects: [...current.subjects, subject.id], customSubjects: [...current.customSubjects, subject] }
    }
    const finish = async () => {
      if (saving) return
      if ((name.trim() || types.length || typeDraft.trim() || (referenceSubjectId && referenceSubjectId !== 'auto') || referenceExamName.trim() || referenceExamCode.trim() || subjectCode.trim() || outlineDraft.trim()) && !canAdd) {
        setSaveError('请填写自定义科目名称并至少选择一个题型；选择独立参考考试时，还需填写考试名称。或清空未完成的输入。')
        return
      }
      const next = canAdd ? withCustomSubject(draft) : draft
      if (next.customSubjects.some((s)=>s.referenceSubjectId === 'independent' && !s.referenceExamName?.trim())) {
        setSaveError('独立参考考试请填写准确的考试名称（院校自命题请包含院校名称）。')
        return
      }
      setSaving(true)
      setSaveError('')
      try { await onDone(next) }
      catch (error) { setSaveError(error.message || '保存失败，请重试') }
      finally { setSaving(false) }
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
        key: final ? 'final' : 'first',
        title: final ? '再次确认删除科目' : '删除科目',
        message: final
          ? `点击科目管理的「完成」后，将永久删除「${subject.name}」及已出题目、作答、收藏、错题和追问记录。此操作无法恢复。`
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
    return h(Modal, {
      title: T.manageSubjects,
      onClose: close,
      wide: true,
      footer: [
        h(Btn, { key: 'cancel', onClick: close, disabled: saving }, T.cancel),
        h(Btn, { key: 'done', variant: 'primary', onClick: finish, disabled: saving }, saving ? '保存中…' : '完成'),
      ],
    },
    saveError ? h('div', { className: 'kd-error-text', role: 'alert' }, saveError) : null,
    draft.deleteSubjectIds.length ? h('div', { className:'kd-error-text', role:'status' },
      `有 ${draft.deleteSubjectIds.length} 个科目待删除，点击「完成」后生效。`) : null,
    h('fieldset', { disabled: saving, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } },
    h('div', { className: 'kd-meta', style: { marginBottom: '12px' } },
      '修改后点击右下角「完成」统一保存；取消或关闭会放弃修改。停用科目不会删除历史题目、作答、收藏和追问。'),
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
      h('div', { className: 'kd-field-label' }, '添加自定义科目'),
      referenceEditor({referenceSubjectId,referenceExamName,referenceExamCode,code:subjectCode},(patch)=>{
        if (patch.referenceSubjectId !== undefined) setReferenceSubjectId(patch.referenceSubjectId)
        if (patch.referenceExamName !== undefined) setReferenceExamName(patch.referenceExamName)
        if (patch.referenceExamCode !== undefined) setReferenceExamCode(patch.referenceExamCode)
        if (patch.code !== undefined) setSubjectCode(patch.code)
      },'自定义科目的参考考试'),
      h('div',{className:'kd-meta'},'可在这里填写练习范围。大纲和难度对照用的真题分别在大纲管理与真题管理导入。'),
      outlineEditor(outlineDraft,setOutlineDraft,'自定义科目的练习范围'),
      h('div', { className: 'kd-row' },
        h('input', {
          className: 'kd-input',
          style: { flex: '1 1 200px' },
          value: name,
          placeholder: '例如：数据结构（自命题）',
          onChange: (event) => setName(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') submit() },
        }),
        h(Btn, { disabled: !canAdd, onClick: submit }, '添加')),
      h('div', { className: 'kd-meta', style: { marginTop: '10px' } }, '题型（至少选一个）'),
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
          placeholder: '自定义题型，例如：名词解释',
          onChange: (event) => setTypeDraft(event.target.value),
          onKeyDown: (event) => { if (event.key === 'Enter') addCustomType() },
        }),
        h(Btn, { small: true, disabled: !typeDraft.trim(), onClick: addCustomType }, '添加题型')),
      h('div', { className: 'kd-msg-meta', style: { marginTop: '6px' } },
        canAdd ? `将添加：${name.trim()}（${types.join(' / ')}）` : '填写科目名称并至少选择一个题型后即可添加'))))
  }

  function BanksModal({ boot, importResult, onClose, onPickFile, onDelete, onCommit, onCancelImport, committing }) {
    const [excluded, setExcluded] = useState([])
    const [previewPage, setPreviewPage] = useState(0)
    if (importResult) {
      const pageSize = 60
      const pageCount = Math.ceil(importResult.items.length / pageSize)
      const selectedCount = importResult.usable - excluded.length
      return h(Modal, {
        title: `${T.preview}（${importResult.name}）`,
        onClose: onCancelImport,
        wide: true,
        footer: [
          h(Btn, { key: 'cancel', onClick: onCancelImport }, T.cancel),
          h(Btn, {
            key: 'ok',
            variant: 'primary',
            disabled: !selectedCount || committing,
            onClick: () => onCommit(importResult, excluded),
          }, T.commit),
        ],
      },
      h('div', { className: 'kd-meta', style: { marginBottom: '10px' } },
        `共识别 ${importResult.stats.total} 道，可用 ${importResult.usable} 道，已选 ${selectedCount} 道入库。`),
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
          h('div', { style: { marginTop: '6px', fontSize: '13px' } },
            h(Markdown, { text: (item.stem || '(未识别到题干)').slice(0, 400) })),
          item.issues.length
            ? h('div', { className: 'kd-warn-text', style: { marginTop: '6px' } }, `问题：${item.issues.join('；')}`)
            : null))))
    }

    return h(Modal, {
      title: T.manageBanks,
      onClose,
      wide: true,
      footer: [
        h(Btn, { key: 'import', variant: 'primary', onClick: onPickFile }, h(Icon, { name: 'upload', size: 13 }), T.import),
        h(Btn, { key: 'close', onClick: onClose }, T.close),
      ],
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

  function SyllabusesModal({ boot, subjectId, onClose, onSaved }) {
    const subjects = boot.subjects || []
    const [selected, setSelected] = useState(() => subjects.some((subject) => subject.id === subjectId) ? subjectId : (subjects[0]?.id || ''))
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const fileInput = useRef(null)
    const current = (boot.syllabuses || []).find((syllabus) => syllabus.subjectId === selected)
    const save = async (op, args) => {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        const payload = await args()
        const result = await rpc(op, {subjectId:selected,...payload})
        onSaved(result.syllabuses)
        setMessage(op === 'importSyllabus' ? '大纲已保存，下次在线出题时使用。' : '大纲已移除。')
      } catch (issue) {
        setError(issue.message)
      } finally {
        setBusy(false)
      }
    }
    const onFile = async (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file || !selected) return
      await save('importSyllabus', () => readStudyFile(file))
    }
    return h(Modal, {title:T.manageSyllabuses,wide:true,onClose:() => { if (!busy) onClose() },
      footer:h(Btn,{disabled:busy,onClick:onClose},T.close)},
    h('p',{className:'kd-meta'},'每科可导入一份文本型 PDF、TXT 或 Markdown 大纲。没有导入时仍可在线出题，题目可能与正式大纲范围有差异。'),
    subjects.length ? h('label',{className:'kd-field'},h('span',{className:'kd-field-label'},'科目'),
      h('select',{className:'kd-select',value:selected,disabled:busy,onChange:(event)=>{setSelected(event.target.value);setError('');setMessage('')}},
        subjects.map((subject)=>h('option',{key:subject.id,value:subject.id},subject.name)))) : h('p',{className:'kd-meta'},'请先在科目管理添加科目。'),
    current ? h('div',{className:'kd-manage-card'},
      h('div',null,current.fileName),
      h('div',{className:'kd-msg-meta'},`导入于 ${formatDateTime(current.importedAt)} · ${current.characters} 字符`))
      : selected ? h('p',{className:'kd-meta'},'这个科目尚未导入大纲。') : null,
    h('input',{type:'file',accept:STUDY_FILE_ACCEPT,ref:fileInput,hidden:true,onChange:onFile}),
    h('div',{className:'kd-actions'},
      h(Btn,{variant:'primary',disabled:busy||!selected,onClick:()=>fileInput.current?.click()},h(Icon,{name:'upload'}),current?'替换大纲':'导入大纲'),
      current ? h(Btn,{variant:'danger',disabled:busy,onClick:()=>save('removeSyllabus',async()=>({}))},'移除大纲') : null),
    busy ? h('p',{className:'kd-meta',role:'status'},'正在处理…') : null,
    error ? h('p',{className:'kd-error-text',role:'alert'},error) : null,
    message ? h('p',{className:'kd-meta',role:'status'},message) : null)
  }

  function PastPapersModal({ boot, subjectId, onClose, onSaved }) {
    const subjects = boot.subjects || []
    const [selected, setSelected] = useState(() => subjects.some((subject) => subject.id === subjectId) ? subjectId : (subjects[0]?.id || ''))
    const [year, setYear] = useState('')
    const [type, setType] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const fileInput = useRef(null)
    const subject = subjects.find((item) => item.id === selected)
    const papers = (boot.pastPapers || []).filter((paper) => paper.subjectId === selected)
    const maxYear = new Date().getFullYear() + 1
    const validYear = /^\d{4}$/.test(year) && Number(year) >= 1900 && Number(year) <= maxYear
    const existing = papers.some((paper) => paper.year === Number(year))
    const typeName = (value) => subject?.typeLabels?.[(subject.types || []).indexOf(value)] || value
    const save = async (op, args, success) => {
      setBusy(true)
      setError('')
      setMessage('')
      try {
        const result = await rpc(op,{subjectId:selected,...await args()})
        onSaved(result.pastPapers)
        setMessage(success)
      } catch (issue) {
        setError(issue.message)
      } finally {
        setBusy(false)
      }
    }
    const onFile = async (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file || !subject || !validYear || busy) return
      await save('importPastPaper',async () => ({year:Number(year),type,...await readStudyFile(file)}),'真题已保存，可供后续出题校验难度。')
    }
    return h(Modal,{title:T.managePastPapers,wide:true,onClose:()=>{if(!busy)onClose()},
      footer:h(Btn,{disabled:busy,onClick:onClose},T.close)},
    h('p',{className:'kd-meta'},'支持文本型 PDF、TXT 和 Markdown。同一科目每年保存一份真题。某题型至少有两个年份的真题才能用于难度校验。'),
    h('div',{className:'kd-row'},
      h('label',{className:'kd-field'},h('span',{className:'kd-field-label'},'科目'),
        h('select',{className:'kd-select',value:selected,disabled:busy,onChange:(event)=>{setSelected(event.target.value);setType('');setError('');setMessage('')}},
          subjects.length ? subjects.map((item)=>h('option',{key:item.id,value:item.id},item.name)) : h('option',{value:''},'请先添加科目'))),
      h('label',{className:'kd-field'},h('span',{className:'kd-field-label'},'年份'),
        h('input',{className:'kd-input',type:'number',min:1900,max:maxYear,step:1,placeholder:'例如 2025',value:year,disabled:busy,onChange:(event)=>setYear(event.target.value)})),
      h('label',{className:'kd-field'},h('span',{className:'kd-field-label'},'题型'),
        h('select',{className:'kd-select',value:type,disabled:busy,onChange:(event)=>setType(event.target.value)},
          h('option',{value:''},'按正文标题识别'),
          ...(subject?.types || []).map((value)=>h('option',{key:value,value},typeName(value)))))),
    h('p',{className:'kd-msg-meta'},'整卷请保留各题型标题。文件只有一种题型且缺少标题时，可以手动选择题型。'),
    h('input',{type:'file',accept:STUDY_FILE_ACCEPT,ref:fileInput,hidden:true,onChange:onFile}),
    h('div',{className:'kd-actions'},
      h(Btn,{variant:'primary',disabled:busy||!subject||!validYear,onClick:()=>fileInput.current?.click()},
        h(Icon,{name:'upload'}),existing?'替换该年份真题':'导入真题')),
    papers.map((paper)=>h('div',{key:paper.year,className:'kd-row-between kd-manage-card'},
      h('div',null,h('div',null,`${paper.year} 年 · ${paper.fileName}`),
        h('div',{className:'kd-msg-meta'},paper.types?.length ? paper.types.map(typeName).join('、') : '未识别题型')),
      h(Btn,{small:true,variant:'danger',disabled:busy,
        onClick:()=>save('removePastPaper',async()=>({year:paper.year}),'真题已移除。')},'移除'))),
    busy ? h('p',{className:'kd-meta',role:'status'},'正在处理…') : null,
    error ? h('p',{className:'kd-error-text',role:'alert'},error) : null,
    message ? h('p',{className:'kd-meta',role:'status'},message) : null)
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
    h('div', { className: 'kd-answer-block', style: { marginTop: '14px' } },
      h('div', { className: 'kd-answer-label' }, '候选标准答案'),
      h(Markdown, { text: candidate.answer })),
    h('div', { className: 'kd-answer-block' },
      h('div', { className: 'kd-answer-label' }, '候选解析'),
      h(Markdown, { text: candidate.explanation })),
    h('div', { className: 'kd-msg-meta' }, '确认后才会替换正式版本；旧版本会保留在版本历史中。'))
  }

  function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose, danger, busy }) {
    return h(Modal, {
      title,
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
    Icon, Btn, EmptyState, Presence, CountdownLines, ExamStrip, UpdateCheck, SubjectNav, TabBar, MobileBar,
    QuestionPane, previewFadePosition, ListPane, ThreadPane, SubjectsModal, BanksModal, SyllabusesModal, PastPapersModal, RevisionModal, ConfirmModal, PluginLogo,
  }
}
