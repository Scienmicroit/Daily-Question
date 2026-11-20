import { formatDateTime } from './common.js'
import { fullscreen } from './fullscreen.js'

const labels = { weak: '建议巩固', insufficient: '样本不足', observed: '继续观察' }

function evidence(row) {
  return `近 30 天练过 ${row.recent} 道不同题，${row.wrong} 道最近一次作答错误 · ${row.reviewed} 道最近一次在今日复习中答对 · ${row.due} 道待复习`
}

export function createStudyMemoryPage(React, { window, rpc, Btn, Icon }) {
  const { createElement: h, useState, useEffect } = React

  function SubjectMemory({ subject, onRelated }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const [pending, setPending] = useState('')
    const [status, setStatus] = useState('')
    const [analysisError, setAnalysisError] = useState('')
    const [topicDisplay, setTopicDisplay] = useState(() => ({ expanded: false, overrides: new Map() }))
    const setAllTopics = (expanded) => setTopicDisplay({ expanded, overrides: new Map() })
    const onTopicToggle = (topic, open) => setTopicDisplay((current) => {
      if ((current.overrides.get(topic) ?? current.expanded) === open) return current
      const overrides = new Map(current.overrides)
      if (open === current.expanded) overrides.delete(topic)
      else overrides.set(topic, open)
      return { ...current, overrides }
    })
    useEffect(() => {
      let active = true
      rpc('getStudyMemory', { subjectId: subject.id }).then((result) => {
        if (active) setData(result)
      }).catch((issue) => { if (active) setError(issue.message) })
      return () => { active = false }
    }, [subject.id, retry])
    const run = async (job, action) => {
      const reportError = job === 'analysis' ? setAnalysisError : setError
      reportError('')
      setStatus('')
      setPending(job)
      try { await action() }
      catch (issue) { reportError(issue.message) }
      finally { setPending('') }
    }
    if (!data) return h('div', { className: 'kd-memory-panel' },
      h('p', { role: error ? 'alert' : 'status' }, error || '正在读取学习记忆…'),
      error ? h(Btn, { onClick: () => { setError(''); setRetry(retry + 1) } }, '重试') : null)
    if (!data.enabled) return h('p', { className: 'kd-meta' }, '功能已关闭，请重新打开页面以同步设置。')
    const { rows, analysis } = data
    const analyze = () => run('analysis', async () => {
      const next = await rpc('analyzeStudyMemory', { subjectId: subject.id })
      setData((current) => ({ ...current, analysis: next }))
    })
    const download = () => {
      const markdown = [`# ${subject.name} · 学习记忆`, ...rows.map((row) => [
        `## ${row.topic}`, `- ${labels[row.status]}：${evidence(row)}`, ...(row.note ? ['### 我的错因', row.note] : []),
      ].join('\n')), ...(analysis ? [
        `## 上次 AI 建议 · ${formatDateTime(analysis.at)}`,
        ...analysis.topics.map((item) => `- ${item.topic}（分析时 ${item.distinctQuestions} 道，${item.latestWrong} 道错）：${item.suggestion}`),
      ] : [])].join('\n\n')
      const url = window.URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
      const link = window.document.createElement('a')
      link.href = url
      link.download = 'daily-question-memory.md'
      link.click()
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
    }
    return h(React.Fragment, null,
      h('section', { className: 'kd-memory-panel kd-memory-analysis-panel', 'aria-label': 'AI 薄弱点分析' },
        h('div', { className: 'kd-stats-section-head' },
          h('h3', null, 'AI 薄弱点分析'),
          h('div', { className: 'kd-actions' },
            h(Btn, { onClick: download, disabled: !rows.length && !analysis }, '导出 Markdown'),
            h(Btn, { variant: 'primary', disabled: Boolean(pending) || !rows.some((row) => row.status === 'weak'),
              onClick: analyze }, pending === 'analysis' ? '正在分析…' : 'AI 分析'))),
        h('p', { className: 'kd-meta' }, '仅在点击时调用 DSH 默认模型，发送当前科目的学习摘要和相关错因片段。'),
        analysisError ? h('p', { role: 'alert', className: 'kd-error-text' }, analysisError) : null,
        !rows.some((row) => row.status === 'weak')
          ? h('p', { className: 'kd-meta' }, '暂无证据充足的薄弱点。近 30 天同一知识点至少练过 3 道已判定的不同题，其中至少 2 道最近一次答错，才建议巩固。') : null,
        analysis ? h('div', { className: 'kd-memory-analysis' },
          h('p', { className: 'kd-meta' }, '上次分析：', formatDateTime(analysis.at)),
          h('ul', null, analysis.topics.map((item) => h('li', { key: item.topic },
            h('strong', null, item.topic), `（分析时 ${item.distinctQuestions} 道，${item.latestWrong} 道错）`,
            h('p', null, item.suggestion))))) : null),
      h('section', { className: 'kd-memory-panel', 'aria-label': '知识点与错因笔记' },
        h('div', { className: 'kd-stats-section-head' },
          h('h3', null, '知识点与错因笔记'),
          rows.length ? h('div', { className: 'kd-row kd-memory-topic-controls', role: 'group', 'aria-label': `${subject.name}知识点` },
            h(Btn, { onClick: () => setAllTopics(true) }, '全部展开'),
            h(Btn, { onClick: () => setAllTopics(false) }, '全部收起')) : null),
        h('p', { className: 'kd-meta' }, '每道题只统计最近一次已判定作答。展开知识点可记录 Markdown 笔记；清空并保存可删除。'),
        error ? h('p', { role: 'alert', className: 'kd-error-text' }, error) : null,
        status ? h('p', { role: 'status', className: 'kd-meta' }, status) : null,
        rows.length ? rows.map((row) => h('details', { className: 'kd-memory-topic', key: row.topic,
            open: topicDisplay.overrides.get(row.topic) ?? topicDisplay.expanded,
            onToggle: (event) => onTopicToggle(row.topic, event.currentTarget.open) },
          h('summary', null, h('span', { className: 'kd-memory-topic-title' }, h('strong', null, row.topic),
            h('span', { className: 'kd-memory-topic-status' }, labels[row.status], row.note ? ' · 有笔记' : ''))),
          h('p', { className: 'kd-meta' }, evidence(row)),
          h('form', { onSubmit: (event) => {
            event.preventDefault()
            const note = event.currentTarget.elements.namedItem('note').value
            run('note', async () => {
              const saved = await rpc('saveMemoryNote', { subjectId: subject.id, topic: row.topic, note })
              setData((current) => ({ ...current, rows: current.rows.map((item) => item.topic === row.topic ? { ...item, note: saved.note } : item) }))
              setStatus('已保存错因笔记')
            })
          } },
          h('label', { className: 'kd-field' },
            h('span', { className: 'kd-field-label' }, '错因笔记（支持 Markdown）'),
            h('textarea', { name: 'note', className: 'kd-textarea kd-memory-note-input', 'aria-label': `${row.topic}的错因笔记`,
              placeholder: '例如：忘记先核对分段点的左右极限', defaultValue: row.note, maxLength: 1000 })),
          h('div', { className: 'kd-actions' },
            h(Btn, { type: 'submit', disabled: Boolean(pending) }, '保存笔记'),
            row.wrongBook ? h(Btn, { onClick: () => onRelated(subject.id, 'wrong', row.topic) }, '查看相关错题') : null,
            row.due ? h(Btn, { onClick: () => onRelated(subject.id, 'review', row.topic) }, '复习相关错题') : null))))
          : h('p', { className: 'kd-meta' }, '作答后，这里会按题目的知识点标签汇总学习记录。')))
  }

  return function StudyMemoryPage({ subjects, onClose, onRelated }) {
    const [preferences, setPreferences] = useState(null)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    useEffect(() => {
      let active = true
      rpc('getStudyMemory').then((result) => { if (active) setPreferences(result) })
        .catch((issue) => { if (active) setError(issue.message) })
      return () => { active = false }
    }, [retry])
    useEffect(() => {
      const keydown = (event) => { if (event.key === 'Escape') onClose() }
      window.addEventListener('keydown', keydown)
      return () => window.removeEventListener('keydown', keydown)
    }, [onClose])
    const change = async (patch) => {
      setPending(true)
      setError('')
      try { setPreferences(await rpc('saveMemoryPreferences', patch)) }
      catch (issue) { setError(issue.message) }
      finally { setPending(false) }
    }
    const enabledSubjects = subjects.filter((subject) => subject.enabled)
    return fullscreen(h, Icon, { title: '记忆与建议', onClose },
      h('div', { className: 'kd-stats-scroll' }, h('div', { className: 'kd-stats-content' },
        h('section', { className: 'kd-stats-card kd-memory-settings' },
          h('h2', null, '功能设置'),
          preferences ? h('label', null, h('input', { type: 'checkbox', checked: preferences.enabled, disabled: pending,
            onChange: (event) => change({ enabled: event.target.checked }) }), '启用记忆与建议') : null,
          h('p', { className: 'kd-meta' }, '关闭期间不分析、不影响出题。笔记保留，重新启用时按本地作答记录计算。'),
          preferences?.enabled ? h(React.Fragment, null,
            h('label', null, h('input', { type: 'checkbox', checked: preferences.reinforce, disabled: pending,
              onChange: (event) => change({ reinforce: event.target.checked }) }), '每日题目优先巩固薄弱点'),
            h('p', { className: 'kd-meta' }, '每科 7 天内最多安排 2 道补弱题，同一知识点不连续安排；每日仍最多一道新题。在线命题会参考当前知识点和相关错因片段。')) : null,
          error ? h('p', { role: 'alert', className: 'kd-error-text' }, error) : null,
          !preferences && error ? h(Btn, { onClick: () => { setError(''); setRetry(retry + 1) } }, '重试') : null),
        preferences?.enabled ? (enabledSubjects.length ? enabledSubjects.map((subject) =>
            h('article', { className: 'kd-stats-card kd-memory-subject-card', key: subject.id, 'aria-label': subject.name },
              h('h2', null, subject.name),
              h(SubjectMemory, { subject, onRelated })))
          : h('p', { className: 'kd-meta' }, '还没有启用科目。请先在科目管理里启用要查看的科目。')) : null)))
  }
}
