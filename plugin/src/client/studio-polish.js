// 墨扉工作台的局部皮肤。
// 所有令牌都挂在 mf-* 容器上，不修改 DSH 宿主的全局主题或布局。
export const STUDIO_POLISH_CSS = `
.mf-bubble-panel,
.mf-panel,
.mf-panel.mf-view,
.mf-settings,
.mf-models-panel,
.mf-import-card,
.mf-palette,
.mf-onboard-card {
  --mf-bg: #171a19;
  --mf-layer: #1d2220;
  --mf-layer-2: #252c28;
  --mf-editor: #1b1e1c;
  --mf-text: #e5e9e3;
  --mf-text-2: #a8b2aa;
  --mf-text-3: #7f8c83;
  --mf-line: rgba(231, 237, 230, .095);
  --mf-line-strong: rgba(231, 237, 230, .16);
  --mf-accent: #6f9b89;
  --mf-accent-strong: #87b5a0;
  --mf-accent-soft: rgba(111, 155, 137, .17);
  --mf-danger: #c47d73;
  --mf-warn: #d4ad74;
  --dsw-alias-bg-base: var(--mf-bg);
  --dsw-alias-bg-layer-1: var(--mf-layer);
  --dsw-alias-bg-layer-2: var(--mf-layer-2);
  --dsw-alias-bg-elevated: #222925;
  --dsw-alias-bg-overlay: #2b342e;
  --dsw-alias-label-primary: var(--mf-text);
  --dsw-alias-label-secondary: var(--mf-text-2);
  --dsw-alias-label-tertiary: var(--mf-text-3);
  --dsw-alias-border-l1: var(--mf-line);
  --dsw-alias-border-l2: var(--mf-line-strong);
  --dsw-alias-interactive-bg-hover: rgba(218, 232, 222, .075);
  --dsw-alias-state-business-primary: var(--mf-accent);
  --dsw-alias-state-business-tertiary: var(--mf-accent-soft);
  --dsw-alias-state-success-primary: #83b39b;
  --dsw-alias-state-warn-primary: var(--mf-warn);
  --dsw-alias-state-warning-primary: var(--mf-warn);
  --dsw-alias-state-error-primary: var(--mf-danger);
  --dsw-specific-bubble: #2b3932;
  --dsw-specific-bubble-highlight: var(--mf-accent-soft);
  --dsw-specific-input-major: #232b26;
  --dsw-shadow-lv2: 0 14px 38px rgba(3, 8, 6, .34);
}

/* The injected workbench gets a clear edge, while the DSH shell remains untouched. */
.mf-bubble-panel {
  background: var(--mf-bg) !important;
  border-right-color: var(--mf-line-strong) !important;
  box-shadow: 18px 0 48px rgba(3, 8, 6, .28) !important;
}

.mf-panel.mf-view {
  color: var(--mf-text);
  background: var(--mf-bg) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.mf-panel.mf-view .mf-head {
  height: 58px;
  padding: 0 18px;
  background: #202724 !important;
  border-bottom-color: var(--mf-line-strong) !important;
  box-shadow: 0 1px 0 rgba(255, 255, 255, .025);
}

.mf-panel.mf-view .mf-head-main {
  gap: 9px;
}

.mf-panel.mf-view .mf-head-mark {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border: 1px solid rgba(135, 181, 160, .62);
  color: #dcebe1;
  font: 600 14px/1 ui-serif, Georgia, serif;
  letter-spacing: 0;
}

.mf-panel.mf-view .mf-head-copy {
  display: grid;
  min-width: max-content;
  gap: 1px;
}

.mf-panel.mf-view .mf-head-copy strong {
  color: #f0f3ed;
  font: 650 14px/1.15 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: .04em;
}

.mf-panel.mf-view .mf-head-copy small {
  color: var(--mf-text-3);
  font-size: 10px;
  line-height: 1.15;
}

.mf-panel.mf-view .mf-head-context {
  max-width: min(300px, 28vw);
  color: #aebbb2;
}

.mf-panel.mf-view .mf-head-context::before {
  margin-right: 7px;
  color: var(--mf-accent-strong);
  content: "·";
}

.mf-panel.mf-view .mf-head-actions {
  gap: 3px;
}

.mf-panel.mf-view .mf-head-actions .mf-btn {
  min-height: 31px;
  border-color: var(--mf-line-strong);
  border-radius: 4px;
  background: transparent;
  color: var(--mf-text-2);
  font-size: 12px;
}

.mf-panel.mf-view .mf-head-actions .mf-btn:hover {
  border-color: rgba(135, 181, 160, .38);
  background: rgba(135, 181, 160, .09);
  color: var(--mf-text);
}

.mf-panel.mf-view .mf-head-actions .mf-primary {
  border-color: transparent;
  background: var(--mf-accent);
  color: #f3f7f2;
  box-shadow: 0 5px 15px rgba(60, 112, 93, .2);
}

.mf-panel.mf-view .mf-head-actions .mf-primary:hover {
  background: var(--mf-accent-strong);
}

.mf-panel.mf-view .mf-action-icon {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  color: #aebbb2;
}

.mf-panel.mf-view .mf-action-icon:hover {
  background: rgba(135, 181, 160, .1);
  color: #eef4ee;
}

.mf-panel.mf-view .mf-body {
  background: var(--mf-bg) !important;
}

.mf-panel.mf-view .mf-col {
  background: var(--mf-layer) !important;
  border-right-color: var(--mf-line-strong) !important;
}

.mf-panel.mf-view .mf-sh,
.mf-panel.mf-view .mf-eh {
  height: 50px;
  padding: 0 16px;
  background: #202623;
  border-bottom-color: var(--mf-line-strong) !important;
  color: #e3e9e2;
  font-size: 12px;
  letter-spacing: .015em;
}

.mf-panel.mf-view .mf-sh .mf-btn,
.mf-panel.mf-view .mf-eh .mf-btn {
  min-height: 28px;
  border-color: var(--mf-line-strong);
  border-radius: 4px;
  background: transparent;
  color: var(--mf-text-2);
}

.mf-panel.mf-view .mf-sh .mf-btn:hover,
.mf-panel.mf-view .mf-eh .mf-btn:hover {
  background: rgba(135, 181, 160, .09);
  color: var(--mf-text);
}

.mf-panel.mf-view .mf-list {
  padding: 10px 10px 16px;
  background: var(--mf-layer);
}

.mf-panel.mf-view .mf-item {
  min-height: 34px;
  margin: 1px 0;
  padding: 8px 10px;
  border-left: 2px solid transparent;
  border-radius: 3px;
  color: #b7c2ba;
}

.mf-panel.mf-view .mf-item:hover {
  background: rgba(218, 232, 222, .065);
  color: #eef3ed;
}

.mf-panel.mf-view .mf-item.on {
  border-left-color: var(--mf-accent-strong);
  background: var(--mf-accent-soft);
  color: #f0f5ef;
  font-weight: 650;
}

.mf-panel.mf-view .mf-item small,
.mf-panel.mf-view .mf-vol small,
.mf-panel.mf-view .mf-proj-meta {
  color: var(--mf-text-3);
}

.mf-panel.mf-view .mf-vol {
  padding: 12px 10px 4px;
  color: #9eaea4;
  font-size: 11px;
  letter-spacing: .04em;
}

.mf-panel.mf-view .mf-vol-children {
  border-left-color: rgba(135, 181, 160, .18);
}

.mf-panel.mf-view .mf-proj {
  border-left: 2px solid transparent !important;
  border-radius: 3px !important;
}

.mf-panel.mf-view .mf-proj.active {
  border-left-color: var(--mf-accent-strong) !important;
  border-color: transparent;
  background: var(--mf-accent-soft) !important;
}

.mf-panel.mf-view .mf-proj-name {
  color: #e3ebe4;
  font-size: 13px;
  letter-spacing: .01em;
}

.mf-panel.mf-view .mf-minis .mf-mini {
  min-width: 25px;
  height: 23px;
  border-color: transparent;
  border-radius: 3px;
  color: #92a198;
}

.mf-panel.mf-view .mf-minis .mf-mini:hover {
  border-color: var(--mf-line-strong);
  background: rgba(135, 181, 160, .1);
  color: #edf4ee;
}

.mf-panel.mf-view .mf-mininav {
  padding: 8px 10px 9px;
  background: #202623;
  border-top-color: var(--mf-line-strong);
}

.mf-panel.mf-view .mf-mininav button {
  min-height: 36px;
  border-radius: 3px;
  color: #8e9d94;
  font-size: 9.5px;
}

.mf-panel.mf-view .mf-mininav button:hover {
  background: rgba(135, 181, 160, .08);
  color: #e6eee7;
}

.mf-panel.mf-view .mf-mininav button.on {
  color: var(--mf-accent-strong);
  background: rgba(111, 155, 137, .1);
}

.mf-panel.mf-view .mf-editor {
  background: var(--mf-editor) !important;
}

.mf-panel.mf-view .mf-editor-pane {
  background: var(--mf-editor);
}

.mf-panel.mf-view .mf-title-input {
  padding: 20px 28px 13px;
  border-bottom-color: var(--mf-line-strong);
  background: var(--mf-editor);
  color: #edf1eb;
  font: 600 20px/1.35 ui-serif, Georgia, "Songti SC", serif;
  letter-spacing: .02em;
  caret-color: var(--mf-accent-strong);
}

.mf-panel.mf-view .mf-text {
  padding: 28px clamp(28px, 7vw, 94px) 48px;
  background: var(--mf-editor);
  color: #dfe5df;
  font: 16px/1.95 ui-serif, Georgia, "Songti SC", serif;
  letter-spacing: .012em;
  caret-color: var(--mf-accent-strong);
}

.mf-panel.mf-view .mf-text::selection,
.mf-panel.mf-view .mf-title-input::selection {
  background: rgba(111, 155, 137, .34);
}

.mf-panel.mf-view .mf-editor .mf-empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  padding: 36px 28px;
  color: #89978d;
  line-height: 1.8;
  text-align: center;
}

.mf-panel.mf-view .mf-editor .mf-empty::before {
  width: 34px;
  height: 1px;
  margin: 0 auto 12px;
  background: var(--mf-accent);
  content: "";
}

.mf-panel.mf-view .mf-foot {
  background: #171b19;
  border-top-color: var(--mf-line-strong);
  color: #89978e;
}

.mf-panel.mf-view .mf-status.unsaved { color: var(--mf-warn); }
.mf-panel.mf-view .mf-status.saving { color: var(--mf-accent-strong); }
.mf-panel.mf-view .mf-status.error { color: var(--mf-danger); }
.mf-panel.mf-view .mf-context-status { color: #91a69a; }

.mf-panel.mf-view .mf-alert {
  border-bottom-color: rgba(196, 125, 115, .26);
  background: rgba(196, 125, 115, .09);
  color: #e2a39a;
}

/* The collapsed entry is a quiet return point, not a second primary CTA. */
.mf-orb {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(135, 181, 160, .38);
  border-radius: 8px;
  background: #273730 !important;
  color: #d8e9dd;
  font-size: 14px;
  box-shadow: 0 8px 22px rgba(3, 8, 6, .35);
}

.mf-orb:hover {
  background: #385448 !important;
  transform: translateY(-1px);
}

.mf-settings-overlay,
.mf-models-overlay,
.mf-import,
.mf-onboard {
  background: rgba(7, 11, 9, .62) !important;
  backdrop-filter: blur(3px);
}

.mf-settings,
.mf-models-panel,
.mf-import-card,
.mf-palette,
.mf-onboard-card {
  border-color: var(--mf-line-strong) !important;
  border-radius: 9px !important;
  background: #171b19 !important;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .42) !important;
}

.mf-settings-head,
.mf-models-head {
  min-height: 56px;
  background: #202623;
  border-bottom-color: var(--mf-line-strong) !important;
}

.mf-settings-head strong,
.mf-models-head strong,
.mf-import-card h3,
.mf-onboard-card h2 {
  color: #edf3ed;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  letter-spacing: .025em;
}

.mf-settings-head small,
.mf-models-head small,
.mf-import-card small,
.mf-onboard-note {
  color: var(--mf-text-3) !important;
}

.mf-settings-nav {
  background: #1b201e;
  border-right-color: var(--mf-line-strong) !important;
}

.mf-settings-nav button {
  border-left: 2px solid transparent;
  border-radius: 4px;
}

.mf-settings-nav button:hover,
.mf-settings-nav button.on {
  border-left-color: var(--mf-accent-strong);
  background: var(--mf-accent-soft);
  color: #eff5ef;
}

.mf-settings-content,
.mf-models-body {
  background: #171b19;
}

.mf-settings-content h3 { color: #edf3ed; font-family: ui-serif, Georgia, "Songti SC", serif; }
.mf-settings-content p { color: var(--mf-text-2); }

.mf-settings-card,
.mf-model-card,
.mf-model-row,
.mf-settings-status-row {
  border-color: var(--mf-line) !important;
  background: #1d2320 !important;
}

.mf-settings-action,
.mf-models-panel .mf-primary,
.mf-import-card .mf-primary,
.mf-onboard-card .mf-primary {
  border-color: transparent !important;
  border-radius: 4px !important;
  background: var(--mf-accent) !important;
  color: #f3f8f3 !important;
}

.mf-settings-action:hover,
.mf-models-panel .mf-primary:hover,
.mf-import-card .mf-primary:hover,
.mf-onboard-card .mf-primary:hover {
  background: var(--mf-accent-strong) !important;
}

.mf-settings-status-row strong.ok { color: var(--mf-accent-strong); }
.mf-settings-status-row strong { color: #e0a099; }

.mf-panel.mf-view .mf-input,
.mf-panel.mf-view .mf-search input,
.mf-panel.mf-view .mf-world-search,
.mf-panel.mf-view .mf-sel,
.mf-panel.mf-view select {
  border-color: var(--mf-line-strong);
  border-radius: 4px;
  background: #171c19;
  color: var(--mf-text);
}

.mf-panel.mf-view .mf-input:focus,
.mf-panel.mf-view .mf-search input:focus,
.mf-panel.mf-view .mf-world-search:focus,
.mf-panel.mf-view select:focus {
  border-color: rgba(135, 181, 160, .62);
  outline: 0;
  box-shadow: 0 0 0 2px rgba(111, 155, 137, .12);
}

@container (max-width: 680px) {
  .mf-panel.mf-view .mf-head { padding-inline: 12px; }
  .mf-panel.mf-view .mf-head-mark { width: 24px; height: 24px; flex-basis: 24px; font-size: 12px; }
  .mf-panel.mf-view .mf-head-copy small { display: none; }
  .mf-panel.mf-view .mf-head-context { max-width: 150px; }
  .mf-panel.mf-view .mf-title-input { padding-inline: 20px; font-size: 18px; }
  .mf-panel.mf-view .mf-text { padding-inline: 22px; font-size: 15px; }
}

@container (max-width: 510px) {
  .mf-panel.mf-view .mf-head-context { display: none; }
  .mf-panel.mf-view .mf-head-actions .mf-stylebar { display: none; }
  .mf-panel.mf-view .mf-title-input { padding-inline: 16px; font-size: 17px; }
  .mf-panel.mf-view .mf-text { padding-inline: 16px; font-size: 14px; }
}
`
