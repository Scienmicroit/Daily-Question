export const CSS = `
.kd-page {
  --kd-bg-base:var(--dsw-alias-bg-base, #ffffff);
  --kd-bg-layer-1:var(--dsw-alias-bg-layer-1, #ffffff);
  --kd-bg-layer-2:color-mix(in srgb, var(--kd-ink) 5%, var(--kd-surface));
  --kd-bg-overlay:var(--dsw-alias-bg-overlay, #ffffff);
  --kd-label-primary:var(--dsw-alias-label-primary, #24332f);
  --kd-label-secondary:var(--dsw-alias-label-secondary, #66736e);
  --kd-border-l1:color-mix(in srgb, var(--kd-ink) 9%, var(--kd-surface));
  --kd-border-l2:color-mix(in srgb, var(--kd-ink) 17%, var(--kd-surface));
  --kd-brand-primary:#4d6bfe;
  --kd-state-success-primary:#078443;
  --kd-state-error-primary:#db3144;
  --kd-state-warn-primary:#95702b;
  --kd-state-idle-primary:#85918b;
  --kd-ink:var(--kd-label-primary); --kd-surface:var(--kd-bg-base);
  font-family:inherit; isolation:isolate; height:100%; min-height:0; display:flex; flex-direction:column; position:relative;
  background:color-mix(in srgb, var(--kd-brand-primary) 2%, var(--kd-surface)); color: var(--kd-label-primary);
  font-size:14px; line-height:1.65; -webkit-font-smoothing:antialiased; box-sizing:border-box; }
.kd-page *, .kd-page *::before, .kd-page *::after { box-sizing:border-box; }
.kd-page :focus-visible { outline:2px solid var(--kd-brand-primary); outline-offset:2px; }
.kd-header { padding:20px 28px 12px; background:var(--kd-surface); border-bottom:1px solid var(--kd-border-l1);
  display:flex; flex-direction:column; gap:12px; }
.kd-header-top { display:flex; gap:20px; justify-content:space-between; align-items:center; flex-wrap:wrap; }
.kd-header-left { min-width:0; flex:1 1 320px; display:flex; gap:12px; align-items:center; }
.kd-brand { flex:0 0 40px; }
.kd-title { margin:0; font-size:19px; font-weight:650; letter-spacing:.01em; line-height:1.4; }
.kd-sub { margin-top:3px; font-size:12px; color:var(--kd-label-secondary); line-height:1.6; }
.kd-select { height:30px; padding:0 10px; border-radius:8px; font-size:13px; font-family:inherit;
  border:1px solid var(--kd-border-l2); background:var(--kd-bg-layer-1);
  color:var(--kd-label-primary); transition:border-color .15s; }
.kd-select:hover { border-color:var(--kd-brand-primary); }
.kd-select-sm { height:26px; font-size:12px; padding:0 6px; }
.kd-cd-lines { min-width:0; flex:0 1 auto; display:flex; flex-direction:column; align-items:flex-end;
  gap:2px; text-align:right; }
.kd-cd-primary, .kd-cd-days { font-size:21px; font-weight:400; color:var(--kd-brand-primary); font-variant-numeric:tabular-nums; line-height:1.25; }
.kd-cd-days strong { font-size:36px; font-weight:700; }
.kd-cd-secondary { font-size:12px; color:var(--kd-label-secondary); }
.kd-cd-target { font-size:11px; font-weight:400; color:var(--kd-label-primary); color:light-dark(#000, var(--kd-label-primary)); }
.kd-exam-strip { display:flex; align-items:center; gap:6px 14px; flex-wrap:wrap; padding:8px 0 0;
  border:0; border-top:1px solid var(--kd-border-l1); background:transparent;
  font-size:11.5px; color:var(--kd-label-secondary); }
.kd-strip-item { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
.kd-strip-warn { color:var(--kd-state-warn-primary); white-space:normal; text-align:left; }
.kd-shell { flex:1 1 auto; min-height:0; display:flex; }
.kd-nav { width:204px; flex:0 0 204px; background:var(--kd-surface); border-right:1px solid var(--kd-border-l1);
  padding:24px 14px; overflow:auto; display:flex; flex-direction:column; gap:18px; }
.kd-nav-group { display:flex; flex-direction:column; gap:4px; }
.kd-nav-group-label { display:flex; justify-content:space-between; gap:6px;
  font-size:10.5px; letter-spacing:.1em; color:var(--kd-label-secondary);
  padding:0 8px 4px; }
.kd-nav-item { position:relative; display:flex; align-items:center; justify-content:space-between; gap:7px; flex-direction:column; align-items:flex-start;
  width:100%; padding:12px; border-radius:9px; border:1px solid transparent; background:transparent;
  cursor:pointer; color:var(--kd-label-primary); font:inherit; font-size:13px; text-align:left;
  transition:background-color .15s, border-color .15s, color .15s; }
.kd-nav-item:hover { background:var(--kd-bg-layer-2); }
.kd-nav-item > span:first-child { min-width:0; overflow-wrap:anywhere; line-height:1.6; }
.kd-nav-item.is-active { background:color-mix(in srgb, var(--kd-brand-primary) 9%, var(--kd-surface)); border-color:transparent;
  color:var(--kd-brand-primary); font-weight:600; }
.kd-nav-item .kd-nav-count { flex:0 0 auto; white-space:nowrap; font-size:11px;
  color:var(--kd-label-secondary); }
.kd-nav-status { flex:0 0 auto; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;
  font-size:10.5px; color:var(--kd-label-secondary); }
.kd-dot { width:6px; height:6px; border-radius:50%; background:var(--kd-state-success-primary); }
.kd-dot-idle { background:var(--kd-state-idle-primary); }
.kd-nav-spacer { flex:1 1 auto; }
.kd-update { display:flex; flex-direction:column; gap:4px; }
.kd-main { flex:1 1 auto; min-width:0; overflow:hidden; display:flex; flex-direction:column; }
.kd-main-toolbar { flex:none; padding:24px 28px 20px; display:flex; align-items:center; gap:12px; }
.kd-main-toolbar > .kd-btn { flex:none; align-self:stretch; aspect-ratio:1; padding:0; min-height:0; white-space:nowrap; border-radius:12px; }
.kd-main-scroll { flex:1; min-height:0; overflow:auto; padding:0 28px 48px; scrollbar-gutter:stable; }
.kd-main-inner { width:100%; margin:0; }
.kd-thread { position:relative; width:clamp(280px,calc((100% - 204px) * var(--kd-thread-ratio, .33)),55%); flex:0 0 auto; border-left:1px solid var(--kd-border-l1);
  display:flex; flex-direction:column; min-height:0; background:var(--kd-bg-layer-1); }
.kd-thread-resize { position:absolute; left:-5px; top:0; bottom:0; width:10px; cursor:col-resize; touch-action:none; z-index:2; }
.kd-thread-resize:hover, .kd-thread-resize:focus-visible { background:color-mix(in srgb,var(--kd-brand-primary) 20%,transparent); }
.kd-thread-head { padding:20px; border-bottom:1px solid var(--kd-border-l1);
  display:flex; align-items:center; justify-content:space-between; gap:8px; }
.kd-thread-title { font-size:13px; font-weight:600; }
.kd-thread-hint { padding:12px 20px 0; font-size:11px; line-height:1.6;
  color:var(--kd-label-secondary); }
.kd-thread-scroll { flex:1 1 auto; min-height:0; overflow:auto; padding:18px 20px; display:flex;
  flex-direction:column; gap:12px; }
.kd-msg { max-width:100%; border-radius:12px; padding:10px 12px; font-size:13px; line-height:1.72; }
.kd-msg-user { align-self:flex-end; background:color-mix(in srgb, var(--kd-brand-primary) 9%, transparent);
  border:1px solid color-mix(in srgb, var(--kd-brand-primary) 26%, transparent); }
.kd-msg-assistant { align-self:stretch; padding:0; border:0; background:transparent; }
.kd-msg-meta { font-size:10px; color:var(--kd-label-secondary); margin-top:6px; }
.kd-msg-failed { border-color:var(--kd-state-error-primary); }
.kd-thread-foot { border-top:1px solid var(--kd-border-l1); padding:12px 16px; }
.kd-composer { border:1px solid var(--kd-border-l2); border-radius:12px;
  background:var(--kd-bg-base); padding:6px; transition:border-color .15s, box-shadow .15s; }
.kd-composer:focus-within { border-color:var(--kd-brand-primary);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--kd-brand-primary) 14%, transparent); }
.kd-textarea { width:100%; min-height:58px; max-height:180px; resize:vertical; padding:6px 8px;
  border:0; background:transparent; color:var(--kd-label-primary); font:inherit; font-size:13px; }
.kd-textarea:focus { outline:none; }
.kd-tabs { display:flex; gap:4px; width:fit-content; max-width:100%; min-width:0; overflow-x:auto; padding:4px; border:1px solid var(--kd-border-l1); border-radius:12px; background:var(--kd-surface); }
.kd-tab { position:relative; display:inline-flex; align-items:center; gap:6px; padding:7px 14px; white-space:nowrap;
  border:0; background:transparent; color:var(--kd-label-secondary); font:inherit; font-size:13px;
  cursor:pointer; border-radius:8px; transition:color .15s, background-color .15s; }
.kd-tab:hover { color:var(--kd-label-primary); background:var(--kd-bg-layer-2); }
.kd-tab:disabled { opacity:.5; cursor:default; background:none; transform:none; }
.kd-tab.is-active { color:var(--kd-brand-primary); font-weight:600; background:color-mix(in srgb, var(--kd-brand-primary) 10%, var(--kd-surface)); }

.kd-tab-count { min-width:17px; padding:0 5px; border-radius:999px; font-size:10.5px; line-height:17px;
  text-align:center; background:var(--kd-bg-layer-2); color:var(--kd-label-secondary); }
.kd-tab.is-active .kd-tab-count { color:var(--kd-brand-primary); }
.kd-card { border:1px solid var(--kd-border-l1); border-radius:14px;
  background:var(--kd-bg-layer-1); padding:28px; box-shadow:0 4px 24px rgb(20 45 35 / 3%); }
.kd-card + .kd-card { margin-top:14px; }
.kd-meta { display:flex; gap:8px; flex-wrap:wrap; align-items:center; font-size:12px;
  color:var(--kd-label-secondary); }
.kd-meta-dot::before { content:'·'; margin-right:8px; }
.kd-chips { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.kd-tag { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:6px;
  font-size:11.5px; line-height:1.7; white-space:nowrap;
  color:var(--kd-label-secondary); background:var(--kd-bg-layer-2); }
.kd-tag-brand { color:var(--kd-brand-primary);
  background:color-mix(in srgb, var(--kd-brand-primary) 10%, transparent); }
.kd-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:999px;
  font-size:11px; line-height:1.6; border:1px solid var(--kd-border-l2);
  color:var(--kd-label-secondary); background:var(--kd-bg-layer-1); white-space:nowrap; }
.kd-badge-ok { color:var(--kd-state-success-primary);
  border-color:color-mix(in srgb, var(--kd-state-success-primary) 34%, transparent);
  background:color-mix(in srgb, var(--kd-state-success-primary) 10%, transparent); }
.kd-badge-bad { color:var(--kd-state-error-primary);
  border-color:color-mix(in srgb, var(--kd-state-error-primary) 34%, transparent);
  background:color-mix(in srgb, var(--kd-state-error-primary) 10%, transparent); }
.kd-badge-warn { color:var(--kd-state-warn-primary);
  border-color:color-mix(in srgb, var(--kd-state-warn-primary) 34%, transparent);
  background:color-mix(in srgb, var(--kd-state-warn-primary) 12%, transparent); }
.kd-badge-brand { color:var(--kd-brand-primary);
  border-color:color-mix(in srgb, var(--kd-brand-primary) 34%, transparent);
  background:color-mix(in srgb, var(--kd-brand-primary) 10%, transparent); }
.kd-stem { margin:24px 0; font-size:16px; line-height:1.85; }
.kd-options { display:flex; flex-direction:column; gap:8px; margin:0 0 4px; }
.kd-option { display:flex; gap:12px; align-items:flex-start; padding:14px 16px; border-radius:12px;
  border:1px solid var(--kd-border-l1); background:var(--kd-bg-base); cursor:pointer;
  text-align:left; color:var(--kd-label-primary); font:inherit; font-size:14px;
  transition:background-color .15s, border-color .15s; }
.kd-option:hover:not(:disabled) { border-color:var(--kd-border-l2);
  background:var(--kd-bg-layer-2); }
.kd-option:disabled { cursor:default; }
.kd-option.is-selected { border-color:var(--kd-brand-primary);
  background:color-mix(in srgb, var(--kd-brand-primary) 7%, transparent); }
.kd-option.is-correct { border-color:color-mix(in srgb, var(--kd-state-success-primary) 45%, var(--kd-surface));
  background:color-mix(in srgb, var(--kd-state-success-primary) 8%, transparent); }
.kd-option.is-wrong { border-color:var(--kd-state-error-primary);
  background:color-mix(in srgb, var(--kd-state-error-primary) 8%, transparent); }
.kd-option-key { flex:0 0 auto; align-self:center; width:24px; height:24px; border-radius:8px; display:inline-flex;
  align-items:center; justify-content:center; font-size:12px; font-weight:600;
  border:1px solid var(--kd-border-l2); background:var(--kd-bg-base); }
.kd-option.is-selected .kd-option-key { color:var(--kd-brand-primary); border-color:var(--kd-brand-primary); }
.kd-option.is-correct .kd-option-key { color:var(--kd-state-success-primary); border-color:var(--kd-state-success-primary); }
.kd-option.is-wrong .kd-option-key { color:var(--kd-state-error-primary); border-color:var(--kd-state-error-primary); }
.kd-option-text { min-width:0; flex:1 1 auto; }
.kd-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:16px; }
.kd-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:36px;
  padding:0 14px; border-radius:8px; font-family:inherit; font-size:13px; font-weight:500; cursor:pointer;
  border:1px solid var(--kd-border-l2); background:var(--kd-bg-layer-1);
  color:var(--kd-label-primary);
  transition:background-color .15s, border-color .15s, color .15s; }
.kd-btn:hover:not(:disabled) { background:var(--kd-bg-layer-2); }
.kd-btn:disabled { opacity:.5; cursor:not-allowed; }
.kd-btn-primary { background:var(--kd-brand-primary); border-color:var(--kd-brand-primary); color:#fff; }
.kd-btn-primary:hover:not(:disabled) { background:var(--kd-brand-primary); filter:brightness(1.07); }
.kd-btn-ghost { border-color:transparent; background:transparent; color:var(--kd-label-secondary); }
.kd-btn-ghost:hover:not(:disabled) { background:var(--kd-bg-layer-2); color:var(--kd-label-primary); }
.kd-btn-danger { color:var(--kd-state-error-primary); background:transparent;
  border-color:color-mix(in srgb, var(--kd-state-error-primary) 40%, transparent); }
.kd-btn-danger:hover:not(:disabled) { background:color-mix(in srgb, var(--kd-state-error-primary) 10%, transparent); }
.kd-btn-sm { min-height:26px; padding:0 9px; font-size:12px; }
.kd-iconbtn { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px;
  border-radius:6px; border:0; background:transparent; color:var(--kd-label-secondary); cursor:pointer;
  transition:background-color .15s, color .15s; }
.kd-iconbtn:hover { background:var(--kd-bg-layer-2); color:var(--kd-label-primary); }
.kd-answer { margin-top:6px; }
.kd-answer-panel { margin-top:18px; border:1px solid var(--kd-border-l1); border-radius:14px;
  background:var(--kd-bg-layer-1); overflow:hidden; }
.kd-answer-panel-head { display:flex; align-items:center; justify-content:space-between; gap:10px;
  flex-wrap:wrap; padding:11px 18px; border-bottom:1px solid var(--kd-border-l1);
  background:color-mix(in srgb, var(--kd-brand-primary) 5%, var(--kd-surface)); font-size:13px; font-weight:600; }
.kd-answer-panel-head .kd-tag { background:var(--kd-bg-layer-1); font-weight:400; }
.kd-answer-panel-body { padding:18px; }
.kd-answer-block + .kd-answer-block { margin-top:18px; padding-top:16px;
  border-top:1px solid var(--kd-border-l1); }
.kd-answer-label { font-size:10.5px; letter-spacing:.1em; color:var(--kd-label-secondary);
  margin-bottom:6px; }
.kd-verify { margin-top:14px; padding:11px 13px; border-radius:10px; font-size:12px; line-height:1.7;
  border:1px solid var(--kd-border-l1); background:var(--kd-bg-layer-2);
  color:var(--kd-label-secondary); }
.kd-verify ul { margin:6px 0 0; padding-left:18px; }
.kd-list-row { display:flex; gap:14px; align-items:flex-start; width:100%; text-align:left;
  padding:14px 16px; border-radius:12px; border:1px solid var(--kd-border-l1);
  background:var(--kd-bg-layer-1); color:var(--kd-label-primary);
  font:inherit; transition:background-color .15s, border-color .15s; }
.kd-list-row > .kd-btn { flex:none; white-space:nowrap; }
.kd-list-row { cursor:pointer; }
.kd-list-open { flex:none; display:flex; align-items:center; gap:6px; font-size:12px; color:var(--kd-label-secondary); white-space:nowrap; }
.kd-list-row + .kd-list-row { margin-top:8px; }
.kd-list-row:hover { border-color:var(--kd-border-l2); background:var(--kd-bg-layer-2); }
.kd-list-body { min-width:0; flex:1 1 auto; }
.kd-list-summary { --kd-preview-line-height:28px; font-size:14px; line-height:var(--kd-preview-line-height); min-width:0;
  max-height:calc(2 * var(--kd-preview-line-height)); overflow:hidden; }
.kd-list-summary .kd-md { line-height:inherit; }
.kd-list-summary .kd-md > * { display:inline; }
.kd-list-summary .kd-p, .kd-list-summary .kd-h, .kd-list-summary .kd-mathblock { margin:0; }
.kd-list-summary .kd-p::after { content:' '; }
.kd-list-summary .kd-mathblock { display:inline; padding:0; text-align:left; vertical-align:baseline; }
.kd-list-summary .kd-mathblock > mjx-container[display=true] { display:inline; min-width:0; width:auto; }
.kd-list-summary .kd-code-wrap { margin:0; border:0; }
.kd-list-summary .kd-code-lang { display:none; }
.kd-list-summary .kd-code { display:inline; padding:0; line-height:inherit; white-space:pre-wrap; }
.kd-list-summary.is-truncated { mask-image:linear-gradient(#000,#000),linear-gradient(to right,#000 var(--kd-preview-fade-start),transparent var(--kd-preview-fade-end));
  mask-size:100% var(--kd-preview-fade-top),100% calc(100% - var(--kd-preview-fade-top)); mask-position:top,bottom; mask-repeat:no-repeat; }
.kd-list-meta { margin-top:7px; display:flex; gap:6px; flex-wrap:wrap; font-size:11px;
  color:var(--kd-label-secondary); align-items:center; }
.kd-empty { padding:56px 24px; text-align:center; color:var(--kd-label-secondary); }
.kd-empty-icon { width:44px; height:44px; margin:0 auto 14px; border-radius:50%; display:flex;
  align-items:center; justify-content:center; border:1px solid var(--kd-border-l1);
  background:var(--kd-bg-layer-1); color:var(--kd-label-secondary); }
.kd-empty-title { font-size:15px; font-weight:600; color:var(--kd-label-primary); margin-bottom:6px; }
.kd-empty-body { font-size:13px; max-width:460px; margin:0 auto; line-height:1.8; }
.kd-empty .kd-actions { justify-content:center; }
.kd-overlay { position:absolute; inset:0; background:rgba(0,0,0,.38); display:flex; align-items:center;
  justify-content:center; padding:24px; z-index:40; backdrop-filter:blur(2px); }
.kd-modal { width:min(580px,100%); max-height:100%; display:flex; flex-direction:column;
  background:var(--kd-bg-overlay); color:var(--kd-label-primary);
  border:1px solid var(--kd-border-l2); border-radius:16px; overflow:hidden;
  box-shadow:0 16px 48px rgba(0,0,0,.24); }
.kd-modal-wide { width:min(880px,100%); }
.kd-modal-head { padding:16px 20px; border-bottom:1px solid var(--kd-border-l1);
  display:flex; align-items:center; justify-content:space-between; gap:10px; }
.kd-modal-title { font-size:15px; font-weight:650; letter-spacing:.01em; }
.kd-modal-body { padding:18px 20px; overflow:auto; min-height:0; }
.kd-modal-foot { padding:14px 20px; border-top:1px solid var(--kd-border-l1);
  display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
.kd-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
.kd-field-label { font-size:12px; font-weight:500; color:var(--kd-label-secondary); }
.kd-input { height:34px; padding:0 11px; border-radius:8px; border:1px solid var(--kd-border-l2);
  background:var(--kd-bg-base); color:var(--kd-label-primary); font:inherit; font-size:13px;
  transition:border-color .15s, box-shadow .15s; }
.kd-input:focus { outline:none; border-color:var(--kd-brand-primary);
  box-shadow:0 0 0 3px color-mix(in srgb, var(--kd-brand-primary) 14%, transparent); }
.kd-input::placeholder { color:var(--kd-label-secondary); }
.kd-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.kd-row-between { display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
.kd-divider { height:1px; background:var(--kd-border-l1); margin:16px 0; }
.kd-preview-item { border:1px solid var(--kd-border-l1); border-radius:12px; padding:12px 14px;
  background:var(--kd-bg-base); }
.kd-preview-item + .kd-preview-item { margin-top:8px; }
.kd-warn-text { color:var(--kd-state-warn-primary); font-size:12px; line-height:1.7; }
.kd-error-text { color:var(--kd-state-error-primary); font-size:12px; line-height:1.7; }
.kd-toast { position:absolute; left:50%; bottom:24px; transform:translateX(-50%); z-index:60;
  padding:9px 18px; border-radius:999px; font-size:13px; max-width:80%;
  background:var(--kd-bg-overlay); border:1px solid var(--kd-border-l2);
  box-shadow:0 8px 24px rgba(0,0,0,.18); }
.kd-toast-bad { color:var(--kd-state-error-primary); }
.kd-toast-ok { color:var(--kd-state-success-primary); }
.kd-toast-warn { color:var(--kd-state-warn-primary); }
.kd-loading { padding:48px 0; text-align:center; color:var(--kd-label-secondary); font-size:13px; }
.kd-spinner { display:inline-block; width:14px; height:14px; border-radius:50%; vertical-align:-2px;
  border:2px solid var(--kd-border-l2); border-top-color:var(--kd-brand-primary);
  animation:kd-spin .8s linear infinite; margin-right:8px; }
@keyframes kd-spin { to { transform:rotate(360deg); } }
.kd-mobilebar { display:none; gap:8px; padding:10px 14px; border-bottom:1px solid var(--kd-border-l1);
  overflow:auto; }
.kd-mobilebar > * { flex:0 0 auto; white-space:nowrap; }
.kd-mobilebar .kd-select { max-width:180px; }
.kd-md { line-height:1.78; overflow-wrap:anywhere; }
.kd-md > *:first-child { margin-top:0; }
.kd-md > *:last-child { margin-bottom:0; }
.kd-p { margin:8px 0; }
.kd-h { margin:14px 0 8px; line-height:1.4; font-weight:650; }
.kd-h1 { font-size:17px; } .kd-h2 { font-size:16px; } .kd-h3 { font-size:15px; }
.kd-h4, .kd-h5, .kd-h6 { font-size:14px; }
.kd-list { margin:8px 0; padding-left:22px; }
.kd-list li { margin:3px 0; }
.kd-quote { margin:10px 0; padding:6px 12px; border-left:3px solid var(--kd-border-l2);
  color:var(--kd-label-secondary); }
.kd-hr { border:0; border-top:1px solid var(--kd-border-l1); margin:14px 0; }
.kd-link { color:var(--kd-brand-primary); text-decoration:underline; text-underline-offset:2px; }
.kd-inline-code { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:.9em;
  padding:1px 5px; border-radius:5px; background:var(--kd-bg-layer-2);
  border:1px solid var(--kd-border-l1); }
.kd-code-wrap { margin:10px 0; border-radius:10px; overflow:hidden; border:1px solid var(--kd-border-l1);
  background:var(--kd-bg-layer-2); }
.kd-code-lang { padding:3px 10px; font-size:11px; color:var(--kd-label-secondary);
  border-bottom:1px solid var(--kd-border-l1); }
.kd-code { margin:0; padding:10px 12px; overflow:auto; font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
  font-size:12.5px; line-height:1.6; white-space:pre; tab-size:2; }
.kd-code code { font:inherit; }
.kd-table-wrap { overflow:auto; margin:10px 0; }
.kd-table { border-collapse:collapse; font-size:13px; min-width:0; }
.kd-table th, .kd-table td { border:1px solid var(--kd-border-l1); padding:5px 10px; text-align:left; }
.kd-table th { background:var(--kd-bg-layer-2); font-weight:600; }
.kd-image { max-width:100%; height:auto; border-radius:8px; display:block; margin:8px 0; }
.kd-image-fallback { display:inline-block; font-family:ui-monospace,monospace; font-size:12px;
  color:var(--kd-state-warn-primary); border:1px dashed var(--kd-state-warn-primary);
  border-radius:6px; padding:2px 6px; }
.kd-math { display:inline; font-size:1em; }
.kd-mathblock { max-width:100%; min-width:0; margin:1em 0; overflow-x:auto; text-align:center; }
.kd-mathblock > mjx-container[display=true] { min-width:100%; width:max-content; margin:0; }
.kd-math svg, .kd-mathblock svg { max-width:none; }
.kd-math-pending { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:.9em;
  opacity:.55; white-space:pre-wrap; }
.kd-math-error { color:var(--kd-state-error-primary);
  font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:.9em; }
.kd-checkline { display:flex; gap:8px; align-items:flex-start; padding:5px 0; font-size:13px; }
.kd-chip { display:inline-flex; align-items:center; gap:2px; padding:0 2px 0 8px; border-radius:999px;
  border:1px solid var(--kd-border-l2); background:var(--kd-bg-layer-1); font-size:12px; }
.kd-chip .kd-checkline { padding:0; }
.kd-chip .kd-iconbtn { width:20px; height:20px; }
.kd-option.is-correct { border-color:#22c55e; }
.kd-option.is-wrong { border-color:#f35464; }
.kd-page input[type=checkbox] { accent-color:var(--kd-brand-primary); width:16px; height:16px; flex:none; }
.kd-btn, .kd-iconbtn, .kd-tab, .kd-nav-item, .kd-option, .kd-list-row {
  transition:background-color .16s, border-color .16s, color .16s, box-shadow .16s, transform .16s; }
.kd-btn:active:not(:disabled), .kd-iconbtn:active, .kd-tab:active, .kd-nav-item:active { transform:scale(.97); }
.kd-option:active:not(:disabled) { transform:translateY(1px); }
.kd-view { animation:kd-enter .2s ease-out; }
.kd-presence { display:contents; }
.kd-overlay { animation:kd-fade .16s ease-out; background:rgb(18 27 52 / 28%); backdrop-filter:blur(5px); }
.kd-modal { animation:kd-enter .18s ease-out; box-shadow:0 24px 80px rgb(12 25 60 / 18%); border-radius:20px; }
.kd-presence.is-leaving .kd-overlay { animation:kd-fade .16s ease-in reverse both; pointer-events:none; }
.kd-presence.is-leaving .kd-modal { animation:kd-enter .16s ease-in reverse both; }
.kd-thread { animation:kd-drawer .2s ease-out; }
.kd-presence.is-leaving .kd-thread { animation:kd-drawer .16s ease-in reverse both; pointer-events:none; }
.kd-modal-head { padding:22px 24px; }
.kd-modal-title { font-size:18px; }
.kd-modal-body { padding:20px 24px; background:color-mix(in srgb, var(--kd-brand-primary) 2%, var(--kd-surface)); }
.kd-modal-foot { padding:16px 24px; }
.kd-manage-card { padding:16px; border:1px solid var(--kd-border-l1); border-radius:14px; background:var(--kd-bg-base); margin-bottom:10px; }
.kd-manage-card.is-enabled { border-color:color-mix(in srgb, var(--kd-brand-primary) 25%, var(--kd-surface)); }
.kd-manage-card .kd-checkline { font-weight:550; }
.kd-manage-card .kd-msg-meta { font-weight:400; line-height:1.7; }
.kd-custom-subject { padding:20px; border-radius:14px; border:1px solid var(--kd-border-l1); background:var(--kd-bg-base); }
.kd-field-label { font-size:13px; }
.kd-input { height:38px; }
.kd-bulkbar { position:sticky; top:0; z-index:5; display:flex; flex-direction:column; gap:10px; padding:14px;
  margin-bottom:14px; border-radius:14px; border:1px solid color-mix(in srgb, var(--kd-brand-primary) 25%, var(--kd-surface));
  background:var(--kd-bg-base); box-shadow:0 5px 20px rgb(20 35 70 / 5%); animation:kd-enter .18s ease-out; }
.kd-list-row.is-selected { border-color:var(--kd-brand-primary); background:color-mix(in srgb, var(--kd-brand-primary) 5%, var(--kd-surface)); }
.kd-list-row input { margin-top:5px; }
@keyframes kd-fade { from { opacity:0; } to { opacity:1; } }
@keyframes kd-enter { from { opacity:0; transform:translateY(8px) scale(.99); } to { opacity:1; transform:none; } }
@keyframes kd-drawer { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:none; } }
@media (max-width: 1180px) {
  .kd-thread { position:absolute; right:0; top:0; bottom:0; width:min(370px,92vw); flex-basis:auto; z-index:30;
box-shadow:-12px 0 32px rgba(0,0,0,.22); }
  .kd-thread-resize { display:none; }
}
@media (max-width: 860px) {
  .kd-nav { display:none; }
  .kd-mobilebar { display:flex; }
  .kd-main-toolbar { padding:16px 14px; }
  .kd-main-scroll { padding:0 14px 40px; }
  .kd-header { padding:14px 14px 12px; gap:10px; }
  .kd-header-left { flex-basis:100%; }
  .kd-cd-lines { align-items:flex-start; text-align:left; }
  .kd-cd-primary { font-size:19px; }
  .kd-tabs { flex:1; }
  .kd-tab { flex:1 0 auto; justify-content:center; padding:7px 10px; }
  .kd-strip-item { white-space:normal; }
  .kd-card { padding:16px 14px; }
  .kd-answer-panel-body { padding:14px; }
  .kd-exam-strip { padding:8px 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .kd-page *, .kd-page *::before, .kd-page *::after { transition:none !important; animation:none !important; }
}

`
