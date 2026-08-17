// 自动迁移自旧 lib/client.js；后续用 TSX 模块逐步替换。
import { ProjectGrid, sortProjects, filterProjects } from './project-grid.js'
import { ProjectPage } from './project-page.js'
import { SummaryPanel } from './summary-panel.js'
import { PromptChainsPanel } from './prompt-chains.js'
import { WritingDashboard } from './writing-dashboard.js'
import { WritingSkillsPanel } from './skills-library.js'
import { getEditorContentLimit, formatContentLimitError } from './editor-limits.js'
import { buildChapterMention, buildSelectionMention, buildWriterMention, buildReviewerMention } from './agent-bridge.js'
import { filterWorldEntries, worldNameConflict, toggleAllSelection, buildBulkTogglePlan, buildBulkDeletePlan } from './worldbook-tools.js'
import { loadLayout, saveLayout, nextLayout, normalizeLayout, LAYOUT_DEFAULTS } from './layout.js'
import { fmtTime, dateKey, countWords } from './workspace-utils.js'
import { chatTextOf, chatTextOfBlocks, normalizeChatItems } from './chat-utils.js'
export function createClient(require) {
  const module = { exports: {} }
  const exports = module.exports
  const React = require('react')
  const h = React.createElement
  try { if (typeof globalThis !== 'undefined') globalThis.__mofeiReact = React } catch (bindError) { /* project-grid 惰性解析 React 的注入点，忽略失败 */ }

  function call(method, args) {
    return fetch('/api/mofei', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, args: args || {} }),
    }).then((r) => r.json()).then((j) => {
      if (!j || j.ok !== true) throw new Error((j && j.error) || '墨扉 rpc failed')
      return j.value
    })
  }

  // v0.15: 轮询用超时包装——fetch 悬挂时降级为 null（下轮再试），避免 busy 卡死轮询。
  function timedCall(method, args, ms) {
    return new Promise((resolve) => {
      let done = false
      const timer = setTimeout(() => { if (!done) { done = true; resolve(null) } }, ms)
      call(method, args).then((value) => { if (!done) { done = true; clearTimeout(timer); resolve(value) } }, () => { if (!done) { done = true; clearTimeout(timer); resolve(null) } })
    })
  }

  // sessions.create() is a client-state action and drops agentPreset. Project writer
  // sessions must be created through DSH's native RPC so they start isolated.
  function dshCall(method, payload) {
    const rpcId = 'mofei-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    return fetch('/api/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: payload || {} }),
    }).then(async (response) => {
      const body = await response.json()
      const result = body && body.result
      if (!response.ok || !result || result.ok !== true) throw new Error(result && result.error || 'DSH_RPC_FAILED:' + method)
      return result.value
    })
  }

  const css = [
    '.mf-open{pointer-events:auto;border:0;border-radius:6px;background:var(--dsw-alias-state-business-primary);color:#fff;padding:8px 12px;cursor:pointer;font:600 13px/1.2 sans-serif}',
    '.mf-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0}.mf-card span{font-size:12px;color:var(--dsw-alias-label-secondary)}',
    '.mf-float{position:fixed;right:16px;bottom:16px;z-index:80;pointer-events:auto;box-shadow:0 8px 28px rgba(0,0,0,.25)}',
    '.mf-side{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font:inherit}.mf-mark{display:grid;place-items:center;width:24px;height:24px;border:1px solid currentColor;border-radius:5px;font-size:10px;font-weight:700}',
    '.mf-overlay{position:fixed;inset:0;z-index:100;pointer-events:auto;display:flex;justify-content:flex-end;background:rgba(0,0,0,.32)}',
    '.mf-panel{width:100vw;height:100vh;margin:0;display:grid;grid-template-rows:52px minmax(0,1fr);overflow:hidden;border:0;border-radius:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:none}',
    '.mf-view-root{flex:1;min-height:0;display:flex;flex-direction:column}.mf-panel.mf-view{flex:1;min-height:0;height:auto;width:100%;border:0;border-radius:0;box-shadow:none}',
    '.mf-head,.mf-sh,.mf-eh,.mf-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-head strong{font-size:15px}.mf-head small{margin-left:10px;color:var(--dsw-alias-label-secondary)}',
    '.mf-close{border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer}',
    '.mf-body{display:grid;grid-template-columns:48px var(--mf-left,210px) 6px var(--mf-middle,250px) 6px minmax(0,1fr) var(--mf-chat,340px);min-height:0}.mf-body.no-chat{grid-template-columns:48px var(--mf-left,210px) 6px var(--mf-middle,250px) 6px minmax(0,1fr)}',
    '.mf-chat{display:flex;min-width:0;min-height:0;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,transparent)}.mf-chat-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12.5px;font-weight:650}.mf-chat-head>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-chat-head small{font-weight:400;color:var(--dsw-alias-label-tertiary);font-size:10.5px}.mf-chat-body{flex:1;min-height:0;min-width:0;overflow-x:hidden;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:10px}.mf-chat-msg{max-width:min(525px,82%);min-width:0;padding:10px 16px;border-radius:22px;font-size:12.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;box-sizing:border-box;display:flex;flex-direction:column;gap:6px}.mf-chat-msg.user{align-self:flex-end;background:var(--dsw-specific-bubble,var(--dsw-alias-state-business-primary));color:var(--dsw-alias-label-primary)}.mf-chat-msg.assistant{align-self:flex-start;background:var(--dsw-alias-interactive-bg-hover)}.mf-chat-msg .mf-chat-src{display:block;font-size:10px;opacity:.7;margin-bottom:2px}.mf-chat-tool{font-size:11px;color:var(--dsw-alias-label-secondary);padding:4px 8px;border:1px dashed var(--dsw-alias-border-l1);border-radius:6px;align-self:flex-start;max-width:100%;min-width:0;box-sizing:border-box;overflow-wrap:anywhere}.mf-chat-tool .mf-chat-tool-ok{color:#4ade80}.mf-chat-tool .mf-chat-tool-err{color:#f87171}.mf-chat-input{display:flex;gap:6px;padding:8px;border-top:1px solid var(--dsw-alias-border-l1)}.mf-chat-input textarea{flex:1;min-width:0;min-height:44px;max-height:120px;resize:vertical;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:22px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1.6 sans-serif;padding:10px 14px}.mf-chat-input button{flex:none}.mf-chat-empty{color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.7;padding:4px 2px}',
    '.mf-activity{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,transparent);overflow-y:auto}.mf-act{display:flex;flex-direction:column;align-items:center;gap:3px;width:46px;padding:8px 0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:17px;line-height:1}.mf-act:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-act.on{background:var(--dsw-alias-state-business-primary);color:#fff}.mf-act span{font-size:9.5px;font-weight:650;line-height:1.2;max-width:44px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-act-bottom{margin-top:auto}',
    '.mf-gutter{flex:0 0 6px;width:6px;min-width:6px;cursor:col-resize;background:transparent;border:0;padding:0;z-index:1}',
    '.mf-gutter:hover,.mf-gutter.dragging{background:var(--dsw-alias-state-business-primary);opacity:.55}',
    '.mf-body.resizing{user-select:none}',
    '.mf-world-tools{display:grid;gap:6px;padding:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-world-search{box-sizing:border-box;width:100%;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}.mf-world-batch{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-world-selall{display:inline-flex;align-items:center;gap:4px;cursor:pointer}.mf-wcheck,.mf-wselect-all{accent-color:var(--dsw-alias-state-business-primary)}.mf-danger{color:#dc2626;border-color:rgba(220,38,38,.45)}.mf-bridge-note{font-size:11px;color:#2563eb;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.mf-col{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,transparent)}',
    '.mf-tabs{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-tab{flex:1;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 0;cursor:pointer;font:600 12px/1.2 sans-serif}.mf-tab.on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
    '.mf-sh,.mf-eh{height:46px;font-size:12px;font-weight:650}.mf-eh-actions{display:flex;align-items:center;gap:8px}',
    '.mf-list{overflow:auto;padding:8px}',
    '.mf-item{display:block;width:100%;min-width:0;padding:6px 8px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit;transition:background .12s ease,opacity .12s ease}.mf-item:hover,.mf-item.on{background:var(--dsw-alias-interactive-bg-hover)}.mf-item.on{font-weight:650}.mf-item.dragging{opacity:.45}.mf-item.drop-target{outline:1px dashed var(--dsw-alias-state-business-primary)}.mf-item small{display:block;margin-top:3px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:400}',
    '.mf-row{display:flex;align-items:center;gap:6px;width:100%;min-width:0}.mf-title{flex:1;min-width:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-minis{display:flex;gap:4px;flex-shrink:0}',
    '.mf-mini{display:grid;place-items:center;min-width:24px;height:22px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;line-height:1;transition:background .12s ease,color .12s ease}.mf-mini:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-mini.danger{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-tertiary));border-color:rgba(224,117,110,.35)}.mf-mini.danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}.mf-mini.danger.armed{background:rgba(224,117,110,.2);color:var(--dsw-alias-state-error-primary)}.mf-mini.on{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}',
    '.mf-vol{font-weight:650;font-size:12px;padding:6px 8px 2px;color:var(--dsw-alias-label-secondary)}.mf-vol-head{display:flex;align-items:center;gap:5px}.mf-vol-head .mf-title{font-weight:650;color:var(--dsw-alias-label-primary)}.mf-vol small{margin-left:4px;font-weight:400;color:var(--dsw-alias-label-secondary);font-size:11px}.mf-vol-children{margin-left:10px;border-left:1px solid var(--dsw-alias-border-l1);padding-left:4px}',
    '.mf-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;padding:6px 9px;cursor:pointer;font:inherit;transition:background .12s ease,opacity .12s ease}.mf-btn:disabled{opacity:.5}.mf-primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}',
    '.mf-form{display:grid;gap:7px;padding:9px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-input{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit}.mf-rename{min-width:0;padding:4px 6px;font-size:12px}',
    '.mf-goal{padding:6px 9px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-goal-btn{width:100%;border:1px dashed var(--dsw-alias-border-l1);border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px;cursor:pointer;font:inherit;font-size:11px}',
    '.mf-empty{padding:18px 14px;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.8}',
    '.mf-editor{display:flex;min-width:0;min-height:0;height:100%;flex-direction:column}.mf-editor-pane{display:flex;flex:1 1 auto;min-width:0;min-height:0;flex-direction:column}.mf-status{font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-status.unsaved{color:#b45309}.mf-status.saving{color:#2563eb}.mf-status.error{color:#dc2626}',
    '.mf-title-input{box-sizing:border-box;width:100%;padding:12px 18px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:700 17px/1.4 ui-serif,Georgia,serif;outline:0}',
    '.mf-alert{padding:10px 14px;border-bottom:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.08);color:#dc2626;font-size:12px}.mf-actions{display:flex;gap:7px;margin-top:8px}',
    '.mf-text{box-sizing:border-box;width:100%;flex:1;min-height:0;resize:none;border:0;outline:0;background:var(--dsw-alias-bg-base);color:inherit;padding:28px clamp(20px,6vw,72px);font:16px/1.85 ui-serif,Georgia,serif}',
    '.mf-hist{max-height:240px;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1);padding:8px}.mf-hist-head{display:flex;align-items:center;justify-content:space-between;padding:2px 6px 8px;font-size:12px;font-weight:650}.mf-hist-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 8px;border-radius:5px}.mf-hist-item:hover{background:var(--dsw-alias-interactive-bg-hover)}.mf-hist-meta{display:flex;align-items:center;gap:10px;min-width:0}.mf-hist-meta strong{font-size:12px}.mf-hist-meta span{color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.mf-foot{flex:0 0 38px;height:38px;min-height:38px;padding:0 14px;border-top:1px solid var(--dsw-alias-border-l1);border-bottom:0;color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden}.mf-stat{display:inline-flex;gap:12px;min-width:0;white-space:nowrap}.mf-context-status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}',
    '.mf-search{padding:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-search input{box-sizing:border-box;width:100%;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}.mf-sr-item{padding:6px 4px;border-bottom:1px dashed var(--dsw-alias-border-l1)}.mf-sr-item strong{font-size:12px}.mf-sr-line{color:var(--dsw-alias-label-secondary);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mf-sel{font:inherit;font-size:11px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-base);color:inherit;max-width:110px}',
    '.mf-import{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}.mf-import-card{width:min(560px,calc(100vw - 32px));max-height:82vh;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:16px;display:grid;gap:10px;box-shadow:0 20px 60px rgba(0,0,0,.3)}.mf-import-card h3{margin:0;font-size:14px}.mf-imp-vol{padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;font-size:12px}.mf-import-card small{color:var(--dsw-alias-label-secondary);font-size:11px}.mf-import-actions{display:flex;gap:8px;justify-content:flex-end}',
    '.mf-tabs2{display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);overflow-x:auto}.mf-tab2{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:transparent;color:inherit;padding:3px 8px;font-size:12px;cursor:pointer;white-space:nowrap}.mf-tab2.on{background:var(--dsw-alias-interactive-bg-hover)}.mf-tab2.dragging{opacity:.45}.mf-tab2.drop-target{outline:1px dashed var(--dsw-alias-state-business-primary)}.mf-tab2 .mf-tabx{border:0;background:transparent;color:inherit;cursor:pointer;font-size:11px;padding:0 2px;border-radius:3px}.mf-tab2 .mf-tabx:hover{background:rgba(220,38,38,.25)}.mf-tab2 .mf-tab-kind{font-size:9px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:3px;padding:0 3px}.mf-tab2 .mf-tab-pin{font-size:10px;color:var(--dsw-alias-state-warn-primary)}.mf-tabmenu{position:absolute;z-index:140;min-width:150px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;box-shadow:0 12px 36px rgba(0,0,0,.3);padding:4px;display:grid;gap:2px}.mf-tabmenu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:6px 10px;border-radius:4px;cursor:pointer;font:inherit;font-size:12px}.mf-tabmenu button:hover{background:var(--dsw-alias-interactive-bg-hover)}',
    '.mf-findbar{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}.mf-findbar input{box-sizing:border-box;width:170px;padding:5px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}.mf-findbar input.mf-find-repl{width:150px}.mf-findbar span{font-size:11px;color:var(--dsw-alias-label-secondary);min-width:34px;text-align:center}',
    '.mf-heat{padding:8px 14px;border-top:1px solid var(--dsw-alias-border-l1);display:grid;gap:8px}.mf-heat-grid{display:grid;grid-template-columns:repeat(12,12px);grid-auto-rows:12px;gap:3px;justify-content:start}.mf-hm-cell{width:12px;height:12px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l1)}.mf-hm-cell.l1{background:rgba(67,160,71,.35)}.mf-hm-cell.l2{background:rgba(67,160,71,.55)}.mf-hm-cell.l3{background:rgba(67,160,71,.75)}.mf-hm-cell.l4{background:rgba(67,160,71,.95)}.mf-heat small{color:var(--dsw-alias-label-secondary);font-size:11px}',
    '.mf-ai{display:grid;gap:8px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l1);max-height:280px;overflow:auto}.mf-ai-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.mf-ai select{font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-base);color:inherit;padding:4px 6px}.mf-ai textarea{box-sizing:border-box;width:100%;min-height:56px;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1.6 sans-serif;resize:vertical}.mf-ai-result{white-space:pre-wrap;font:13px/1.7 ui-serif,Georgia,serif;padding:8px 10px;border:1px dashed var(--dsw-alias-border-l1);border-radius:5px;max-height:140px;overflow:auto;color:var(--dsw-alias-label-primary)}',
    '.mf-panel.mf-focus .mf-body{grid-template-columns:minmax(0,1fr)}.mf-panel.mf-focus .mf-col,.mf-panel.mf-focus .mf-activity,.mf-panel.mf-focus .mf-gutter,.mf-panel.mf-focus .mf-chat{display:none}',
    '@media(max-width:760px){.mf-panel{width:100vw;height:100vh;margin:0;border:0;border-radius:0}.mf-body{grid-template-columns:48px 110px minmax(0,1fr)}.mf-body>.mf-col.mf-mid{display:none}.mf-gutter{display:none}.mf-chat{display:none}.mf-text{padding:18px 15px}.mf-head small{display:none}}',
    '.mf-standalone .mf-overlay{position:absolute;background:transparent}.mf-standalone .mf-panel{width:100vw;height:100vh;margin:0;border-radius:0;border:none}',
    '.mf-palette{position:fixed;left:50%;top:90px;transform:translateX(-50%);width:min(620px,calc(100vw - 32px));max-height:420px;overflow:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.35);z-index:130}.mf-palette input{box-sizing:border-box;width:100%;padding:10px 12px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit}.mf-palette-item{display:block;width:100%;padding:9px 12px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-size:13px}.mf-palette-item:hover,.mf-palette-item.on{background:var(--dsw-alias-interactive-bg-hover)}.mf-palette-item small{display:block;margin-top:3px;color:var(--dsw-alias-label-secondary);font-size:11px}',
    '.mf-stylebar{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-stylebar select{font:inherit;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-base);color:inherit;padding:3px 6px}',
    '.mf-git{max-height:46vh;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1);padding:8px 12px;display:grid;gap:6px}.mf-git pre{white-space:pre-wrap;font:11px/1.6 ui-monospace,Consolas,monospace;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-elevated,transparent);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:8px;margin:0;max-height:220px;overflow:auto}.mf-git-item{display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:5px}.mf-git-item:hover{background:var(--dsw-alias-interactive-bg-hover)}.mf-git-item code{font:11px ui-monospace,Consolas,monospace;color:var(--dsw-alias-label-secondary)}',
    '.mf-git-diff{font:11px/1.6 ui-monospace,Consolas,monospace;max-height:240px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-elevated,transparent)}.mf-diff-line{white-space:pre-wrap;padding:0 6px}.mf-diff-add{color:#4ade80;background:rgba(74,222,128,.08)}.mf-diff-del{color:#f87171;background:rgba(248,113,113,.08)}.mf-diff-hunk{color:#60a5fa;background:rgba(96,165,250,.08)}.mf-diff-meta{color:var(--dsw-alias-label-secondary)}',
    // v0.12.1 对话面板：pending 审批/提问卡片
    '.mf-pends{display:grid;gap:8px;padding:8px 10px}.mf-pend{border:1px solid var(--dsw-alias-state-warn-secondary);background:var(--dsw-specific-input-major);border-radius:14px;padding:10px 12px;display:grid;gap:8px;color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv2,0 4px 16px rgba(0,0,0,.2))}.mf-pend-head{font-size:12px;font-weight:650;color:var(--dsw-alias-state-warn-primary)}.mf-pend-body,.mf-pend-q{font-size:13px;line-height:1.6;display:grid;gap:4px;min-width:0}.mf-pend-qtext{font-weight:600}.mf-pend-reason{font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap}.mf-pend-actions{display:flex;gap:6px;justify-content:flex-end}.mf-pend-opts{display:flex;flex-wrap:wrap;gap:6px}.mf-pend-opt{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit}.mf-pend-opt:hover{background:var(--dsw-alias-interactive-bg-hover)}.mf-pend-opt.on{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-specific-bubble-highlight);color:var(--dsw-alias-label-primary)}.mf-pend-custom{box-sizing:border-box;width:100%;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}',
    '.mf-chat-jump{align-self:flex-end;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 10px;font-size:11px;cursor:pointer;font-family:inherit}.mf-chat-jump:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-business-primary)}',
    // v0.14 变形工作态：原版 web 完整保留；墨扉 = 右下角 orb 按钮 + 左侧滑入工作台。
    // 工作态的阅读顺序固定为「墨扉工作台 | DSH 写作助手 | DSH 窄轨」。
    '.mf-bubble{position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden}',
    // 宽屏让原生 DSH composer 留在最右；空间不足时，优先完整保住写作区，只留下 DSH 窄轨供切回。
    '.mf-bubble-panel{position:absolute;top:0;left:0;bottom:0;width:calc(100% - var(--mf-dsh-sidebar,55px) - var(--mf-dsh-composer,clamp(380px,31vw,520px)));min-width:0;display:flex;flex-direction:column;overflow:hidden;container-type:inline-size;background:var(--dsw-alias-bg-layer-1,#0d0e11);border-right:1px solid var(--dsw-alias-border-l1);transform:translateX(-100%);transition:transform .32s cubic-bezier(.22,.61,.36,1),width .2s ease;pointer-events:auto;box-shadow:14px 0 36px rgba(0,0,0,.28)}',
    '.mf-bubble.on .mf-bubble-panel{transform:translateX(0)}',
    '.mf-orb{position:fixed;right:18px;bottom:18px;width:46px;height:46px;border:0;border-radius:50%;background:var(--dsw-alias-state-business-primary,#4d8dff);color:#fff;cursor:pointer;font:700 17px/1 sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);pointer-events:auto;z-index:95;transition:transform .2s ease,background .2s ease,opacity .2s ease}',
    '.mf-orb:hover{transform:scale(1.08)}.mf-orb.on{background:var(--dsw-alias-label-secondary,#6b6b74)}',
    // 变形后 orb 退场（收起走工作台顶栏），避免悬在官方 composer 上方挡操作。
    '.mf-bubble.on .mf-orb{opacity:0;pointer-events:none}',
    // 变形时：官方侧栏由官方机制收成窄条，并显式放到 DSH 助手右侧。
    // 不能隐藏官方 grid 列：这样会触发 grid 自动排版，反而会压扁整页。
    'body.mf-transform{--mf-dsh-sidebar:55px;--mf-dsh-composer:clamp(380px,31vw,520px)}body.mf-transform.mf-sidebar-expanded{--mf-dsh-sidebar:280px}',
    'body.mf-transform [class*="_frame"]{grid-template-columns:minmax(0,1fr) var(--mf-dsh-sidebar) 0 !important}',
    'body.mf-transform [class*="centerCol"]{grid-column:1 !important;grid-row:1 !important}',
    'body.mf-transform [class*="hHd-Xa_root"]{grid-column:2 !important;grid-row:1 !important;width:var(--mf-dsh-sidebar) !important;min-width:var(--mf-dsh-sidebar) !important;max-width:var(--mf-dsh-sidebar) !important;overflow:hidden !important}',
    // centerCol 本身已经排除了官方侧栏，内层只需为 Composer 预留空间；重复扣侧栏会让 Composer 被工作台遮住。
    'body.mf-transform [class*="centerCol"] [class*="root"]{padding-left:calc(100% - var(--mf-dsh-composer)) !important;transition:padding-left .2s ease}',
    // 右侧仍是官方 composer，只收紧容器并用同一套分隔线把它收为助手栏。
    'body.mf-transform [class*="scrollBody"]{background:var(--dsw-alias-bg-layer-1,#101115);border-left:1px solid var(--dsw-alias-border-l1)}',
    'body.mf-transform [class*="composerSeat"]{padding:0 16px 18px !important}',
    'body.mf-transform [class*="composerHero"]{box-sizing:border-box;width:100%;max-width:100%;overflow:hidden;padding:20px 0 0}',
    'body.mf-transform [class*="composerHero"]>svg{display:none}',
    // v0.17.1: 430px 窄条下头部压缩——标题单行截断，工作区行（Router Standard 下拉）不换行，避免重叠
    'body.mf-transform [class*="composerHero"] [class*="headline"]{font-size:15px !important;line-height:1.3 !important;letter-spacing:0 !important;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'body.mf-transform [class*="composerHero"] [class*="headlineText"]{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'body.mf-transform [class*="composerHero"] [class*="heroWorkspaceRow"]{margin-top:2px;padding:0 2px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px !important;line-height:1.5 !important;color:var(--dsw-alias-label-secondary) !important}',
    'body.mf-transform [class*="composerHero"] [class*="card"]{border-radius:8px !important;box-shadow:0 10px 28px rgba(0,0,0,.28)}',
    'body.mf-transform [class*="composerHero"] [class*="card"],body.mf-transform [class*="composerHero"] [class*="row"]{width:100%;max-width:100%}',
    // 窄屏优先保留墨扉编辑区；官方会话切换仍在右侧 55px 窄轨中可达。
    '@media(max-width:760px){body.mf-transform,body.mf-transform.mf-sidebar-expanded{--mf-dsh-sidebar:55px;--mf-dsh-composer:0px}body.mf-transform [class*="centerCol"] [class*="root"]{padding-left:0 !important}}',
    // 墨扉工作台：扁平的目录、编辑器与 DSH 助手三栏，不使用悬浮卡片来分区。
    '.mf-panel.mf-view{background:var(--dsw-alias-bg-layer-1,#0d0e11)}.mf-panel.mf-view .mf-head{position:relative;height:56px;padding:0 20px;background:var(--dsw-alias-bg-layer-2,#111217);border-bottom-color:var(--dsw-alias-border-l1)}.mf-panel.mf-view .mf-body{display:flex;gap:0;padding:0;min-height:0;background:var(--dsw-alias-bg-layer-1,#0d0e11)}',
    '.mf-panel.mf-view .mf-activity,.mf-panel.mf-view .mf-gutter,.mf-panel.mf-view .mf-col.mf-mid{display:none}',
    '.mf-panel.mf-view .mf-col{width:286px;flex:none;border:0;border-right:1px solid var(--dsw-alias-border-l1);border-radius:0;background:var(--dsw-alias-bg-layer-1,#101115);overflow:hidden;box-shadow:none}',
    '.mf-panel.mf-view .mf-editor{flex:1;min-height:0;border:0;border-radius:0;background:var(--dsw-alias-bg-base,#0d0e11);overflow:hidden;box-shadow:none}',
    '@media(max-width:1140px){.mf-panel.mf-view .mf-col{width:228px}.mf-panel.mf-view .mf-text{padding-inline:30px}}',
    // 官方会话栏展开后，墨扉使用紧凑工作态而不是把编辑区压成窄缝。
    'body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-col{width:204px}body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-head{height:48px;padding-inline:12px}body.mf-transform.mf-sidebar-expanded .mf-head-context{max-width:140px}body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-text{padding-inline:22px;font-size:15px}body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-mininav{padding-inline:6px}body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-proj{padding:7px 8px}',
    '.mf-head-main{display:flex;align-items:center;gap:10px;min-width:0}.mf-head-main strong{font-size:15px;font-weight:680;letter-spacing:0}.mf-head-context{min-width:0;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px}.mf-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-width:0}.mf-head-actions .mf-btn{min-height:30px}.mf-head-actions .mf-primary{padding-inline:11px}.mf-action-icon{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:18px/1 sans-serif}.mf-action-icon:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-head-actions .mf-stylebar{margin-right:6px}.mf-head-actions .mf-stylebar select{max-width:104px;border:0;background:transparent;padding:4px;color:var(--dsw-alias-label-secondary)}',
    '@container (max-width:680px){.mf-panel.mf-view .mf-col{width:190px}.mf-panel.mf-view .mf-head{height:48px;padding-inline:10px}.mf-head-context{display:none}.mf-panel.mf-view .mf-text{padding-inline:18px;font-size:15px}.mf-panel.mf-view .mf-mininav{padding-inline:5px}.mf-panel.mf-view .mf-proj{padding:7px}.mf-panel.mf-view .mf-proj-meta{gap:5px}}',
    '@container (max-width:510px){.mf-panel.mf-view .mf-col{width:164px}.mf-panel.mf-view .mf-mininav{display:none}.mf-panel.mf-view .mf-head-actions .mf-stylebar{display:none}.mf-panel.mf-view .mf-text{padding-inline:14px;font-size:14px}.mf-panel.mf-view .mf-proj-meta{display:none}.mf-panel.mf-view .mf-list{padding:5px}}',
    '.mf-writer-session-menu{position:absolute;right:12px;top:46px;z-index:115;width:260px;max-height:min(360px,calc(100vh - 80px));display:flex;flex-direction:column;gap:3px;padding:7px;background:var(--dsw-alias-bg-overlay,#141416);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 16px 42px rgba(0,0,0,.42);overflow:auto}.mf-writer-session-menu h3{margin:2px 5px 5px;font-size:11px;font-weight:650;color:var(--dsw-alias-label-secondary)}.mf-writer-session-item{display:flex;align-items:center;gap:8px;width:100%;min-width:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);padding:7px 8px;text-align:left;cursor:pointer;font:12px/1.35 sans-serif}.mf-writer-session-item:hover,.mf-writer-session-item.on{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary)}.mf-writer-session-item .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-writer-session-item .time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px}.mf-writer-session-empty{padding:10px 8px;color:var(--dsw-alias-label-tertiary);font-size:11.5px}.mf-writer-session-menu .mf-btn{margin:4px 1px 1px;text-align:center}.mf-writer-session-menu .mf-btn.danger{color:#f87171;border-color:rgba(248,113,113,.3)}.mf-writer-session-menu-sep{height:1px;margin:8px 2px;background:var(--dsw-alias-border-l1)}.mf-writer-session-item .badge{flex:none;width:18px;text-align:center;color:var(--dsw-alias-state-success-primary,#55c98d);font-size:12px}',
    // v0.13.1 预览对齐：迷你导航移入左内栏底部横排（此前为 col/editor 间竖向窄条）
    '.mf-panel.mf-view .mf-col .mf-list{flex:1;min-height:0}',
    '.mf-panel.mf-view .mf-col > .mf-list{display:flex;flex-direction:column;gap:2px}',
    '.mf-panel.mf-view .mf-mininav{flex:none;border-top:1px solid var(--dsw-alias-border-l1);padding:8px 10px}',
    // v0.17.1: 迷你导航对比度提升（tertiary 在墨韵皮肤中过暗，视觉审查发现难读）
    '.mf-panel.mf-view .mf-mininav button{color:var(--dsw-alias-label-secondary)}',
    '.mf-panel.mf-view .mf-mininav button:hover{color:var(--dsw-alias-label-primary)}',
    '.mf-proj-list{display:flex;flex-direction:column;gap:4px;padding:0 2px 8px}',
    // v0.14.1 预览对齐：编辑区空态垂直居中、占位符对比度
    '.mf-panel.mf-view .mf-editor-pane > .mf-empty{display:grid;flex:1;place-items:center;min-height:0;padding:24px;color:var(--dsw-alias-label-secondary)}',
    '.mf-panel.mf-view input::placeholder,.mf-panel.mf-view textarea::placeholder{color:var(--dsw-alias-label-secondary)}',
    // 写作助手入口兼作会话隔离器：只展开 mofei-writer 会话，减少顶栏重复状态。
    '.mf-wstate{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 8px;cursor:pointer;font:12px/1.2 sans-serif;white-space:nowrap}.mf-wstate::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}.mf-wstate:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.mf-wstate.on{color:var(--dsw-alias-label-primary)}.mf-wstate.on::before{background:var(--dsw-alias-state-success-primary,#55c98d);box-shadow:0 0 0 3px rgba(85,201,141,.12)}',
    // v0.13.1 预览对齐：左栏行操作 hover 才显现（静止态 = 极简，功能不丢）
    '.mf-panel.mf-view .mf-col .mf-minis{opacity:0;pointer-events:none;transition:opacity .12s ease}',
    '.mf-panel.mf-view .mf-col .mf-item:hover .mf-minis,.mf-panel.mf-view .mf-col .mf-vol-head:hover .mf-minis,.mf-panel.mf-view .mf-col .mf-proj:hover .mf-minis{opacity:1;pointer-events:auto}',
    // v0.13.1 预览对齐：项目行 = 标题 + 元信息（无封面块/进度条）
    '.mf-panel.mf-view .mf-col .mf-proj{display:flex;flex-direction:column;gap:2px;padding:9px 10px;border:1px solid transparent;border-radius:5px;cursor:pointer;transition:background .12s ease,border-color .12s ease}',
    '.mf-panel.mf-view .mf-col .mf-proj:hover{background:var(--dsw-alias-interactive-bg-hover)}',
    '.mf-panel.mf-view .mf-col .mf-proj.active{background:var(--dsw-alias-state-business-tertiary);border-color:var(--dsw-alias-border-l1)}',
    '.mf-panel.mf-view .mf-col .mf-proj-head{display:flex;align-items:center;gap:6px;min-width:0}',
    '.mf-panel.mf-view .mf-col .mf-proj-name{flex:1;min-width:0;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mf-panel.mf-view .mf-col .mf-proj-meta{display:flex;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
    '.mf-panel.mf-view .mf-col .mf-proj .mf-minis{opacity:0;pointer-events:none;flex-shrink:0}',
    '.mf-mininav{display:flex;gap:2px;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l1);flex:none}.mf-mininav button{flex:1;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:9.5px;font-family:inherit;padding:4px 0;border-radius:7px}.mf-mininav button:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}.mf-mininav button.on{color:var(--dsw-alias-state-business-primary)}.mf-mininav .ic{font-size:15px}',
    '.mf-back{background:transparent;border:0;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;padding:0 4px;font-family:inherit}.mf-back:hover{color:var(--dsw-alias-label-primary)}',
    '.mf-sess-toggle{display:flex;align-items:center;gap:6px;width:100%;padding:7px 12px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:11.5px;flex:none}.mf-sess-toggle:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
    '.mf-sess-list{max-height:180px;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1);padding:4px 6px 6px;display:flex;flex-direction:column;gap:1px;flex:none}.mf-sess-item{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:7px;cursor:pointer;font-size:11.5px;color:var(--dsw-alias-label-secondary)}.mf-sess-item:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-sess-item.on{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary)}.mf-sess-item .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-sess-item .time{font-size:9.5px;color:var(--dsw-alias-label-tertiary);flex:none}',
    '.mf-panel.mf-view .mf-chat-input{padding:8px 12px 12px;border-top:0}.mf-panel.mf-view .mf-chat-input textarea{border-radius:16px;background:var(--dsw-alias-bg-base);font-size:13px}',
    // v0.18: 初始向导
    '.mf-onboard{position:fixed;inset:0;z-index:150;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}.mf-onboard-card{width:min(560px,calc(100vw - 40px));display:grid;gap:14px;padding:28px 30px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 26px 80px rgba(0,0,0,.5)}.mf-onboard-card h2{margin:0;font-size:18px}.mf-onboard-card p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.7}.mf-onboard-folder{display:flex;gap:8px;align-items:center}.mf-onboard-folder input{flex:1;min-width:0;box-sizing:border-box;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1.4 sans-serif;outline:0}.mf-onboard-folder input:focus{border-color:var(--dsw-alias-state-business-primary)}.mf-onboard input[type="text"]{box-sizing:border-box;width:100%;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:inherit;font:13px/1.4 sans-serif;outline:0}.mf-onboard input:focus{border-color:var(--dsw-alias-state-business-primary)}.mf-onboard-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center}.mf-onboard-error{color:#f87171;font-size:12px}.mf-onboard-note{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
  ].join('\n')
  let styleEl = null
  function ensureStyles() {
    if (!styleEl && typeof document !== 'undefined') {
      styleEl = document.createElement('style')
      styleEl.textContent = css
      document.head.appendChild(styleEl)
    }
  }
  function removeStyles() { if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); styleEl = null }

  const timers = new Set()
  function later(fn, ms) { const id = setTimeout(fn, ms); timers.add(id); return () => { clearTimeout(id); timers.delete(id) } }
  function debounce(fn, ms) {
    let t = null
    const run = () => { if (t) clearTimeout(t); t = setTimeout(() => { t = null; fn() }, ms); timers.add(t) }
    run.dispose = () => { if (t) { clearTimeout(t); timers.delete(t); t = null } }
    return run
  }
  function applyWritingComposerPlaceholder() {
    if (typeof document === 'undefined') return
    const ta = document.querySelector('[data-composer-seat] textarea,[class*="composerSeat"] textarea')
    if (!ta) return
    if (!ta.dataset.mofeiPh) {
      ta.dataset.mofeiPh = '1'
      ta.dataset.mofeiOriginalPlaceholder = ta.placeholder
    }
    const writing = document.body.classList.contains('mf-transform')
    ta.placeholder = writing ? '输入写作指令：续写 / 审稿 / 查设定…' : (ta.dataset.mofeiOriginalPlaceholder || ta.placeholder)
  }

  const panel = { open: false, listeners: [] }
  let dshClientSessions = null
  let dshClientConnection = null
  let dshClientWorkspaces = null
  function currentDshWorkspacePath() {
    try {
      const sessions = dshClientSessions
      const snapshot = sessions && sessions.list && typeof sessions.list.getSnapshot === 'function' ? sessions.list.getSnapshot() : null
      const current = snapshot && snapshot.current && snapshot.byId && snapshot.byId[snapshot.current]
      if (current && typeof current.cwd === 'string' && current.cwd.trim()) return current.cwd.trim()
      const workspaces = dshClientWorkspaces
      const workspaceSnapshot = workspaces && workspaces.list && typeof workspaces.list.getSnapshot === 'function' ? workspaces.list.getSnapshot() : null
      const recent = workspaceSnapshot && workspaceSnapshot.recentWorkspaceId
      const item = recent && Array.isArray(workspaceSnapshot.items) ? workspaceSnapshot.items.find((entry) => entry && entry.workspaceId === recent) : null
      return item && typeof item.path === 'string' ? item.path.trim() : ''
    } catch (error) { return '' }
  }
  function setOpen(value) { panel.open = value; panel.listeners.slice().forEach((listener) => listener(value)) }
  function useOpen() { const state = React.useState(panel.open); React.useEffect(() => { panel.listeners.push(state[1]); return () => { panel.listeners = panel.listeners.filter((listener) => listener !== state[1]) } }, []); return state[0] }
  function OpenButton(props) { return h('button', { className: props && props.float ? 'mf-open mf-float' : 'mf-open', type: 'button', onClick: () => { ensureStyles(); setOpen(true) } }, '打开 墨扉') }
  const ErrorBoundary = class extends React.Component {
    constructor(props) { super(props); this.state = { error: null } }
    static getDerivedStateFromError(error) { return { error } }
    render() {
      if (this.state.error) return h('div', { style: { position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dsw-alias-bg-base)', color: '#dc2626', font: '13px/1.6 sans-serif', padding: 24 } }, '墨扉 渲染出错：' + String((this.state.error && this.state.error.message) || this.state.error))
      return this.props.children
    }
  }
  function RunCard() { return h('div', { className: 'mf-card' }, h('span', null, '墨扉写作平台已运行'), h(OpenButton, null)) }
  function SideAction(props) { return h('button', { className: 'mf-side', type: 'button', onClick: () => { ensureStyles(); setBubbleOn(true) }, title: '打开 墨扉' }, h('span', { className: 'mf-mark' }, '墨'), props && props.wide ? h('span', null, '墨扉') : null) }
  function MiniButton(props) { return h('button', { className: 'mf-mini' + (props.danger ? ' danger' : '') + (props.armed ? ' armed' : '') + (props.on ? ' on' : ''), type: 'button', title: props.title || '', disabled: props.disabled, onClick: (event) => { event.stopPropagation(); if (props.onClick) props.onClick(event) } }, props.label) }

  // v0.14 变形金刚形态：气泡开关状态（右下角 orb 按钮 + 官方侧栏「墨扉」入口共用）
  const bubble = { on: false, listeners: [] }
  let sidebarSyncTarget = null
  let sidebarSyncTimer = null
  function setBubbleOn(value) {
    const next = !!value
    // Collapse and clip DSH before React starts the workbench slide-in. This prevents
    // the expanded DSH sidebar from bleeding through the 55px utility rail.
    if (next && typeof document !== 'undefined') {
      document.body.classList.add('mf-transform')
      syncOfficialSidebar(true)
    }
    bubble.on = next
    bubble.listeners.slice().forEach((listener) => listener(bubble.on))
  }
  function useBubbleOn() { const state = React.useState(bubble.on); React.useEffect(() => { bubble.listeners.push(state[1]); return () => { bubble.listeners = bubble.listeners.filter((listener) => listener !== state[1]) } }, []); return state[0] }
  // 官方侧边栏折叠同步：变形时用官方原生折叠机制收成 55px 窄条（logo/会话列表/设置图标保留）
  function syncOfficialSidebar(collapse) {
    if (typeof document === 'undefined') return
    try {
      const root = document.querySelector('[class*="hHd-Xa_root"]')
      const isCollapsed = !!(root && String(root.className).includes('collapsed'))
      const target = !!collapse
      if (sidebarSyncTarget === target) return
      if (root && target !== isCollapsed) {
        const toggle = document.querySelector('[class*="hHd-Xa_toggle"]')
        if (toggle) {
          sidebarSyncTarget = target
          if (sidebarSyncTimer) clearTimeout(sidebarSyncTimer)
          toggle.click()
          // DSH applies the sidebar state asynchronously. Avoid an effect re-clicking
          // the toggle before the root class has caught up.
          sidebarSyncTimer = setTimeout(() => { sidebarSyncTarget = null; sidebarSyncTimer = null }, 450)
        }
      }
    } catch (error) { /* 官方折叠机制不可用时静默降级 */ }
  }
  function MofeiBubble() {
    ensureStyles()
    const on = useBubbleOn()
    const previousOn = React.useRef(on)
    React.useEffect(() => {
      // Composer is mounted asynchronously by DSH. Apply the writing affordance
      // on a fresh page as well as after the transform, so its two states agree.
      return later(applyWritingComposerPlaceholder, 340)
    }, [])
    React.useEffect(() => {
      const wasOn = previousOn.current
      previousOn.current = on
      if (on) {
        if (typeof document !== 'undefined') document.body.classList.add('mf-transform')
        syncOfficialSidebar(true)
        // DSH recreates its composer while the sidebar changes shape.
        return later(applyWritingComposerPlaceholder, 340)
      } else {
        if (typeof document !== 'undefined') document.body.classList.remove('mf-transform')
        // Let the writing panel clear the viewport before the native sidebar expands.
        // Expanding both at once makes the two independent layouts visibly collide.
        if (wasOn) return later(() => { syncOfficialSidebar(false); applyWritingComposerPlaceholder() }, 300)
        syncOfficialSidebar(false)
        return later(applyWritingComposerPlaceholder, 0)
      }
      return undefined
    }, [on])
    React.useEffect(() => {
      if (!on || typeof document === 'undefined') return undefined
      const root = document.querySelector('[class*="hHd-Xa_root"]')
      if (!root) return undefined
      const syncSidebarWidth = () => document.body.classList.toggle('mf-sidebar-expanded', !String(root.className).includes('collapsed'))
      syncSidebarWidth()
      const observer = new MutationObserver(syncSidebarWidth)
      observer.observe(root, { attributes: true, attributeFilter: ['class'] })
      return () => { observer.disconnect(); document.body.classList.remove('mf-sidebar-expanded') }
    }, [on])
    return h('div', { className: 'mf-bubble' + (on ? ' on' : '') },
      h('div', { className: 'mf-bubble-panel', 'aria-hidden': on ? undefined : 'true' }, h(ErrorBoundary, null, h(Workspace, { mode: 'web', onCollapse: () => setBubbleOn(false) }))),
      h('button', { className: 'mf-orb' + (on ? ' on' : ''), type: 'button', title: on ? '收起墨扉，返回原版 web' : '打开墨扉写作台（原版 web 变形）', onClick: () => setBubbleOn(!on) }, on ? '✕' : '墨'))
  }

  // —— 墨韵双色板（v0.12.1 完整令牌）——
  // MOFEI_INK：墨色底 + 米色文字 + 茶金品牌（dark）；MOFEI_PAPER：宣纸浅色变体（light）。
  // 覆盖官方 design-platform.css 全部 --dsw-alias-*/--dsw-specific-* 令牌。
  const MOFEI_INK = {
    '--dsw-alias-bg-base': '#0a0a0a',
    '--dsw-alias-bg-layer-1': '#101012',
    '--dsw-alias-bg-layer-2': '#161619',
    '--dsw-alias-bg-layer-3': '#1c1c1f',
    '--dsw-alias-bg-module-platform': '#131315',
    '--dsw-alias-bg-multi-select': '#161619',
    '--dsw-alias-bg-overlay': '#141416',
    '--dsw-alias-bg-skeleton': 'rgba(255,255,255,0.06)',
    '--dsw-alias-bg-mask-1': 'rgba(0,0,0,0.55)',
    '--dsw-alias-bg-mask-2': 'rgba(0,0,0,0.25)',
    '--dsw-alias-bg-mask-3': 'rgba(0,0,0,0.5)',
    '--dsw-alias-bg-mask-photo': 'rgba(0,0,0,0.88)',
    '--dsw-alias-bg-mask-drop': 'rgba(20,20,22,0.7)',
    '--dsw-alias-border-l1': 'rgba(255,255,255,0.07)',
    '--dsw-alias-border-l2': 'rgba(255,255,255,0.11)',
    '--dsw-alias-border-l2-darkmode-thin': 'rgba(255,255,255,0.06)',
    '--dsw-alias-border-l3': 'rgba(255,255,255,0.15)',
    '--dsw-alias-border-l4': 'rgba(255,255,255,0.19)',
    '--dsw-alias-border-inverted': 'rgba(255,255,255,0.05)',
    '--dsw-alias-border-inverted2': 'rgba(255,255,255,0.07)',
    '--dsw-alias-brand-primary': '#4d8dff',
    '--dsw-alias-brand-primary-invert': '#f2f2f2',
    '--dsw-alias-brand-primary-new-colorprimary-new-color': '#3b6fe0',
    '--dsw-alias-brand-text': '#f2f2f2',
    '--dsw-alias-button-contrast-fill': '#e8e8e8',
    '--dsw-alias-button-elevated-fill': '#161619',
    '--dsw-alias-button-floating-fill': '#161619',
    '--dsw-alias-button-floating-hover': '#1c1c1f',
    '--dsw-alias-button-ghost-active-border': '#4d8dff',
    '--dsw-alias-button-ghost-active-fill': 'rgba(77,141,255,0.16)',
    '--dsw-alias-button-ghost-active-hover': 'rgba(77,141,255,0.24)',
    '--dsw-alias-button-info-fill': '#3b6fe0',
    '--dsw-alias-button-info-hover': '#4d8dff',
    '--dsw-alias-button-primary-dimmed': '#22262e',
    '--dsw-alias-button-primary-fill': '#3b6fe0',
    '--dsw-alias-button-primary-hover': '#2f5bc4',
    '--dsw-alias-button-tool-bar-fill': 'rgba(84,85,87,0.5)',
    '--dsw-alias-button-tool-bar-hover': 'rgba(84,85,87,0.6)',
    '--dsw-alias-button-tool-bar-fill-invisible': 'rgba(31,31,31,0.36)',
    '--dsw-alias-interactive-bg-active': 'rgba(255,255,255,0.12)',
    '--dsw-alias-interactive-bg-hover': 'rgba(255,255,255,0.06)',
    '--dsw-alias-interactive-bg-hover-accent': 'rgba(77,141,255,0.16)',
    '--dsw-alias-interactive-bg-hover-danger': 'rgba(248,113,113,0.12)',
    '--dsw-alias-interactive-bg-hover-solid': '#1c1c1f',
    '--dsw-alias-label-primary': '#f2f2f2',
    '--dsw-alias-label-secondary': '#a8a8b0',
    '--dsw-alias-label-tertiary': '#8a8a92',
    '--dsw-alias-label-caption': '#6b6b74',
    '--dsw-alias-label-dimmed': '#5c5c64',
    '--dsw-alias-label-primary-bluish': '#f2f2f2',
    '--dsw-alias-label-primary-dimmed': '#d6d6da',
    '--dsw-alias-label-primary-foreground': '#0a0a0a',
    '--dsw-alias-label-primary-inverted': '#0a0a0a',
    '--dsw-alias-markdown-citation': '#161619',
    '--dsw-alias-markdown-code-block': '#101012',
    '--dsw-alias-markdown-code-block-banner': '#101012',
    '--dsw-alias-markdown-code-segment-selected': '#1c1c1f',
    '--dsw-alias-markdown-code-segment-unselected': '#161619',
    '--dsw-alias-markdown-inline-code': '#19191c',
    '--dsw-alias-markdown-placeholder': '#0e0e10',
    '--dsw-alias-markdown-tag': '#161619',
    '--dsw-alias-scrollbar-bg-l1': '#161619',
    '--dsw-alias-scrollbar-bg-l2': '#1c1c1f',
    '--dsw-alias-scrollbar-hover-l1': '#242428',
    '--dsw-alias-scrollbar-hover-l2': '#2e2e33',
    '--dsw-alias-state-business-primary': '#4d8dff',
    '--dsw-alias-state-business-tertiary': 'rgba(77,141,255,0.16)',
    '--dsw-alias-state-error-primary': '#f87171',
    '--dsw-alias-state-error-secondary': '#ef4444',
    '--dsw-alias-state-success-primary': '#4ade80',
    '--dsw-alias-state-success-secondary': '#22c55e',
    '--dsw-alias-state-success-tertiary': 'rgba(74,222,128,0.14)',
    '--dsw-alias-state-warn-label': '#fbbf24',
    '--dsw-alias-state-warn-primary': '#fbbf24',
    '--dsw-alias-state-warn-secondary': '#f59e0b',
    '--dsw-alias-state-warn-tertiary': 'rgba(251,191,36,0.14)',
    '--dsw-alias-toast-bg': '#1c1c1f',
    '--dsw-alias-tooltip-bg': '#242428',
    '--dsw-specific-bubble': '#1a1a1d',
    '--dsw-specific-bubble-highlight': 'rgba(77,141,255,0.2)',
    '--dsw-specific-input-major': '#141416',
    '--dsw-specific-login-input': '#101012',
    '--dsw-specific-menu': '#1c1c1f',
    '--dsw-specific-selector': '#161619',
    '--dsw-specific-sidebar-fill': '#0d0d0f',
    '--dsw-specific-sidebar-nav-item-active': 'rgba(77,141,255,0.16)',
    '--dsw-specific-sidebar-nav-item-active-accent': '#4d8dff',
    '--dsw-specific-sidebar-nav-item-hover': 'rgba(255,255,255,0.05)',
    '--dsw-specific-tip': '#161619',
  }
  const MOFEI_PAPER = {
    '--dsw-alias-bg-base': '#fafafa',
    '--dsw-alias-bg-layer-1': '#f2f2f3',
    '--dsw-alias-bg-layer-2': '#e9e9eb',
    '--dsw-alias-bg-layer-3': '#e0e0e3',
    '--dsw-alias-bg-module-platform': '#f5f5f6',
    '--dsw-alias-bg-multi-select': '#e9e9eb',
    '--dsw-alias-bg-overlay': 'rgba(250,250,250,0.92)',
    '--dsw-alias-bg-skeleton': 'rgba(0,0,0,0.06)',
    '--dsw-alias-bg-mask-1': 'rgba(0,0,0,0.45)',
    '--dsw-alias-bg-mask-2': 'rgba(0,0,0,0.16)',
    '--dsw-alias-bg-mask-3': 'rgba(0,0,0,0.4)',
    '--dsw-alias-bg-mask-photo': 'rgba(0,0,0,0.8)',
    '--dsw-alias-bg-mask-drop': 'rgba(90,90,95,0.5)',
    '--dsw-alias-border-l1': 'rgba(0,0,0,0.08)',
    '--dsw-alias-border-l2': 'rgba(0,0,0,0.13)',
    '--dsw-alias-border-l2-darkmode-thin': 'rgba(0,0,0,0.08)',
    '--dsw-alias-border-l3': 'rgba(0,0,0,0.18)',
    '--dsw-alias-border-l4': 'rgba(0,0,0,0.24)',
    '--dsw-alias-border-inverted': 'rgba(0,0,0,0.06)',
    '--dsw-alias-border-inverted2': 'rgba(0,0,0,0.07)',
    '--dsw-alias-brand-primary': '#3b6fe0',
    '--dsw-alias-brand-primary-invert': '#fafafa',
    '--dsw-alias-brand-primary-new-colorprimary-new-color': '#4d8dff',
    '--dsw-alias-brand-text': '#1a1a1a',
    '--dsw-alias-button-contrast-fill': '#1a1a1a',
    '--dsw-alias-button-elevated-fill': '#e9e9eb',
    '--dsw-alias-button-floating-fill': '#ffffff',
    '--dsw-alias-button-floating-hover': '#f2f2f3',
    '--dsw-alias-button-ghost-active-border': '#3b6fe0',
    '--dsw-alias-button-ghost-active-fill': 'rgba(59,111,224,0.12)',
    '--dsw-alias-button-ghost-active-hover': 'rgba(59,111,224,0.18)',
    '--dsw-alias-button-info-fill': '#3b6fe0',
    '--dsw-alias-button-info-hover': '#4d8dff',
    '--dsw-alias-button-primary-dimmed': '#d8dde8',
    '--dsw-alias-button-primary-fill': '#3b6fe0',
    '--dsw-alias-button-primary-hover': '#2f5bc4',
    '--dsw-alias-button-tool-bar-fill': 'rgba(84,85,87,0.5)',
    '--dsw-alias-button-tool-bar-hover': 'rgba(84,85,87,0.6)',
    '--dsw-alias-button-tool-bar-fill-invisible': 'rgba(31,31,31,0.36)',
    '--dsw-alias-interactive-bg-active': 'rgba(0,0,0,0.1)',
    '--dsw-alias-interactive-bg-hover': 'rgba(0,0,0,0.05)',
    '--dsw-alias-interactive-bg-hover-accent': 'rgba(59,111,224,0.1)',
    '--dsw-alias-interactive-bg-hover-danger': 'rgba(220,60,50,0.06)',
    '--dsw-alias-interactive-bg-hover-solid': '#e0e0e3',
    '--dsw-alias-label-primary': '#1a1a1a',
    '--dsw-alias-label-secondary': '#52525a',
    '--dsw-alias-label-tertiary': '#8a8a92',
    '--dsw-alias-label-caption': '#9c9ca4',
    '--dsw-alias-label-dimmed': '#b4b4bb',
    '--dsw-alias-label-primary-bluish': '#1a1a1a',
    '--dsw-alias-label-primary-dimmed': '#3a3a40',
    '--dsw-alias-label-primary-foreground': '#fafafa',
    '--dsw-alias-label-primary-inverted': '#fafafa',
    '--dsw-alias-markdown-citation': '#e9e9eb',
    '--dsw-alias-markdown-code-block': '#f2f2f3',
    '--dsw-alias-markdown-code-block-banner': '#e9e9eb',
    '--dsw-alias-markdown-code-segment-selected': '#e0e0e3',
    '--dsw-alias-markdown-code-segment-unselected': '#e9e9eb',
    '--dsw-alias-markdown-inline-code': '#e4e4e7',
    '--dsw-alias-markdown-placeholder': '#f5f5f6',
    '--dsw-alias-markdown-tag': '#e9e9eb',
    '--dsw-alias-scrollbar-bg-l1': '#e9e9eb',
    '--dsw-alias-scrollbar-bg-l2': '#e0e0e3',
    '--dsw-alias-scrollbar-hover-l1': '#d4d4d9',
    '--dsw-alias-scrollbar-hover-l2': '#c9c9cf',
    '--dsw-alias-state-business-primary': '#3b6fe0',
    '--dsw-alias-state-business-tertiary': 'rgba(59,111,224,0.1)',
    '--dsw-alias-state-error-primary': '#b3473f',
    '--dsw-alias-state-error-secondary': '#c95f58',
    '--dsw-alias-state-success-primary': '#3f7d52',
    '--dsw-alias-state-success-secondary': '#4f925f',
    '--dsw-alias-state-success-tertiary': 'rgba(63,125,82,0.12)',
    '--dsw-alias-state-warn-label': '#9a6b1f',
    '--dsw-alias-state-warn-primary': '#b8860b',
    '--dsw-alias-state-warn-secondary': '#a06c10',
    '--dsw-alias-state-warn-tertiary': 'rgba(184,134,11,0.12)',
    '--dsw-alias-toast-bg': '#1c1c1f',
    '--dsw-alias-tooltip-bg': '#242428',
    '--dsw-specific-bubble': '#ececef',
    '--dsw-specific-bubble-highlight': 'rgba(59,111,224,0.12)',
    '--dsw-specific-input-major': '#f4f4f5',
    '--dsw-specific-login-input': '#f2f2f3',
    '--dsw-specific-menu': '#e9e9eb',
    '--dsw-specific-selector': '#ececef',
    '--dsw-specific-sidebar-fill': '#f5f5f6',
    '--dsw-specific-sidebar-nav-item-active': 'rgba(59,111,224,0.1)',
    '--dsw-specific-sidebar-nav-item-active-accent': '#3b6fe0',
    '--dsw-specific-sidebar-nav-item-hover': 'rgba(0,0,0,0.04)',
    '--dsw-specific-tip': '#e9e9eb',
  }
  // 双色板 → overrideTokens 的 { light, dark } 对（light 缺项回退 ink）
  function mofeiTokenPairs() {
    const pairs = {}
    for (const name of Object.keys(MOFEI_INK)) pairs[name] = { light: MOFEI_PAPER[name] || MOFEI_INK[name], dark: MOFEI_INK[name] }
    return pairs
  }

  // v0.12.1 对话面板：pending 交互卡（工具审批 / 提问）——面板内直接应答（PendingWait.respond）
  // approval payload: { approvalId, toolName, callId?, reason? } → respond({ sessionId, approvalId, outcome: 'allowed-once'|'rejected' })
  // question payload: { questions: [{id, question, detail?, header?, options?: [{label}], multiSelect?}] } → respond({ sessionId, answer: { answers: [{ id, selected: [labels], custom? }] } })
  function PendingCard(props) {
    const item = props && props.item
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState('')
    const [picks, setPicks] = React.useState({})
    if (!item || !item.payload) return null
    const fail = (failure) => { setError('应答失败：' + ((failure && failure.message) || String(failure))); setBusy(false) }
    if (item.kind === 'approval') {
      const payload = item.payload
      const send = (outcome) => {
        if (busy) return
        setBusy(true); setError('')
        Promise.resolve(item.respond({ sessionId: item.sessionId, approvalId: payload.approvalId, outcome })).catch(fail)
      }
      return h('div', { className: 'mf-pend' },
        h('div', { className: 'mf-pend-head' }, '⚠ 工具审批'),
        h('div', { className: 'mf-pend-body' }, h('strong', null, payload.toolName || '工具调用'), payload.reason ? h('div', { className: 'mf-pend-reason' }, payload.reason) : null),
        error ? h('div', { className: 'mf-alert' }, error) : null,
        h('div', { className: 'mf-pend-actions' },
          h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: busy, onClick: () => send('allowed-once') }, busy ? '提交中…' : '允许一次'),
          h('button', { className: 'mf-btn', type: 'button', disabled: busy, onClick: () => send('rejected') }, '拒绝')))
    }
    const questions = Array.isArray(item.payload.questions) ? item.payload.questions : []
    const toggleOption = (qId, label) => setPicks((prev) => {
      const current = (prev[qId] && prev[qId].selected) || []
      return { ...prev, [qId]: { selected: current.includes(label) ? current.filter((x) => x !== label) : current.concat([label]), custom: (prev[qId] && prev[qId].custom) || '' } }
    })
    const pickOption = (qId, label) => setPicks((prev) => ({ ...prev, [qId]: { selected: [label], custom: (prev[qId] && prev[qId].custom) || '' } }))
    const setCustom = (qId, text) => setPicks((prev) => ({ ...prev, [qId]: { selected: (prev[qId] && prev[qId].selected) || [], custom: text } }))
    const submit = () => {
      if (busy) return
      const answers = questions.map((q) => ({ id: q.id, selected: (picks[q.id] && picks[q.id].selected) || [], custom: (picks[q.id] && picks[q.id].custom) || undefined }))
      setBusy(true); setError('')
      Promise.resolve(item.respond({ sessionId: item.sessionId, answer: { answers } })).catch(fail)
    }
    return h('div', { className: 'mf-pend' },
      h('div', { className: 'mf-pend-head' }, '❓ 提问'),
      questions.map((q) => h('div', { key: q.id, className: 'mf-pend-q' },
        h('div', { className: 'mf-pend-qtext' }, (q.header ? q.header + ' · ' : '') + q.question),
        q.detail ? h('div', { className: 'mf-pend-reason' }, q.detail) : null,
        Array.isArray(q.options) && q.options.length
          ? h('div', { className: 'mf-pend-opts' }, q.options.map((opt) => {
              const chosen = ((picks[q.id] || {}).selected || []).includes(opt.label)
              return h('button', { key: opt.label, type: 'button', className: 'mf-pend-opt' + (chosen ? ' on' : ''), disabled: busy, title: opt.description || '', onClick: () => (q.multiSelect ? toggleOption(q.id, opt.label) : pickOption(q.id, opt.label)) }, opt.label)
            }))
          : h('input', { className: 'mf-input mf-pend-custom', value: ((picks[q.id] || {}).custom) || '', placeholder: '输入回答…', disabled: busy, onChange: (event) => setCustom(q.id, event.target.value) }))),
      error ? h('div', { className: 'mf-alert' }, error) : null,
      h('div', { className: 'mf-pend-actions' },
        h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: busy, onClick: submit }, busy ? '提交中…' : '提交回答')))
  }

  // 从 @提及文本中解析 projectId/chapterId（送章/送选中/Writer/Reviewer 提及共用格式）
  function parseMentionIds(text) {
    const source = typeof text === 'string' ? text : ''
    const project = source.match(/projectId:\s*([A-Za-z0-9_-]+)/)
    const chapter = source.match(/chapterId:\s*([A-Za-z0-9_-]+)/)
    return { projectId: project ? project[1] : '', chapterId: chapter ? chapter[1] : '' }
  }

  function Workspace(props) {
    // v0.12.1: mode='web' = 3088 整体为墨扉 web（conversation.session 单槽替换，官方对话内嵌右面板）；缺省 = 侧栏入口 overlay
    // v0.14: mode='web' 语义更新 = 变形后的墨扉工作台（原版 web 保留，官方对话在右窄条）；onCollapse = 收起工作台返回原版 web
    const mode = (props && props.mode) || 'overlay'
    const onCollapse = props && props.onCollapse
    const openState = useOpen()
    const open = mode === 'web' ? true : openState
    React.useEffect(() => {
      if (mode !== 'web') return undefined
      ensureStyles()
      // 官方 composer 占位符改为写作向文案（原为 coding 平台文案）
      later(applyWritingComposerPlaceholder, 300)
      return () => { removeStyles() }
    }, [mode])
    const [projects, setProjects] = React.useState([])
    const [drafts, setDrafts] = React.useState([])
    const [stats, setStats] = React.useState(null)
    const [projectId, setProjectId] = React.useState('')
    // v0.13.1: web 模式项目列表本地搜索（预览对齐：搜索项目…）
    const [projQuery, setProjQuery] = React.useState('')
    const [chapterId, setChapterId] = React.useState('')
    const [draft, setDraft] = React.useState('')
    const [saved, setSaved] = React.useState('')
    const [titleDraft, setTitleDraft] = React.useState('')
    const [revision, setRevision] = React.useState(0)
    const [status, setStatus] = React.useState('saved')
    const [error, setError] = React.useState('')
    const [conflict, setConflict] = React.useState(null)
    const [loading, setLoading] = React.useState(true)
    const [projectForm, setProjectForm] = React.useState(false)
    const [chapterForm, setChapterForm] = React.useState(false)
    const [newProject, setNewProject] = React.useState('')
    const [newChapter, setNewChapter] = React.useState('')
    const [focus, setFocus] = React.useState(false)
    const [showHistory, setShowHistory] = React.useState(false)
    const [historyList, setHistoryList] = React.useState([])
    const [historyLoading, setHistoryLoading] = React.useState(false)
    const [armed, setArmed] = React.useState(null)
    const [rename, setRename] = React.useState(null)
    const [renameValue, setRenameValue] = React.useState('')
    const [goalForm, setGoalForm] = React.useState(false)
    const [goalInput, setGoalInput] = React.useState('')
    const [projectWide, setProjectWide] = React.useState(false)
    // v7 摘要面板
    const [summaryOpen, setSummaryOpen] = React.useState(false)
    const [summaryRows, setSummaryRows] = React.useState([])
    const [summaryRanges, setSummaryRanges] = React.useState([])
    const [summaryLoading, setSummaryLoading] = React.useState(false)
    const [summaryError, setSummaryError] = React.useState('')
    const [summaryBusy, setSummaryBusy] = React.useState(null)
    const [summaryProgress, setSummaryProgress] = React.useState(null)
    const [summaryResult, setSummaryResult] = React.useState(null)
    // v8 @提及桥接
    const [bridgeNotice, setBridgeNotice] = React.useState('')
    const bridgeNoticeTimer = React.useRef(null)
    // v7 世界书批量
    const [worldQuery, setWorldQuery] = React.useState('')
    const [worldSelected, setWorldSelected] = React.useState([])
    const [worldBatchBusy, setWorldBatchBusy] = React.useState(false)
    const [worldDeleteArmed, setWorldDeleteArmed] = React.useState(false)
    const worldDeleteTimer = React.useRef(null)
    // v8 实体历史（角色/笔记/世界书）
    const [entityHistOpen, setEntityHistOpen] = React.useState(false)
    const [entityHistKind, setEntityHistKind] = React.useState('')
    const [entityHistList, setEntityHistList] = React.useState([])
    const [entityHistLoading, setEntityHistLoading] = React.useState(false)
    const [entityHistError, setEntityHistError] = React.useState('')
    // v9 prompt chains
    const [chainsOpen, setChainsOpen] = React.useState(false)
    const [chains, setChains] = React.useState([])
    const [chainActiveId, setChainActiveId] = React.useState('')
    const [chainBusy, setChainBusy] = React.useState(false)
    const [chainError, setChainError] = React.useState('')
    const [chainResult, setChainResult] = React.useState('')
    const [chainLastPrompt, setChainLastPrompt] = React.useState('')
    // 写作技能由 mofei-writer preset 隔离注册；这里仅提供作者可见的技能目录。
    const [skillsOpen, setSkillsOpen] = React.useState(false)
    const [writingSkills, setWritingSkills] = React.useState([])
    const [skillSettings, setSkillSettings] = React.useState(null)
    const [skillsLoading, setSkillsLoading] = React.useState(false)
    const [skillsError, setSkillsError] = React.useState('')
    const [dashOpen, setDashOpen] = React.useState(false)
    // v10: 命令面板 + 写作风格
    const [paletteOpen, setPaletteOpen] = React.useState(false)
    const [paletteQuery, setPaletteQuery] = React.useState('')
    const [styles, setStyles] = React.useState([])
    const [currentStyle, setCurrentStyle] = React.useState('default')
    // v0.10.1: 检索视图（结构化 RAG）
    const [retrieveQuery, setRetrieveQuery] = React.useState('')
    const [retrieveResults, setRetrieveResults] = React.useState([])
    const [retrieveBusy, setRetrieveBusy] = React.useState(false)
    const [retrieveError, setRetrieveError] = React.useState('')
    // v0.10.1: 风格视图（新建/编辑/预览/删除）
    const [selStyleId, setSelStyleId] = React.useState('')
    const [styleName, setStyleName] = React.useState('')
    const [styleDesc, setStyleDesc] = React.useState('')
    const [styleTags, setStyleTags] = React.useState('')
    const [styleContent, setStyleContent] = React.useState('')
    const [styleDirty, setStyleDirty] = React.useState(false)
    const [styleError, setStyleError] = React.useState('')
    const [styleScope, setStyleScope] = React.useState('global')
    const [stylePreview, setStylePreview] = React.useState(false)
    // v0.10.1: git 历史面板
    const [gitHistOpen, setGitHistOpen] = React.useState(false)
    const [gitHistData, setGitHistData] = React.useState(null)
    const [gitHistLoading, setGitHistLoading] = React.useState(false)
    const [gitHistDiff, setGitHistDiff] = React.useState(false)
    const [gitHistChain, setGitHistChain] = React.useState(null)
    // v0.10.2: 后台任务（DSH Jobs）
    const [jobListOpen, setJobListOpen] = React.useState(false)
    const [mofeiJobs, setMofeiJobs] = React.useState([])
    const [aiBatchJobId, setAiBatchJobId] = React.useState('')
    // v0.11: Agent 对话面板（右侧常驻，缩小版 DSH web）
    const [chatOpen, setChatOpen] = React.useState(true)
    const [chatInput, setChatInput] = React.useState('')
    const [chatSessionId, setChatSessionId] = React.useState('')
    const [chatSnap, setChatSnap] = React.useState(null)
    const [chatSummary, setChatSummary] = React.useState(null)
    const [chatBusy, setChatBusy] = React.useState(false)
    const [chatError, setChatError] = React.useState('')
    const [chatHint, setChatHint] = React.useState('')
    // v0.12.1: 新建会话的预设选择（agentPresets.list；仅多预设时显示选择器）
    const [chatPresets, setChatPresets] = React.useState([])
    const [chatPresetId, setChatPresetId] = React.useState('mofei-writer')
    // v0.13: 右气泡会话条（默认收起，点方向键弹出列表）
    const [chatSessionsOpen, setChatSessionsOpen] = React.useState(false)
    const [chatSessionList, setChatSessionList] = React.useState({ ids: [], byId: {} })
    const [agentContextBound, setAgentContextBound] = React.useState(false)
    // 新项目默认继承当前 DSH 会话的工作区；作者可在向导中改为其他目录。
    const [onboardOpen, setOnboardOpen] = React.useState(false)
    const [onboardFolder, setOnboardFolder] = React.useState(() => currentDshWorkspacePath())
    const [onboardTitle, setOnboardTitle] = React.useState('')
    const [onboardBusy, setOnboardBusy] = React.useState(false)
    const [onboardError, setOnboardError] = React.useState('')
    const [onboardPicking, setOnboardPicking] = React.useState(false)
    const autoSessionMenuRef = React.useRef(false)
    const chatBodyRef = React.useRef(null)
    // v0.10.1: 标签页增强（混开/固定/右键菜单/拖拽/滚动记忆）
    const [tabMenu, setTabMenu] = React.useState(null)
    const [tabDragId, setTabDragId] = React.useState('')
    // v6 布局：三栏拖拽调宽 + 持久化
    const [layout, setLayout] = React.useState(() => loadLayout(typeof localStorage !== 'undefined' ? localStorage : null))
    const [dragAxis, setDragAxis] = React.useState('')
    const layoutRef = React.useRef(layout)
    const layoutDragRef = React.useRef(null)
    function applyLayout(next) { layoutRef.current = next; setLayout(next) }
    function panelWidth() {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const panelEl = document.querySelector('.mf-panel')
        if (panelEl && panelEl.clientWidth) return panelEl.clientWidth
        return window.innerWidth
      }
      return 1240
    }
    function resetLayoutAxis(axis) {
      const base = layoutRef.current || LAYOUT_DEFAULTS
      const next = normalizeLayout(axis === 'left'
        ? { left: LAYOUT_DEFAULTS.left, middle: base.middle }
        : { left: base.left, middle: LAYOUT_DEFAULTS.middle }, panelWidth())
      applyLayout(next)
      saveLayout(typeof localStorage !== 'undefined' ? localStorage : null, 'mofei.layout', next)
    }
    function startGutterDrag(event) {
      const axis = event.currentTarget.getAttribute('data-axis')
      if (axis !== 'left' && axis !== 'middle') return
      event.preventDefault()
      setDragAxis(axis)
      layoutDragRef.current = { axis, startX: event.clientX, startLayout: layoutRef.current }
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch (error) { /* 忽略 pointer capture 失败 */ }
    }
    function moveGutterDrag(event) {
      const drag = layoutDragRef.current
      if (!drag) return
      applyLayout(nextLayout(drag.startLayout, drag.axis, event.clientX - drag.startX, panelWidth()))
    }
    function endGutterDrag() {
      const drag = layoutDragRef.current
      if (drag) {
        layoutDragRef.current = null
        setDragAxis('')
        saveLayout(typeof localStorage !== 'undefined' ? localStorage : null, 'mofei.layout', layoutRef.current)
      }
    }
    function cancelGutterDrag() { layoutDragRef.current = null; setDragAxis('') }
    function resetGutter(event) {
      const axis = event.currentTarget.getAttribute('data-axis')
      if (axis === 'left' || axis === 'middle') resetLayoutAxis(axis)
    }
    // v4
    const [tab, setTab] = React.useState('projects')
    const [selChar, setSelChar] = React.useState('')
    const [charName, setCharName] = React.useState('')
    const [charDesc, setCharDesc] = React.useState('')
    const [charDirty, setCharDirty] = React.useState(false)
    const [charForm, setCharForm] = React.useState(false)
    const [newChar, setNewChar] = React.useState('')
    const [selNote, setSelNote] = React.useState('')
    const [noteTitle, setNoteTitle] = React.useState('')
    const [noteContent, setNoteContent] = React.useState('')
    const [noteDirty, setNoteDirty] = React.useState(false)
    const [noteForm, setNoteForm] = React.useState(false)
    const [newNote, setNewNote] = React.useState('')
    const [catForm, setCatForm] = React.useState(false)
    const [newCat, setNewCat] = React.useState('')
    const [subCatFor, setSubCatFor] = React.useState('')
    const [newSubCat, setNewSubCat] = React.useState('')
    const [volForm, setVolForm] = React.useState(false)
    const [newVol, setNewVol] = React.useState('')
    const [moveVolFor, setMoveVolFor] = React.useState('')
    const [searchOpen, setSearchOpen] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState('')
    const [searchResults, setSearchResults] = React.useState([])
    const [searching, setSearching] = React.useState(false)
    // v5: TXT 导入
    const [importOpen, setImportOpen] = React.useState(false)
    const [importBusy, setImportBusy] = React.useState(false)
    const [importError, setImportError] = React.useState('')
    const [importPreview, setImportPreview] = React.useState(null)
    const [importContent, setImportContent] = React.useState('')
    const [importName, setImportName] = React.useState('')
    const [importEncoding, setImportEncoding] = React.useState('')
    // v5: 多标签 + 查找替换
    const [openTabs, setOpenTabs] = React.useState([])
    const [findOpen, setFindOpen] = React.useState(false)
    const [findQuery, setFindQuery] = React.useState('')
    const [replaceQuery, setReplaceQuery] = React.useState('')
    const [findMatches, setFindMatches] = React.useState([])
    const [findIndex, setFindIndex] = React.useState(-1)
    // v5: AI 助手
    const [aiOpen, setAiOpen] = React.useState(false)
    const [aiMode, setAiMode] = React.useState('continue')
    const [aiPrompt, setAiPrompt] = React.useState('')
    const [aiBusy, setAiBusy] = React.useState(false)
    const [aiResult, setAiResult] = React.useState('')
    const [aiError, setAiError] = React.useState('')
    // v7: AI 会话历史 + 批量摘要
    const [aiHistory, setAiHistory] = React.useState([])
    const [aiHistoryOpen, setAiHistoryOpen] = React.useState(false)
    const [aiBatchBusy, setAiBatchBusy] = React.useState(false)
    const [aiBatchResults, setAiBatchResults] = React.useState([])
    const [aiBatchError, setAiBatchError] = React.useState('')
    // v9: SSE 流式生成
    const aiAbort = React.useRef(null)
    // v10: 上次恢复记录（用于打开项目后自动恢复上次章节）
    const restoredProjectRef = React.useRef('')
    const projectRestoredRef = React.useRef(false)
    // v8: 写作热力图 + Markdown 工具条
    const [statsOpen, setStatsOpen] = React.useState(false)
    const [dragKind, setDragKind] = React.useState('')
    const [dragId, setDragId] = React.useState('')
    const [selStart, setSelStart] = React.useState(0)
    const [selEnd, setSelEnd] = React.useState(0)
    // v6: 世界书
    const [selWorld, setSelWorld] = React.useState('')
    const [worldName, setWorldName] = React.useState('')
    const [worldKeys, setWorldKeys] = React.useState('')
    const [worldContent, setWorldContent] = React.useState('')
    const [worldDirty, setWorldDirty] = React.useState(false)
    const [worldForm, setWorldForm] = React.useState(false)
    const [newWorld, setNewWorld] = React.useState('')
    const [worldImportOpen, setWorldImportOpen] = React.useState(false)
    const [worldImportMode, setWorldImportMode] = React.useState('append')
    const [worldImportBusy, setWorldImportBusy] = React.useState(false)
    const [worldImportError, setWorldImportError] = React.useState('')
    const [worldImportResult, setWorldImportResult] = React.useState('')
    const locks = React.useRef({})
    const agentMutationRefreshRef = React.useRef('')

    const project = projects.find((item) => item.id === projectId)
    const chapter = project && project.chapters.find((item) => item.id === chapterId)
    const character = project && project.characters.find((item) => item.id === selChar)
    const note = project && project.notes.find((item) => item.id === selNote)
    const worldEntry = project && project.worldEntries && project.worldEntries.find((item) => item.id === selWorld)
    const changed = !!chapterId && draft !== saved
    const activeTabId = tab === 'notes' && selNote ? selNote : chapterId
    // v0.10.2: 检索结果按卷/实体类型分组展示
    const retrieveGrouped = React.useMemo(() => {
      const groups = []
      const byKey = new Map()
      retrieveResults.forEach((hit) => {
        const key = hit.entityType === 'chapter' || hit.entityType === 'summary'
          ? (hit.volumeTitle || '未分组')
          : hit.entityType === 'character' ? '角色' : hit.entityType === 'note' ? '笔记' : hit.entityType === 'world' ? '世界书' : '其他'
        let group = byKey.get(key)
        if (!group) { group = { title: key, hits: [] }; byKey.set(key, group); groups.push(group) }
        group.hits.push(hit)
      })
      return groups
    }, [retrieveResults])
    const projectChars = project ? project.chapters.reduce((sum, item) => sum + item.content.length, 0) : 0
    const volumes = project ? project.volumes.slice().sort((a, b) => a.order - b.order) : []
    const ungrouped = project ? project.chapters.filter((c) => !c.volumeId).slice().sort((a, b) => a.order - b.order) : []
    const categories = project ? project.noteCategories.slice().sort((a, b) => a.title.localeCompare(b.title, 'zh')) : []
    const worldEntries = project && Array.isArray(project.worldEntries) ? project.worldEntries.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : []
    const worldFiltered = filterWorldEntries(worldEntries, worldQuery)
    const rootCats = categories.filter((c) => !c.parentId)
    const childCats = categories.filter((c) => c.parentId)

    function arm(kind, id) {
      if (armed && armed.kind === kind && armed.id === id) return true
      setArmed({ kind, id })
      later(() => setArmed((current) => current && current.kind === kind && current.id === id ? null : current), 4000)
      return false
    }
    function disarm() { setArmed(null) }
    function reload() {
      return call('bootstrap', {}).then((result) => {
        const nextProjects = result && Array.isArray(result.projects) ? result.projects : []
        setProjects(nextProjects)
        setDrafts(result && Array.isArray(result.drafts) ? result.drafts : [])
        if (result && result.stats) setStats(result.stats)
        setOpenTabs((tabs) => tabs.map((t) => { const currentProject = nextProjects.find((item) => item.id === projectId); if (t.kind === 'note') { const note = currentProject && currentProject.notes.find((item2) => item2.id === t.id); return note ? { kind: 'note', id: t.id, title: note.title, pinned: t.pinned } : t } const currentChapter = currentProject && currentProject.chapters.find((item2) => item2.id === t.id); return currentChapter ? { kind: 'chapter', id: t.id, title: currentChapter.title, pinned: t.pinned } : t }))
        if (projectId && !nextProjects.find((item) => item.id === projectId)) { setProjectId(''); setChapterId(''); setDraft(''); setSaved(''); setRevision(0); setStatus('saved'); setError(''); setConflict(null); setSelChar(''); setSelNote(''); setSelWorld(''); setWorldName(''); setWorldKeys(''); setWorldContent(''); setWorldDirty(false); setAiHistory([]); setAiResult(''); setAiError(''); setAiBatchResults([]); setAiBatchError(''); setOpenTabs([]) }
        else if (chapterId && nextProjects.find((item) => item.id === projectId) && !nextProjects.find((item) => item.id === projectId).chapters.find((item2) => item2.id === chapterId)) { setChapterId(''); setDraft(''); setSaved(''); setRevision(0); setStatus('saved'); setError(''); setConflict(null) }
        else {
          const latest = chapterId && nextProjects.find((item) => item.id === projectId) && nextProjects.find((item) => item.id === projectId).chapters.find((item) => item.id === chapterId)
          if (latest && latest.revision !== revision) {
            if (changed) { setConflict(latest); setStatus('error'); setError('写作 Agent 已更新远端正文，当前草稿没有被覆盖。') }
            else { setDraft(latest.content); setSaved(latest.content); setRevision(latest.revision); setStatus('saved'); setError(''); setConflict(null) }
          }
        }
        return result
      }).catch((failure) => { setError('操作失败'); console.error(failure); return null })
    }
    // v0.18: 初始向导——空白状态引导选择「小说文件夹」（后续所有文件保存在那里）
    function pickOnboardFolder() {
      if (onboardPicking) return
      setOnboardPicking(true); setOnboardError('')
      dshCall('host.pickDirectory', {}).then((picked) => {
        setOnboardPicking(false)
        if (typeof picked === 'string' && picked.trim()) setOnboardFolder(picked.trim())
      }).catch((failure) => { setOnboardPicking(false); setOnboardError('选择文件夹失败：' + String((failure && failure.message) || failure)) })
    }
    function startOnboardProject() {
      if (onboardBusy) return
      const title = onboardTitle.trim() || '未命名小说'
      setOnboardBusy(true); setOnboardError('')
      call('create-project', { title, ...(onboardFolder ? { rootDir: onboardFolder } : {}) }).then((result) => {
        setOnboardBusy(false)
        if (result && result.project) {
          setOnboardOpen(false)
          setProjectId(result.project.id)
          try { if (typeof localStorage !== 'undefined') localStorage['mofei.lastProject'] = result.project.id } catch (persistError) { /* noop */ }
          reload()
        } else setOnboardError((result && result.error) || '创建项目失败')
      }).catch((failure) => { setOnboardBusy(false); setOnboardError('创建项目失败：' + String((failure && failure.message) || failure)) })
    }
    React.useEffect(() => {
      if (!open) return undefined
      let alive = true; setLoading(true)
      call('bootstrap', {}).then((result) => {
        if (!alive) return
        const nextProjects = result && Array.isArray(result.projects) ? result.projects : []
        setProjects(nextProjects)
        setDrafts(result && Array.isArray(result.drafts) ? result.drafts : [])
        if (result && result.stats) setStats(result.stats)
        if (!projectRestoredRef.current) {
          projectRestoredRef.current = true
          try {
            if (typeof localStorage !== 'undefined') {
              const lastProject = localStorage['mofei.lastProject'] || null
              if (lastProject && nextProjects.find((item) => item.id === lastProject)) setProjectId(lastProject)
              else if (lastProject) delete localStorage['mofei.lastProject']
            }
          } catch (persistError) { /* noop */ }
        }
        setLoading(false)
      }).catch((failure) => { if (alive) { setLoading(false); setError('无法加载写作工作区') }; console.error(failure) })
      return () => { alive = false }
    }, [open])
    function persist() {
      if (!projectId || !chapterId || !changed) return Promise.resolve(null)
      return call('save-draft', { projectId, chapterId, content: draft, baseRevision: revision }).then((result) => { if (result && result.draft) setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === chapterId)).concat([result.draft])); return result }).catch((failure) => { setStatus('error'); setError('草稿持久化失败，请勿关闭页面'); console.error(failure); return null })
    }
    function updateView(next) { setProjects((items) => items.map((item) => item.id !== projectId ? item : { ...item, chapters: item.chapters.map((current) => current.id === next.id ? next : current) })) }
    function accept(next) { updateView(next); setDraft(next.content); setSaved(next.content); setRevision(next.revision); setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === next.id))); setStatus('saved'); setError(''); setConflict(null) }
    function saveChapter() {
      if (!changed || status === 'saving' || conflict) return Promise.resolve(null)
      const contentLimit = getEditorContentLimit(draft)
      if (!contentLimit.isWithinLimit) { setStatus('error'); setError(formatContentLimitError(contentLimit)); return Promise.resolve(null) }
      const key = projectId + ':' + chapterId
      if (locks.current[key]) return locks.current[key]
      setStatus('saving'); setError('')
      const operation = call('update-chapter', { projectId, chapterId, content: draft, expectedRevision: revision }).then((result) => { if (result && result.stats) setStats(result.stats); if (result && result.conflict) { setConflict(result.chapter); setStatus('error'); setError('远端正文已更新，当前草稿没有被覆盖。') } else if (result && result.chapter) accept(result.chapter); else { setStatus('error'); setError('保存失败，草稿仍已保留') }; return result }).catch((failure) => { setStatus('error'); setError('保存失败，草稿仍已保留'); console.error(failure); return null }).then((result) => { delete locks.current[key]; return result })
      locks.current[key] = operation; return operation
    }
    React.useEffect(() => { if (!open || !changed) return undefined; const task = debounce(() => { persist() }, 800); task(); return () => task.dispose() }, [open, projectId, chapterId, draft, revision])
    React.useEffect(() => { if (!open || !changed || status !== 'unsaved' || conflict) return undefined; const task = debounce(() => { saveChapter() }, 3000); task(); return () => task.dispose() }, [open, projectId, chapterId, draft, revision, status, conflict])
    React.useEffect(() => {
      if (!open || !showHistory || !projectId || !chapterId) { if (!showHistory) setHistoryList([]); return undefined }
      let alive = true; setHistoryLoading(true)
      call('chapter-history', { projectId, chapterId }).then((result) => { if (alive) { setHistoryList(result && Array.isArray(result.history) ? result.history : []); setHistoryLoading(false) } }).catch((failure) => { if (alive) { setHistoryLoading(false); setError('无法读取历史版本') }; console.error(failure) })
      return () => { alive = false }
    }, [open, showHistory, projectId, chapterId])
    React.useEffect(() => {
      if (!open || !searchOpen || !projectId) { if (!searchOpen) { setSearchResults([]); setSearchQuery('') } return undefined }
      const query = searchQuery.trim()
      if (!query) { setSearchResults([]); setSearching(false); return undefined }
      setSearching(true)
      const task = debounce(() => {
        call('search-chapters', { projectId, query }).then((result) => { setSearchResults(result && Array.isArray(result.results) ? result.results : []); setSearching(false) }).catch((failure) => { setSearching(false); console.error(failure) })
      }, 350)
      task()
      return () => task.dispose()
    }, [open, searchOpen, projectId, searchQuery])
    function pickProject(id) { persist(); disarm(); setShowHistory(false); setSearchOpen(false); setOpenTabs([]); setFindOpen(false); setProjectId(id); setChapterId(''); setDraft(''); setSaved(''); setRevision(0); setStatus('saved'); setError(''); setConflict(null); setSelChar(''); setSelNote(''); setSelWorld(''); setWorldName(''); setWorldKeys(''); setWorldContent(''); setWorldDirty(false); setAiHistory([]); setAiResult(''); setAiError(''); setAiBatchResults([]); setAiBatchError(''); try { if (typeof localStorage !== 'undefined') localStorage['mofei.lastProject'] = id } catch (persistError) { /* noop */ } }
    // v0.13: 返回项目列表（清空选中项目，不写 localStorage）
    function backToProjectList() { persist(); disarm(); setShowHistory(false); setSearchOpen(false); setOpenTabs([]); setFindOpen(false); setProjectId(''); setChapterId(''); setDraft(''); setSaved(''); setRevision(0); setStatus('saved'); setError(''); setConflict(null); setSelChar(''); setSelNote(''); setSelWorld(''); setWorldName(''); setWorldKeys(''); setWorldContent(''); setWorldDirty(false); setAiHistory([]); setAiResult(''); setAiError(''); setAiBatchResults([]); setAiBatchError('') }
    // v0.13: 会话相对时间
    function fmtAgo(value) {
      const at = typeof value === 'number' ? value : Date.parse(String(value || ''))
      if (!Number.isFinite(at)) return ''
      const diff = Math.max(0, Date.now() - at)
      const m = Math.floor(diff / 60000)
      if (m < 1) return '刚刚'
      if (m < 60) return m + '分'
      const h = Math.floor(m / 60)
      if (h < 24) return h + '时'
      const d = Math.floor(h / 24)
      return d + '天'
    }
    // v0.13: 选择会话（右气泡会话条）
    function selectChatSession(sessionId) {
      if (!sessionId || !project || project.writerSessionId !== sessionId) return
      const sessions = dshClientSessions
      setChatSessionId(sessionId)
      try { if (sessions && typeof sessions.open === 'function') sessions.open(sessionId) } catch (error) { /* noop */ }
      setChatSessionsOpen(false)
    }
    function pickChapter(next) { persist(); disarm(); setProjectWide(false); setShowHistory(false); setTab('projects'); const local = drafts.find((item) => item.projectId === projectId && item.chapterId === next.id); ensureTab(next); setChapterId(next.id); setSaved(next.content); setDraft(local ? local.content : next.content); setRevision(local ? local.baseRevision : next.revision); if (local && local.baseRevision !== next.revision) { setConflict(next); setStatus('error'); setError('正文版本已变化，本地草稿已恢复但不会覆盖正文。') } else { setConflict(null); setStatus(local && local.content !== next.content ? 'unsaved' : 'saved'); setError('') } try { if (typeof localStorage !== 'undefined') localStorage['mofei.lastChapter.' + projectId] = next.id } catch (persistError) { /* noop */ } restoreScrollPos() }
    React.useEffect(() => { setTitleDraft(chapter && typeof chapter.title === 'string' ? chapter.title : '') }, [chapterId])
    React.useEffect(() => {
      if (!open || !projectId || chapterId || restoredProjectRef.current === projectId) return undefined
      const currentProject = projects.find((item) => item.id === projectId)
      if (!currentProject) return undefined
      restoredProjectRef.current = projectId
      let lastId = null
      try { if (typeof localStorage !== 'undefined') lastId = localStorage['mofei.lastChapter.' + projectId] || null } catch (error) { lastId = null }
      if (!lastId) return undefined
      const target = currentProject.chapters.find((c) => c.id === lastId)
      if (target) pickChapter(target)
      return undefined
    }, [open, projectId, chapterId, projects])
    function jumpToResult(res) {
      const target = project && project.chapters.find((c) => c.id === res.chapterId)
      if (!target) return
      pickChapter(target)
      later(() => {
        const el = document.querySelector('textarea.mf-text')
        if (el) {
          const lines = el.value.split('\n')
          const first = res.matches && res.matches[0] ? res.matches[0].line : 1
          let pos = 0
          for (let i = 0; i < first - 1 && i < lines.length; i++) pos += lines[i].length + 1
          el.focus(); el.setSelectionRange(pos, pos)
          el.scrollTop = lines.length ? ((first - 1) / lines.length) * el.scrollHeight : 0
        }
      }, 350)
    }
    function createProject() {
      if (!newProject.trim()) return
      const rootDir = currentDshWorkspacePath()
      call('create-project', { title: newProject, ...(rootDir ? { rootDir } : {}) }).then((result) => {
        if (result && result.project) {
          setNewProject(''); setProjectForm(false); setProjectId(result.project.id)
          try { if (typeof localStorage !== 'undefined') localStorage['mofei.lastProject'] = result.project.id } catch (persistError) { /* noop */ }
          reload()
        }
      }).catch((failure) => { setError('创建项目失败'); console.error(failure) })
    }
    function createChapter(volumeId) { if (!projectId || !newChapter.trim()) return; call('create-chapter', { projectId, title: newChapter, volumeId: volumeId || null }).then((result) => { if (result && result.chapter) { setNewChapter(''); setChapterForm(false); setProjects((items) => items.map((item) => item.id !== projectId ? item : { ...item, chapters: item.chapters.concat([result.chapter]) })); pickChapter(result.chapter) } }).catch((failure) => { setError('创建章节失败'); console.error(failure) }) }
    function startRename(kind, id, currentTitle) { setRename({ kind, id }); setRenameValue(currentTitle) }
    function commitRename() {
      if (!rename || !renameValue.trim()) { setRename(null); return }
      const args = rename.kind === 'project' ? { projectId: rename.id, title: renameValue } : rename.kind === 'chapter' ? { projectId, chapterId: rename.id, title: renameValue } : rename.kind === 'volume' ? { projectId, volumeId: rename.id, title: renameValue } : rename.kind === 'character' ? { projectId, characterId: rename.id, name: renameValue } : rename.kind === 'note' ? { projectId, noteId: rename.id, title: renameValue } : { projectId, categoryId: rename.id, title: renameValue }
      const method = rename.kind === 'project' ? 'update-project' : rename.kind === 'chapter' ? 'update-chapter-meta' : rename.kind === 'volume' ? 'update-volume' : rename.kind === 'character' ? 'update-character' : rename.kind === 'note' ? 'update-note' : 'rename-note-category'
      call(method, args).then(() => { setRename(null); setRenameValue(''); reload() }).catch((failure) => { setError('重命名失败'); console.error(failure) })
    }
    function commitTitle() {
      if (!projectId || !chapterId || !chapter) return
      const value = String(titleDraft || '').trim()
      if (!value || value === chapter.title) { setTitleDraft(chapter.title); return }
      call('update-chapter-meta', { projectId, chapterId, title: value }).then(() => {
        setProjects((items) => items.map((item) => item.id !== projectId ? item : { ...item, chapters: item.chapters.map((current) => current.id === chapterId ? { ...current, title: value } : current) }))
        setOpenTabs((tabs) => tabs.map((t) => t.id === chapterId ? { ...t, title: value } : t))
        setTitleDraft(value)
      }).catch((failure) => { setError('章节标题保存失败'); console.error(failure) })
    }
    function deleteProject(id, confirmed) { if (!confirmed && !arm('delete-project', id)) return; call('delete-project', { projectId: id }).then(() => { disarm(); try { if (typeof localStorage !== 'undefined') { if (localStorage['mofei.lastProject'] === id) delete localStorage['mofei.lastProject']; const key = 'mofei.lastChapter.' + id; if (localStorage[key]) delete localStorage[key] } } catch (persistError) { /* noop */ } reload() }).catch((failure) => { disarm(); setError('删除项目失败'); console.error(failure) }) }
    function saveProjectDescription(item, description) { call('update-project', { projectId: item.id, description }).then(() => reload()).catch((failure) => { setError('简介保存失败'); console.error(failure) }) }
    function deleteChapter(id) { if (!arm('delete-chapter', id)) return; call('delete-chapter', { projectId, chapterId: id }).then(() => { disarm(); try { if (typeof localStorage !== 'undefined' && localStorage['mofei.lastChapter.' + projectId] === id) delete localStorage['mofei.lastChapter.' + projectId] } catch (error) { /* noop */ } reload() }).catch((failure) => { disarm(); setError('删除章节失败'); console.error(failure) }) }
    function deleteVolume(id) { if (!arm('delete-volume', id)) return; call('delete-volume', { projectId, volumeId: id }).then(() => { disarm(); reload() }).catch((failure) => { disarm(); setError('删除卷失败'); console.error(failure) }) }
    function deleteCharacter(id) { if (!arm('delete-character', id)) return; call('delete-character', { projectId, characterId: id }).then(() => { disarm(); if (selChar === id) { setSelChar(''); setCharName(''); setCharDesc(''); setCharDirty(false) } reload() }).catch((failure) => { disarm(); setError('删除角色失败'); console.error(failure) }) }
    function deleteNote(id) { if (!arm('delete-note', id)) return; call('delete-note', { projectId, noteId: id }).then(() => { disarm(); if (selNote === id) { setSelNote(''); setNoteTitle(''); setNoteContent(''); setNoteDirty(false) } reload() }).catch((failure) => { disarm(); setError('删除笔记失败'); console.error(failure) }) }
    function deleteCategory(id) { if (!arm('delete-category', id)) return; call('delete-note-category', { projectId, categoryId: id }).then(() => { disarm(); reload() }).catch((failure) => { disarm(); setError('删除分类失败'); console.error(failure) }) }
    function moveChapter(id, direction) { call('move-chapter', { projectId, chapterId: id, direction }).then(() => reload()).catch((failure) => { setError('调整顺序失败'); console.error(failure) }) }
    function moveVolume(id, direction) { call('move-volume', { projectId, volumeId: id, direction }).then(() => reload()).catch((failure) => { setError('调整卷顺序失败'); console.error(failure) }) }
    function reorderChapters(targetId, before) {
      if (!project || dragKind !== 'chapter' || !dragId || dragId === targetId) return
      const ordered = project.chapters.slice().sort((a, b) => a.order - b.order).map((c) => c.id)
      const from = ordered.indexOf(dragId)
      if (from < 0) return
      ordered.splice(from, 1)
      let to = ordered.indexOf(targetId)
      if (to < 0) return
      if (!before) to += 1
      ordered.splice(to, 0, dragId)
      call('reorder-chapters', { projectId, chapterIds: ordered }).then(() => reload()).catch((failure) => { setError('拖拽排序失败'); console.error(failure) })
    }
    function reorderVolumes(targetId, before) {
      if (!project || dragKind !== 'volume' || !dragId || dragId === targetId) return
      const ordered = project.volumes.slice().sort((a, b) => a.order - b.order).map((v) => v.id)
      const from = ordered.indexOf(dragId)
      if (from < 0) return
      ordered.splice(from, 1)
      let to = ordered.indexOf(targetId)
      if (to < 0) return
      if (!before) to += 1
      ordered.splice(to, 0, dragId)
      call('reorder-volumes', { projectId, volumeIds: ordered }).then(() => reload()).catch((failure) => { setError('拖拽排序失败'); console.error(failure) })
    }
    function setChapterVolume(id, volumeId) { call('set-chapter-volume', { projectId, chapterId: id, volumeId: volumeId || null }).then(() => { setMoveVolFor(''); reload() }).catch((failure) => { setError('移动章节失败'); console.error(failure) }) }
    function commitGoal() { const value = parseInt(goalInput, 10); if (isNaN(value) || value < 0) { setGoalForm(false); return } call('update-project', { projectId, goal: value }).then(() => { setGoalForm(false); reload() }).catch((failure) => { setError('设置目标失败'); console.error(failure) }) }
    function rollbackTo(rev) { if (!arm('rollback', String(rev))) return; call('rollback-chapter', { projectId, chapterId, toRevision: rev }).then((result) => { disarm(); setShowHistory(false); if (result && result.chapter) accept(result.chapter); else reload() }).catch((failure) => { disarm(); setError('回滚失败'); console.error(failure) }) }
    function pickCharacter(item) { setSelChar(item.id); setCharName(item.name); setCharDesc(item.description); setCharDirty(false); setEntityHistOpen(false); setEntityHistList([]) }
    function saveCharacter() { if (!selChar) return; call('update-character', { projectId, characterId: selChar, name: charName, description: charDesc }).then(() => { setCharDirty(false); reload() }).catch((failure) => { setError('保存角色失败'); console.error(failure) }) }
    function createCharacter() { if (!newChar.trim()) return; call('create-character', { projectId, name: newChar }).then((result) => { if (result && result.character) { setNewChar(''); setCharForm(false); reload() } }).catch((failure) => { setError('创建角色失败'); console.error(failure) }) }
    function toggleFavorite(id) { call('toggle-character-favorite', { projectId, characterId: id }).then(() => reload()).catch((failure) => { setError('收藏失败'); console.error(failure) }) }
    function pickWorld(item) { setSelWorld(item.id); setWorldName(item.name); setWorldKeys((item.keys || []).join('，')); setWorldContent(item.content); setWorldDirty(false); setEntityHistOpen(false); setEntityHistList([]) }
    function saveWorld() { if (!selWorld) return; if (worldNameConflict(worldEntries, worldName, selWorld)) { setError('世界书条目名称已存在'); return }; call('update-world-entry', { projectId, entryId: selWorld, name: worldName, keys: worldKeys, content: worldContent }).then(() => { setWorldDirty(false); reload() }).catch((failure) => { setError('保存世界书条目失败'); console.error(failure) }) }
    function createWorld() { if (!newWorld.trim()) return; if (worldNameConflict(worldEntries, newWorld, null)) { setError('世界书条目名称已存在'); return }; call('create-world-entry', { projectId, name: newWorld, content: '' }).then((result) => { if (result && result.entry) { setNewWorld(''); setWorldForm(false); pickWorld(result.entry); reload() } }).catch((failure) => { setError('创建世界书条目失败'); console.error(failure) }) }
    function deleteWorld(id) { if (!arm('delete-world', id)) return; call('delete-world-entry', { projectId, entryId: id }).then(() => { disarm(); if (selWorld === id) { setSelWorld(''); setWorldName(''); setWorldKeys(''); setWorldContent(''); setWorldDirty(false) } reload() }).catch((failure) => { disarm(); setError('删除世界书条目失败'); console.error(failure) }) }
    function toggleWorldFlag(id, field) { const current = worldEntries.find((item) => item.id === id); call('update-world-entry', { projectId, entryId: id, [field]: !(current ? current[field] : false) }).then(() => reload()).catch((failure) => { setError('切换失败'); console.error(failure) }) }
    // v7: 世界书搜索与批量操作
    function toggleWorldSelect(id) { setWorldSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : items.concat([id])) }
    function toggleWorldSelectAll() { setWorldSelected((items) => toggleAllSelection(worldEntries, items, filterWorldEntries(worldEntries, worldQuery))) }
    function runWorldBulkToggle(isEnabled) {
      if (!projectId || worldBatchBusy) return
      const plan = buildBulkTogglePlan(worldEntries, worldSelected, isEnabled)
      if (!plan.entryIds.length) return
      setWorldBatchBusy(true); setError('')
      const direct = () => call('update-world-entries', { projectId, entryIds: plan.entryIds, patch: { isEnabled: isEnabled } })
      direct().then(() => { setWorldBatchBusy(false); reload() }).catch((failure) => {
        if (String((failure && failure.message) || '').includes('METHOD_NOT_FOUND')) {
          Promise.all(plan.entryIds.map((entryId) => call('update-world-entry', { projectId, entryId, isEnabled: isEnabled }))).then(() => { setWorldBatchBusy(false); reload() }).catch((failure2) => { setWorldBatchBusy(false); setError('批量切换失败'); console.error(failure2) })
        } else { setWorldBatchBusy(false); setError('批量切换失败'); console.error(failure) }
      })
    }
    function runWorldBulkDelete() {
      if (!projectId || worldBatchBusy) return
      const plan = buildBulkDeletePlan(worldEntries, worldSelected)
      if (!plan.entryIds.length) { setWorldDeleteArmed(false); return }
      setWorldBatchBusy(true); setError('')
      const direct = () => call('delete-world-entries', { projectId, entryIds: plan.entryIds })
      direct().then(() => { setWorldBatchBusy(false); setWorldSelected([]); setWorldDeleteArmed(false); reload() }).catch((failure) => {
        if (String((failure && failure.message) || '').includes('METHOD_NOT_FOUND')) {
          Promise.all(plan.entryIds.map((entryId) => call('delete-world-entry', { projectId, entryId }))).then(() => { setWorldBatchBusy(false); setWorldSelected([]); setWorldDeleteArmed(false); reload() }).catch((failure2) => { setWorldBatchBusy(false); setError('批量删除失败'); console.error(failure2) })
        } else { setWorldBatchBusy(false); setError('批量删除失败'); console.error(failure) }
      })
    }
    function handleWorldBulkDeleteClick() {
      if (worldDeleteArmed) { if (worldDeleteTimer.current) { clearTimeout(worldDeleteTimer.current); worldDeleteTimer.current = null } runWorldBulkDelete() }
      else { setWorldDeleteArmed(true); worldDeleteTimer.current = later(() => { setWorldDeleteArmed(false); worldDeleteTimer.current = null }, 3000) }
    }
    // v8: 实体历史与回滚
    function currentEntityId() {
      if (entityHistKind === 'character') return character ? character.id : selChar
      if (entityHistKind === 'note') return note ? note.id : selNote
      if (entityHistKind === 'world-entry') return worldEntry ? worldEntry.id : selWorld
      return ''
    }
    function entitySnapshotLabel(kind, entry) {
      const snap = entry && entry.snapshot ? entry.snapshot : {}
      if (kind === 'character') return (snap.name || '未命名角色') + (snap.description ? ' · ' + String(snap.description).slice(0, 24) : '')
      if (kind === 'note') return (snap.title || '未命名笔记') + (snap.content ? ' · ' + String(snap.content).slice(0, 24) : '')
      return (snap.name || '未命名条目') + ' · ' + (snap.isEnabled === false ? '禁用' : '启用')
    }
    function toggleEntityHistory(kind, id) {
      if (entityHistOpen && entityHistKind === kind) { setEntityHistOpen(false); setEntityHistList([]); setEntityHistError(''); return }
      setEntityHistOpen(true); setEntityHistKind(kind); setEntityHistLoading(true); setEntityHistList([]); setEntityHistError('')
      call('entity-history', { projectId, kind, entityId: id }).then((result) => {
        setEntityHistList(Array.isArray(result && result.history) ? result.history : [])
        setEntityHistLoading(false)
      }).catch((failure) => { setEntityHistLoading(false); setEntityHistError('历史加载失败：' + String((failure && failure.message) || failure)) })
    }
    function rollbackEntity(entry) {
      const entityId = currentEntityId()
      if (!projectId || !entityId || !entry) return
      const revision = typeof entry.revision === 'number' ? entry.revision : Number(entry.revision)
      if (!Number.isFinite(revision)) return
      const key = entityHistKind + ':' + entityId + ':' + String(revision)
      if (!arm('rollback-entity', key)) return
      call('rollback-entity', { projectId, kind: entityHistKind, entityId, toRevision: revision }).then((result) => {
        disarm()
        const entity = result && result.entity
        if (entity) {
          if (entityHistKind === 'character') { setCharName(entity.name || ''); setCharDesc(entity.description || ''); setCharDirty(false) }
          else if (entityHistKind === 'note') { setNoteTitle(entity.title || ''); setNoteContent(entity.content || ''); setNoteDirty(false) }
          else if (entityHistKind === 'world-entry') { setWorldName(entity.name || ''); setWorldKeys(Array.isArray(entity.keys) ? entity.keys.join('，') : ''); setWorldContent(entity.content || ''); setWorldDirty(false) }
        }
        setEntityHistOpen(false); setEntityHistList([]); reload()
      }).catch((failure) => { disarm(); setEntityHistError('回滚失败：' + String((failure && failure.message) || failure)) })
    }
    // v9: prompt chains
    function loadPromptChains() {
      if (!projectId) return
      call('list-prompt-chains', { projectId }).then((result) => {
        setChains(Array.isArray(result && result.chains) ? result.chains : [])
        setChainError('')
      }).catch((failure) => { setChains([]); setChainError('链功能需重启 DSH 后可用：' + String((failure && failure.message) || failure)) })
    }
    function openPromptChains() {
      if (!projectId) return
      setChainsOpen(true); setChainError(''); setChainResult(''); setChainLastPrompt('')
      loadPromptChains()
    }
    function openWritingSkills() {
      setSkillsOpen(true); setSkillsLoading(true); setSkillsError('')
      Promise.all([call('list-writing-skills'), call('list-skill-settings')]).then(([skillsResult, settingsResult]) => {
        setWritingSkills(Array.isArray(skillsResult && skillsResult.skills) ? skillsResult.skills : [])
        setSkillSettings(settingsResult || null)
        setSkillsLoading(false)
      }).catch((failure) => {
        setWritingSkills([]); setSkillSettings(null); setSkillsLoading(false)
        setSkillsError('写作技能加载失败：' + String((failure && failure.message) || failure))
      })
    }
    function refreshSkillSettings() {
      if (!skillsOpen) return
      call('list-skill-settings').then((result) => { if (result) setSkillSettings(result) }).catch(() => { /* 下轮再试 */ })
    }
    function toggleSkill(skillId, enabled) {
      call('set-skill-enabled', { skillId, enabled }).then((result) => {
        if (result && result.error) { setSkillsError(String(result.error)); return }
        setSkillSettings((current) => {
          if (!current) return current
          const next = new Set(Array.isArray(current.disabledSkills) ? current.disabledSkills : [])
          if (enabled) next.delete(skillId); else next.add(skillId)
          return { ...current, disabledSkills: [...next] }
        })
        setSkillsError('')
      }).catch((failure) => { setSkillsError('技能开关失败：' + String((failure && failure.message) || failure)) })
    }
    function createCustomSkill(form) {
      return call('create-custom-skill', form).then((result) => {
        if (result && result.error) return result
        refreshSkillSettings()
        return result
      }).catch((failure) => ({ error: String((failure && failure.message) || failure) }))
    }
    function deleteCustomSkill(name) {
      call('delete-custom-skill', { name }).then(() => refreshSkillSettings()).catch(() => { /* noop */ })
    }
    // 空白状态 → 初始向导；有项目 → 关闭。工作区快照异步到达时补入默认小说目录。
    React.useEffect(() => {
      if (mode !== 'web' || loading) return
      setOnboardOpen(!projects.length)
      if (!onboardFolder) {
        const workspacePath = currentDshWorkspacePath()
        if (workspacePath) setOnboardFolder(workspacePath)
      }
    }, [mode, loading, projects, onboardFolder])
    // v0.18: 会话菜单自动弹出——打开墨菲且未绑定会话、存在历史会话时，直接可承接上次对话。
    // 注意：chatSessionList 快照频繁更新，不能整对象作依赖（会清掉 later 定时器）——
    // 用 ref 读取最新列表，依赖只含「列表是否非空」这一信号（冷启动快照为空，数据异步到达后触发一次）。
    const chatSessionListRef = React.useRef(chatSessionList)
    chatSessionListRef.current = chatSessionList
    const sessionListNonEmpty = (chatSessionList.ids || []).length > 0
    React.useEffect(() => {
      if (chatSessionId) autoSessionMenuRef.current = false
    }, [chatSessionId])
    React.useEffect(() => {
      if (mode !== 'web' || loading || chatSessionId) return undefined
      if (autoSessionMenuRef.current) return undefined
      const list = chatSessionListRef.current
      const hasHistory = (Array.isArray(list.ids) ? list.ids : []).some((id) => {
        const summary = list.byId && list.byId[id]
        return summary && summary.origin !== 'subagent'
      })
      if (!hasHistory) return undefined
      autoSessionMenuRef.current = true
      return later(() => setChatSessionsOpen(true), 400)
    }, [mode, loading, chatSessionId, sessionListNonEmpty])
    function handleSaveChain(input) {
      if (!projectId || chainBusy) return
      setChainBusy(true); setChainError('')
      call('save-prompt-chain', { projectId, chainId: input && input.chainId, name: input && input.name, content: input && input.content }).then((result) => {
        setChainBusy(false)
        if (result && result.chain) setChainActiveId(result.chain.id)
        loadPromptChains()
      }).catch((failure) => { setChainBusy(false); setChainError('保存链失败：' + String((failure && failure.message) || failure)) })
    }
    function handleDeleteChain(chain) {
      if (!projectId || !chain || chainBusy) return
      if (!arm('delete-chain', chain.id)) return
      call('delete-prompt-chain', { projectId, chainId: chain.id }).then(() => {
        disarm(); if (chainActiveId === chain.id) setChainActiveId(''); loadPromptChains()
      }).catch((failure) => { disarm(); setChainError('删除链失败：' + String((failure && failure.message) || failure)) })
    }
    function handleRunChain(chain) {
      if (!projectId || !chain || chainBusy) return
      setChainBusy(true); setChainError(''); setChainResult(''); setChainLastPrompt('')
      const selected = draft.slice(selStart, selEnd)
      call('run-prompt-chain', { projectId, chainId: chain.id, chapterId: chapterId || undefined, selected: selected || undefined }).then((result) => {
        setChainBusy(false)
        setChainResult((result && result.text) || '')
        setChainLastPrompt((result && result.prompt) || '')
        if (result && result.historyCount) loadAiHistory()
      }).catch((failure) => { setChainBusy(false); setChainError('运行链失败：' + String((failure && failure.message) || failure)) })
    }
    function moveWorld(id, direction) { call('move-world-entry', { projectId, entryId: id, direction }).then(() => reload()).catch((failure) => { setError('调整世界书顺序失败'); console.error(failure) }) }
    function readWorldImportFile(file) {
      if (!file) return
      setWorldImportBusy(true); setWorldImportError(''); setWorldImportResult('')
      const reader = new FileReader()
      reader.onload = () => {
        call('import-world-info-json', { projectId, content: String(reader.result || ''), mode: worldImportMode }).then((result) => {
          setWorldImportBusy(false)
          if (result && result.error) { setWorldImportError(result.error); setWorldImportResult(''); return }
          setWorldImportResult('已导入 ' + String(result && result.importedCount || 0) + ' 条（' + (worldImportMode === 'overwrite' ? '覆盖模式' : '追加模式') + '）')
          reload()
        }).catch((failure) => { setWorldImportBusy(false); setWorldImportError('导入失败：' + String((failure && failure.message) || failure)) })
      }
      reader.onerror = () => { setWorldImportBusy(false); setWorldImportError('无法读取文件') }
      reader.readAsText(file, 'utf-8')
    }
    function pickNote(item) { setSelNote(item.id); setNoteTitle(item.title); setNoteContent(item.content); setNoteDirty(false); setEntityHistOpen(false); setEntityHistList([]); ensureNoteTab(item) }
    function saveNote() { if (!selNote) return; call('update-note', { projectId, noteId: selNote, title: noteTitle, content: noteContent }).then(() => { setNoteDirty(false); reload() }).catch((failure) => { setError('保存笔记失败'); console.error(failure) }) }
    function createNote(categoryId) { if (!newNote.trim()) return; call('create-note', { projectId, title: newNote, categoryId: categoryId || null }).then((result) => { if (result && result.note) { setNewNote(''); setNoteForm(false); reload() } }).catch((failure) => { setError('创建笔记失败'); console.error(failure) }) }
    function toggleNoteFlag(id, field) { call('update-note', { projectId, noteId: id, [field]: !(note && note.id === id ? note[field] : false) }).then(() => reload()).catch((failure) => { setError('切换失败'); console.error(failure) }) }
    function createCategory(parentId) {
      const title = parentId ? newSubCat : newCat
      if (!title.trim()) return
      call('create-note-category', { projectId, title, parentId: parentId || null }).then(() => { setNewCat(''); setNewSubCat(''); setCatForm(false); setSubCatFor(''); reload() }).catch((failure) => { setError('创建分类失败'); console.error(failure) })
    }
    function moveNote(id, categoryId) { call('move-note', { projectId, noteId: id, categoryId: categoryId || null }).then(() => reload()).catch((failure) => { setError('移动笔记失败'); console.error(failure) }) }
    function createVolume() { if (!newVol.trim()) return; call('create-volume', { projectId, title: newVol }).then((result) => { if (result && result.volume) { setNewVol(''); setVolForm(false); reload() } }).catch((failure) => { setError('创建卷失败'); console.error(failure) }) }
    function close() { persist(); setOpen(false); removeStyles() }
    function rebase() { if (conflict) { updateView(conflict); setSaved(conflict.content); setRevision(conflict.revision); setConflict(null); setStatus('unsaved'); setError('草稿已基于远端最新版本，可检查后保存。') } }
    function decodeTxtBuffer(buffer) {
      const bytes = new Uint8Array(buffer)
      const bom = []
      if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) { bom.push('utf-8'); try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8 BOM' } } catch (error) {} }
      else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) { try { return { text: new TextDecoder('utf-16le', { fatal: true }).decode(bytes), encoding: 'UTF-16 LE BOM' } } catch (error) {} }
      else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) { try { return { text: new TextDecoder('utf-16be', { fatal: true }).decode(bytes), encoding: 'UTF-16 BE BOM' } } catch (error) {} }
      if (!bom.length) {
        try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' } } catch (error) {}
        const candidates = ['gb18030', 'big5']
        for (const label of candidates) { try { return { text: new TextDecoder(label, { fatal: true }).decode(bytes), encoding: label.toUpperCase() } } catch (error) {} }
      }
      return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'UTF-8（替换解码）' }
    }
    function readImportFile(file) {
      if (!file) return
      setImportBusy(true); setImportError(''); setImportPreview(null); setImportContent(''); setImportEncoding('')
      file.arrayBuffer().then((buffer) => {
        const decoded = decodeTxtBuffer(buffer)
        setImportContent(decoded.text)
        setImportEncoding(decoded.encoding)
        return call('import-txt-preview', { content: decoded.text }).then((result) => { if (result && result.error) { setImportError(result.error); setImportPreview(null) } else setImportPreview(result); setImportBusy(false) })
      }).catch((failure) => { setImportBusy(false); setImportError('解析失败：' + String((failure && failure.message) || failure)) })
    }
    function confirmImport() {
      if (!importContent || importBusy) return
      setImportBusy(true); setImportError('')
      call('import-txt-confirm', { title: importName, description: '', content: importContent }).then((result) => {
        setImportBusy(false)
        if (result && result.project) {
          setImportOpen(false); setImportPreview(null); setImportContent(''); setImportName(''); setImportEncoding('')
          setProjectId(result.project.id); reload()
        } else setImportError('导入失败')
      }).catch((failure) => { setImportBusy(false); setImportError('导入失败：' + String((failure && failure.message) || failure)) })
    }
    function exportProjectTxt() {
      if (!projectId) return
      call('export-project-txt', { projectId }).then((result) => {
        if (!result || typeof result.content !== 'string') { setError('导出失败'); return }
        const blob = new Blob([result.content], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = result.filename || '墨扉.txt'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        later(() => URL.revokeObjectURL(url), 5000)
      }).catch((failure) => { setError('导出失败'); console.error(failure) })
    }
    function ensureTab(chapterItem) {
      setOpenTabs((tabs) => tabs.some((t) => t.id === chapterItem.id) ? tabs : tabs.concat([{ kind: 'chapter', id: chapterItem.id, title: chapterItem.title }]))
    }
    function ensureNoteTab(noteItem) {
      setOpenTabs((tabs) => tabs.some((t) => t.kind === 'note' && t.id === noteItem.id) ? tabs : tabs.concat([{ kind: 'note', id: noteItem.id, title: noteItem.title }]))
    }
    function switchChapterTab(id) {
      if (!project) return
      const targetTab = openTabs.find((t) => t.id === id)
      if (!targetTab) return
      persist()
      if (targetTab.kind === 'note') { const item = project.notes.find((n) => n.id === id); if (item) { setTab('notes'); pickNote(item) } }
      else { const target = project.chapters.find((c) => c.id === id); if (target) pickChapter(target) }
    }
    function closeChapterTab(id) {
      if (!project) return
      const targetTab = openTabs.find((t) => t.id === id)
      if (targetTab && targetTab.pinned) return
      const tabs = openTabs.filter((t) => t.id !== id)
      setOpenTabs(tabs)
      if (id !== activeTabId) return
      persist()
      if (tabs.length) {
        const next = tabs[tabs.length - 1]
        if (next.kind === 'note') { const item = project.notes.find((n) => n.id === next.id); if (item) { setTab('notes'); pickNote(item) } else clearChapter() }
        else { const target = project.chapters.find((c) => c.id === next.id); if (target) pickChapter(target); else clearChapter() }
      } else clearChapter()
    }
    function clearChapter() { setChapterId(''); setDraft(''); setSaved(''); setRevision(0); setStatus('saved'); setError(''); setConflict(null) }
    // v0.10.1: 标签页增强（固定 / 关闭其他 / 右键菜单 / 拖拽排序）
    function openTabMenu(event, t) {
      event.preventDefault(); event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      const x = Math.min(Math.max(rect.left, 8), Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 170))
      setTabMenu({ id: t.id, kind: t.kind, x, y: rect.bottom + 4, pinned: !!t.pinned })
    }
    function closeTabMenu() { setTabMenu(null) }
    function pinTab(id) { setOpenTabs((tabs) => tabs.map((t) => t.id === id ? { ...t, pinned: !t.pinned } : t)) }
    function closeOtherTabs(id) { setOpenTabs((tabs) => tabs.filter((t) => t.id === id || t.pinned)) }
    function moveTab(targetId, before) {
      if (!tabDragId || tabDragId === targetId) return
      const list = openTabs.slice()
      const from = list.findIndex((t) => t.id === tabDragId)
      if (from < 0) return
      const moved = list.splice(from, 1)[0]
      let to = list.findIndex((t) => t.id === targetId)
      if (to < 0) return
      if (!before) to += 1
      list.splice(to, 0, moved)
      setOpenTabs(list)
    }
    // v0.10.1: 编辑器滚动位置记忆（localStorage）
    function saveScrollPos() {
      if (!projectId || !chapterId) return
      const el = document.querySelector('textarea.mf-text')
      if (!el) return
      try { if (typeof localStorage !== 'undefined') localStorage['mofei.scroll.' + projectId + '.' + chapterId] = String(el.scrollTop) } catch (error) { /* noop */ }
    }
    function restoreScrollPos() {
      if (!projectId || !chapterId) return
      let top = 0
      try { if (typeof localStorage !== 'undefined') top = Number(localStorage['mofei.scroll.' + projectId + '.' + chapterId] || 0) } catch (error) { top = 0 }
      if (!Number.isFinite(top) || top <= 0) return
      later(() => { const el = document.querySelector('textarea.mf-text'); if (el) el.scrollTop = top }, 80)
    }
    function findAt(pos) {
      if (pos < 0) return
      const el = document.querySelector('textarea.mf-text')
      if (!el) return
      const lines = el.value.slice(0, pos).split('\n')
      el.focus()
      el.setSelectionRange(pos, pos + findQuery.length)
      el.scrollTop = lines.length ? ((lines.length - 1) / Math.max(1, el.value.split('\n').length)) * el.scrollHeight : 0
    }
    function updateFind(query) {
      setFindQuery(query)
      const matches = []
      if (query) {
        const text = draft
        let pos = 0
        while ((pos = text.indexOf(query, pos)) !== -1) { matches.push(pos); pos += query.length }
      }
      setFindMatches(matches)
      if (matches.length) { setFindIndex(0); findAt(matches[0]) } else setFindIndex(-1)
    }
    function findNext() {
      if (!findMatches.length) return
      const next = (findIndex + 1) % findMatches.length
      setFindIndex(next)
      findAt(findMatches[next])
    }
    function findPrev() {
      if (!findMatches.length) return
      const prev = (findIndex - 1 + findMatches.length) % findMatches.length
      setFindIndex(prev)
      findAt(findMatches[prev])
    }
    function replaceOne() {
      if (!findMatches.length || findIndex < 0 || !findQuery) return
      const pos = findMatches[findIndex]
      const nextDraft = draft.slice(0, pos) + replaceQuery + draft.slice(pos + findQuery.length)
      setDraft(nextDraft)
      if (!conflict) { setStatus('unsaved'); setError('') }
      const remaining = findMatches.slice(findIndex + 1).map((p) => p - findQuery.length + replaceQuery.length)
      setFindMatches(remaining)
      setFindIndex(remaining.length ? 0 : -1)
      if (remaining.length) findAt(remaining[0])
    }
    function replaceAll() {
      if (!findQuery) return
      setDraft(draft.split(findQuery).join(replaceQuery))
      if (!conflict) { setStatus('unsaved'); setError('') }
      setFindMatches([])
      setFindIndex(-1)
    }
    function lineRange(text, start, end) {
      const lineStart = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1
      let lineEnd = text.indexOf('\n', end)
      if (lineEnd < 0) lineEnd = text.length
      return { lineStart, lineEnd }
    }
    function applyMarkdown(kind) {
      const el = document.querySelector('textarea.mf-text')
      if (!el) return
      const text = el.value
      const start = el.selectionStart || 0
      const end = el.selectionEnd || start
      let next = text
      let nextStart = start
      let nextEnd = end
      if (kind === 'h2' || kind === 'h3' || kind === 'list' || kind === 'quote') {
        const range = lineRange(text, start, end)
        const prefix = kind === 'h2' ? '## ' : kind === 'h3' ? '### ' : kind === 'list' ? '- ' : '> '
        const block = text.slice(range.lineStart, range.lineEnd).split('\n').map((line) => line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line).join('\n')
        next = text.slice(0, range.lineStart) + block + text.slice(range.lineEnd)
        nextStart = range.lineStart
        nextEnd = range.lineStart + block.length
      } else if (kind === 'hr') {
        const marker = (text.slice(0, start).trim() ? '\n\n' : '') + '---\n'
        next = text.slice(0, start) + marker + text.slice(end)
        nextStart = nextEnd = start + marker.length
      } else {
        const selected = text.slice(start, end)
        const pad = kind === 'bold' ? '**' : kind === 'italic' ? '*' : kind === 'inline' ? '`' : kind === 'code' ? '```\n' : ''
        const close = kind === 'code' ? '\n```' : pad
        const body = selected || (kind === 'bold' ? '重点' : kind === 'italic' ? '强调' : kind === 'inline' ? '代码' : kind === 'code' ? '代码块' : '')
        next = text.slice(0, start) + pad + body + close + text.slice(end)
        nextStart = start + pad.length
        nextEnd = nextStart + body.length
      }
      setDraft(next)
      if (!conflict) { setStatus('unsaved'); setError('') }
      later(() => {
        const target = document.querySelector('textarea.mf-text')
        if (target) { target.focus(); target.setSelectionRange(nextStart, nextEnd) }
      }, 0)
    }
    function stopAi() {
      if (aiAbort.current) { try { aiAbort.current.abort() } catch (error) { /* noop */ } aiAbort.current = null }
      setAiBusy(false)
    }
    function parseSseFrames(buffer, onFrame) {
      let rest = buffer
      let separator = -1
      while ((separator = rest.indexOf('\n\n')) >= 0) {
        const frame = rest.slice(0, separator)
        rest = rest.slice(separator + 2)
        let event = 'message'
        let data = ''
        frame.split('\n').forEach((line) => {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).replace(/^ /, '')
        })
        if (!data) continue
        let payload = null
        try { payload = JSON.parse(data) } catch (error) { payload = null }
        onFrame(event, payload)
      }
      return rest
    }
    function runAi() {
      if (!chapterId || aiBusy) return
      let selected = ''
      if (aiMode === 'rewrite') {
        selected = draft.slice(selStart, selEnd)
        if (!selected) { setAiError('请先在正文中选中要改写的文本'); setAiResult(''); return }
      }
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      aiAbort.current = controller
      setAiBusy(true); setAiError(''); setAiResult('')
      let output = ''
      let buffer = ''
      let completed = false
      const finishStream = (persisted) => {
        completed = true
        if (persisted && output) loadAiHistory()
        setAiBusy(false); aiAbort.current = null
      }
      fetch('/api/mofei/stream/ai-assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ args: { projectId, chapterId, mode: aiMode, selected, prompt: aiPrompt } }),
        signal: controller ? controller.signal : undefined,
      }).then(async (response) => {
        if (!response.ok) throw new Error('HTTP ' + String(response.status))
        if (!response.body) throw new Error('当前浏览器不支持流式响应')
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        while (true) {
          const step = await reader.read()
          if (step.done) break
          buffer += decoder.decode(step.value, { stream: true })
          buffer = parseSseFrames(buffer, (event, payload) => {
            if (event === 'delta' && payload && typeof payload.text === 'string') { output += payload.text; setAiResult(output) }
            else if (event === 'done') { setAiResult(payload && typeof payload.text === 'string' ? payload.text : output); finishStream(true) }
            else if (event === 'error') { setAiError((payload && payload.message) || (payload && payload.code) || '生成失败'); setAiBusy(false); aiAbort.current = null }
          })
        }
        buffer += decoder.decode()
        buffer = parseSseFrames(buffer, (event, payload) => {
          if (event === 'delta' && payload && typeof payload.text === 'string') { output += payload.text; setAiResult(output) }
          else if (event === 'done') { setAiResult(payload && typeof payload.text === 'string' ? payload.text : output); finishStream(true) }
          else if (event === 'error') { setAiError((payload && payload.message) || (payload && payload.code) || '生成失败'); setAiBusy(false); aiAbort.current = null }
        })
        if (!completed && aiAbort.current && controller && !controller.signal.aborted) { setAiBusy(false); aiAbort.current = null }
      }).catch((failure) => {
        if (controller && controller.signal.aborted) { setAiBusy(false); aiAbort.current = null; return }
        setAiBusy(false); aiAbort.current = null; setAiError('生成失败：' + String((failure && failure.message) || failure))
      })
    }
    function loadAiHistory() {
      if (!projectId) return Promise.resolve(null)
      return call('ai-history', { projectId }).then((result) => { setAiHistory(result && Array.isArray(result.messages) ? result.messages : []); return result }).catch((failure) => { console.error(failure); return null })
    }
    function clearAiHistory() {
      if (!projectId) return
      call('ai-clear-history', { projectId }).then(() => { setAiHistory([]); setAiResult(''); setAiError('') }).catch((failure) => { setAiError('清空历史失败：' + String((failure && failure.message) || failure)) })
    }
    function runAiBatch() {
      if (!projectId || aiBatchBusy) return
      setAiBatchBusy(true); setAiBatchError(''); setAiBatchResults([])
      call('job-start-summarize', { projectId, kind: 'chapters' }).then((result) => {
        if (result && result.jobId) {
          setAiBatchJobId(result.jobId)
          setAiBatchBusy(false)
          setJobListOpen(true)
          pollMofeiJobs()
          return
        }
        if (result && result.error === 'JOBS_UNAVAILABLE') {
          call('ai-summarize-chapters', { projectId }).then((sync) => {
            setAiBatchBusy(false)
            if (sync && Array.isArray(sync.summaries)) setAiBatchResults(sync.summaries)
            else setAiBatchError((sync && sync.error) || '批量摘要失败')
          }).catch((failure) => { setAiBatchBusy(false); setAiBatchError('批量摘要失败：' + String((failure && failure.message) || failure)) })
          return
        }
        setAiBatchBusy(false); setAiBatchError((result && result.error) || '启动后台摘要失败')
      }).catch((failure) => { setAiBatchBusy(false); setAiBatchError('启动后台摘要失败：' + String((failure && failure.message) || failure)) })
    }
    // v0.10.2: 后台任务列表 / 取消 / 完成回填
    function pollMofeiJobs() {
      call('job-list-mofei', {}).then((result) => { setMofeiJobs(Array.isArray(result && result.jobs) ? result.jobs : []) }).catch(() => { /* noop */ })
    }
    React.useEffect(() => {
      if (!jobListOpen) return undefined
      let alive = true
      const poll = () => { call('job-list-mofei', {}).then((result) => { if (alive) setMofeiJobs(Array.isArray(result && result.jobs) ? result.jobs : []) }).catch(() => { /* noop */ }) }
      poll()
      const timer = setInterval(poll, 2000)
      return () => { alive = false; clearInterval(timer) }
    }, [jobListOpen])
    React.useEffect(() => {
      if (!aiBatchJobId) return undefined
      let alive = true
      const poll = () => {
        call('job-result-mofei', { jobId: aiBatchJobId }).then((result) => {
          if (!alive || !result) return
          if (result.status === 'completed') {
            setAiBatchJobId('')
            if (Array.isArray(result.summaries)) setAiBatchResults(result.summaries)
            if (projectId) refreshSummaryPanel()
          } else if (result.status === 'failed' || result.status === 'killed') {
            setAiBatchJobId('')
            setAiBatchError(result.status === 'killed' ? '后台摘要已取消' : (result.error || '后台摘要失败'))
          }
        }).catch(() => { /* 下轮再试 */ })
      }
      poll()
      const timer = setInterval(poll, 2000)
      return () => { alive = false; clearInterval(timer) }
    }, [aiBatchJobId])
    function killMofeiJob(jobId) {
      call('job-kill-mofei', { jobId }).then(() => pollMofeiJobs()).catch(() => { /* noop */ })
    }
    // 每本小说只绑定自己的 mofei-writer 会话。这里仅订阅目录，绝不把 DSH 当前开发会话带进墨扉。
    React.useEffect(() => {
      if (!open) return undefined
      const sessions = dshClientSessions
      if (!sessions || !sessions.list || typeof sessions.list.subscribe !== 'function') { setChatHint('DSH 会话服务不可用'); return undefined }
      const syncList = () => {
        try {
          const snap = sessions.list.getSnapshot()
          setChatSessionList({ ids: (snap && snap.ids) || [], byId: (snap && snap.byId) || {} })
          if (chatSessionId) setChatSummary(snap && snap.byId && snap.byId[chatSessionId] || null)
        } catch (error) { /* noop */ }
      }
      syncList()
      const unsub = sessions.list.subscribe(syncList)
      return () => { if (unsub && typeof unsub === 'function') unsub() }
    }, [open, chatSessionId])
    React.useEffect(() => {
      if (!open || !chatSessionId) return undefined
      const sessions = dshClientSessions
      if (!sessions || typeof sessions.binding !== 'function') { setChatHint('DSH 会话服务不可用'); return undefined }
      let unsub = null
      try {
        const binding = sessions.binding(chatSessionId)
        if (binding && binding.session && typeof binding.session.subscribe === 'function') {
          setChatHint('')
          // 拉取历史尾部（冷启动快照为空时保证有内容；幂等）
          if (typeof binding.session.open === 'function') { try { binding.session.open() } catch (openError) { /* noop */ } }
          unsub = binding.session.subscribe(() => { setChatSnap(binding.session.getSnapshot()) })
          setChatSnap(binding.session.getSnapshot())
        } else {
          setChatHint('会话不可绑定（可能已归档）')
        }
      } catch (error) { setChatHint('会话绑定失败：' + String((error && error.message) || error)) }
      return () => { if (unsub && typeof unsub === 'function') unsub() }
    }, [open, chatSessionId])
    // 当前项目/章节不是通过可见聊天消息传递，而是与该项目专属 DSH 写作会话做短生命周期绑定。
    // 写作 preset 的 mofei_get-active-context 工具会在实际执行前取回精装上下文。
    React.useEffect(() => {
      let alive = true
      if (!open || !chatSessionId || !projectId) { setAgentContextBound(false); return undefined }
      call('bind-agent-context', { sessionId: chatSessionId, projectId, ...(chapterId ? { chapterId } : {}) }).then((result) => {
        if (alive) setAgentContextBound(!!(result && result.bound))
      }).catch(() => { if (alive) setAgentContextBound(false) })
      return () => { alive = false }
    }, [open, chatSessionId, projectId, chapterId])
    // DSH 会话快照已包含工具完成事件。Agent 写入后以它为信号刷新项目实体；
    // 若作者本地仍有未保存草稿，reload() 会保留草稿并进入冲突状态。
    React.useEffect(() => {
      if (!open || !project || !chatSessionId || project.writerSessionId !== chatSessionId || !chatSnap) return undefined
      const writes = normalizeChatItems(chatSnap).filter((item) => item.kind === 'tool' && !item.running && item.ok !== false && /^(?:mofei|openfic)_(?:write|edit|update|create|delete|move|set|reorder|save|revert|rollback)-/.test(String(item.name || '')))
      const token = writes.map((item) => item.key || item.name).join('|')
      if (!token || token === agentMutationRefreshRef.current) return undefined
      agentMutationRefreshRef.current = token
      const cancel = later(() => { reload() }, 80)
      return cancel
    }, [open, projectId, project && project.writerSessionId, chatSessionId, chatSnap])
    // v0.15: 文件同步轮询——AI/外部写入（无论会话绑定与否）在数秒内自动可见。
    // storeStamp 变化 → 仅 UI reload（工具/UI 写入，内存已是最新）；
    // fileStamp 变化而 storeStamp 未变 → 外部文件编辑，先 reload-from-files 文件优先导入再 reload；
    // 首轮执行一次 catch-up：补上「气泡收起期间」发生的外部写入。
    const reloadRef = React.useRef(reload)
    reloadRef.current = reload
    const syncStoreRef = React.useRef(null)
    const syncFileRef = React.useRef(null)
    const workspaceDiscoveryRef = React.useRef({ path: '', at: 0 })
    React.useEffect(() => {
      if (mode !== 'web') return undefined
      let alive = true
      let busy = false
      const sync = async () => {
        if (busy || !alive) return
        busy = true
        try {
          const workspaceRoot = currentDshWorkspacePath()
          const discovery = workspaceDiscoveryRef.current
          if (workspaceRoot && (workspaceRoot !== discovery.path || Date.now() - discovery.at > 5000)) {
            workspaceDiscoveryRef.current = { path: workspaceRoot, at: Date.now() }
            await timedCall('discover-workspace', { workspaceRoot }, 15000)
          }
          const result = await timedCall('sync-status', {}, 5000)
          if (!alive || !result) return
          const storeStamp = (result && result.storeStamp) || ''
          const fileStamp = (result && result.fileStamp) || ''
          const first = syncStoreRef.current === null && syncFileRef.current === null
          const storeChanged = storeStamp !== (syncStoreRef.current || '')
          const fileChanged = fileStamp !== (syncFileRef.current || '')
          syncStoreRef.current = storeStamp
          syncFileRef.current = fileStamp
          if (first || (fileChanged && !storeChanged)) {
            const imported = await timedCall('reload-from-files', {}, 15000)
            if (!alive || !imported) return
          }
          if (first || storeChanged || fileChanged) await reloadRef.current()
        } catch (error) { /* 静默跳过，下轮再试 */ }
        finally { busy = false }
      }
      sync()
      const timer = setInterval(sync, 2000)
      return () => { alive = false; clearInterval(timer) }
    }, [mode])
    // v0.12.1: 拉取 agent 预设清单（供「＋」新建会话选择；只保留可用预设）
    React.useEffect(() => {
      if (!open) return undefined
      const api = dshClientConnection && dshClientConnection.api
      if (!api || !api.agentPresets || typeof api.agentPresets.list !== 'function') return undefined
      let alive = true
      Promise.resolve(api.agentPresets.list({})).then((response) => {
        if (!alive) return
        const value = response && response.result && response.result.ok ? response.result.value : null
        const presets = value && Array.isArray(value.presets) ? value.presets.filter((p) => !p.broken) : []
        setChatPresets(presets)
        if (presets.length && !presets.some((p) => p.id === chatPresetId)) setChatPresetId(presets[0].id)
      }).catch(() => { /* 预设列表失败不阻塞，＋ 仍用默认预设 */ })
      return () => { alive = false }
    }, [open])
    // 自动滚到底部
    React.useEffect(() => {
      if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight
    }, [chatSnap, chatOpen])
    function sendChat() {
      const text = chatInput.trim()
      if (!text || chatBusy || !chatSessionId) return
      const sessions = dshClientSessions
      const binding = sessions && sessions.binding(chatSessionId)
      if (!binding || !binding.session || typeof binding.session.prompt !== 'function') { setChatError('会话不可用'); return }
      setChatBusy(true); setChatError('')
      binding.session.prompt([{ type: 'text', text }], 'queue').then((result) => {
        setChatBusy(false)
        if (result && result.ok === false) setChatError('发送失败：' + String((result.error) || '未知错误'))
      }).catch((failure) => { setChatBusy(false); setChatError('发送失败：' + String((failure && failure.message) || failure)) })
      setChatInput('')
    }
    function cancelChat() {
      const sessions = dshClientSessions
      const binding = sessions && chatSessionId && sessions.binding(chatSessionId)
      if (binding && binding.session && typeof binding.session.cancel === 'function') {
        try { binding.session.cancel() } catch (error) { /* noop */ }
      }
    }
    function createdSessionId(created, sessions, before) {
      let sessionId = created && ((created.value && created.value.sessionId) || created.sessionId) || null
      if (sessionId) return sessionId
      const after = sessions && sessions.list && sessions.list.getSnapshot ? sessions.list.getSnapshot() : {}
      return (after.ids || []).find((id) => !before.has(id)) || null
    }
    async function activateProjectWriterSession(targetProjectId, forceNew) {
      const sessions = dshClientSessions
      if (!targetProjectId) { setChatError('请先选择一本小说项目'); return null }
      if (!sessions || !sessions.list || typeof sessions.create !== 'function') { setChatError('DSH 会话服务不可用'); return null }
      setChatBusy(true); setChatError('')
      try {
        if (!forceNew) {
          const bound = await call('writer-session', { projectId: targetProjectId })
          const assignedId = bound && bound.sessionId
          const snapshot = sessions.list.getSnapshot()
          const summary = assignedId && snapshot && snapshot.byId && snapshot.byId[assignedId]
          if (assignedId && summary && summary.agentPreset === 'mofei-writer') {
            if (typeof sessions.open === 'function') { try { sessions.open(assignedId) } catch (error) { /* noop */ } }
            setChatSessionId(assignedId)
            setChatSummary(summary)
            setChatBusy(false)
            return assignedId
          }
        }
        const before = new Set((sessions.list.getSnapshot().ids) || [])
        const workspaceRoot = currentDshWorkspacePath()
        const created = await dshCall('session.create', { agentPreset: 'mofei-writer', ...(workspaceRoot ? { cwd: workspaceRoot } : {}) })
        const sessionId = createdSessionId(created, sessions, before)
        if (!sessionId) { setChatError('创建项目写作会话失败'); setChatBusy(false); return null }
        const bound = await call('bind-writer-session', { projectId: targetProjectId, sessionId })
        if (!bound || bound.error) { setChatError('写作会话归属保存失败'); setChatBusy(false); return null }
        setProjects((items) => items.map((item) => item.id === targetProjectId ? { ...item, writerSessionId: sessionId } : item))
        if (typeof sessions.open === 'function') { try { sessions.open(sessionId) } catch (error) { /* noop */ } }
        const snapshot = sessions.list.getSnapshot()
        setChatSessionId(sessionId)
        setChatSummary(snapshot && snapshot.byId && snapshot.byId[sessionId] || { agentPreset: 'mofei-writer' })
        setChatBusy(false)
        return sessionId
      } catch (failure) { setChatBusy(false); setChatError('打开项目写作会话失败：' + String((failure && failure.message) || failure)); return null }
    }
    // 项目切换是写作会话切换。它从不复用或改写标准 DSH 开发会话。
    React.useEffect(() => {
      let alive = true
      if (!open || !projectId) { setChatSessionId(''); setChatSummary(null); setChatSnap(null); setAgentContextBound(false); return undefined }
      activateProjectWriterSession(projectId, false).then((sessionId) => {
        if (!alive || !sessionId) return
        setChatHint('')
      })
      return () => { alive = false }
    }, [open, projectId])
    async function newChatSession() {
      if (!projectId) { setChatError('请先选择一本小说项目'); return }
      await activateProjectWriterSession(projectId, true)
    }
    // 保留原入口，但它现在只会打开当前小说项目的专属写作会话。
    async function enterWritingMode() {
      if (!projectId) { flashBridgeNotice('请先在墨扉选择或新建一本小说项目'); return }
      const sessionId = await activateProjectWriterSession(projectId, false)
      if (sessionId) flashBridgeNotice('✍ 已打开《' + (project && project.title || '当前项目') + '》的专属写作会话')
    }
    // v0.17: 退出当前对话（解除右侧 Agent 面板的会话绑定，回到会话选择态）
    function exitCurrentChat() {
      setChatSessionId('')
      setChatSnap(null)
      setChatSummary(null)
      setAgentContextBound(false)
      setChatError('')
    }
    // v0.17: 切换到指定 DSH 会话（任意历史会话；菜单里点击即打开）
    function switchChatSession(sessionId) {
      const sessions = dshClientSessions
      if (!sessions || !sessionId) return
      try {
        if (typeof sessions.open === 'function') sessions.open(sessionId)
      } catch (error) { /* noop */ }
      const snap = sessions.list && typeof sessions.list.getSnapshot === 'function' ? sessions.list.getSnapshot() : null
      setChatSessionId(sessionId)
      setChatSummary(snap && snap.byId && snap.byId[sessionId] || null)
      setChatSnap(null)
      setChatError('')
      setChatSessionsOpen(false)
    }
    function sessionMenuLabel(summary) {
      if (!summary) return ''
      if (typeof summary.title === 'string' && summary.title.trim()) return summary.title.trim()
      return String(summary.id || '').slice(0, 16)
    }
    function sessionMenuBadge(summary) {
      return summary && summary.agentPreset === 'mofei-writer' ? '✍' : '·'
    }
    function sessionMenuTime(summary) {
      const at = summary && (summary.updatedAt || summary.lastActivityAt)
      if (!at) return ''
      try { return fmtTime(at) } catch (error) { return '' }
    }
    // v7: 摘要维护面板
    function refreshSummaryPanel() {
      if (!projectId) return
      setSummaryLoading(true); setSummaryError('')
      const sorted = project ? project.chapters.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : []
      const chaptersPromise = call('chapter-summaries', { projectId }).then((result) => result.chapters).catch((failure) => {
        if (String((failure && failure.message) || '').includes('METHOD_NOT_FOUND')) {
          return Promise.all(sorted.map((item) => call('chapter-summary', { projectId, chapterId: item.id }).then((view) => ({ chapterId: item.id, title: item.title, order: item.order, revision: item.revision, volumeId: item.volumeId || null, entry: view.entry, stale: view.stale }))))
        }
        throw failure
      })
      Promise.all([chaptersPromise, call('range-summary-groups', { projectId }).then((result) => result.groups)]).then(([rows, groups]) => {
        setSummaryRows(Array.isArray(rows) ? rows : [])
        setSummaryRanges(Array.isArray(groups) ? groups : [])
        setSummaryLoading(false)
      }).catch((failure) => { setSummaryLoading(false); setSummaryError('摘要加载失败：' + String((failure && failure.message) || failure)) })
    }
    function openSummaryPanel() {
      if (!projectId) return
      setSummaryOpen(true)
      refreshSummaryPanel()
    }
    // v8: @提及桥接（DSH 会话注入，失败降级剪贴板）
    function flashBridgeNotice(text) {
      setBridgeNotice(text)
      if (bridgeNoticeTimer.current) { clearTimeout(bridgeNoticeTimer.current); bridgeNoticeTimer.current = null }
      bridgeNoticeTimer.current = later(() => { setBridgeNotice(''); bridgeNoticeTimer.current = null }, 4000)
    }
    function currentDshSessionId() {
      try {
        if (dshClientSessions && dshClientSessions.list && typeof dshClientSessions.list.getSnapshot === 'function') {
          const snapshot = dshClientSessions.list.getSnapshot()
          if (snapshot && snapshot.current) return snapshot.current
        }
      } catch (error) { /* noop */ }
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage['dsh.sessions.current']
          if (raw) { const parsed = JSON.parse(raw); if (parsed && parsed.sessionId) return parsed.sessionId }
        }
      } catch (error) { /* noop */ }
      return null
    }
    function sendMentionToSession(text) {
      const sessionId = currentDshSessionId()
      if (!sessionId || !dshClientSessions || typeof dshClientSessions.binding !== 'function') return Promise.resolve(false)
      try {
        const binding = dshClientSessions.binding(sessionId)
        if (!binding || !binding.session || typeof binding.session.prompt !== 'function') return Promise.resolve(false)
        return binding.session.prompt([{ type: 'text', text: text }], 'queue').then((result) => !!(result && result.ok === true && result.value && result.value.accepted === true)).catch(() => false)
      } catch (error) { return Promise.resolve(false) }
    }
    function copyTextToClipboard(text) {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') return navigator.clipboard.writeText(text)
      return new Promise((resolve, reject) => {
        try {
          const el = document.createElement('textarea')
          el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'
          document.body.appendChild(el); el.select()
          const ok = document.execCommand('copy')
          document.body.removeChild(el)
          if (ok) resolve(); else reject(new Error('copy rejected'))
        } catch (error) { reject(error) }
      })
    }
    function bridgeMention(mode) {
      if (!project || !chapter) { flashBridgeNotice('请先打开章节'); return }
      const base = { projectTitle: project.title, projectId, chapter }
      let text = ''
      if (mode === 'selection') {
        const selected = draft.slice(selStart, selEnd)
        if (!selected.trim()) { flashBridgeNotice('请先选中正文'); return }
        text = buildSelectionMention({ ...base, selected })
      } else if (mode === 'writer') {
        text = buildWriterMention(base)
      } else if (mode === 'reviewer') {
        text = buildReviewerMention(base)
      } else {
        text = buildChapterMention(base)
      }
      sendMentionToSession(text).then((sent) => {
        if (sent) flashBridgeNotice('已发送到当前 DSH 会话')
        else copyTextToClipboard(text).then(() => flashBridgeNotice('未找到可发送会话，已复制到剪贴板')).catch(() => flashBridgeNotice('发送失败且剪贴板不可用'))
      })
    }
    function finishSummaryRun(kind, payload) {
      setSummaryBusy(null); setSummaryProgress(null)
      if (payload) {
        setSummaryResult({ kind, count: typeof payload.count === 'number' ? payload.count : 0, total: typeof payload.total === 'number' ? payload.total : 0, staleCount: typeof payload.staleCount === 'number' ? payload.staleCount : 0, freshCount: typeof payload.freshCount === 'number' ? payload.freshCount : 0 })
      }
      refreshSummaryPanel()
    }
    function runSummary(kind, extraArgs, busyKind, busyId) {
      if (!projectId || summaryBusy) return
      setSummaryBusy({ kind: busyKind, id: busyId || null })
      setSummaryProgress({ done: 0, total: 0, label: kind === 'chapters' ? '准备生成章节摘要…' : '准备生成区间摘要…' })
      setSummaryError(''); setSummaryResult(null)
      const streamArgs = { kind, projectId, ...(extraArgs || {}) }
      let buffer = ''
      let finalPayload = null
      const onFrame = (event, payload) => {
        if (event === 'progress' && payload) {
          const title = payload.title || payload.chapterId || payload.rangeId || ''
          setSummaryProgress({ done: typeof payload.done === 'number' ? payload.done : 0, total: typeof payload.total === 'number' ? payload.total : 0, label: title ? '正在生成《' + title + '》' : '生成中' })
        } else if (event === 'done') { finalPayload = payload }
        else if (event === 'error') { setSummaryError((payload && payload.message) || (payload && payload.code) || '摘要生成失败'); setSummaryBusy(null); setSummaryProgress(null) }
      }
      const fallback = () => {
        const force = extraArgs && extraArgs.force === true ? true : undefined
        const promise = kind === 'chapters'
          ? call('ai-summarize-chapters', { projectId, chapterIds: extraArgs && extraArgs.chapterIds, force })
          : call('ai-summarize-ranges', { projectId, rangeIds: extraArgs && extraArgs.rangeIds, size: extraArgs && extraArgs.size, force })
        promise.then((payload) => finishSummaryRun(kind, payload)).catch((failure) => { setSummaryBusy(null); setSummaryProgress(null); setSummaryError('摘要生成失败：' + String((failure && failure.message) || failure)) })
      }
      fetch('/api/mofei/stream/ai-summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ args: streamArgs }),
      }).then(async (response) => {
        if (!response.ok) { fallback(); return }
        if (!response.body) { fallback(); return }
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let completed = false
        while (true) {
          const step = await reader.read()
          if (step.done) break
          buffer += decoder.decode(step.value, { stream: true })
          buffer = parseSseFrames(buffer, (event, payload) => {
            if (event === 'done') completed = true
            onFrame(event, payload)
          })
        }
        buffer += decoder.decode()
        buffer = parseSseFrames(buffer, onFrame)
        if (!completed) fallback()
        else finishSummaryRun(kind, finalPayload)
      }).catch(() => fallback())
    }
    function insertAiResult() {
      if (!aiResult) return
      const el = document.querySelector('textarea.mf-text')
      const pos = el ? el.selectionStart : draft.length
      setDraft(draft.slice(0, pos) + aiResult + draft.slice(pos))
      if (!conflict) { setStatus('unsaved'); setError('') }
    }
    // v0.12.1 对话联动：把助手回复插入正文（光标处）
    function insertChatIntoEditor(text) {
      if (!chapterId) { setChatError('请先在编辑器打开章节，再插入正文'); return }
      const body = typeof text === 'string' ? text : ''
      if (!body.trim()) return
      const el = document.querySelector('textarea.mf-text')
      const pos = el ? el.selectionStart : draft.length
      const next = draft.slice(0, pos) + body + draft.slice(pos)
      setDraft(next)
      if (!conflict) { setStatus('unsaved'); setError('') }
      later(() => { const target = document.querySelector('textarea.mf-text'); if (target) { target.focus(); target.setSelectionRange(pos + body.length, pos + body.length) } }, 0)
    }
    // v0.12.1 对话联动：跳转到提及的章节（送章/送选中/Writer/Reviewer 提及解析）
    function jumpToChapter(ids) {
      if (!ids || !ids.chapterId) return
      const owner = projects.find((p) => p.id === ids.projectId) || projects.find((p) => p.chapters.some((c) => c.id === ids.chapterId))
      if (!owner) { setChatError('未找到提及的项目（可能已删除）'); return }
      const chapter = owner.chapters.find((c) => c.id === ids.chapterId)
      if (!chapter) { setChatError('未找到提及的章节（可能已删除）'); return }
      if (owner.id !== projectId) pickProject(owner.id)
      pickChapter(chapter)
      setChatError('')
    }
    // v0.14 变形形态联动：官方对话不可侵入 → 编辑器头部放「插入最新回复/跳转提及」快捷按钮
    function latestAssistantText() {
      const items = normalizeChatItems(chatSnap)
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].kind === 'assistant' && !items[i].streaming && items[i].text && items[i].text.trim()) return items[i].text
      }
      return ''
    }
    function insertLatestReply() {
      const text = latestAssistantText()
      if (!text) { flashBridgeNotice('还没有 Agent 回复可插入'); return }
      insertChatIntoEditor(text)
      flashBridgeNotice('已把最新回复插入光标处')
    }
    function jumpLatestMention() {
      const text = latestAssistantText()
      const ids = parseMentionIds(text)
      if (!ids.chapterId) { flashBridgeNotice('最新回复里没有章节提及（先点「送章」让 Agent 收到章节）'); return }
      jumpToChapter(ids)
    }
    React.useEffect(() => { if (!open || !aiOpen || !projectId) return undefined; let alive = true; call('ai-history', { projectId }).then((result) => { if (alive) setAiHistory(result && Array.isArray(result.messages) ? result.messages : []) }).catch((failure) => { console.error(failure) }); return () => { alive = false } }, [open, aiOpen, projectId])
    // v10: 写作风格与命令面板
    function refreshStyles() {
      if (typeof open !== 'undefined' && !open) return Promise.resolve(null)
      return call('list-styles', projectId ? { projectId } : {}).then((result) => { setStyles(result && Array.isArray(result.styles) ? result.styles : []); return result }).catch(() => { setStyles([{ id: 'default', name: '默认', content: '', scope: 'global' }]); return null })
    }
    React.useEffect(() => {
      if (!open) return undefined
      let alive = true
      call('list-styles', projectId ? { projectId } : {}).then((result) => { if (alive) setStyles(result && Array.isArray(result.styles) ? result.styles : []) }).catch(() => { if (alive) setStyles([{ id: 'default', name: '默认', content: '' }]) })
      return () => { alive = false }
    }, [open, projectId])
    // v0.10.1: 检索视图
    function runRetrieve() {
      if (!projectId || !retrieveQuery.trim() || retrieveBusy) return
      setRetrieveBusy(true); setRetrieveError('')
      call('retrieve', { projectId, query: retrieveQuery.trim(), limit: 50 }).then((result) => {
        setRetrieveBusy(false)
        setRetrieveResults(Array.isArray(result && result.results) ? result.results : [])
      }).catch((failure) => { setRetrieveBusy(false); setRetrieveError('检索失败：' + String((failure && failure.message) || failure)) })
    }
    function entityKindLabel(kind) { return kind === 'chapter' ? '章节' : kind === 'character' ? '角色' : kind === 'note' ? '笔记' : kind === 'world' ? '世界' : kind === 'summary' ? '摘要' : kind }
    // v0.10.3: git patch 行着色渲染（+/‑/@@/header）
    function renderGitPatch(patch) {
      if (!patch) return null
      const lines = String(patch).split('\n')
      return h('div', { className: 'mf-git-diff' }, lines.map((line, index) => {
        let cls = ''
        if (line.startsWith('+++') || line.startsWith('---') || /^(commit |Author:|Date:|index |diff --git)/.test(line)) cls = 'mf-diff-meta'
        else if (line.startsWith('@@')) cls = 'mf-diff-hunk'
        else if (line.startsWith('+')) cls = 'mf-diff-add'
        else if (line.startsWith('-')) cls = 'mf-diff-del'
        return h('div', { key: index, className: 'mf-diff-line' + (cls ? ' ' + cls : '') }, line || '\u00a0')
      }))
    }
    function jumpRetrieveHit(hit) {
      if (!project || !hit) return
      if (hit.entityType === 'chapter' || hit.entityType === 'summary') {
        const target = project.chapters.find((c) => c.id === hit.entityId)
        if (target) { setTab('projects'); pickChapter(target) }
      } else if (hit.entityType === 'character') {
        const target = project.characters.find((c) => c.id === hit.entityId)
        if (target) { setTab('characters'); pickCharacter(target) }
      } else if (hit.entityType === 'world') {
        const target = project.worldEntries.find((c) => c.id === hit.entityId)
        if (target) { setTab('world'); pickWorld(target) }
      } else if (hit.entityType === 'note') {
        const target = project.notes.find((c) => c.id === hit.entityId)
        if (target) { setTab('notes'); pickNote(target) }
      }
    }
    // v0.10.1: 风格视图（新建/编辑/预览/删除）
    function loadStyleIntoEditor(styleId) {
      setStyleError('')
      if (!styleId) { setSelStyleId(''); setStyleName(''); setStyleDesc(''); setStyleTags(''); setStyleContent(''); setStyleDirty(false); setStyleScope('global'); return }
      call('get-style', { styleId, projectId: projectId || undefined }).then((result) => {
        if (result && result.error) { setStyleError(result.error); return }
        setSelStyleId(styleId)
        setStyleName((result.style && result.style.name) || styleId)
        setStyleDesc((result.style && result.style.description) || '')
        setStyleTags(Array.isArray(result.style && result.style.tags) ? result.style.tags.join('，') : '')
        setStyleContent((result.style && result.style.content) || '')
        setStyleScope((result && result.scope) || 'global')
        setStyleDirty(false)
      }).catch((failure) => { setStyleError('读取风格失败：' + String((failure && failure.message) || failure)) })
    }
    function createStyle() {
      const id = 'custom-' + String(Date.now()).slice(-4)
      setSelStyleId(id); setStyleName('新风格'); setStyleDesc(''); setStyleTags(''); setStyleContent('# 新写作风格\n\n- 描述你的文风要求…'); setStyleScope(projectId ? 'project' : 'global'); setStyleDirty(true); setStyleError(''); setTab('styles')
    }
    function saveStyleEditor() {
      if (!selStyleId || !styleName.trim()) { setStyleError('风格名称不能为空'); return }
      const tags = styleTags.split(/[，,]/).map((t) => t.trim()).filter(Boolean)
      call('save-style', { styleId: selStyleId, name: styleName.trim(), description: styleDesc, tags, content: styleContent, scope: styleScope, projectId: styleScope === 'project' ? projectId : undefined }).then(() => {
        setStyleDirty(false); setStyleError(''); refreshStyles()
      }).catch((failure) => { setStyleError('保存风格失败：' + String((failure && failure.message) || failure)) })
    }
    function deleteStyleItem(styleId, scope) {
      if (!arm('delete-style', styleId + ':' + (scope || 'global'))) return
      call('delete-style', { styleId, scope: scope || 'global', projectId: (scope === 'project' ? projectId : undefined) }).then(() => {
        disarm()
        if (selStyleId === styleId) loadStyleIntoEditor('')
        refreshStyles()
      }).catch((failure) => { disarm(); setStyleError('删除风格失败：' + String((failure && failure.message) || failure)) })
    }
    // v0.10.1: git 历史面板
    function refreshGitHistory(chainId, diff) {
      if (!projectId) return
      const wantDiff = typeof diff === 'boolean' ? diff : gitHistDiff
      setGitHistLoading(true)
      call('git-history', chainId ? { projectId, chainId, diff: wantDiff } : { projectId, diff: wantDiff }).then((result) => { setGitHistLoading(false); setGitHistData(result) }).catch((failure) => { setGitHistLoading(false); setGitHistData({ available: false, reason: String((failure && failure.message) || failure), commits: [], patch: '' }) })
    }
    function openGitHistory(chainId) {
      if (!projectId) { flashBridgeNotice('请先打开项目'); return }
      setGitHistOpen(true); setGitHistData(null); setGitHistChain(chainId || null)
      refreshGitHistory(chainId)
    }
    function toggleGitHistDiff() {
      const next = !gitHistDiff
      setGitHistDiff(next)
      refreshGitHistory(gitHistChain, next)
    }
    // v0.10.2: 项目文件树回滚到指定提交
    function revertProjectTo(hash) {
      if (!projectId || !gitHistData) return
      const key = 'git-revert:' + hash
      if (!arm('git-revert', key)) return
      call('git-revert-project', { projectId, to: hash }).then((result) => {
        disarm()
        if (result && result.reverted) {
          setGitHistOpen(false); setGitHistData(null); setGitHistChain(null)
          reload()
          setError('已回滚项目文件树到 ' + String(hash).slice(0, 8))
        } else {
          setError('回滚失败：' + String((result && result.error) || (result && result.reason) || '未知错误'))
        }
      }).catch((failure) => { disarm(); setError('回滚失败：' + String((failure && failure.message) || failure)) })
    }
    React.useEffect(() => {
      if (!open) return undefined
      const onKey = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'P' || event.key === 'p')) { event.preventDefault(); setPaletteOpen(true) }
        else if (event.key === 'Escape') { setPaletteOpen(false); setTabMenu(null) }
      }
      if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
      return () => { if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey) }
    }, [open])
    function changeStyle(styleId) {
      setCurrentStyle(styleId)
      if (projectId) call('set-project-style', { projectId, styleId }).then(() => reload()).catch((failure) => { setError('切换写作风格失败'); console.error(failure) })
    }
    const paletteCommands = [
      { id: 'new-project', label: '新建项目', hint: '创建小说项目', run: () => { setProjectForm(true); setTab('projects'); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'mofei-new-chapter', label: '/mofei:new-chapter', hint: '在当前项目新建章节', run: () => { setChapterForm(true); setTab('projects'); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'mofei-writer', label: '/mofei:writer', hint: '把 Writer 写作任务发给当前 DSH 会话', run: () => { setPaletteOpen(false); setPaletteQuery(''); if (chapter) bridgeMention('writer') } },
      { id: 'mofei-reviewer', label: '/mofei:reviewer', hint: '把 Reviewer 审稿任务发给当前 DSH 会话', run: () => { setPaletteOpen(false); setPaletteQuery(''); if (chapter) bridgeMention('reviewer') } },
      { id: 'mofei-summary', label: '/mofei:summary', hint: '打开摘要面板', run: () => { setSummaryOpen(true); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'mofei-skills', label: '/mofei:skills', hint: '浏览已启用的 OpenFic 写作技能', run: () => { openWritingSkills(); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'mofei-style', label: '/mofei:style', hint: '打开风格视图（新建/编辑/预览/删除）', run: () => { setTab('styles'); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'mofei-retrieve', label: '/mofei:retrieve', hint: '打开检索视图（跨实体结构化 RAG）', run: () => { setTab('retrieve'); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'mofei-git-history', label: '/mofei:git-history', hint: '项目 git 历史 / 链版本 diff', run: () => { setPaletteOpen(false); setPaletteQuery(''); openGitHistory(null) } },
      { id: 'mofei-jobs', label: '/mofei:jobs', hint: '打开后台任务列表（可取消）', run: () => { setJobListOpen(true); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'open-summary', label: '摘要面板', hint: '章节/区间摘要维护', run: () => { setSummaryOpen(true); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'open-chains', label: 'Prompt Chains', hint: '打开提示词链', run: () => { setChainsOpen(true); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'open-dashboard', label: '写作记录', hint: '打开写作仪表盘', run: () => { setDashOpen(true); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'open-heatmap', label: '写作热力图', hint: '打开最近 84 天写作热力图', run: () => { setStatsOpen(true); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'mofei-sessions', label: '/mofei:sessions', hint: '打开会话列表（切换历史会话 / 退出当前对话）', run: () => { setPaletteOpen(false); setPaletteQuery(''); setChatSessionsOpen(true) } },
      { id: 'exit-chat', label: '退出当前对话', hint: '解除右侧 Agent 面板的会话绑定，回到会话选择态', run: () => { exitCurrentChat(); setPaletteOpen(false); setPaletteQuery('') } },
      { id: 'close-workbench', label: '退出墨扉', hint: '返回标准 DSH', run: () => { setPaletteOpen(false); setPaletteQuery(''); close() } },
    ]
    const filteredCommands = (mode === 'web' ? paletteCommands.filter((item) => item.id !== 'close-workbench') : paletteCommands).filter((item) => !paletteQuery.trim() || (item.label + ' ' + item.hint).toLowerCase().includes(paletteQuery.toLowerCase()))
    // 写作状态只认当前小说项目持有的会话，绝不从全局 DSH 会话列表借用开发会话。
    const writingSession = !!(project && project.writerSessionId && project.writerSessionId === chatSessionId && chatSummary && chatSummary.agentPreset === 'mofei-writer')
    if (!open) return null
    const label = status === 'saving' ? '正在保存' : status === 'unsaved' ? '未保存' : status === 'error' ? '需要处理' : '已保存'
    const volumesSorted = volumes
    const renderChapterRow = (item) => h('div', { key: item.id, className: 'mf-item' + (item.id === chapterId ? ' on' : '') + (dragId === item.id ? ' dragging' : ''), draggable: true, onDragStart: (event) => { event.stopPropagation(); setDragKind('chapter'); setDragId(item.id); try { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id) } catch (error) {} }, onDragOver: (event) => { if (dragKind === 'chapter') { event.preventDefault(); event.stopPropagation() } }, onDrop: (event) => { if (dragKind !== 'chapter') return; event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); reorderChapters(item.id, event.clientY < rect.top + rect.height / 2) }, onDragEnd: () => { setDragKind(''); setDragId('') } }, h('div', { className: 'mf-row' }, h('button', { className: 'mf-title', type: 'button', onClick: () => pickChapter(item) }, item.title, h('small', null, 'r' + String(item.revision) + (item.historyCount ? ' · 历史 ' + String(item.historyCount) : ''))), rename && rename.kind === 'chapter' && rename.id === item.id ? h('input', { className: 'mf-input mf-rename', value: renameValue, autoFocus: true, onFocus: (event) => event.target.select(), onChange: (event) => setRenameValue(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') setRename(null) } }) : h('span', { className: 'mf-minis' }, moveVolFor === item.id ? h('select', { className: 'mf-sel', value: item.volumeId || '', onChange: (event) => setChapterVolume(item.id, event.target.value), onBlur: () => setMoveVolFor('') }, h('option', { value: '' }, '未分卷'), volumesSorted.map((v) => h('option', { key: v.id, value: v.id }, v.title))) : null, h(MiniButton, { label: '卷', title: '移动到卷', on: !!item.volumeId, onClick: () => setMoveVolFor(moveVolFor === item.id ? '' : item.id) }), h(MiniButton, { label: '↑', title: '上移', onClick: () => moveChapter(item.id, 'up') }), h(MiniButton, { label: '↓', title: '下移', onClick: () => moveChapter(item.id, 'down') }), h(MiniButton, { label: '✎', title: '重命名', onClick: () => startRename('chapter', item.id, item.title) }), h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-chapter' && armed.id === item.id, title: armed && armed.kind === 'delete-chapter' && armed.id === item.id ? '再次点击确认删除' : '删除章节', onClick: () => deleteChapter(item.id) }))))
    const renderVolume = (v) => h('div', { key: v.id, className: 'mf-vol' + (dragId === v.id ? ' dragging' : ''), draggable: true, onDragStart: (event) => { event.stopPropagation(); setDragKind('volume'); setDragId(v.id); try { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', v.id) } catch (error) {} }, onDragOver: (event) => { if (dragKind === 'volume') { event.preventDefault(); event.stopPropagation() } }, onDrop: (event) => { if (dragKind !== 'volume') return; event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); reorderVolumes(v.id, event.clientY < rect.top + rect.height / 2) }, onDragEnd: () => { setDragKind(''); setDragId('') } }, h('div', { className: 'mf-vol-head' }, h('button', { className: 'mf-title', type: 'button' }, v.title, h('small', null, String(v.chapterCount) + ' 章')), h('span', { className: 'mf-minis' }, rename && rename.kind === 'volume' && rename.id === v.id ? h('input', { className: 'mf-input mf-rename', value: renameValue, autoFocus: true, onFocus: (event) => event.target.select(), onChange: (event) => setRenameValue(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') setRename(null) } }) : h(MiniButton, { label: '✎', title: '重命名卷', onClick: () => startRename('volume', v.id, v.title) }), h(MiniButton, { label: '↑', title: '上移', onClick: () => moveVolume(v.id, 'up') }), h(MiniButton, { label: '↓', title: '下移', onClick: () => moveVolume(v.id, 'down') }), h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-volume' && armed.id === v.id, title: armed && armed.kind === 'delete-volume' && armed.id === v.id ? '再次点击确认删除（含卷内章节）' : '删除卷', onClick: () => deleteVolume(v.id) }))), h('div', { className: 'mf-vol-children' }, project.chapters.filter((c) => c.volumeId === v.id).map(renderChapterRow)))
    function renderEntityHistory() {
      return h('div', { className: 'mf-hist' },
        h('div', { className: 'mf-hist-head' }, h('span', null, '历史版本（回滚将产生新版本）'), h('button', { className: 'mf-close', type: 'button', onClick: () => { setEntityHistOpen(false); setEntityHistList([]) }, title: '关闭' }, '×')),
        entityHistLoading ? h('div', { className: 'mf-empty' }, '正在加载…')
          : entityHistError ? h('div', { className: 'mf-alert' }, entityHistError)
            : entityHistList.length ? entityHistList.map((entry) => h('div', { key: entityHistKind + ':' + entry.revision, className: 'mf-hist-item' },
              h('div', { className: 'mf-hist-meta' }, h('strong', null, 'r' + String(entry.revision)), h('span', null, fmtTime(entry.at) + ' · ' + entitySnapshotLabel(entityHistKind, entry))),
              h(MiniButton, { label: armed && armed.kind === 'rollback-entity' && armed.id === entityHistKind + ':' + currentEntityId() + ':' + String(entry.revision) ? '确认回滚' : '回滚', danger: true, armed: armed && armed.kind === 'rollback-entity' && armed.id === entityHistKind + ':' + currentEntityId() + ':' + String(entry.revision), title: '回滚到此版本', onClick: () => rollbackEntity(entry) })))
              : h('div', { className: 'mf-empty' }, '暂无历史版本'))
    }
    const mfChildren = [h('section', { className: 'mf-panel' + (mode === 'web' ? ' mf-view' : '') + (focus ? ' mf-focus' : ''), role: 'dialog', 'aria-label': '墨扉写作工作区' },
      h('header', { className: 'mf-head' },
        h('div', { className: 'mf-head-main' }, h('strong', null, '墨扉'), h('span', { className: 'mf-head-context', title: project ? project.title : '写作工作台' }, project ? project.title : '写作工作台')),
        h('span', { className: 'mf-head-actions' },
          h('button', { className: 'mf-action-icon', type: 'button', title: '命令面板（Ctrl+Shift+P）', onClick: () => setPaletteOpen(true) }, '⋯'),
          mode === 'web' ? h('button', { className: 'mf-btn mf-primary', type: 'button', title: project ? '在当前项目新建章节' : '新建项目', onClick: () => { if (project) { setChapterForm(true); setTab('projects') } else { setProjectForm(true); setTab('projects') } } }, '＋ 新建') : null,
          mode === 'web' && onCollapse ? h('button', { className: 'mf-action-icon', type: 'button', title: '收起墨扉，返回原版 web', onClick: onCollapse }, '×') : null,
          mode === 'web' ? null : h('button', { className: 'mf-close', type: 'button', onClick: close, title: '关闭' }, '×')),
        // Web 模式的会话选择统一交给右侧官方 DSH 侧栏；独立工作台仍可使用本地菜单。
        mode !== 'web' && chatSessionsOpen ? h('div', { className: 'mf-writer-session-menu', role: 'menu', 'aria-label': '墨扉会话' },
          h('h3', null, project ? '《' + project.title + '》的写作会话' : '写作会话'),
          project ? h('div', { className: 'mf-writer-session-item on' }, h('span', { className: 'name' }, writingSession ? '项目专属写作会话已打开' : '项目专属写作会话'), h('span', { className: 'time' }, writingSession ? 'mofei-writer' : '正在关联')) : h('div', { className: 'mf-writer-session-empty' }, '先选择一本小说项目'),
          project ? h('button', { className: 'mf-btn', type: 'button', onClick: () => { enterWritingMode(); setChatSessionsOpen(false) } }, '打开项目会话') : null,
          project ? h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: () => { newChatSession(); setChatSessionsOpen(false) } }, '＋ 新建本项目会话') : null,
          h('div', { className: 'mf-writer-session-menu-sep' }),
          h('h3', null, '全部会话（点击切换）'),
          (Array.isArray(chatSessionList.ids) ? chatSessionList.ids : []).slice().sort((a, b) => {
            const ta = (chatSessionList.byId[a] && (chatSessionList.byId[a].updatedAt || chatSessionList.byId[a].lastActivityAt)) || 0
            const tb = (chatSessionList.byId[b] && (chatSessionList.byId[b].updatedAt || chatSessionList.byId[b].lastActivityAt)) || 0
            return tb - ta
          }).slice(0, 30).map((id) => {
            const summary = chatSessionList.byId[id] || { id }
            if (summary.origin === 'subagent') return null
            const active = id === chatSessionId
            return h('button', { key: id, className: 'mf-writer-session-item' + (active ? ' on' : ''), type: 'button', title: '切换到该会话（' + id + '）', onClick: () => switchChatSession(id) },
              h('span', { className: 'badge' }, sessionMenuBadge(summary)),
              h('span', { className: 'name' }, sessionMenuLabel(summary)),
              h('span', { className: 'time' }, sessionMenuTime(summary)))
          }),
          chatSessionId ? h('button', { className: 'mf-btn danger', type: 'button', onClick: () => { exitCurrentChat(); setChatSessionsOpen(false) } }, '退出当前对话') : null) : null),
      h('div', { className: 'mf-body' + (dragAxis ? ' resizing' : '') + (chatOpen ? '' : ' no-chat'), style: { '--mf-left': layout.left + 'px', '--mf-middle': layout.middle + 'px' } },
        h('nav', { className: 'mf-activity', 'aria-label': '墨扉活动栏' },
          h('button', { className: 'mf-act' + (tab === 'projects' ? ' on' : ''), type: 'button', title: '项目', onClick: () => setTab('projects') }, '▤', h('span', null, '项目')),
          h('button', { className: 'mf-act' + (tab === 'retrieve' ? ' on' : ''), type: 'button', title: '检索（跨实体 RAG）', onClick: () => setTab('retrieve') }, '⌕', h('span', null, '检索')),
          h('button', { className: 'mf-act' + (tab === 'characters' ? ' on' : ''), type: 'button', title: '角色', onClick: () => setTab('characters') }, '☺', h('span', null, '角色')),
          h('button', { className: 'mf-act' + (tab === 'world' ? ' on' : ''), type: 'button', title: '世界书', onClick: () => setTab('world') }, '◈', h('span', null, '世界')),
          h('button', { className: 'mf-act' + (tab === 'notes' ? ' on' : ''), type: 'button', title: '笔记', onClick: () => setTab('notes') }, '☰', h('span', null, '笔记')),
          h('button', { className: 'mf-act' + (summaryOpen ? ' on' : ''), type: 'button', title: '摘要面板', onClick: () => summaryOpen ? setSummaryOpen(false) : openSummaryPanel() }, '∑', h('span', null, '摘要')),
          h('button', { className: 'mf-act' + (chainsOpen ? ' on' : ''), type: 'button', title: 'Prompt Chains', onClick: () => chainsOpen ? setChainsOpen(false) : openPromptChains() }, '⛓', h('span', null, '链')),
          h('button', { className: 'mf-act' + (tab === 'styles' ? ' on' : ''), type: 'button', title: '写作风格（文笔/文风）', onClick: () => setTab('styles') }, '✎', h('span', null, '风格')),
          h('button', { className: 'mf-act' + (chatOpen ? ' on' : ''), type: 'button', title: 'Agent 对话（缩小版 DSH）', onClick: () => setChatOpen(!chatOpen) }, '💬', h('span', null, '对话')),
          h('button', { className: 'mf-act mf-act-bottom' + (dashOpen ? ' on' : ''), type: 'button', title: '写作仪表盘', onClick: () => setDashOpen(!dashOpen) }, '▦', h('span', null, '记录'))
        ),
        h('aside', { className: 'mf-col' },
          tab === 'projects' ? (mode === 'web' && projectId ? h('div', { className: 'mf-list' },
            h('div', { className: 'mf-sh' }, h('span', null, h('button', { className: 'mf-back', type: 'button', title: '返回项目列表', onClick: backToProjectList }, '←'), project ? project.title : '章节'), h('span', { className: 'mf-eh-actions' }, h('button', { className: 'mf-btn', type: 'button', onClick: () => setSearchOpen(!searchOpen) }, '搜索'), h('button', { className: 'mf-btn', type: 'button', disabled: !project, onClick: () => setChapterForm(!chapterForm) }, '+ 新建'))),
            searchOpen ? h('div', { className: 'mf-search' }, h('input', { className: 'mf-input', value: searchQuery, placeholder: '搜索章节全文…', autoFocus: true, onChange: (event) => setSearchQuery(event.target.value), onKeyDown: (event) => { if (event.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) } } }), searching ? h('div', { className: 'mf-empty' }, '搜索中…') : searchResults.length ? searchResults.map((res) => h('div', { key: res.chapterId, className: 'mf-sr-item' }, h('button', { className: 'mf-title', type: 'button', onClick: () => jumpToResult(res) }, h('strong', null, res.title)), res.matches.slice(0, 3).map((m) => h('div', { key: m.line, className: 'mf-sr-line' }, 'L' + String(m.line) + ': ' + m.text)))) : searchQuery.trim() ? h('div', { className: 'mf-empty' }, '无匹配') : null) : null,
            chapterForm && project ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: newChapter, placeholder: '章节标题', onChange: (event) => setNewChapter(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createChapter(null) } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: () => createChapter(null) }, '创建')) : null,
            h('div', { className: 'mf-list' },
              h('div', { className: 'mf-vol' }, h('div', { className: 'mf-vol-head' }, h('button', { className: 'mf-title', type: 'button' }, '未分卷', h('small', null, String(ungrouped.length) + ' 章')), h('span', { className: 'mf-minis' }, h(MiniButton, { label: '+', title: '新建卷', onClick: () => setVolForm(!volForm) }))), volForm ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: newVol, placeholder: '卷名称', onChange: (event) => setNewVol(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createVolume() } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: createVolume }, '创建')) : null),
              volumesSorted.map(renderVolume),
              ungrouped.map(renderChapterRow)
            )
          ) : h('div', { className: 'mf-list' },
            h('div', { className: 'mf-sh' }, h('span', { title: currentDshWorkspacePath() || '当前会话未选择工作区' }, '项目'), h('span', { className: 'mf-eh-actions' }, mode === 'web' ? h('button', { className: 'mf-btn', type: 'button', title: '扫描当前 DSH 工作区中的墨扉项目文件', onClick: () => { const workspaceRoot = currentDshWorkspacePath(); if (workspaceRoot) call('discover-workspace', { workspaceRoot }).then(() => reload()) } }, '同步') : h('button', { className: 'mf-btn', type: 'button', title: projectWide ? '收起项目宽幅页' : '打开项目宽幅页', onClick: () => setProjectWide(!projectWide) }, projectWide ? '收起' : '宽幅'), h('button', { className: 'mf-btn', type: 'button', onClick: () => setProjectForm(!projectForm) }, '+ 新建'))),
            mode === 'web' ? h('div', { className: 'mf-search', style: { borderBottom: 0, padding: '0 10px 8px' } }, h('input', { className: 'mf-input', value: projQuery, placeholder: '搜索项目…', onChange: (event) => setProjQuery(event.target.value) })) : null,
            projectForm ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: newProject, placeholder: '项目名称', onChange: (event) => setNewProject(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createProject() } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: createProject }, '创建')) : null,
            loading ? h('div', { className: 'mf-empty' }, '正在加载…') : projects.length ? h('div', null,
              rename && rename.kind === 'project' ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input mf-rename', value: renameValue, autoFocus: true, onFocus: (event) => event.target.select(), onChange: (event) => setRenameValue(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') setRename(null) } })) : null,
              mode === 'web'
                ? h('div', { className: 'mf-proj-list' }, sortProjects(filterProjects(projects, projQuery), 'updated').map((item) => {
                  const title = String(item.title == null ? '' : item.title).trim() || '未命名项目'
                  const chars = (Array.isArray(item.chapters) ? item.chapters : []).reduce((sum, c) => sum + String((c && c.content) || '').length, 0)
                  const chapCount = Array.isArray(item.chapters) ? item.chapters.length : 0
                  return h('div', { key: item.id, className: 'mf-proj' + (projectId === item.id ? ' active' : ''), onClick: () => pickProject(item.id) },
                    h('div', { className: 'mf-proj-head' },
                      h('span', { className: 'mf-proj-name', title: title }, title),
                      h('span', { className: 'mf-minis' },
                        h(MiniButton, { label: '✎', title: '重命名', onClick: (event) => { event.stopPropagation(); startRename('project', item.id, item.title) } }),
                        h(MiniButton, { label: armed && armed.kind === 'delete-project' && armed.id === item.id ? '确认删除' : '×', danger: true, armed: armed && armed.kind === 'delete-project' && armed.id === item.id, title: '删除项目（再次点击确认）', onClick: (event) => { event.stopPropagation(); if (armed && armed.kind === 'delete-project' && armed.id === item.id) { disarm(); deleteProject(item.id, true) } else arm('delete-project', item.id) } }))),
                    h('div', { className: 'mf-proj-meta' }, h('span', null, chars.toLocaleString('en-US') + ' 字'), h('span', null, String(chapCount) + ' 章')))
                }))
                : h(ProjectGrid, { projects, activeId: projectId, onPick: (item) => pickProject(item.id), onRename: (item) => startRename('project', item.id, item.title), onDelete: (item) => deleteProject(item.id, true) })
            ) : h('div', { className: 'mf-empty' }, '创建第一个小说项目。'),
            mode === 'web' ? null : (project ? h('div', { className: 'mf-goal' }, goalForm ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: goalInput, placeholder: '目标总字数', type: 'number', onChange: (event) => setGoalInput(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') commitGoal() } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: commitGoal }, '设置')) : h('button', { className: 'mf-goal-btn', type: 'button', onClick: () => { setGoalInput(String(project.goal || '')); setGoalForm(true) } }, '目标 ' + String(project.goal || 0) + ' 字 · 进度 ' + (project.goal ? String(Math.min(100, Math.round(projectChars / project.goal * 100))) + '%' : '—') + ' ✎')) : null)
          )) : tab === 'characters' ? h('div', { className: 'mf-list' },
            h('div', { className: 'mf-sh' }, h('span', null, '角色'), h('button', { className: 'mf-btn', type: 'button', onClick: () => setCharForm(!charForm) }, '+ 新建')),
            charForm ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: newChar, placeholder: '角色名称', onChange: (event) => setNewChar(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createCharacter() } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: createCharacter }, '创建')) : null,
            project && project.characters.length ? project.characters.map((item) => h('div', { key: item.id, className: 'mf-item' + (item.id === selChar ? ' on' : '') }, h('div', { className: 'mf-row' }, h('button', { className: 'mf-title', type: 'button', onClick: () => pickCharacter(item) }, item.name, h('small', null, item.isFavorited ? '★' : '')), h('span', { className: 'mf-minis' }, h(MiniButton, { label: item.isFavorited ? '★' : '☆', title: '收藏', on: item.isFavorited, onClick: () => toggleFavorite(item.id) }), h(MiniButton, { label: '✎', title: '重命名', onClick: () => startRename('character', item.id, item.name) }), h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-character' && armed.id === item.id, title: armed && armed.kind === 'delete-character' && armed.id === item.id ? '再次点击确认删除' : '删除角色', onClick: () => deleteCharacter(item.id) }))))) : h('div', { className: 'mf-empty' }, '还没有角色。')
          ) : tab === 'world' ? h('div', { className: 'mf-list' },
            h('div', { className: 'mf-sh' }, h('span', null, '世界书'), h('span', { className: 'mf-minis' }, h(MiniButton, { label: '+', title: '新建条目', onClick: () => setWorldForm(!worldForm) }), h(MiniButton, { label: '导入', title: '导入 SillyTavern 世界书 JSON', onClick: () => setWorldImportOpen(true) }))),
            worldForm && project ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: newWorld, placeholder: '条目名称（如：青城设定）', onChange: (event) => setNewWorld(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createWorld() } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: createWorld }, '创建')) : null,
            project ? h('div', { className: 'mf-world-tools' },
              h('input', { className: 'mf-world-search', value: worldQuery, placeholder: '搜索条目（名称 / 触发词）…', onChange: (event) => setWorldQuery(event.target.value) }),
              worldFiltered.length ? h('div', { className: 'mf-world-batch' },
                h('label', { className: 'mf-world-selall' }, h('input', { className: 'mf-wselect-all', type: 'checkbox', checked: worldFiltered.length > 0 && worldFiltered.every((item) => worldSelected.includes(item.id)), onChange: toggleWorldSelectAll }), ' 全选'),
                h('span', { className: 'mf-world-batch-count' }, '已选 ' + String(worldSelected.length) + ' 项'),
                h('button', { className: 'mf-btn', type: 'button', disabled: worldBatchBusy || !worldSelected.length, onClick: () => runWorldBulkToggle(true) }, '启用'),
                h('button', { className: 'mf-btn', type: 'button', disabled: worldBatchBusy || !worldSelected.length, onClick: () => runWorldBulkToggle(false) }, '禁用'),
                h('button', { className: 'mf-btn mf-danger', type: 'button', disabled: worldBatchBusy || !worldSelected.length, onClick: handleWorldBulkDeleteClick }, worldDeleteArmed ? '确认删除' : '删除')) : null
            ) : null,
            project && worldFiltered.length ? worldFiltered.map((item) => h('div', { key: item.id, className: 'mf-item' + (item.id === selWorld ? ' on' : '') }, h('div', { className: 'mf-row' }, h('input', { className: 'mf-wcheck', type: 'checkbox', checked: worldSelected.includes(item.id), onChange: () => toggleWorldSelect(item.id) }), h('button', { className: 'mf-title', type: 'button', onClick: () => pickWorld(item) }, (item.isEnabled ? '' : '⏸ ') + (item.constant ? '★ ' : '') + item.name, h('small', null, (item.keys && item.keys.length ? item.keys.join('、') : '无触发词'))), h('span', { className: 'mf-minis' }, h(MiniButton, { label: '↑', title: '上移', onClick: () => moveWorld(item.id, 'up') }), h(MiniButton, { label: '↓', title: '下移', onClick: () => moveWorld(item.id, 'down') }), h(MiniButton, { label: '★', title: '常驻（始终注入上下文）', on: item.constant, onClick: () => toggleWorldFlag(item.id, 'constant') }), h(MiniButton, { label: '开关', title: item.isEnabled ? '启用' : '禁用', on: item.isEnabled, onClick: () => toggleWorldFlag(item.id, 'isEnabled') }), h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-world' && armed.id === item.id, title: armed && armed.kind === 'delete-world' && armed.id === item.id ? '再次点击确认删除' : '删除条目', onClick: () => deleteWorld(item.id) }))))) : h('div', { className: 'mf-empty' }, project ? (worldQuery ? '无匹配条目。' : '还没有世界书条目，可新建或导入 ST JSON。') : '选择项目后管理世界书。')
          ) : tab === 'retrieve' ? h('div', { className: 'mf-list' },
            h('div', { className: 'mf-sh' }, h('span', null, '检索（RAG）'), h('span', { className: 'mf-eh-actions' }, h('button', { className: 'mf-btn', type: 'button', disabled: retrieveBusy || !projectId, onClick: runRetrieve }, retrieveBusy ? '检索中' : '检索'))),
            h('div', { className: 'mf-search', style: { borderBottom: 0, paddingBottom: 4 } }, h('input', { className: 'mf-input', value: retrieveQuery, placeholder: '跨章节/角色/笔记/世界书/摘要…', onChange: (event) => setRetrieveQuery(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') runRetrieve() } })),
            retrieveError ? h('div', { className: 'mf-alert' }, retrieveError) : null,
            !projectId ? h('div', { className: 'mf-empty' }, '选择项目后检索。')
              : retrieveBusy ? h('div', { className: 'mf-empty' }, '检索中…')
                : retrieveResults.length ? h('div', null,
                  h('div', { className: 'mf-vol' }, String(retrieveResults.length) + ' 个命中（点击跳转实体）'),
                  retrieveGrouped.map((group) => h('div', { key: group.title },
                    h('div', { className: 'mf-vol' }, group.title + ' · ' + String(group.hits.length)),
                    group.hits.map((hit, index) => h('div', { key: hit.entityType + ':' + hit.entityId + ':' + hit.line + ':' + index, className: 'mf-sr-item' },
                      h('button', { className: 'mf-title', type: 'button', onClick: () => jumpRetrieveHit(hit) }, h('strong', null, entityKindLabel(hit.entityType) + ' · ' + hit.title), h('div', { className: 'mf-sr-line' }, 'L' + String(hit.line) + ' · score ' + String(hit.score))),
                      h('div', { className: 'mf-sr-line' }, hit.snippet)))
                  ))
                ) : retrieveQuery.trim() ? h('div', { className: 'mf-empty' }, '无命中。') : h('div', { className: 'mf-empty' }, '输入检索词，回车或点「检索」。')
          ) : tab === 'styles' ? h('div', { className: 'mf-list' },
            h('div', { className: 'mf-sh' }, h('span', null, '写作风格' + (projectId ? ' · 项目级优先' : '')), h('span', { className: 'mf-eh-actions' }, h('button', { className: 'mf-btn', type: 'button', onClick: createStyle }, '+ 新建'))),
            styleError ? h('div', { className: 'mf-alert' }, styleError) : null,
            styles.length ? styles.map((item) => h('div', { key: item.id, className: 'mf-item' + (item.id === selStyleId ? ' on' : '') }, h('div', { className: 'mf-row' }, h('button', { className: 'mf-title', type: 'button', onClick: () => loadStyleIntoEditor(item.id) }, item.name + (project && project.currentStyle === item.id ? ' ✓' : ''), h('small', null, (item.description || '') + (item.scope === 'project' ? ' · 项目级' : ''))), h('span', { className: 'mf-minis' }, h(MiniButton, { label: '✎', title: '编辑', onClick: () => loadStyleIntoEditor(item.id) }), h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-style' && armed.id === item.id + ':' + (item.scope || 'global'), title: '删除风格', onClick: () => deleteStyleItem(item.id, item.scope) }))))) : h('div', { className: 'mf-empty' }, '暂无风格文件，点「+ 新建」创建。')
          ) : h('div', { className: 'mf-list' },
            h('div', { className: 'mf-sh' }, h('span', null, '笔记'), h('button', { className: 'mf-btn', type: 'button', onClick: () => setCatForm(!catForm) }, '+ 分类')),
            catForm ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: newCat, placeholder: '分类名称', onChange: (event) => setNewCat(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createCategory(null) } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: () => createCategory(null) }, '创建')) : null,
            h('button', { className: 'mf-btn mf-primary', type: 'button', style: { width: 'calc(100% - 16px)', margin: '8px' }, onClick: () => { setNoteForm(!noteForm); setSelNote('') } }, '+ 新建笔记'),
            noteForm ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: newNote, placeholder: '笔记标题', onChange: (event) => setNewNote(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createNote(null) } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: () => createNote(null) }, '创建')) : null,
            rootCats.map((cat) => h('div', { key: cat.id },
              h('div', { className: 'mf-item mf-vol' },
                h('div', { className: 'mf-vol-head' },
                  h('button', { className: 'mf-title', type: 'button', onClick: () => setSubCatFor(subCatFor === cat.id ? '' : cat.id) }, '📁 ' + cat.title),
                  h('span', { className: 'mf-minis' },
                    h(MiniButton, { label: '+', title: '子分类', onClick: () => setSubCatFor(subCatFor === cat.id ? '' : cat.id) }),
                    h(MiniButton, { label: '✎', title: '重命名', onClick: () => startRename('category', cat.id, cat.title) }),
                    h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-category' && armed.id === cat.id, title: armed && armed.kind === 'delete-category' && armed.id === cat.id ? '再次点击确认删除' : '删除分类', onClick: () => deleteCategory(cat.id) })))),
              subCatFor === cat.id ? h('div', { className: 'mf-vol-children' },
                h('div', { className: 'mf-form' },
                  h('input', { className: 'mf-input', value: newSubCat, placeholder: '子分类名称', onChange: (event) => setNewSubCat(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createCategory(cat.id) } }),
                  h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: () => createCategory(cat.id) }, '创建'))) : null,
              childCats.filter((c) => c.parentId === cat.id).map((child) =>
                h('div', { key: child.id },
                  h('div', { className: 'mf-item mf-vol' },
                    h('div', { className: 'mf-vol-head' },
                      h('button', { className: 'mf-title', type: 'button' }, '└ ' + child.title),
                      h('span', { className: 'mf-minis' },
                        h(MiniButton, { label: '✎', title: '重命名', onClick: () => startRename('category', child.id, child.title) }),
                        h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-category' && armed.id === child.id, title: '删除分类', onClick: () => deleteCategory(child.id) })))),
                  project.notes.filter((n) => n.categoryId === child.id).map((n) => renderNoteItem(n, child.id)))),
              project.notes.filter((n) => n.categoryId === cat.id).map((n) => renderNoteItem(n, cat.id))
            )),
            project ? h('div', { className: 'mf-vol' }, h('div', { className: 'mf-vol-head' }, h('button', { className: 'mf-title', type: 'button' }, '未分类'), h('span', { className: 'mf-minis' }))) : null,
            project ? project.notes.filter((n) => !n.categoryId).map((n) => renderNoteItem(n, null)) : null,
            h('div', { className: 'mf-empty' }, '笔记树：两级分类 · 锁定=Agent 不可改')
          ),
          mode === 'web' ? h('div', { className: 'mf-mininav' },
            [['projects', '▤', '项目'], ['retrieve', '⌕', '检索'], ['characters', '☺', '角色'], ['world', '◈', '世界'], ['notes', '☰', '笔记']].map((item) => h('button', { key: item[0], type: 'button', className: tab === item[0] ? 'on' : '', onClick: () => setTab(item[0]) }, h('span', { className: 'ic' }, item[1]), item[2])),
            h('button', { type: 'button', className: skillsOpen ? 'on' : '', title: '写作技能与工作流', onClick: openWritingSkills }, h('span', { className: 'ic' }, '✦'), '技能')
          ) : null
        ),
        h('div', { className: 'mf-gutter' + (dragAxis === 'left' ? ' dragging' : ''), 'data-axis': 'left', role: 'separator', title: '拖动调整宽度', onPointerDown: startGutterDrag, onPointerMove: moveGutterDrag, onPointerUp: endGutterDrag, onPointerCancel: cancelGutterDrag, onDoubleClick: resetGutter }),
        h('aside', { className: 'mf-col mf-mid' },
          h('div', { className: 'mf-sh' }, h('span', null, tab === 'characters' ? '角色' : tab === 'notes' ? '笔记' : tab === 'styles' ? '章节（可混开笔记标签）' : tab === 'retrieve' ? '章节' : '章节'), h('button', { className: 'mf-btn', type: 'button', onClick: () => setSearchOpen(!searchOpen) }, '搜索'), h('button', { className: 'mf-btn', type: 'button', disabled: !project, onClick: () => setChapterForm(!chapterForm) }, '+ 新建')),
          searchOpen ? h('div', { className: 'mf-search' }, h('input', { className: 'mf-input', value: searchQuery, placeholder: '搜索章节全文…', autoFocus: true, onChange: (event) => setSearchQuery(event.target.value), onKeyDown: (event) => { if (event.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) } } }), searching ? h('div', { className: 'mf-empty' }, '搜索中…') : searchResults.length ? searchResults.map((res) => h('div', { key: res.chapterId, className: 'mf-sr-item' }, h('button', { className: 'mf-title', type: 'button', onClick: () => jumpToResult(res) }, h('strong', null, res.title)), res.matches.slice(0, 3).map((m) => h('div', { key: m.line, className: 'mf-sr-line' }, 'L' + String(m.line) + ': ' + m.text)))) : searchQuery.trim() ? h('div', { className: 'mf-empty' }, '无匹配') : null) : null,
          chapterForm && project ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: newChapter, placeholder: '章节标题', onChange: (event) => setNewChapter(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createChapter(null) } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: () => createChapter(null) }, '创建')) : null,
          h('div', { className: 'mf-list' }, !project ? h('div', { className: 'mf-empty' }, '选择项目。') : h('div', null,
            h('div', { className: 'mf-vol' }, h('div', { className: 'mf-vol-head' }, h('button', { className: 'mf-title', type: 'button' }, '未分卷', h('small', null, String(ungrouped.length) + ' 章')), h('span', { className: 'mf-minis' }, h(MiniButton, { label: '+', title: '新建卷', onClick: () => setVolForm(!volForm) }))), volForm ? h('div', { className: 'mf-form' }, h('input', { className: 'mf-input', value: newVol, placeholder: '卷名称', onChange: (event) => setNewVol(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createVolume() } }), h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: createVolume }, '创建')) : null),
            volumesSorted.map(renderVolume),
            ungrouped.map(renderChapterRow)
          ))
        ),
        h('div', { className: 'mf-gutter' + (dragAxis === 'middle' ? ' dragging' : ''), 'data-axis': 'middle', role: 'separator', title: '拖动调整宽度', onPointerDown: startGutterDrag, onPointerMove: moveGutterDrag, onPointerUp: endGutterDrag, onPointerCancel: cancelGutterDrag, onDoubleClick: resetGutter }),
        h('main', { className: 'mf-editor' },
          openTabs.length ? h('div', { className: 'mf-tabs2', onClick: closeTabMenu }, openTabs.map((t) => h('span', { key: t.kind + ':' + t.id, className: 'mf-tab2' + (t.id === activeTabId ? ' on' : '') + (tabDragId === t.id ? ' dragging' : '') + (tabDragId && tabDragId !== t.id ? ' drop-target' : ''), draggable: true, onDragStart: (event) => { event.stopPropagation(); setTabDragId(t.id) }, onDragOver: (event) => { event.preventDefault() }, onDrop: (event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); moveTab(t.id, event.clientX < rect.left + rect.width / 2) }, onDragEnd: () => setTabDragId(''), onContextMenu: (event) => openTabMenu(event, t), onClick: () => switchChapterTab(t.id) }, h('span', { className: 'mf-tab-kind' }, t.kind === 'note' ? '笔' : '章'), t.pinned ? h('span', { className: 'mf-tab-pin' }, '📌') : null, t.title, t.pinned ? null : h('button', { className: 'mf-tabx', type: 'button', title: '关闭标签（右键更多操作）', onClick: (event) => { event.stopPropagation(); closeChapterTab(t.id) } }, '×')))) : null,
          tabMenu ? h('div', { className: 'mf-tabmenu', style: { left: tabMenu.x, top: tabMenu.y } }, h('button', { type: 'button', onClick: () => { pinTab(tabMenu.id); closeTabMenu() } }, tabMenu.pinned ? '取消固定' : '固定标签'), h('button', { type: 'button', onClick: () => { closeOtherTabs(tabMenu.id); closeTabMenu() } }, '关闭其他'), h('button', { type: 'button', disabled: tabMenu.pinned, onClick: () => { closeChapterTab(tabMenu.id); closeTabMenu() } }, '关闭')) : null,
          tab === 'projects' && projectWide ? h(ProjectPage, { projects, activeId: projectId, onPick: (item) => pickProject(item.id), onRename: (item) => startRename('project', item.id, item.title), onDelete: (item) => deleteProject(item.id, true), onCreate: () => setProjectForm(!projectForm), onClose: () => setProjectWide(false), onSaveDescription: saveProjectDescription })
          : tab === 'world' ? h('div', null,
            h('div', { className: 'mf-eh' }, h('span', null, worldEntry ? worldEntry.name : '世界书编辑'), h('span', { className: 'mf-eh-actions' }, worldEntry ? h(MiniButton, { label: entityHistOpen && entityHistKind === 'world-entry' ? '收起历史' : '历史', title: '条目历史版本', on: entityHistOpen && entityHistKind === 'world-entry', onClick: () => toggleEntityHistory('world-entry', worldEntry.id) }) : null, h('span', { className: 'mf-status' }, worldEntry ? (worldEntry.isEnabled ? '' : '⏸ 禁用 · ') + (worldEntry.constant ? '★ 常驻 · ' : '') + (worldDirty ? '未保存' : '') : ''))),
            entityHistOpen && entityHistKind === 'world-entry' ? renderEntityHistory() : null,
            worldEntry ? h('div', { className: 'mf-form', style: { border: 0, padding: '14px 18px' } },
              h('input', { className: 'mf-input', value: worldName, placeholder: '条目名称', onChange: (event) => { setWorldName(event.target.value); setWorldDirty(true) } }),
              h('input', { className: 'mf-input', value: worldKeys, placeholder: '触发词，用逗号分隔（如：林轩，青城）。留空则条目名命中时激活。', onChange: (event) => { setWorldKeys(event.target.value); setWorldDirty(true) } }),
              h('textarea', { className: 'mf-text', style: { flex: '1', minHeight: '40vh', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '6px' }, value: worldContent, placeholder: '条目内容（AI 续写/摘要时，命中触发词后注入上下文）…', onChange: (event) => { setWorldContent(event.target.value); setWorldDirty(true) } }),
              h('div', { className: 'mf-actions' },
                h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: !worldDirty, onClick: saveWorld }, '保存条目'),
                h(MiniButton, { label: '★', title: '常驻（始终注入上下文）', on: worldEntry.constant, onClick: () => toggleWorldFlag(worldEntry.id, 'constant') }),
                h(MiniButton, { label: worldEntry.isEnabled ? '启用' : '禁用', title: '启用/禁用', on: worldEntry.isEnabled, onClick: () => toggleWorldFlag(worldEntry.id, 'isEnabled') }),
                h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-world' && armed.id === worldEntry.id, title: '删除条目', onClick: () => deleteWorld(worldEntry.id) })))
            : h('div', { className: 'mf-empty' }, '在左侧创建或导入世界书条目。'))
          : tab === 'characters' ? h('div', null,
            h('div', { className: 'mf-eh' }, h('span', null, character ? character.name : '角色编辑'), h('span', { className: 'mf-eh-actions' }, character ? h(MiniButton, { label: entityHistOpen && entityHistKind === 'character' ? '收起历史' : '历史', title: '角色历史版本', on: entityHistOpen && entityHistKind === 'character', onClick: () => toggleEntityHistory('character', character.id) }) : null, h('span', { className: 'mf-status' }, character && charDirty ? '未保存' : ''))),
            entityHistOpen && entityHistKind === 'character' ? renderEntityHistory() : null,
            character ? h('div', { className: 'mf-form', style: { border: 0, padding: '14px 18px' } },
              h('input', { className: 'mf-input', value: charName, placeholder: '角色名称', onChange: (event) => { setCharName(event.target.value); setCharDirty(true) } }),
              h('textarea', { className: 'mf-text', style: { flex: '1', minHeight: '40vh', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '6px' }, value: charDesc, placeholder: '角色描述（外貌/性格/背景/关系…）', onChange: (event) => { setCharDesc(event.target.value); setCharDirty(true) } }),
              h('div', { className: 'mf-actions' },
                h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: !charDirty, onClick: saveCharacter }, '保存角色'),
                h(MiniButton, { label: '★', title: '收藏', on: character.isFavorited, onClick: () => toggleFavorite(character.id) }),
                h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-character' && armed.id === character.id, title: '删除角色', onClick: () => deleteCharacter(character.id) })))
            : h('div', { className: 'mf-empty' }, '选择角色开始编辑。'))
          : tab === 'notes' ? h('div', null,
            h('div', { className: 'mf-eh' }, h('span', null, note ? note.title : '笔记编辑'), h('span', { className: 'mf-eh-actions' }, note ? h(MiniButton, { label: entityHistOpen && entityHistKind === 'note' ? '收起历史' : '历史', title: '笔记历史版本', on: entityHistOpen && entityHistKind === 'note', onClick: () => toggleEntityHistory('note', note.id) }) : null, h('span', { className: 'mf-status' }, note ? (note.isLocked ? '🔒 锁定' : '') + (note.isHidden ? ' 👁 隐藏' : '') + (noteDirty ? ' · 未保存' : '') : ''))),
            entityHistOpen && entityHistKind === 'note' ? renderEntityHistory() : null,
            note ? h('div', { className: 'mf-form', style: { border: 0, padding: '14px 18px' } },
              h('input', { className: 'mf-input', value: noteTitle, placeholder: '笔记标题', onChange: (event) => { setNoteTitle(event.target.value); setNoteDirty(true) } }),
              h('textarea', { className: 'mf-text', style: { flex: '1', minHeight: '40vh', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '6px' }, value: noteContent, placeholder: '笔记内容…', onChange: (event) => { setNoteContent(event.target.value); setNoteDirty(true) } }),
              h('div', { className: 'mf-actions' },
                h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: !noteDirty, onClick: saveNote }, '保存笔记'),
                h('select', { className: 'mf-sel', value: note.categoryId || '', onChange: (event) => moveNote(note.id, event.target.value) }, h('option', { value: '' }, '未分类'), categories.map((c) => h('option', { key: c.id, value: c.id }, c.title))),
                h(MiniButton, { label: '🔒', title: '锁定（Agent 不可改）', on: note.isLocked, onClick: () => toggleNoteFlag(note.id, 'isLocked') }),
                h(MiniButton, { label: '👁', title: '隐藏', on: note.isHidden, onClick: () => toggleNoteFlag(note.id, 'isHidden') }),
                h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-note' && armed.id === note.id, title: '删除笔记', onClick: () => deleteNote(note.id) })))
            : h('div', { className: 'mf-empty' }, '选择笔记开始编辑。'))
          : tab === 'styles' ? h('div', null,
            h('div', { className: 'mf-eh' }, h('span', null, selStyleId ? '风格编辑：' + styleName : '写作风格（文笔/文风提示词）'), h('span', { className: 'mf-eh-actions' }, selStyleId ? h(MiniButton, { label: stylePreview ? '收起预览' : '预览', title: '预览提示词正文', on: stylePreview, onClick: () => setStylePreview(!stylePreview) }) : null, h('span', { className: 'mf-status' }, selStyleId ? (styleScope === 'project' ? '项目级 · ' : '全局 · ') + (styleDirty ? '未保存' : '已保存') : '风格只注入写作上下文，不进入 coding 会话'))),
            selStyleId ? h('div', { className: 'mf-form', style: { border: 0, padding: '14px 18px' } },
              h('input', { className: 'mf-input', value: styleName, placeholder: '风格名称', onChange: (event) => { setStyleName(event.target.value); setStyleDirty(true) } }),
              h('input', { className: 'mf-input', value: styleDesc, placeholder: '一句话描述（列表展示）', onChange: (event) => { setStyleDesc(event.target.value); setStyleDirty(true) } }),
              h('input', { className: 'mf-input', value: styleTags, placeholder: '标签，逗号分隔', onChange: (event) => { setStyleTags(event.target.value); setStyleDirty(true) } }),
              h('textarea', { className: 'mf-text', style: { flex: '1', minHeight: '42vh', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '6px' }, value: styleContent, placeholder: '风格提示词正文（Markdown）…', onChange: (event) => { setStyleContent(event.target.value); setStyleDirty(true) } }),
              stylePreview ? h('div', { className: 'mf-ai-result' }, styleContent) : null,
              h('div', { className: 'mf-actions' },
                h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: !styleDirty, onClick: saveStyleEditor }, '保存风格'),
                h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-style' && armed.id === selStyleId + ':' + styleScope, title: '删除该风格', onClick: () => deleteStyleItem(selStyleId, styleScope) })))
            : h('div', { className: 'mf-empty' }, '在左侧选择风格文件编辑，或点「+ 新建」。'))
          : h('div', { className: 'mf-editor-pane' },
            findOpen ? h('div', { className: 'mf-findbar' },
              h('input', { value: findQuery, placeholder: '查找…', onChange: (event) => updateFind(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') findNext(); if (event.key === 'Escape') setFindOpen(false) } }),
              h('span', null, findMatches.length ? String(findIndex + 1) + '/' + String(findMatches.length) : '0/0'),
              h('button', { className: 'mf-mini', type: 'button', title: '上一个', onClick: findPrev }, '↑'),
              h('button', { className: 'mf-mini', type: 'button', title: '下一个', onClick: findNext }, '↓'),
              h('input', { className: 'mf-find-repl', value: replaceQuery, placeholder: '替换为…', onChange: (event) => setReplaceQuery(event.target.value) }),
              h('button', { className: 'mf-btn', type: 'button', disabled: !findMatches.length, onClick: replaceOne }, '替换'),
              h('button', { className: 'mf-btn', type: 'button', disabled: !findQuery, onClick: replaceAll }, '全部替换'),
              h('button', { className: 'mf-close', type: 'button', onClick: () => setFindOpen(false), title: '关闭' }, '×')
            ) : null,
            error ? h('div', { className: 'mf-alert' }, h('div', null, error), conflict ? h('div', { className: 'mf-actions' }, h('button', { className: 'mf-btn', type: 'button', onClick: rebase }, '保留草稿继续'), h('button', { className: 'mf-btn', type: 'button', onClick: () => accept(conflict) }, '使用远端正文')) : null) : null,
            showHistory && chapter ? h('div', { className: 'mf-hist' }, h('div', { className: 'mf-hist-head' }, h('span', null, '历史版本（回滚将产生新修订）'), h('button', { className: 'mf-close', type: 'button', onClick: () => setShowHistory(false), title: '关闭' }, '×')), historyLoading ? h('div', { className: 'mf-empty' }, '正在加载…') : historyList.length ? historyList.map((item) => h('div', { key: item.revision, className: 'mf-hist-item' }, h('div', { className: 'mf-hist-meta' }, h('strong', null, 'r' + String(item.revision)), h('span', null, fmtTime(item.at) + ' · ' + String(item.chars) + ' 字')), h(MiniButton, { label: armed && armed.kind === 'rollback' && armed.id === String(item.revision) ? '确认回滚' : '回滚', danger: true, armed: armed && armed.kind === 'rollback' && armed.id === String(item.revision), title: '回滚到此版本', onClick: () => rollbackTo(item.revision) }))) : h('div', { className: 'mf-empty' }, '暂无历史版本')) : null,
            chapter ? h('input', { key: 'title-' + chapterId, className: 'mf-title-input', value: titleDraft, placeholder: '章节标题', spellCheck: false, onChange: (event) => setTitleDraft(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); event.target.blur() } }, onBlur: () => commitTitle(), title: '章节标题' }) : null,
            chapter ? h('textarea', { className: 'mf-text', value: draft, spellCheck: true, placeholder: '开始写作…（Ctrl+S 保存正文，Ctrl+F 查找替换）', onScroll: saveScrollPos, onSelect: (event) => { setSelStart(event.target.selectionStart); setSelEnd(event.target.selectionEnd) }, onMouseUp: (event) => { setSelStart(event.target.selectionStart); setSelEnd(event.target.selectionEnd) }, onChange: (event) => { setDraft(event.target.value); if (!conflict) { setStatus('unsaved'); setError('') } }, onKeyDown: (event) => { const key = String(event.key).toLowerCase(); if ((event.ctrlKey || event.metaKey) && key === 's') { event.preventDefault(); saveChapter() } if ((event.ctrlKey || event.metaKey) && key === 'f') { event.preventDefault(); setFindOpen(true); updateFind(''); later(() => { const el = document.querySelector('.mf-findbar input'); if (el) el.focus() }, 60) } if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); const el = event.target; const start = el.selectionStart || 0; const end = el.selectionEnd || start; const next = draft.slice(0, start) + '\u3000\u3000' + draft.slice(end); const caret = start + 2; setDraft(next); if (!conflict) { setStatus('unsaved'); setError('') } later(() => { const target = document.querySelector('textarea.mf-text'); if (target) { target.focus(); target.setSelectionRange(caret, caret) } }, 0) } } }) : h('div', { className: 'mf-empty' }, '选择章节后开始写作。'),
            aiOpen ? h('div', { className: 'mf-ai' },
              h('div', { className: 'mf-ai-head' },
                h('select', { value: aiMode, onChange: (event) => setAiMode(event.target.value) }, h('option', { value: 'continue' }, '续写'), h('option', { value: 'rewrite' }, '改写选中'), h('option', { value: 'summary' }, '章节摘要'), h('option', { value: 'custom' }, '自定义指令')),
                h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: !chapter, onClick: aiBusy ? stopAi : runAi }, aiBusy ? '停止' : '生成'),
                aiResult ? h('button', { className: 'mf-btn', type: 'button', onClick: insertAiResult }, '插入到光标') : null),
              h('div', { className: 'mf-ai-head' },
                h(MiniButton, { label: aiHistoryOpen ? '收起历史' : '会话历史', title: '查看/收起本项目的 AI 会话历史', on: aiHistoryOpen, onClick: () => setAiHistoryOpen(!aiHistoryOpen) }),
                h('span', { className: 'mf-status' }, String(aiHistory.length) + ' 条'),
                h(MiniButton, { label: '清空', title: '清空本项目 AI 会话历史', danger: true, disabled: !aiHistory.length, onClick: clearAiHistory }),
                h(MiniButton, { label: aiBatchBusy ? '摘要中…' : '批量摘要', title: '为全部章节顺序生成摘要（最多 30 章）', disabled: aiBatchBusy || !project, onClick: runAiBatch })),
              aiMode === 'custom' || aiMode === 'rewrite' ? h('textarea', { value: aiPrompt, placeholder: aiMode === 'rewrite' ? '改写要求（可选）…' : '输入指令，如：让主角在雨中回忆童年…', onChange: (event) => setAiPrompt(event.target.value) }) : null,
              aiError ? h('div', { className: 'mf-alert' }, aiError) : null,
              aiBatchError ? h('div', { className: 'mf-alert' }, aiBatchError) : null,
              aiHistoryOpen ? aiHistory.length ? aiHistory.slice(-6).map((item) => h('div', { key: item.id, className: 'mf-ai-result', style: { maxHeight: '80px' } }, (item.role === 'assistant' ? '助手 ' : '你 ') + (item.mode ? '(' + item.mode + ') ' : '') + fmtTime(item.at) + '\n' + String(item.content).slice(0, 300))) : h('div', { className: 'mf-empty' }, '暂无会话历史。') : null,
              aiBatchResults.length ? h('div', { className: 'mf-hist' }, aiBatchResults.map((item) => h('div', { key: item.chapterId, className: 'mf-ai-result', style: { maxHeight: '90px' } }, '【' + item.title + '】' + item.summary))) : null,
              aiResult || aiBusy ? h('div', { className: 'mf-ai-result' }, (aiResult || '') + (aiBusy ? '▌' : '')) : null
            ) : null,
            statsOpen && stats ? h('div', { className: 'mf-heat' },
              h('div', null, h('small', null, '最近 84 天写作热力图 · 每格=一天 · 颜色越深当天净增字数越多')),
              h('div', { className: 'mf-heat-grid' }, Array.from({ length: 84 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (83 - index)); const key = dateKey(date); const chars = stats.calendar && stats.calendar[key] || 0; const level = chars === 0 ? 0 : chars < 200 ? 1 : chars < 800 ? 2 : chars < 2000 ? 3 : 4; return h('div', { key: key, className: 'mf-hm-cell' + (level ? ' l' + String(level) : ''), title: key + ' · ' + String(chars) + ' 字' }) }))
            ) : null,
            h('div', { className: 'mf-foot' },
              mode === 'web'
                ? h('span', { className: 'mf-stat' }, chapter ? h('span', null, countWords(draft) + ' 字') : null, chapter ? h('span', { className: 'mf-status ' + status }, '· ' + label) : null, agentContextBound && chatSummary && chatSummary.agentPreset === 'mofei-writer' ? h('span', { className: 'mf-context-status', title: '当前项目和章节已关联到写作助手；它会按需读取精装上下文与最新修订。' }, '已关联写作助手') : null)
                : h('span', { className: 'mf-stat' }, chapter ? countWords(draft) + ' 字' : '', project && project.goal ? ' · 目标 ' + String(project.goal) + '（' + String(Math.min(100, Math.round(projectChars / project.goal * 100))) + '%）' : '', stats ? ' · 今日 +' + String(stats.todayChars) + ' · 连续 ' + String(stats.streak) + ' 天 · 累计 ' + String(stats.totalChars) + ' 字' : ''),
              mode === 'web'
                ? null
                : h('span', { className: 'mf-eh-actions' }, h('button', { className: 'mf-btn', type: 'button', onClick: () => setJobListOpen(!jobListOpen) }, jobListOpen ? '收起任务' : '任务'), h('button', { className: 'mf-btn', type: 'button', onClick: () => setDashOpen(!dashOpen) }, dashOpen ? '收起记录' : '写作记录'), h('button', { className: 'mf-btn', type: 'button', onClick: () => setStatsOpen(!statsOpen) }, statsOpen ? '收起热力图' : '写作热力图'), h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: !changed || status === 'saving' || !!conflict, onClick: saveChapter }, status === 'saving' ? '保存中' : '保存正文')))
            )
          ),
          mode === 'web' ? null : (chatOpen ? h('aside', { className: 'mf-chat', 'aria-label': 'Agent 对话' },
            mode === 'web' ? (chatSessionsOpen ? h('div', { className: 'mf-sess-list' },
              chatSessionList.ids.length ? chatSessionList.ids.slice(0, 30).map((id) => {
                const summary = chatSessionList.byId[id] || {}
                return h('div', { key: id, className: 'mf-sess-item' + (id === chatSessionId ? ' on' : ''), onClick: () => selectChatSession(id) },
                  h('span', { className: 'name' }, summary.title || '未命名'),
                  h('span', { className: 'time' }, summary.agentPreset ? summary.agentPreset + ' · ' : '', fmtAgo(summary.updatedAt)))
              }) : h('div', { className: 'mf-empty' }, '暂无会话'),
              h('button', { className: 'mf-btn', type: 'button', style: { margin: '4px auto 2px' }, onClick: () => { newChatSession(); setChatSessionsOpen(false) } }, '＋ 新会话')
            ) : h('button', { className: 'mf-sess-toggle', type: 'button', title: '切换/退出当前会话', onClick: () => setChatSessionsOpen(true) }, '‹ 会话列表')) : null,
            h('div', { className: 'mf-chat-head' },
              h('span', null, 'Agent 对话', chatSummary ? h('small', null, ' · ' + (chatSummary.title || '未命名') + (chatSummary.agentPreset ? ' · ' + chatSummary.agentPreset : '')) : null),
              h('span', { className: 'mf-eh-actions' },
                chatSnap && chatSnap.running ? h(MiniButton, { label: '停止', danger: true, title: '停止当前回合', onClick: cancelChat }) : null,
                chatPresets.length > 1 ? h('select', { className: 'mf-sel', title: '新建会话使用的预设', value: chatPresetId, onChange: (event) => setChatPresetId(event.target.value) }, chatPresets.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.name || preset.id))) : null,
                h(MiniButton, { label: '＋', title: '新建会话（' + (chatPresetId || '默认') + ' 预设）', disabled: chatBusy, onClick: newChatSession }),
                mode === 'web' ? null : h(MiniButton, { label: '×', title: '收起对话面板', onClick: () => setChatOpen(false) }))),
            mode === 'web' ? h('div', { className: 'mf-chat-body', ref: chatBodyRef },
              chatHint ? h('div', { className: 'mf-chat-empty' }, chatHint) : null,
              !chatSessionId ? h('div', { className: 'mf-chat-empty' }, dshClientSessions ? '还没有绑定 DSH 会话，点右上「＋」新建写作会话（mofei-writer）。' : 'DSH 会话服务不可用。') : null,
              normalizeChatItems(chatSnap).length ? normalizeChatItems(chatSnap).map((item) => item.kind === 'user'
                ? h('div', { key: item.key, className: 'mf-chat-msg user' }, item.text, parseMentionIds(item.text).chapterId ? h('button', { type: 'button', className: 'mf-chat-jump', title: '跳转到提及章节', onClick: () => jumpToChapter(parseMentionIds(item.text)) }, '📄 跳转章节') : null)
                : item.kind === 'assistant'
                  ? h('div', { key: item.key, className: 'mf-chat-msg assistant' }, item.streaming ? h('span', { className: 'mf-chat-src' }, '写作 Agent 正在输入…') : null, item.text || '', item.streaming ? '▌' : '', item.tools && item.tools.length ? item.tools.map((tool, toolIndex) => h('div', { key: toolIndex, className: 'mf-chat-tool' }, '⚙ ' + tool.name)) : null, !item.streaming && item.text && item.text.trim() ? h('button', { type: 'button', className: 'mf-chat-jump', title: '把回复插入正文（光标处）', onClick: () => insertChatIntoEditor(item.text) }, '↓ 插入正文') : null)
                  : item.kind === 'tool'
                    ? h('div', { key: item.key, className: 'mf-chat-tool' }, (item.running ? '⏳ ' : item.ok === false ? '✖ ' : '✔ ') + (item.name || '工具') + (item.text ? '：' + item.text : ''))
                    : h('div', { key: item.key, className: 'mf-chat-tool' }, item.text))
                : h('div', { className: 'mf-chat-empty' }, '和写作 Agent 对话吧：续写 / 审稿 / 查设定。'),
              chatSnap && chatSnap.pending && chatSnap.pending.length ? h('div', { className: 'mf-pends' }, chatSnap.pending.map((pending) => h(PendingCard, { key: pending.key, item: pending }))) : null,
              chatError ? h('div', { className: 'mf-alert' }, chatError) : null
            )
              : h('div', { className: 'mf-chat-body', ref: chatBodyRef },
              chatHint ? h('div', { className: 'mf-chat-empty' }, chatHint) : null,
              !chatSessionId ? h('div', { className: 'mf-chat-empty' }, dshClientSessions ? '还没有绑定 DSH 会话，点右上「＋」新建写作会话（mofei-writer）。' : 'DSH 会话服务不可用。') : null,
              normalizeChatItems(chatSnap).length ? normalizeChatItems(chatSnap).map((item) => item.kind === 'user'
                ? h('div', { key: item.key, className: 'mf-chat-msg user' }, item.text, parseMentionIds(item.text).chapterId ? h('button', { type: 'button', className: 'mf-chat-jump', title: '跳转到提及章节', onClick: () => jumpToChapter(parseMentionIds(item.text)) }, '📄 跳转章节') : null)
                : item.kind === 'assistant'
                  ? h('div', { key: item.key, className: 'mf-chat-msg assistant' }, item.streaming ? h('span', { className: 'mf-chat-src' }, '写作 Agent 正在输入…') : null, item.text || '', item.streaming ? '▌' : '', item.tools && item.tools.length ? item.tools.map((tool, toolIndex) => h('div', { key: toolIndex, className: 'mf-chat-tool' }, '⚙ ' + tool.name)) : null, !item.streaming && item.text && item.text.trim() ? h('button', { type: 'button', className: 'mf-chat-jump', title: '把回复插入正文（光标处）', onClick: () => insertChatIntoEditor(item.text) }, '↓ 插入正文') : null)
                  : item.kind === 'tool'
                    ? h('div', { key: item.key, className: 'mf-chat-tool' }, (item.running ? '⏳ ' : item.ok === false ? '✖ ' : '✔ ') + (item.name || '工具') + (item.text ? '：' + item.text : ''))
                    : h('div', { key: item.key, className: 'mf-chat-tool' }, item.text))
                : h('div', { className: 'mf-chat-empty' }, '和写作 Agent 对话吧：续写 / 审稿 / 查设定。'),
              chatSnap && chatSnap.pending && chatSnap.pending.length ? h('div', { className: 'mf-pends' }, chatSnap.pending.map((pending) => h(PendingCard, { key: pending.key, item: pending }))) : null,
              chatError ? h('div', { className: 'mf-alert' }, chatError) : null
            ),
            h('div', { className: 'mf-chat-input' },
              h('textarea', { value: chatInput, placeholder: '输入写作指令：续写 / 审稿 / 查设定…（Enter 发送）', disabled: !chatSessionId, onChange: (event) => setChatInput(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat() } } }),
              h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: !chatSessionId || !chatInput.trim() || chatBusy, onClick: sendChat }, chatBusy ? '发送中' : '发送'))
          ) : null)
        )
      ), importOpen ? h('div', { className: 'mf-import', onMouseDown: (event) => { event.stopPropagation(); if (event.target === event.currentTarget) setImportOpen(false) } }, h('div', { className: 'mf-import-card' },
        h('h3', null, 'TXT 整书导入'),
        h('small', null, '支持「第X卷」「第X章/回」标题识别；自动检测 UTF-8 / UTF-16 BOM / GBK / GB18030 / Big5。'),
        h('input', { type: 'file', accept: '.txt,text/plain', onChange: (event) => readImportFile(event.target.files && event.target.files[0]) }),
        importEncoding ? h('small', null, '检测编码：' + importEncoding) : null,
        h('input', { className: 'mf-input', value: importName, placeholder: '项目名称（留空用默认）', onChange: (event) => setImportName(event.target.value) }),
        importBusy ? h('div', { className: 'mf-empty' }, '正在解析…') : importError ? h('div', { className: 'mf-alert' }, importError) : importPreview ? h('div', null,
          h('small', null, '卷 ' + String(importPreview.volumeCount) + ' · 章 ' + String(importPreview.chapterCount) + ' · ' + String(importPreview.chars) + ' 字'),
          importPreview.volumes.map((v) => h('div', { key: v.title || '未分卷', className: 'mf-imp-vol' }, (v.title || '未分卷') + ' · ' + String(v.chapterCount) + ' 章 · ' + String(v.chars) + ' 字'))
        ) : h('div', { className: 'mf-empty' }, '选择 .txt 文件开始。'),
        h('div', { className: 'mf-import-actions' },
          h('button', { className: 'mf-btn', type: 'button', onClick: () => { setImportOpen(false); setImportPreview(null); setImportContent(''); setImportName(''); setImportEncoding('') } }, '取消'),
          h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: !importPreview || importBusy, onClick: confirmImport }, '确认导入'))
      )) : null,
      worldImportOpen ? h('div', { className: 'mf-import', onMouseDown: (event) => { event.stopPropagation(); if (event.target === event.currentTarget) setWorldImportOpen(false) } }, h('div', { className: 'mf-import-card' },
        h('h3', null, '导入 SillyTavern 世界书'),
        h('small', null, '支持 ST Lorebook JSON：entries.keys / secondary_keys / constant / selective / disable / order / comment。'),
        h('select', { className: 'mf-sel', value: worldImportMode, onChange: (event) => setWorldImportMode(event.target.value) }, h('option', { value: 'append' }, '追加模式'), h('option', { value: 'overwrite' }, '覆盖模式（清空现有条目）')),
        h('input', { type: 'file', accept: '.json,application/json', disabled: !project || worldImportBusy, onChange: (event) => readWorldImportFile(event.target.files && event.target.files[0]) }),
        worldImportBusy ? h('div', { className: 'mf-empty' }, '正在导入…') : worldImportError ? h('div', { className: 'mf-alert' }, worldImportError) : worldImportResult ? h('div', { className: 'mf-empty' }, worldImportResult) : h('div', { className: 'mf-empty' }, project ? '选择 .json 世界书文件开始。' : '请先选择项目。'),
        h('div', { className: 'mf-import-actions' },
          h('button', { className: 'mf-btn', type: 'button', onClick: () => { setWorldImportOpen(false); setWorldImportError(''); setWorldImportResult(''); setWorldImportMode('append') } }, '关闭'),
          h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: () => setWorldImportOpen(false) }, '完成'))
      )) : null,
      summaryOpen ? h(SummaryPanel, { open: true, onClose: () => setSummaryOpen(false), projectTitle: project ? project.title : '', chapterRows: summaryRows, ranges: summaryRanges, loading: summaryLoading, error: summaryError, busy: summaryBusy, progress: summaryProgress, result: summaryResult, onRegenerateChapter: (row) => runSummary('chapters', { chapterIds: [row.chapterId], force: true }, 'chapter', row.chapterId), onRegenerateRange: (range) => runSummary('ranges', { rangeIds: [range.id], force: true }, 'range', range.id), onGenerateChapters: () => runSummary('chapters', {}, 'chapters', null), onGenerateRanges: () => runSummary('ranges', {}, 'ranges', null), onRefresh: refreshSummaryPanel }) : null,
      skillsOpen ? h(WritingSkillsPanel, { open: true, onClose: () => setSkillsOpen(false), onOpenChains: projectId ? () => { setSkillsOpen(false); openPromptChains() } : null, skills: writingSkills, settings: skillSettings, loading: skillsLoading, error: skillsError, onToggle: toggleSkill, onCreateSkill: createCustomSkill, onDeleteCustom: deleteCustomSkill, onRefresh: refreshSkillSettings }) : null,
      chainsOpen ? h(PromptChainsPanel, { open: true, onClose: () => setChainsOpen(false), chains, activeChainId: chainActiveId, onSelect: setChainActiveId, busy: chainBusy, error: chainError, result: chainResult, lastPrompt: chainLastPrompt, onSave: handleSaveChain, onDelete: handleDeleteChain, onRun: handleRunChain, onHistory: (chain) => { if (chain && chain.id) openGitHistory(chain.id) } }) : null,
      dashOpen ? h(WritingDashboard, { open: true, onClose: () => setDashOpen(false), days: stats && stats.calendar ? stats.calendar : {} }) : null,
      gitHistOpen ? h('div', { className: 'mf-import', onMouseDown: (event) => { event.stopPropagation(); if (event.target === event.currentTarget) setGitHistOpen(false) } }, h('div', { className: 'mf-import-card' },
        h('h3', null, 'Git 历史 / 对比' + (gitHistData && gitHistData.chainId ? ' · 链 ' + gitHistData.chainId : '')),
        gitHistLoading ? h('div', { className: 'mf-empty' }, '正在读取 git 历史…')
          : !gitHistData ? null
            : !gitHistData.available ? h('div', { className: 'mf-empty' }, (gitHistData.reason || 'git 不可用') + '（墨扉自动在每次写入后提交 .mofei）')
              : h('div', { className: 'mf-git' },
                  h('div', { className: 'mf-hist-head' },
                    h('span', null, '提交 ' + String((gitHistData.commits || []).length) + ' 条' + (gitHistData.patch ? ' · 含 diff' : '')),
                    h('span', { className: 'mf-eh-actions' },
                      h('label', { className: 'mf-world-selall' }, h('input', { type: 'checkbox', checked: gitHistDiff, onChange: () => toggleGitHistDiff() }), ' 含 diff'),
                      h('button', { className: 'mf-btn', type: 'button', onClick: () => openGitHistory(gitHistChain) }, '刷新'))),
                  (gitHistData.commits || []).length ? gitHistData.commits.map((c) => h('div', { key: c.hash, className: 'mf-git-item' }, h('code', null, String(c.hash).slice(0, 8)), h('span', null, c.subject || ''), h('small', null, fmtTime(c.at)), h(MiniButton, { label: armed && armed.kind === 'git-revert' && armed.id === 'git-revert:' + c.hash ? '确认回滚' : '回滚', danger: true, armed: armed && armed.kind === 'git-revert' && armed.id === 'git-revert:' + c.hash, title: '把项目文件树回滚到此提交（谨慎）', onClick: () => revertProjectTo(c.hash) }))) : h('div', { className: 'mf-empty' }, '暂无提交。'),
                  gitHistData.patch ? renderGitPatch(gitHistData.patch) : null),
        h('div', { className: 'mf-import-actions' }, h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: () => setGitHistOpen(false) }, '关闭'))
      )) : null,
      jobListOpen ? h('div', { className: 'mf-import', onMouseDown: (event) => { event.stopPropagation(); if (event.target === event.currentTarget) setJobListOpen(false) } }, h('div', { className: 'mf-import-card' },
        h('h3', null, '后台任务（DSH Jobs）'),
        mofeiJobs.length ? h('div', { className: 'mf-git' }, mofeiJobs.map((job) => h('div', { key: job.id, className: 'mf-git-item' },
          h('code', null, job.id),
          h('span', null, job.label + (job.current ? ' · 正在处理《' + job.current + '》' : '')),
          h('small', null, job.status + (job.total ? ' · ' + job.done + '/' + job.total : '') + (job.error ? ' · ' + job.error : '')),
          job.status === 'running' || job.status === 'stopping' ? h(MiniButton, { label: '取消', danger: true, title: '取消该任务', onClick: () => killMofeiJob(job.id) }) : null)))
        : h('div', { className: 'mf-empty' }, '暂无任务；「批量摘要」等长任务会出现在这里，可取消。'),
        h('div', { className: 'mf-import-actions' }, h('button', { className: 'mf-btn mf-primary', type: 'button', onClick: () => setJobListOpen(false) }, '关闭'))
      )) : null,
      paletteOpen ? h('div', { className: 'mf-palette', onMouseDown: (event) => event.stopPropagation() },
        h('input', { value: paletteQuery, placeholder: '墨扉命令…（新建项目/摘要/链/写作记录/退出）', autoFocus: true, onChange: (event) => setPaletteQuery(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter' && filteredCommands[0]) filteredCommands[0].run(); if (event.key === 'Escape') setPaletteOpen(false) } }),
        filteredCommands.length ? filteredCommands.map((item) => h('button', { key: item.id, className: 'mf-palette-item', type: 'button', onClick: () => item.run() }, item.label, h('small', null, item.hint))) : h('div', { className: 'mf-empty' }, '无匹配命令')
      ) : null,
      // v0.18: 初始向导（空白状态引导选择小说文件夹）
      mode === 'web' && onboardOpen ? h('div', { className: 'mf-onboard', role: 'presentation' },
        h('div', { className: 'mf-onboard-card', role: 'dialog', 'aria-label': '开始写作' },
          h('h2', null, '开始你的第一本小说'),
          h('p', null, '小说默认保存在当前 DSH 会话已选择的工作区；你也可以改选专用小说文件夹。章节、角色、世界书、笔记和链都会写入该位置。'),
          h('div', { className: 'mf-onboard-folder' },
            h('input', { value: onboardFolder, placeholder: '当前会话未选择工作区，可选择小说文件夹', readOnly: true, onChange: () => {} }),
            h('button', { className: 'mf-btn', type: 'button', disabled: onboardPicking, onClick: pickOnboardFolder }, onboardPicking ? '选择中…' : '选择文件夹')),
          h('input', { type: 'text', value: onboardTitle, placeholder: '小说名（如：探案未至之境）', onChange: (event) => setOnboardTitle(event.target.value) }),
          onboardError ? h('div', { className: 'mf-onboard-error' }, onboardError) : null,
          h('div', { className: 'mf-onboard-note' }, '提示：也可以直接开始写作，之后仍可在命令面板中管理存放位置。'),
          h('div', { className: 'mf-onboard-actions' },
            h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: onboardBusy, onClick: startOnboardProject }, onboardBusy ? '创建中…' : '开始写作')))) : null
    ]
    // v0.12: 官方 web conversation.view 标签 → 内联渲染；侧栏入口 → overlay
    if (mode === 'web') return h('div', { className: 'mf-view-root' }, mfChildren)
    return h('div', { className: 'mf-overlay', onMouseDown: (event) => { if (event.target === event.currentTarget) close() } }, mfChildren)
    function renderNoteItem(n, catId) {
      return h('div', { key: n.id, className: 'mf-item' + (n.id === selNote ? ' on' : '') }, h('div', { className: 'mf-row' }, h('button', { className: 'mf-title', type: 'button', onClick: () => pickNote(n) }, (n.isLocked ? '🔒 ' : '') + (n.isHidden ? '👁 ' : '') + n.title), h('span', { className: 'mf-minis' }, h(MiniButton, { label: '✎', title: '重命名', onClick: () => startRename('note', n.id, n.title) }), h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-note' && armed.id === n.id, title: armed && armed.kind === 'delete-note' && armed.id === n.id ? '再次点击确认删除' : '删除笔记', onClick: () => deleteNote(n.id) }))))
    }
  }

  function apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    try { dshClientSessions = ctx.get('sessions') || null } catch (error) { dshClientSessions = null }
    try { dshClientConnection = ctx.get('connection') || null } catch (error) { dshClientConnection = null }
    try { dshClientWorkspaces = ctx.get('workspaces') || null } catch (error) { dshClientWorkspaces = null }
    slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'mofei-workspace', order: 20, label: '墨扉' }, SideAction))
    // v0.14 变形金刚形态：原版 DSH web 完整保留（官方侧栏/官方对话/官方 composer 全部回归）；
    // 墨扉 = shell.overlay 气泡（右下角 orb 按钮，点击 → 官方侧栏原生折叠成窄条 +
    // 官方对话/输入框挤到右侧 430px + 墨扉工作台从左侧滑入）。不再替换 conversation.session。
    slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'mofei-draft-workspace', order: 20, label: '墨扉 Workspace' }, () => h(ErrorBoundary, null, h(MofeiBubble, null))))
    let undoMofeiTokens = null
    try {
      const theme = ctx.get('theme')
      if (theme && typeof theme.register === 'function' && typeof theme.overrideTokens === 'function') {
        theme.register({
          id: 'mofei',
          colorScheme: 'dark',
          tokens: MOFEI_INK,
        })
        // 墨韵双色板作为令牌叠加层强制生效（与主题偏好无关，设置层 adopt 不会覆盖）。
        // overrideTokens 要求 { light, dark } 对：浅色 = 宣纸，深色 = 墨。
        undoMofeiTokens = theme.overrideTokens('mofei-dsh', mofeiTokenPairs())
        // 尽力把偏好也指向 mofei（可被设置层 adopt 覆盖，但叠加层已保证观感）
        if (typeof theme.setTheme === 'function') { try { theme.setTheme('mofei') } catch (setError) { /* 主题切换失败不阻塞 */ } }
      }
    } catch (error) { /* 主题注册失败不阻塞 */ }
    return () => {
      if (undoMofeiTokens) { try { undoMofeiTokens() } catch (cleanupError) { /* noop */ } }
      removeStyles()
      timers.forEach((id) => clearTimeout(id))
      timers.clear()
    }
  }
  exports.mountStandalone = function (root) {
    if (!root || typeof document === 'undefined') return undefined
    ensureStyles()
    document.body.classList.add('mf-standalone')
    panel.open = true
    const ReactDOM = require('react-dom')
    const element = h(ErrorBoundary, null, h(Workspace, null))
    if (ReactDOM && typeof ReactDOM.createRoot === 'function') {
      const reactRoot = ReactDOM.createRoot(root)
      reactRoot.render(element)
      return () => { try { reactRoot.unmount() } catch (error) { /* noop */ } }
    }
    if (ReactDOM && typeof ReactDOM.render === 'function') {
      ReactDOM.render(element, root)
      return () => { try { ReactDOM.unmountComponentAtNode(root) } catch (error) { /* noop */ } }
    }
    root.textContent = '墨扉需要 React 运行时，请检查 vendor 脚本是否加载。'
    return undefined
  }
  exports.apply = apply
  exports.inject = []
  return module.exports
}
