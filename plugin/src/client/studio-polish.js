// 墨扉工作台的局部皮肤（v2）：
// - 两套主题：暗色「墨蓝」+ 亮色「纸感」（跟随系统 prefers-color-scheme）
// - 所有令牌挂在 mf-* 容器上，不修改 DSH 宿主的全局主题或布局；
//   --dsw-alias-* 在此层被统一映射，避免宿主绿色主题透传。
// - 圆角/字号/字重与主样式（legacy.js）保持一致，不再回退为 3-4px 小圆角。
export const STUDIO_POLISH_CSS = `
.mf-bubble-panel,
.mf-panel,
.mf-panel.mf-view,
.mf-settings,
.mf-models-panel,
.mf-import-card,
.mf-palette,
.mf-onboard-card {
  --mf-bg: #16181d;
  --mf-layer: #1d2026;
  --mf-layer-2: #252933;
  --mf-head: #1f2229;
  --mf-editor: #191c21;
  --mf-text: #e7e9ee;
  --mf-text-2: #a4aab5;
  --mf-text-3: #737b89;
  --mf-line: rgba(231, 233, 238, .09);
  --mf-line-strong: rgba(231, 233, 238, .16);
  --mf-accent: #2f7bff;
  --mf-accent-strong: #5e97ff;
  --mf-accent-soft: rgba(47, 123, 255, .16);
  --mf-accent-hover: rgba(47, 123, 255, .26);
  --mf-danger: #d98a84;
  --mf-warn: #d9b878;
  --mf-success: #0fbf61;
  --mf-selection: rgba(47, 123, 255, .32);
  --dsw-alias-bg-base: var(--mf-bg);
  --dsw-alias-bg-layer-1: var(--mf-layer);
  --dsw-alias-bg-layer-2: var(--mf-layer-2);
  --dsw-alias-bg-elevated: var(--mf-layer-2);
  --dsw-alias-bg-overlay: var(--mf-layer-2);
  --dsw-alias-label-primary: var(--mf-text);
  --dsw-alias-label-secondary: var(--mf-text-2);
  --dsw-alias-label-tertiary: var(--mf-text-3);
  --dsw-alias-border-l1: var(--mf-line);
  --dsw-alias-border-l2: var(--mf-line-strong);
  --dsw-alias-interactive-bg-hover: rgba(231, 233, 238, .075);
  --dsw-alias-state-business-primary: var(--mf-accent);
  --dsw-alias-state-business-tertiary: var(--mf-accent-soft);
  --dsw-alias-state-success-primary: var(--mf-success);
  --dsw-alias-state-warn-primary: var(--mf-warn);
  --dsw-alias-state-warning-primary: var(--mf-warn);
  --dsw-alias-state-error-primary: var(--mf-danger);
  --dsw-specific-bubble: var(--mf-layer-2);
  --dsw-specific-bubble-highlight: var(--mf-accent-soft);
  --dsw-specific-input-major: var(--mf-layer);
  --dsw-shadow-lv2: 0 14px 38px rgba(4, 6, 10, .36);
}

@media (prefers-color-scheme: light) {
  .mf-bubble-panel,
  .mf-panel,
  .mf-panel.mf-view,
  .mf-settings,
  .mf-models-panel,
  .mf-import-card,
  .mf-palette,
  .mf-onboard-card {
    --mf-bg: #f6f4ee;
    --mf-layer: #efede6;
    --mf-layer-2: #e5e2d8;
    --mf-head: #ece9e0;
    --mf-editor: #faf9f5;
    --mf-text: #2b2e34;
    --mf-text-2: #565c66;
    --mf-text-3: #878d97;
    --mf-line: rgba(40, 44, 52, .1);
    --mf-line-strong: rgba(40, 44, 52, .17);
    --mf-accent: #1d5fd0;
    --mf-accent-strong: #3a76d6;
    --mf-accent-soft: rgba(29, 95, 208, .13);
    --mf-accent-hover: rgba(29, 95, 208, .22);
    --mf-danger: #bd5b50;
    --mf-warn: #a07427;
    --mf-success: #0d9a4e;
    --mf-selection: rgba(29, 95, 208, .24);
    --dsw-alias-bg-base: var(--mf-bg);
    --dsw-alias-bg-layer-1: var(--mf-layer);
    --dsw-alias-bg-layer-2: var(--mf-layer-2);
    --dsw-alias-bg-elevated: var(--mf-layer-2);
    --dsw-alias-bg-overlay: var(--mf-layer-2);
    --dsw-alias-label-primary: var(--mf-text);
    --dsw-alias-label-secondary: var(--mf-text-2);
    --dsw-alias-label-tertiary: var(--mf-text-3);
    --dsw-alias-border-l1: var(--mf-line);
    --dsw-alias-border-l2: var(--mf-line-strong);
    --dsw-alias-interactive-bg-hover: rgba(40, 44, 52, .07);
    --dsw-alias-state-business-primary: var(--mf-accent);
    --dsw-alias-state-business-tertiary: var(--mf-accent-soft);
    --dsw-alias-state-success-primary: var(--mf-success);
    --dsw-alias-state-warn-primary: var(--mf-warn);
    --dsw-alias-state-warning-primary: var(--mf-warn);
    --dsw-alias-state-error-primary: var(--mf-danger);
    --dsw-specific-bubble: var(--mf-layer-2);
    --dsw-specific-bubble-highlight: var(--mf-accent-soft);
    --dsw-specific-input-major: var(--mf-layer);
    --dsw-shadow-lv2: 0 14px 38px rgba(40, 44, 52, .18);
  }
}

/* 字体渲染：清晰化（消除发虚/毛边） */
.mf-bubble-panel,
.mf-panel,
.mf-panel.mf-view,
.mf-settings,
.mf-models-panel,
.mf-import-card,
.mf-palette,
.mf-onboard-card,
.mf-panel.mf-view button,
.mf-panel.mf-view input,
.mf-panel.mf-view textarea,
.mf-panel.mf-view select {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* The injected workbench gets a clear edge, while the DSH shell remains untouched. */
.mf-bubble-panel {
  background: var(--mf-bg) !important;
  border-right-color: var(--mf-line-strong) !important;
  box-shadow: 18px 0 48px rgba(4, 6, 10, .3) !important;
}

.mf-panel.mf-view {
  color: var(--mf-text);
  background: var(--mf-bg) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.mf-panel.mf-view .mf-head {
  height: 58px;
  padding: 0 18px;
  background: var(--mf-head) !important;
  border-bottom: 1px solid var(--mf-line-strong) !important;
  box-shadow: 0 1px 0 var(--mf-line-strong);
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
  border: 1px solid var(--mf-accent-soft);
  border-radius: 10px;
  background: var(--mf-accent-soft);
  color: var(--mf-accent-strong);
  font: 600 14px/1 ui-serif, Georgia, serif;
  letter-spacing: 0;
}

.mf-panel.mf-view .mf-head-copy {
  display: grid;
  min-width: max-content;
  gap: 1px;
}

.mf-panel.mf-view .mf-head-copy strong {
  color: var(--mf-text);
  font-weight: 600;
  font-size: 14px;
  line-height: 1.15;
  letter-spacing: .04em;
}

.mf-panel.mf-view .mf-head-copy small {
  color: var(--mf-text-3);
  font-size: 10px;
  line-height: 1.15;
}

.mf-panel.mf-view .mf-head-context {
  max-width: min(300px, 28vw);
  color: var(--mf-text-2);
}

.mf-panel.mf-view .mf-head-context::before {
  margin-right: 7px;
  color: var(--mf-accent);
  content: "·";
}

.mf-panel.mf-view .mf-head-actions {
  gap: 3px;
}

.mf-panel.mf-view .mf-head-actions .mf-btn {
  min-height: 31px;
  border-color: var(--mf-line-strong);
  border-radius: 10px;
  background: transparent;
  color: var(--mf-text-2);
  font-size: 12px;
}

.mf-panel.mf-view .mf-head-actions .mf-btn:hover {
  border-color: var(--mf-accent-soft);
  background: var(--mf-accent-hover);
  color: var(--mf-text);
}

.mf-panel.mf-view .mf-head-actions .mf-primary {
  border-color: transparent;
  background: var(--mf-accent);
  color: var(--mf-text);
  box-shadow: 0 5px 15px var(--mf-accent-soft);
}

.mf-panel.mf-view .mf-head-actions .mf-primary:hover {
  background: var(--mf-accent-strong);
}

.mf-panel.mf-view .mf-action-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: var(--mf-text-2);
}

.mf-panel.mf-view .mf-action-icon:hover {
  background: var(--mf-accent-hover);
  color: var(--mf-text);
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
  background: var(--mf-head);
  border-bottom-color: var(--mf-line-strong) !important;
  color: var(--mf-text);
  font-size: 12px;
  letter-spacing: .015em;
}

.mf-panel.mf-view .mf-sh .mf-btn,
.mf-panel.mf-view .mf-eh .mf-btn {
  min-height: 28px;
  border-color: var(--mf-line-strong);
  border-radius: 10px;
  background: transparent;
  color: var(--mf-text-2);
}

.mf-panel.mf-view .mf-sh .mf-btn:hover,
.mf-panel.mf-view .mf-eh .mf-btn:hover {
  background: var(--mf-accent-hover);
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
  border-radius: 12px;
  color: var(--mf-text-2);
}

.mf-panel.mf-view .mf-item:hover {
  background: var(--mf-accent-hover);
  color: var(--mf-text);
}

.mf-panel.mf-view .mf-item.on {
  border-left-color: var(--mf-accent);
  background: var(--mf-accent-soft);
  color: var(--mf-text);
  font-weight: 600;
}

.mf-panel.mf-view .mf-item small,
.mf-panel.mf-view .mf-vol small,
.mf-panel.mf-view .mf-proj-meta {
  color: var(--mf-text-3);
}

.mf-panel.mf-view .mf-vol {
  padding: 12px 10px 4px;
  color: var(--mf-text-2);
  font-size: 11px;
  letter-spacing: .04em;
}

.mf-panel.mf-view .mf-vol-children {
  border-left-color: var(--mf-accent-soft);
}

.mf-panel.mf-view .mf-proj {
  border-left: 2px solid transparent !important;
  border-radius: 12px !important;
}

.mf-panel.mf-view .mf-proj.active {
  border-left-color: var(--mf-accent) !important;
  border-color: transparent;
  background: var(--mf-accent-soft) !important;
}

.mf-panel.mf-view .mf-proj-name {
  color: var(--mf-text);
  font-size: 13px;
  letter-spacing: .01em;
}

.mf-panel.mf-view .mf-minis .mf-mini {
  min-width: 25px;
  height: 23px;
  border-color: transparent;
  border-radius: 8px;
  color: var(--mf-text-3);
}

.mf-panel.mf-view .mf-minis .mf-mini:hover {
  border-color: var(--mf-line-strong);
  background: var(--mf-accent-hover);
  color: var(--mf-text);
}

.mf-panel.mf-view .mf-mininav {
  padding: 8px 10px 9px;
  background: var(--mf-head);
  border-top-color: var(--mf-line-strong);
}

.mf-panel.mf-view .mf-mininav button {
  min-height: 36px;
  border-radius: 12px;
  color: var(--mf-text-3);
  font-size: 10px;
}

.mf-panel.mf-view .mf-mininav button:hover {
  background: var(--mf-accent-hover);
  color: var(--mf-text);
}

.mf-panel.mf-view .mf-mininav button.on {
  color: var(--mf-accent);
  background: var(--mf-accent-soft);
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
  color: var(--mf-text);
  font: 600 20px/1.35 ui-serif, Georgia, "Songti SC", serif;
  letter-spacing: .02em;
  caret-color: var(--mf-accent);
}

.mf-panel.mf-view .mf-text {
  padding: 28px clamp(28px, 7vw, 94px) 48px;
  background: var(--mf-editor);
  color: var(--mf-text);
  font: 16px/1.95 ui-serif, Georgia, "Songti SC", serif;
  letter-spacing: .012em;
  caret-color: var(--mf-accent);
}

.mf-panel.mf-view .mf-text::selection,
.mf-panel.mf-view .mf-title-input::selection {
  background: var(--mf-selection);
}

.mf-panel.mf-view .mf-editor .mf-empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  padding: 36px 28px;
  color: var(--mf-text-3);
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
  background: var(--mf-bg);
  border-top-color: var(--mf-line-strong);
  color: var(--mf-text-3);
}

.mf-panel.mf-view .mf-status.unsaved { color: var(--mf-warn); }
.mf-panel.mf-view .mf-status.saving { color: var(--mf-accent); }
.mf-panel.mf-view .mf-status.error { color: var(--mf-danger); }
.mf-panel.mf-view .mf-context-status { color: var(--mf-text-2); }

.mf-panel.mf-view .mf-alert {
  border-bottom-color: var(--mf-danger);
  background: var(--mf-danger);
  color: var(--mf-text);
}

/* The collapsed entry is a quiet return point, not a second primary CTA. */
.mf-orb {
  width: 40px;
  height: 40px;
  border: 1px solid var(--mf-accent-soft);
  border-radius: 14px;
  background: var(--mf-layer-2) !important;
  color: var(--mf-accent);
  font-size: 14px;
  box-shadow: 0 8px 22px rgba(4, 6, 10, .36);
}

.mf-orb:hover {
  background: var(--mf-accent-soft) !important;
  transform: translateY(-1px);
}

.mf-settings-overlay,
.mf-models-overlay,
.mf-import,
.mf-onboard {
  background: rgba(6, 9, 14, .62) !important;
  backdrop-filter: blur(3px);
}

@media (prefers-color-scheme: light) {
  .mf-settings-overlay,
  .mf-models-overlay,
  .mf-import,
  .mf-onboard {
    background: rgba(40, 44, 52, .4) !important;
  }
}

.mf-settings,
.mf-models-panel,
.mf-import-card,
.mf-palette,
.mf-onboard-card {
  border-color: var(--mf-line-strong) !important;
  border-radius: 16px !important;
  background: var(--mf-bg) !important;
  box-shadow: 0 24px 70px rgba(4, 6, 10, .44) !important;
}

@media (prefers-color-scheme: light) {
  .mf-settings,
  .mf-models-panel,
  .mf-import-card,
  .mf-palette,
  .mf-onboard-card {
    box-shadow: 0 24px 70px rgba(40, 44, 52, .22) !important;
  }
}

.mf-settings-head,
.mf-models-head {
  min-height: 56px;
  background: var(--mf-head);
  border-bottom-color: var(--mf-line-strong) !important;
}

.mf-settings-head strong,
.mf-models-head strong,
.mf-import-card h3,
.mf-onboard-card h2 {
  color: var(--mf-text);
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
  background: var(--mf-layer);
  border-right-color: var(--mf-line-strong) !important;
}

.mf-settings-nav button {
  border-left: 2px solid transparent;
  border-radius: 12px;
}

.mf-settings-nav button:hover,
.mf-settings-nav button.on {
  border-left-color: var(--mf-accent);
  background: var(--mf-accent-soft);
  color: var(--mf-text);
}

.mf-settings-content,
.mf-models-body {
  background: var(--mf-bg);
}

.mf-settings-content h3 { color: var(--mf-text); font-family: ui-serif, Georgia, "Songti SC", serif; }
.mf-settings-content p { color: var(--mf-text-2); }

.mf-settings-card,
.mf-model-card,
.mf-model-row,
.mf-settings-status-row {
  border-color: var(--mf-line) !important;
  background: var(--mf-layer) !important;
}

.mf-settings-action,
.mf-models-panel .mf-primary,
.mf-import-card .mf-primary,
.mf-onboard-card .mf-primary {
  border-color: transparent !important;
  border-radius: 12px !important;
  background: var(--mf-accent) !important;
  color: var(--mf-text) !important;
}

.mf-settings-action:hover,
.mf-models-panel .mf-primary:hover,
.mf-import-card .mf-primary:hover,
.mf-onboard-card .mf-primary:hover {
  background: var(--mf-accent-strong) !important;
}

.mf-settings-status-row strong.ok { color: var(--mf-accent); }
.mf-settings-status-row strong { color: var(--mf-danger); }

.mf-panel.mf-view .mf-input,
.mf-panel.mf-view .mf-search input,
.mf-panel.mf-view .mf-world-search,
.mf-panel.mf-view .mf-sel,
.mf-panel.mf-view select {
  border-color: var(--mf-line-strong);
  border-radius: 10px;
  background: var(--mf-layer);
  color: var(--mf-text);
}

.mf-panel.mf-view .mf-input:focus,
.mf-panel.mf-view .mf-search input:focus,
.mf-panel.mf-view .mf-world-search:focus,
.mf-panel.mf-view select:focus {
  border-color: var(--mf-accent);
  outline: 0;
  box-shadow: 0 0 0 2px var(--mf-accent-soft);
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
