export const CSS = `
@font-face {
  font-family:"DQ HarmonyOS Sans SC";
  src:url("/api/daily-question/vendor/harmonyos-sans-sc-regular-v1.ttf") format("truetype");
  font-style:normal; font-weight:400; font-display:swap;
}
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
  --kd-question-font:"Times New Roman", SimSun, "宋体", "Songti SC", "Noto Serif CJK SC", serif;
  --kd-motion-out:cubic-bezier(.2,.75,.25,1);
  --kd-motion-in:cubic-bezier(.45,0,.8,.45);
  --kd-glass:color-mix(in srgb,var(--kd-surface) 88%,transparent);
  --kd-glass-edge:color-mix(in srgb,var(--kd-surface) 64%,transparent);
  --kd-ink:var(--kd-label-primary); --kd-surface:var(--kd-bg-base);
  font-family:"DQ HarmonyOS Sans SC", "HarmonyOS Sans SC", system-ui, sans-serif;
  isolation:isolate; height:100%; min-height:0; display:flex; flex-direction:column; position:relative;
  background:color-mix(in srgb, var(--kd-brand-primary) 2%, var(--kd-surface)); color: var(--kd-label-primary);
  font-size:14px; line-height:1.65; -webkit-font-smoothing:antialiased; box-sizing:border-box; }
.kd-page *, .kd-page *::before, .kd-page *::after { box-sizing:border-box; }
.kd-page :where(button,input,select,textarea) { font-family:inherit; }
.kd-page :focus-visible { outline:2px solid var(--kd-brand-primary); outline-offset:2px; }
.kd-practice-screen { display:flex; flex:1; min-height:0; flex-direction:column; }
.kd-fullscreen { position:absolute; inset:0; z-index:65; display:flex; flex-direction:column;
  background:color-mix(in srgb, var(--kd-brand-primary) 3%, var(--kd-surface)); animation:kd-enter .2s ease-out; }
.kd-settings-screen { z-index:40; }
.kd-stats-header { flex:none; display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:18px clamp(14px,4vw,42px); background:var(--kd-surface); border-bottom:1px solid var(--kd-border-l1); }
.kd-stats-heading { display:flex; align-items:center; gap:12px; }
.kd-stats-heading h1 { margin:0; font-size:20px; }
.kd-stats-heading .kd-iconbtn { width:34px; height:34px; border:1px solid var(--kd-border-l2); }
.kd-stats-scroll { flex:1; min-height:0; overflow:auto; }
.kd-stats-content, .kd-settings-layout { display:grid; gap:16px; width:100%; max-width:1200px;
  margin:0 auto; padding:24px clamp(14px,4vw,42px) 40px; }
.kd-stats-metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(185px,100%),1fr)); gap:12px; }
.kd-stats-card { min-width:0; padding:18px; border:1px solid var(--kd-border-l1); border-radius:14px; background:var(--kd-surface); }
.kd-stats-card h2 { margin:0; font-size:15px; }
.kd-stats-metric h2 { color:var(--kd-label-secondary); font-size:13px; }
.kd-stats-metric strong { display:block; margin-top:6px; color:var(--kd-brand-primary);
  font-size:clamp(23px,3vw,32px); line-height:1.25; font-variant-numeric:tabular-nums; }
.kd-stats-metric p { margin:6px 0 0; }
.kd-stats-section-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 18px; }
.kd-stats-legend { display:flex; flex-wrap:wrap; gap:12px; color:var(--kd-label-secondary); font-size:12px; }
.kd-stats-legend span { display:inline-flex; align-items:center; gap:5px; }
.kd-stats-legend span::before { content:''; width:8px; height:8px; border-radius:50%; background:var(--kd-series); }
.kd-stats-legend .is-correct, .kd-stats-bar .is-correct { --kd-series:var(--kd-state-success-primary); }
.kd-stats-legend .is-wrong, .kd-stats-bar .is-wrong { --kd-series:var(--kd-state-error-primary); }
.kd-stats-legend .is-pending, .kd-stats-bar .is-pending { --kd-series:var(--kd-state-idle-primary); }
.kd-stats-chart { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:4px; list-style:none; margin:16px 0 0; padding:0; }
.kd-stats-chart li { min-width:0; text-align:center; color:var(--kd-label-secondary); font-size:11px; }
.kd-stats-bar-area { --kd-plot-height:134px; height:var(--kd-plot-height); display:flex; flex-direction:column; align-items:center;
  justify-content:flex-end; border-bottom:1px solid var(--kd-border-l1); }
.kd-stats-bar-value { color:var(--kd-label-primary); font-variant-numeric:tabular-nums; }
.kd-stats-bar { width:min(54%,34px); height:calc((var(--kd-plot-height) - 20px) * var(--kd-bar-share));
  display:flex; flex-direction:column-reverse; overflow:hidden; border-radius:5px 5px 0 0; }
.kd-stats-bar > span { background:var(--kd-series); }
.kd-stats-day { display:block; margin-top:6px; white-space:nowrap; }
.kd-stats-table-wrap { overflow:auto; margin-top:12px; }
.kd-stats-table { width:100%; border-collapse:collapse; white-space:nowrap; font-variant-numeric:tabular-nums; }
.kd-stats-table th, .kd-stats-table td { text-align:right; padding:9px 12px; border-bottom:1px solid var(--kd-border-l1); }
.kd-stats-table thead { color:var(--kd-label-secondary); font-size:12px; }
.kd-stats-table th:first-child { text-align:left; padding-inline-start:0; }
.kd-stats-table tbody th { white-space:normal; min-width:100px; }
.kd-stats-table small { margin-inline-start:8px; color:var(--kd-label-secondary); font-weight:400; }
.kd-stats-table tbody tr:last-child > * { border-bottom:0; }
.kd-memory-settings label { display:flex; align-items:center; gap:8px; }
.kd-memory-settings label { margin-top:12px; }
.kd-memory-settings input { accent-color:var(--kd-brand-primary); }
.kd-memory-subject-card > h2 { font-size:17px; overflow-wrap:anywhere; }
.kd-memory-panel { border-top:1px solid var(--kd-border-l1); margin-top:12px; padding-top:12px; }
.kd-memory-panel h3 { margin:0; font-size:14px; }
.kd-memory-topic { padding:12px 0; border-top:1px solid var(--kd-border-l1); }
.kd-memory-topic summary { cursor:pointer; overflow-wrap:anywhere; }
.kd-memory-topic summary > span { margin-inline-start:12px; }
.kd-memory-topic textarea { box-sizing:border-box; min-height:84px; margin-bottom:8px; }
.kd-memory-analysis { overflow-wrap:anywhere; }
.kd-memory-filter { margin-bottom:12px; }
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
.kd-select.is-placeholder { color:var(--kd-label-secondary); }
.kd-select.is-placeholder option:not(:disabled) { color:var(--kd-label-primary); }
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
.kd-main { flex:1 1 auto; min-width:0; overflow:hidden; display:flex; flex-direction:column; }
.kd-main-toolbar { --kd-toolbar-control-height:36px; flex:none; padding:12px 28px 10px; display:flex; align-items:center; flex-wrap:wrap; gap:8px 12px; }
.kd-daily-schedule { margin-inline-start:auto; align-self:stretch; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
.kd-daily-schedule > .kd-btn { min-height:var(--kd-toolbar-control-height); border-radius:12px; }
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
.kd-tabs { display:flex; width:fit-content; max-width:100%; min-width:0; height:var(--kd-toolbar-control-height);
  overflow:hidden; border:1px solid var(--kd-border-l1); border-radius:12px; background:var(--kd-surface);
  box-shadow:0 2px 7px rgb(18 27 52 / 4%); }
.kd-tab-strip { display:flex; gap:4px; min-width:0; padding:3px 4px; overflow-x:auto; scrollbar-width:none; }
.kd-tab-return { --kd-tab-return-size:calc(var(--kd-toolbar-control-height) - 2px); flex:none; width:0; overflow:hidden;
  transition:width .22s var(--kd-motion-out); }
.kd-tab-return.is-open { width:var(--kd-tab-return-size); }
.kd-tab-return-button { display:grid; place-items:center; width:var(--kd-tab-return-size); height:100%;
  padding:0; border:0; border-inline-start:1px solid var(--kd-border-l1);
  color:var(--kd-label-primary); background:transparent; cursor:pointer;
  transform:translateX(-100%); transition:transform .22s var(--kd-motion-out), background-color .15s; }
.kd-tab-return.is-open .kd-tab-return-button { transform:none; }
.kd-tab-return-button:hover:not(:disabled) { background:var(--kd-bg-layer-2); }
.kd-tab-return-button:focus-visible { outline-offset:-3px; }
.kd-tab { position:relative; display:inline-flex; align-items:center; gap:6px; padding:3px 14px; white-space:nowrap;
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
.kd-stem, .kd-option-key, .kd-option-text, .kd-list-summary, .kd-bank-preview-stem, .kd-answer-copy {
  font-family:var(--kd-question-font);
}
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
.kd-overlay { position:absolute; inset:0; background:rgb(18 27 52 / 24%); display:flex; align-items:center;
  justify-content:center; padding:24px; z-index:40; }
.kd-modal { position:relative; width:min(580px,100%); max-height:100%; display:flex; flex-direction:column;
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
.kd-pdf-preview { display:grid; gap:10px; }
.kd-pdf-preview summary, .kd-manage-section details summary, .kd-bank-preview-stem summary {
  padding-block:7px; cursor:pointer; font-weight:550; overflow-wrap:anywhere; }
.kd-import-text { margin:0; max-height:320px; overflow:auto; padding:12px; border:1px solid var(--kd-border-l2);
  border-radius:8px; background:var(--kd-bg-layer-1); white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; }
.kd-warn-text { color:var(--kd-state-warn-primary); font-size:12px; line-height:1.7; }
.kd-error-text { color:var(--kd-state-error-primary); font-size:12px; line-height:1.7; }
.kd-notification-slot { flex:none; overflow:hidden; }
.kd-notification-slot.is-floating { position:absolute; inset-inline:0; bottom:0; z-index:60; pointer-events:none; }
.kd-notification { --kd-notification-color:var(--kd-state-success-primary); display:flex; align-items:center;
  justify-content:space-between; gap:12px; padding:6px 16px; min-height:42px; pointer-events:auto;
  color:var(--kd-notification-color); background:color-mix(in srgb, var(--kd-notification-color) 10%, var(--kd-bg-overlay));
  border-top:1px solid color-mix(in srgb, var(--kd-notification-color) 32%, var(--kd-bg-overlay));
  font-size:13px; animation:kd-notification-slide .18s var(--kd-motion-out) both; }
.kd-notification-bad { --kd-notification-color:var(--kd-state-error-primary); }
.kd-notification-warn { --kd-notification-color:var(--kd-state-warn-primary); }
.kd-notification > span { min-width:0; overflow-wrap:anywhere; }
.kd-notification > .kd-iconbtn { flex:none; color:inherit; margin-bottom:2px; }
.kd-notification > .kd-btn { flex:none; color:inherit; }
.kd-notification.is-leaving { pointer-events:none; animation:kd-notification-slide-out .18s var(--kd-motion-in) both; }
@keyframes kd-notification-slide { from { transform:translateY(100%); } to { transform:translateY(0); } }
@keyframes kd-notification-slide-out { from { transform:translateY(0); } to { transform:translateY(100%); } }
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
:is(.kd-stem, .kd-option-text, .kd-list-summary, .kd-bank-preview-stem, .kd-answer-copy) :is(.kd-inline-code, .kd-code) {
  font-family:inherit;
}
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
.kd-btn, .kd-iconbtn, .kd-tab, .kd-nav-item, .kd-option, .kd-list-row, .kd-settings-option {
  transition:background-color .16s, border-color .16s, color .16s, box-shadow .18s,
    transform .18s var(--kd-motion-out); }
.kd-btn:active:not(:disabled), .kd-iconbtn:active:not(:disabled), .kd-tab:active:not(:disabled) { transform:scale(.97); }
.kd-option:active:not(:disabled), .kd-nav-item:active, .kd-settings-option:active:not(:disabled) {
  transform:translateY(1px); transition-duration:.08s; }
@media (hover:hover) and (pointer:fine) {
  .kd-list-row:hover, .kd-option:hover:not(:disabled) { box-shadow:0 3px 12px rgb(20 33 70 / 6%); }
}
.kd-view { animation:kd-content-in .18s var(--kd-motion-out) both; }
.kd-presence { display:contents; }
.kd-overlay { animation:kd-fade .16s var(--kd-motion-out); }
.kd-modal { animation:kd-enter .22s var(--kd-motion-out); border-radius:20px;
  box-shadow:inset 0 1px var(--kd-glass-edge), 0 22px 65px rgb(12 25 60 / 20%), 0 4px 14px rgb(12 25 60 / 7%); }
.kd-presence.is-leaving .kd-overlay { animation:kd-fade-out .16s var(--kd-motion-in) both; pointer-events:none; }
.kd-presence.is-leaving .kd-modal { animation:kd-modal-out .16s var(--kd-motion-in) both; }
.kd-presence.is-leaving .kd-fullscreen { animation:kd-fade-out .16s var(--kd-motion-in) both; pointer-events:none; }
.kd-thread { animation:kd-drawer .22s var(--kd-motion-out); }
.kd-presence.is-leaving .kd-thread { animation:kd-drawer-out .16s var(--kd-motion-in) both; pointer-events:none; }
.kd-modal-head { padding:22px 24px; }
.kd-modal-title { font-size:18px; }
.kd-modal-body { padding:20px 24px; background:color-mix(in srgb, var(--kd-brand-primary) 2%, var(--kd-surface)); }
.kd-modal-foot { padding:16px 24px; }
.kd-settings-layout { flex:1; min-width:0; min-height:0; grid-template-columns:164px minmax(0,1fr); }
.kd-settings-nav { display:flex; flex-direction:column; gap:4px; min-height:0; overflow:auto;
  padding:14px 10px; border:1px solid var(--kd-border-l1); border-radius:14px; background:var(--kd-surface); }
.kd-settings-option { flex:none; display:flex; align-items:center; gap:9px; width:100%; min-height:38px;
  border:0; border-radius:8px; padding:7px 10px; background:transparent; color:var(--kd-label-secondary);
  font:inherit; text-align:left; white-space:nowrap; cursor:pointer; }
.kd-settings-option svg { flex:none; }
.kd-settings-option:hover:not(:disabled) { background:var(--kd-bg-layer-2); color:var(--kd-label-primary); }
.kd-settings-option[aria-current="page"] { background:color-mix(in srgb, var(--kd-brand-primary) 10%, var(--kd-surface));
  color:var(--kd-brand-primary); font-weight:650; }
.kd-settings-option:focus-visible { outline:2px solid var(--kd-brand-primary); outline-offset:-2px; }
.kd-settings-option:disabled { opacity:.55; cursor:default; }
.kd-settings-content, .kd-settings-section { min-width:0; min-height:0; display:flex; flex-direction:column; }
.kd-settings-content { border:1px solid var(--kd-border-l1); border-radius:14px; background:var(--kd-surface); }
.kd-settings-section { flex:1; }
.kd-settings-section > .kd-modal-head, .kd-settings-section > .kd-modal-body {
  animation:kd-content-in .18s var(--kd-motion-out) both;
}
.kd-settings-section > .kd-modal-head, .kd-settings-section > .kd-modal-foot { flex:none; }
.kd-settings-section > .kd-modal-head { padding-block:14px; flex-wrap:wrap; }
.kd-settings-section > .kd-modal-head .kd-modal-title { margin:0; font-size:16px; overflow-wrap:anywhere; }
.kd-settings-header-actions { margin-inline-start:auto; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
.kd-settings-header-actions .kd-btn:disabled { background:var(--kd-bg-layer-2); color:var(--kd-label-secondary); border-color:var(--kd-border-l2); }
.kd-settings-section > .kd-modal-body { flex:1; background:transparent; }
.kd-manage-fields { max-width:680px; }
.kd-paper-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(158px,100%),1fr)); gap:10px 12px; }
.kd-manage-fields .kd-field, .kd-manage-subject-options .kd-field { margin:0; }
.kd-manage-fields .kd-input, .kd-manage-fields .kd-select, .kd-custom-subject .kd-select {
  width:100%; min-width:0; min-height:38px; }
.kd-about { display:grid; gap:18px; align-content:start; justify-items:start; }
.kd-about-brand { display:flex; align-items:flex-start; gap:12px; }
.kd-about-brand svg { flex:none; }
.kd-about-brand h3 { margin:0 0 4px; font-size:16px; }
.kd-about-brand p { margin:0; color:var(--kd-label-secondary); line-height:1.65; }
.kd-about-github { text-decoration:none; }
.kd-update { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px 24px;
  width:min(100%,640px); padding:14px 16px; border:1px solid var(--kd-border-l1); border-radius:12px; background:var(--kd-bg-base); }
.kd-update-info { min-width:0; overflow-wrap:anywhere; }
.kd-update-version { font-size:16px; }
.kd-update-version strong { font-weight:650; font-variant-numeric:tabular-nums; }
.kd-update-status { font-size:14px; color:var(--kd-label-secondary); }
.kd-backup-layout { display:grid; gap:16px; }
.kd-backup-actions { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr)); gap:16px; }
.kd-backup-card { min-width:0; padding:18px; border:1px solid var(--kd-border-l1); border-radius:14px;
  background:var(--kd-bg-base); }
.kd-backup-card h3 { margin:0; font-size:15px; }
.kd-backup-card p { margin:4px 0 0; }
.kd-backup-actions .kd-backup-card { display:flex; flex-direction:column; align-items:flex-start; }
.kd-backup-actions .kd-backup-card > .kd-meta { flex:1; }
.kd-backup-actions .kd-btn { margin-top:14px; }
.kd-backup-recovery .kd-backup-empty, .kd-recovery-list { margin:14px 0 0; padding:12px; border-radius:10px; background:var(--kd-bg-layer-2); }
.kd-recovery-list { list-style:none; padding:0 12px; }
.kd-recovery-list li { padding:12px 0; }
.kd-recovery-list li + li { border-top:1px solid var(--kd-border-l1); }
.kd-recovery-list strong, .kd-backup-confirm strong { font-weight:600; }
.kd-backup-confirm { overflow-wrap:anywhere; }
.kd-manage-stack { display:grid; gap:16px; min-width:0; }
.kd-manage-fieldset { border:0; padding:0; margin:0; }
.kd-manage-section { min-width:0; padding:clamp(12px,2.2vw,20px); border:1px solid var(--kd-border-l1);
  border-radius:14px; background:var(--kd-surface); }
.kd-manage-section-head { margin-bottom:12px; }
.kd-manage-section-head h3 { margin:0; font-size:15px; }
.kd-manage-section-head p { margin:4px 0 0; }
.kd-manage-section > .kd-actions { margin-top:12px; }
.kd-manage-section > .kd-empty { padding:22px 12px; }
.kd-manage-card { padding:12px 14px; border:1px solid var(--kd-border-l1); border-radius:10px; background:var(--kd-bg-base); }
.kd-manage-card + .kd-manage-card { margin-top:8px; }
.kd-manage-card.is-enabled { border-color:color-mix(in srgb,var(--kd-brand-primary) 28%,var(--kd-border-l1)); }
.kd-manage-file { display:flex; align-items:center; flex-wrap:wrap; gap:10px 12px; }
.kd-manage-file-icon { display:grid; place-items:center; flex:none; width:36px; height:36px; border-radius:9px;
  color:var(--kd-brand-primary); background:color-mix(in srgb,var(--kd-brand-primary) 9%,var(--kd-surface)); }
.kd-manage-file-info { min-width:0; flex:1 1 140px; overflow-wrap:anywhere; }
.kd-manage-file-info strong { display:block; }
.kd-manage-badges { margin-top:5px; gap:5px; }
.kd-manage-subject-head { align-items:flex-start; }
.kd-manage-subject-label { flex:1 1 160px; min-width:0; padding:0; cursor:pointer; overflow-wrap:anywhere; }
.kd-manage-subject-code { margin-inline-start:8px; font-size:12px; color:var(--kd-label-secondary); }
.kd-manage-types { display:block; margin-top:3px; }
.kd-manage-subject-options { display:grid; gap:8px; margin-top:10px; padding-top:10px; border-top:1px solid var(--kd-border-l1); }
.kd-manage-subject .kd-select, .kd-pdf-preview .kd-select { max-width:100%; min-height:34px; }
.kd-manage-types-options .kd-checkline { padding:5px 9px; border:1px solid var(--kd-border-l1);
  border-radius:8px; background:var(--kd-bg-layer-1); }
.kd-custom-subject { margin:0; gap:8px; }
.kd-custom-subject .kd-field { margin:0; }
.kd-custom-subject-actions { margin-top:8px; }
.kd-manage-empty { margin:0; padding:14px; border:1px dashed var(--kd-border-l2); border-radius:10px; color:var(--kd-label-secondary); }
.kd-manage-feedback { padding:9px 12px; border:1px solid var(--kd-border-l1); border-radius:9px;
  margin:10px 0 0; font-size:13px; color:var(--kd-label-secondary); background:var(--kd-bg-layer-1); overflow-wrap:anywhere; }
.kd-manage-stack > .kd-manage-feedback, .kd-pdf-preview > .kd-manage-feedback { margin:0; }
.kd-manage-feedback:is(ul) { padding-inline-start:30px; }
.kd-manage-feedback.is-error { color:var(--kd-state-error-primary); border-color:currentColor; }
.kd-manage-feedback.is-warning { color:var(--kd-state-warn-primary); }
.kd-manage-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
.kd-manage-metrics > div { display:grid; padding:8px 10px; border-radius:10px; border:1px solid var(--kd-border-l1);
  color:var(--kd-label-secondary); font-size:12px; }
.kd-manage-metrics strong { font-size:19px; color:var(--kd-label-primary); font-variant-numeric:tabular-nums; }
.kd-field-label { font-size:13px; }
.kd-input { height:38px; }
.kd-outline-input { box-sizing:border-box; width:100%; height:auto; padding:8px 11px; line-height:1.6; resize:vertical; }
.kd-reference-name { flex:1 1 15rem; min-width:0; }
.kd-bulkbar { position:sticky; top:0; z-index:5; display:flex; flex-direction:column; gap:10px; padding:14px;
  margin-bottom:14px; border-radius:14px; border:1px solid color-mix(in srgb, var(--kd-brand-primary) 25%, var(--kd-surface));
  background:var(--kd-bg-base); box-shadow:0 5px 20px rgb(20 35 70 / 5%); animation:kd-enter .18s ease-out; }
.kd-list-row.is-selected { border-color:var(--kd-brand-primary); background:color-mix(in srgb, var(--kd-brand-primary) 5%, var(--kd-surface)); }
.kd-list-row input { margin-top:5px; }
@keyframes kd-fade { from { opacity:0; } to { opacity:1; } }
@keyframes kd-fade-out { to { opacity:0; } }
@keyframes kd-enter { from { opacity:0; transform:translateY(8px) scale(.99); } to { opacity:1; transform:none; } }
@keyframes kd-content-in { from { opacity:.55; transform:translateY(4px); } to { opacity:1; transform:none; } }
@keyframes kd-modal-out { to { opacity:0; transform:translateY(6px) scale(.99); } }
@keyframes kd-drawer { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:none; } }
@keyframes kd-drawer-out { to { opacity:0; transform:translateX(16px); } }
@supports (backdrop-filter:blur(1px)) {
  .kd-modal { background:var(--kd-glass); backdrop-filter:blur(20px) saturate(1.2); }
  .kd-modal-body { background:color-mix(in srgb,var(--kd-surface) 82%,transparent); }
  .kd-notification-slot.is-floating .kd-notification {
    background:color-mix(in srgb,var(--kd-notification-color) 8%,var(--kd-glass));
    backdrop-filter:blur(14px) saturate(1.15);
  }
}
@media (max-width: 1180px) {
  .kd-thread { position:absolute; right:0; top:0; bottom:0; width:min(370px,92vw); flex-basis:auto; z-index:30;
    box-shadow:-12px 0 32px rgb(18 27 52 / 17%); }
  @supports (backdrop-filter:blur(1px)) {
    .kd-thread { background:var(--kd-glass); backdrop-filter:blur(18px) saturate(1.15); }
  }
  .kd-thread-resize { display:none; }
}
@media (max-width: 860px) {
  .kd-nav { display:none; }
  .kd-mobilebar { display:flex; }
  .kd-main-toolbar { padding:10px 14px 8px; }
  .kd-main-scroll { padding:0 14px 40px; }
  .kd-header { padding:14px 14px 12px; gap:10px; }
  .kd-header-left { flex-basis:100%; }
  .kd-cd-lines { align-items:flex-start; text-align:left; }
  .kd-cd-primary { font-size:19px; }
  .kd-tabs, .kd-tab-strip { flex:1; }
  .kd-tab { flex:1 0 auto; justify-content:center; padding-inline:10px; }
  .kd-strip-item { white-space:normal; }
  .kd-card { padding:16px 14px; }
  .kd-answer-panel-body { padding:14px; }
  .kd-exam-strip { padding:8px 10px; }
  .kd-settings-layout { grid-template-columns:112px minmax(0,1fr); gap:8px; padding-block:12px; }
  .kd-settings-nav { padding:10px 5px; }
  .kd-settings-option { padding-inline:6px; gap:4px; font-size:12px; }
  .kd-settings-section > .kd-modal-head,
  .kd-settings-section > .kd-modal-body, .kd-settings-section > .kd-modal-foot { padding:12px; }
}
@media (prefers-reduced-motion: reduce) {
  .kd-page *, .kd-page *::before, .kd-page *::after { transition:none !important; animation:none !important; }
  .kd-notification.is-leaving, .kd-presence.is-leaving .kd-fullscreen { visibility:hidden; }
}

`
