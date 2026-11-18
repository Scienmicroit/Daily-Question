import { formatDate } from './common.js'

function accuracy({ correct, wrong }) {
  const graded = correct + wrong
  return graded ? `${Math.round(correct / graded * 100)}%` : '—'
}

export function createStudyStatsPage(React, { window, rpc, Btn, Icon }) {
  const { createElement: h, useState, useEffect } = React

  function PracticeChart({ days }) {
    const max = Math.max(1, ...days.map((day) => day.attempts))
    return h('section', { className: 'kd-stats-card', 'aria-label': '近七天作答' },
      h('div', { className: 'kd-stats-section-head' },
        h('h2', null, '近七天作答'),
        h('div', { className: 'kd-stats-legend' },
          h('span', { className: 'is-correct' }, '正确'),
          h('span', { className: 'is-wrong' }, '错误'),
          h('span', { className: 'is-pending' }, '待判定'))),
      max === 1 && !days.some((day) => day.attempts) ? h('p', { className: 'kd-meta' }, '近七天暂无作答。') : null,
      h('ol', { className: 'kd-stats-chart' },
        days.map((day) => {
          const label = `${formatDate(day.date)}，作答 ${day.attempts} 次，正确 ${day.correct} 次，错误 ${day.wrong} 次，待判定 ${day.pending} 次`
          return h('li', { key: day.date, 'aria-label': label, title: label },
            h('div', { className: 'kd-stats-bar-area', 'aria-hidden': true },
              h('span', { className: 'kd-stats-bar-value' }, day.attempts),
              h('div', { className: 'kd-stats-bar', style: { '--kd-bar-share': day.attempts / max } },
                ...['correct', 'wrong', 'pending'].filter((status) => day[status]).map((status) =>
                  h('span', { key: status, className: `is-${status}`, style: { flex: day[status] } })))),
            h('span', { className: 'kd-stats-day', 'aria-hidden': true }, day.date.slice(5).replace('-', '/')))
        })))
  }

  function SubjectTable({ subjects }) {
    const columns = ['科目', '已练习', '作答次数', '正确率', '收藏', '错题', '待复习']
    return h('section', { className: 'kd-stats-card', 'aria-label': '分科统计' },
      h('h2', null, '分科统计'),
      subjects.length ? h('div', { className: 'kd-stats-table-wrap', tabIndex: 0, 'aria-label': '分科统计表格' },
        h('table', { className: 'kd-stats-table' },
          h('thead', null, h('tr', null, columns.map((label) => h('th', { key: label, scope: 'col' }, label)))),
          h('tbody', null, subjects.map((subject) =>
            h('tr', { key: subject.id },
              h('th', { scope: 'row' }, subject.name, subject.enabled ? null : h('small', null, '已停用')),
              h('td', null, subject.attempted, ' / ', subject.all),
              h('td', null, subject.attempts),
              h('td', null, accuracy(subject)),
              h('td', null, subject.favorite),
              h('td', null, subject.wrongBook),
              h('td', null, subject.review))))))
        : h('p', { className: 'kd-meta' }, '启用科目后，这里会显示各科的学习记录。'))
  }

  return function StudyStatsPage({ today, onClose }) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    useEffect(() => {
      let active = true
      setError('')
      rpc('studyStats').then((result) => { if (active) setData(result) })
        .catch((issue) => { if (active) setError(issue.message) })
      return () => { active = false }
    }, [today, retry])
    useEffect(() => {
      const keydown = (event) => { if (event.key === 'Escape') onClose() }
      window.addEventListener('keydown', keydown)
      return () => window.removeEventListener('keydown', keydown)
    }, [onClose])

    const totals = data?.totals
    const metrics = totals ? [
      ['累计作答', totals.attempts, `共练习 ${totals.attempted} 道不同题目`],
      ['答题正确率', accuracy(totals), `正确 ${totals.correct} 次 · 已判定 ${totals.correct + totals.wrong} 次`],
      ['连续练习', `${data.streak} 天`, '每天至少作答一次'],
      ['待复习', `${totals.review} 道`, `错题本 ${totals.wrongBook} 道 · 收藏 ${totals.favorite} 道`],
    ] : []
    return h('section', { className: 'kd-stats-screen', role: 'dialog', 'aria-modal': true, 'aria-label': '学习统计' },
      h('header', { className: 'kd-stats-header' },
        h('div', { className: 'kd-stats-heading' },
          h('button', { type: 'button', className: 'kd-iconbtn', onClick: onClose, autoFocus: true, 'aria-label': '返回练习', title: '返回练习' },
            h(Icon, { name: 'chevron-left', size: 20 })),
          h('h1', null, '学习统计')),
        (data?.today || today) ? h('span', { className: 'kd-meta' }, formatDate(data?.today || today)) : null),
      h('div', { className: 'kd-stats-scroll' },
        h('div', { className: 'kd-stats-content' },
          error ? h('div', { className: 'kd-stats-card', role: 'alert' },
            h('p', null, `无法读取学习统计：${error}`), h(Btn, { onClick: () => setRetry((value) => value + 1) }, '重试'))
            : !data ? h('div', { className: 'kd-loading', role: 'status' },
              h('span', { className: 'kd-spinner' }), '正在读取学习统计…')
              : [
                h('section', { key: 'overview', className: 'kd-stats-metrics', 'aria-label': '学习概览' },
                  metrics.map(([label, value, hint]) => h('div', { key: label, className: 'kd-stats-card kd-stats-metric' },
                    h('h2', null, label), h('strong', null, value), h('p', { className: 'kd-meta' }, hint)))),
                h(PracticeChart, { key: 'chart', days: data.days }),
                h(SubjectTable, { key: 'subjects', subjects: data.subjects }),
              ])))
  }
}
