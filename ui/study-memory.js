import { formatDateTime } from './common.js'
import { fullscreen } from './fullscreen.js'

const labels = { weak: '建议巩固', insufficient: '样本不足', observed: '继续观察' }
const TOPICS_PER_PAGE = 8
const chapterOf = (row) => row.chapter || '未归类'
const searchText = (value) => value.normalize('NFKC').trim().toLowerCase()

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
    const [topicQuery, setTopicQuery] = useState('')
    const [chapter, setChapter] = useState('')
    const [page, setPage] = useState(1)
    const [noteDrafts, setNoteDrafts] = useState(() => new Map())
    const [mergeProposal, setMergeProposal] = useState(null)
    const [selectedMerges, setSelectedMerges] = useState([])
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
    const chapters = [...new Set(rows.map(chapterOf))]
    const query = searchText(topicQuery)
    const matches = query || chapter ? rows.filter((row) =>
      (!chapter || chapterOf(row) === chapter) && (!query ||
        [row.topic, chapterOf(row), ...(row.aliases || [])].some((label) => searchText(label).includes(query)))) : rows
    const pages = Math.max(1, Math.ceil(matches.length / TOPICS_PER_PAGE))
    const currentPage = Math.min(page, pages)
    const visible = matches.slice((currentPage - 1) * TOPICS_PER_PAGE, currentPage * TOPICS_PER_PAGE)
    const analyze = () => run('analysis', async () => {
      const next = await rpc('analyzeStudyMemory', { subjectId: subject.id })
      setData((current) => ({ ...current, analysis: next }))
    })
    const suggestMerges = (offset = 0) => run('suggest-merges', async () => {
      setMergeProposal(null)
      const next = await rpc('suggestMemoryMerges', { subjectId: subject.id, offset })
      setMergeProposal(next)
      setSelectedMerges(next.groups.map(({ target }) => target))
    })
    const applyMerges = () => run('apply-merges', async () => {
      const groups = mergeProposal.groups.filter(({ target }) => selectedMerges.includes(target))
      const result = await rpc('applyMemoryMerges', { subjectId: subject.id, version: mergeProposal.version, groups })
      setData((current) => ({ ...current, ...result }))
      setMergeProposal(null)
      setPage(1)
      setStatus(`已应用 ${groups.length} 组标签归并`)
    })
    const download = () => {
      const markdown = [`# ${subject.name} · 学习记忆`, ...rows.map((row) => [
        `## ${row.topic}`, `- ${labels[row.status]}：${evidence(row)}`, ...(row.note ? ['### 我的错因', row.note] : []),
        ...(row.sourceNotes || []).flatMap(({ topic, note }) => [`### ${topic}的原笔记`, note]),
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
    const noteForm = (row, topic, note, original = false) => h('form', { key: topic, onSubmit: (event) => {
      event.preventDefault()
      const draft = event.currentTarget.elements.namedItem('note').value
      run('note', async () => {
        const saved = await rpc('saveMemoryNote', { subjectId: subject.id, topic, note: draft })
        setData((current) => ({ ...current, rows: current.rows.map((item) => {
          if (item.topic !== row.topic) return item
          if (!original) return { ...item, note: saved.note }
          const sourceNotes = item.sourceNotes.map((entry) => entry.topic === topic ? { ...entry, note: saved.note } : entry)
          return { ...item, sourceNotes: sourceNotes.filter((entry) => entry.note) }
        }) }))
        setNoteDrafts((current) => {
          if (current.get(topic) !== draft) return current
          const next = new Map(current)
          next.delete(topic)
          return next
        })
        setStatus('已保存错因笔记')
      })
    } },
    h('label', { className: 'kd-field' },
      h('span', { className: 'kd-field-label' }, original ? `${topic}的原笔记` : '错因笔记（支持 Markdown）'),
      h('textarea', { name: 'note', className: 'kd-textarea kd-memory-note-input', 'aria-label': `${topic}的错因笔记`,
        placeholder: '例如：忘记先核对分段点的左右极限', value: noteDrafts.get(topic) ?? note ?? '',
        onChange: (event) => {
          const value = event.target.value
          setNoteDrafts((current) => {
            const next = new Map(current)
            if (value === (note || '')) next.delete(topic)
            else next.set(topic, value)
            return next
          })
        }, maxLength: 1000 })),
    h('div', { className: 'kd-actions' },
      h(Btn, { type: 'submit', disabled: Boolean(pending) }, '保存笔记'),
      !original && row.wrongBook ? h(Btn, { onClick: () => onRelated(subject.id, 'wrong', row.topic) }, '查看相关错题') : null,
      !original && row.due ? h(Btn, { onClick: () => onRelated(subject.id, 'review', row.topic) }, '复习相关错题') : null))
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
      h('details', { className: 'kd-memory-panel kd-memory-topics', 'aria-label': `${subject.name}的知识点与错因笔记` },
        h('summary', { className: 'kd-memory-topics-summary' }, '知识点与错因笔记',
          h('span', { className: 'kd-meta' }, `${rows.length} 个知识点`)),
        h('section', { className: 'kd-memory-merge', 'aria-label': '知识点归并' },
          h('div', { className: 'kd-stats-section-head' },
            h('h3', null, '知识点归并'),
            h(Btn, { disabled: Boolean(pending) || !data.canSuggestMerges, onClick: () => suggestMerges() },
              pending === 'suggest-merges' ? '正在生成建议…' : 'AI 建议归并')),
          h('p', { className: 'kd-meta' }, data.canSuggestMerges
            ? '点击后将本科标签和可用的大纲或练习范围交给 DSH 默认模型。勾选并应用后生效。'
            : '本科至少需要两个标签才能生成归并建议。'),
          mergeProposal ? h(React.Fragment, null,
            mergeProposal.reviewed < mergeProposal.total ? h('p', { className: 'kd-meta' },
              `本次检查第 ${mergeProposal.start + 1}–${mergeProposal.start + mergeProposal.reviewed} 个标签，共 ${mergeProposal.total} 个。`) : null,
            mergeProposal.groups.length ? h(React.Fragment, null,
              h('ul', { className: 'kd-memory-merge-options' }, mergeProposal.groups.map(({ target, sources, reason }) =>
                h('li', { key: target }, h('label', null,
                  h('input', { type: 'checkbox', disabled: Boolean(pending), checked: selectedMerges.includes(target),
                    onChange: (event) => {
                      const checked = event.target.checked
                      setSelectedMerges((current) => checked ? [...current, target] : current.filter((label) => label !== target))
                    } }),
                  h('span', null, h('strong', null, target), h('span', null, `归入：${sources.join('、')}`),
                    reason ? h('span', { className: 'kd-meta' }, reason) : null))))),
              h(Btn, { variant: 'primary', disabled: Boolean(pending) || !selectedMerges.length || noteDrafts.size > 0,
                onClick: applyMerges }, pending === 'apply-merges' ? '正在应用…' : '应用所选归并'),
              noteDrafts.size ? h('p', { className: 'kd-meta' }, '请先保存正在编辑的笔记。') : null)
              : h('p', { role: 'status', className: 'kd-meta' }, '本次没有找到可靠的归并建议。'),
            mergeProposal.start + mergeProposal.reviewed < mergeProposal.total
              ? h(Btn, { disabled: Boolean(pending), onClick: () => suggestMerges(mergeProposal.start + mergeProposal.reviewed) }, '检查下一批标签') : null) : null),
        rows.length ? h('div', { className: 'kd-row kd-memory-topic-controls' },
          h('div', { className: 'kd-row kd-memory-topic-filters' },
            h('input', { type: 'search', className: 'kd-input', placeholder: '搜索知识点', 'aria-label': '搜索知识点',
              value: topicQuery, onChange: (event) => { setTopicQuery(event.target.value); setPage(1) } }),
            chapters.some((name) => name !== '未归类') ? h('select', {
              className: 'kd-select', 'aria-label': '按章节筛选知识点', value: chapter,
              onChange: (event) => { setChapter(event.target.value); setPage(1) },
            }, h('option', { value: '' }, '全部章节'),
            chapters.map((name) => h('option', { key: name, value: name }, name))) : null),
          h('div', { className: 'kd-row', role: 'group', 'aria-label': `${subject.name}知识点` },
            h(Btn, { onClick: () => setAllTopics(true), disabled: !visible.length }, '全部展开'),
            h(Btn, { onClick: () => setAllTopics(false), disabled: !visible.length }, '全部收起'))) : null,
        h('p', { className: 'kd-meta' }, '每道题只统计最近一次已判定作答。展开知识点可记录 Markdown 笔记；清空并保存可删除。'),
        error ? h('p', { role: 'alert', className: 'kd-error-text' }, error) : null,
        status ? h('p', { role: 'status', className: 'kd-meta' }, status) : null,
        visible.map((row) => h('details', { className: 'kd-memory-topic', key: row.topic,
            open: topicDisplay.overrides.get(row.topic) ?? topicDisplay.expanded,
            onToggle: (event) => onTopicToggle(row.topic, event.currentTarget.open) },
          h('summary', null, h('span', { className: 'kd-memory-topic-title' }, h('strong', null, row.topic),
            !chapter && row.chapter && row.chapter !== row.topic ? h('span', { className: 'kd-meta' }, row.chapter) : null,
            h('span', { className: 'kd-memory-topic-status' }, labels[row.status], row.note || row.sourceNotes?.length ? ' · 有笔记' : ''))),
          h('p', { className: 'kd-meta' }, evidence(row)),
          row.aliases?.length ? h('p', { className: 'kd-meta' }, `包含标签：${row.aliases.join('、')}`) : null,
          noteForm(row, row.topic, row.note),
          row.sourceNotes?.map(({ topic, note }) => noteForm(row, topic, note, true)))),
        !visible.length ? h('p', { className: 'kd-meta' }, rows.length ? '没有符合条件的知识点。'
          : '作答后，这里会按题目的知识点汇总学习记录。') : null,
        pages > 1 ? h('div', { className: 'kd-row kd-memory-topic-pages', 'aria-label': `${subject.name}知识点分页` },
          h(Btn, { small: true, disabled: currentPage === 1, onClick: () => setPage(currentPage - 1) }, '上一页'),
          h('span', { className: 'kd-meta' }, `第 ${currentPage} / ${pages} 页`),
          h(Btn, { small: true, disabled: currentPage === pages, onClick: () => setPage(currentPage + 1) }, '下一页')) : null))
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
