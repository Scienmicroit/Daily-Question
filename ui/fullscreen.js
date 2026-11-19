export function fullscreen(h, Icon, { title, onClose, detail, settings = false, locked, dialog }, content) {
  return h('section', {
    className: settings ? 'kd-fullscreen kd-settings-screen' : 'kd-fullscreen',
    role: 'dialog', 'aria-modal': true, 'aria-label': title,
  },
  h('header', { className: 'kd-stats-header', inert: dialog ? true : undefined },
    h('div', { className: 'kd-stats-heading' },
      h('button', { type: 'button', className: 'kd-iconbtn', onClick: onClose, autoFocus: true,
        disabled: locked || Boolean(dialog), 'aria-label': '返回练习', title: '返回练习' },
        h(Icon, { name: 'chevron-left', size: 20 })),
      h('h1', null, title)),
    detail),
  content, dialog)
}
