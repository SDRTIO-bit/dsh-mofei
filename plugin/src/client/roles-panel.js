// 墨扉（Mofei）子代理提示词面板组件。
// 纯展示组件：数据全部经 props 传入，不发起 fetch/RPC；
// 所有写/删动作通过 onSave / onDelete 回调交由父组件处理。
// 子代理提示词 = entries 列表，每条 { name, content, order, isEnabled }，可开关/排序/增删/编辑。

// ---- React 惰性解析（require 守卫）----------------------------------------
let reactBinding = null
let reactResolved = false

export function resolveReact() {
  if (reactResolved) return reactBinding
  reactResolved = true
  let React = null
  const g = (typeof globalThis !== 'undefined') ? globalThis : null
  if (g && g.React && typeof g.React.createElement === 'function' && typeof g.React.useState === 'function') React = g.React
  if (!React && typeof window !== 'undefined' && window.React && typeof window.React.createElement === 'function') React = window.React
  if (!React) {
    try {
      const req = (typeof require === 'function') ? require : (g && typeof g.__mfRequire === 'function' ? g.__mfRequire : null)
      if (req) React = req('react')
    } catch (error) { /* react 不可用：保持 null */ }
  }
  if (!React && g && g.__mofeiReact && typeof g.__mofeiReact.createElement === 'function') React = g.__mofeiReact
  reactBinding = React
    ? { h: React.createElement, useState: React.useState }
    : null
  return reactBinding
}

// ---- 纯函数 ---------------------------------------------------------------

/** 提示词名称规范化：trim + 截断 40 字符，空回退「未命名提示词」。 */
export function normalizeRoleName(name) {
  const s = String(name == null ? '' : name).trim()
  const chars = Array.from(s)
  const clipped = chars.length > 40 ? chars.slice(0, 40).join('') : s
  return clipped.length > 0 ? clipped : '未命名提示词'
}

/** entry name 规范化：trim + 截断 30 字符，空回退空串。 */
export function normalizeEntryName(name) {
  const s = String(name == null ? '' : name).trim()
  const chars = Array.from(s)
  return chars.length > 30 ? chars.slice(0, 30).join('') : s
}

// ---- 样式 ------------------------------------------------------------------

export const ROLES_PANEL_CSS = [
  '.mf-roles-overlay{position:fixed;inset:0;z-index:132;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}',
  '.mf-roles{display:grid;grid-template-rows:48px minmax(0,1fr);width:min(920px,94vw);height:80vh;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 20px 60px rgba(0,0,0,.28)}',
  '.mf-roles-head{display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
  '.mf-roles-title{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary);flex:1;min-width:0}',
  '.mf-roles-body{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:0;flex:1;overflow:hidden}',
  '.mf-roles-list{display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--dsw-alias-border-l1);overflow-y:auto}',
  '.mf-roles-list-empty{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
  '.mf-roles-item{display:flex;align-items:center;gap:8px;min-width:0;padding:9px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;border-left:0;border-right:0;border-top:0;cursor:pointer;text-align:left}',
  '.mf-roles-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-roles-item.on{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-roles-item-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
  '.mf-roles-item-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mf-roles-item-meta{font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mf-roles-source{display:inline-flex;align-items:center;min-height:18px;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;color:var(--dsw-alias-label-secondary);font-size:10px;white-space:nowrap}',
  '.mf-roles-source.custom{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);color:var(--dsw-alias-state-business-primary)}',
  '.mf-roles-del{flex-shrink:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);padding:2px 6px;font-size:11px;cursor:pointer;line-height:1}',
  '.mf-roles-del:hover{background:rgba(220,38,38,.14);color:#dc2626}',
  '.mf-roles-editor{display:flex;flex-direction:column;min-width:0;min-height:0;padding:12px;overflow-x:hidden;overflow-y:auto}',
  '.mf-roles-ed-name{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
  '.mf-roles-ed-name label{font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}',
  '.mf-roles-name{flex:1;min-width:0}',
  // Keep the entries at their intrinsic height so the editor owns the scroll.
  // A shrinking flex child lets long textareas paint over the instruction block below.
  '.mf-roles-entries{display:flex;flex-direction:column;gap:10px;flex:0 0 auto;min-height:auto;overflow:visible}',
  '.mf-roles-entry{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}',
  '.mf-roles-entry-head{display:flex;align-items:center;gap:8px}',
  '.mf-roles-entry-toggle{flex-shrink:0;width:36px;height:18px;border-radius:9px;border:0;background:var(--dsw-alias-interactive-bg-hover);cursor:pointer;position:relative;transition:background .15s ease}',
  '.mf-roles-entry-toggle.on{background:var(--dsw-alias-state-business-primary)}',
  '.mf-roles-entry-toggle::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s ease}',
  '.mf-roles-entry-toggle.on::after{left:20px}',
  '.mf-roles-entry-name{flex:1;min-width:0;font-size:11px}',
  '.mf-roles-entry-order{width:50px;font-size:11px}',
  '.mf-roles-entry-del{flex-shrink:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);padding:2px 6px;font-size:11px;cursor:pointer;line-height:1}',
  '.mf-roles-entry-del:hover{background:rgba(220,38,38,.14);color:#dc2626}',
  '.mf-roles-entry-content{width:100%;box-sizing:border-box;resize:vertical;min-height:80px;font-family:Consolas,Menlo,Monaco,Courier New,monospace;font-size:12px;line-height:1.6;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-elevated,transparent);color:var(--dsw-alias-label-primary)}',
  '.mf-roles-entry.disabled .mf-roles-entry-content{opacity:.5}',
  '.mf-roles-add-entry{border:1px dashed var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);padding:8px;cursor:pointer;font-size:12px;text-align:center}',
  '.mf-roles-add-entry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.mf-roles-actions{display:flex;align-items:center;gap:8px;margin-top:10px}',
  '.mf-roles-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:transparent;color:inherit;padding:5px 10px;cursor:pointer;font-size:12px;line-height:1;transition:background .12s ease,opacity .12s ease}',
  '.mf-roles-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-roles-btn:disabled{opacity:.45;cursor:default}',
  '.mf-roles-btn.primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}',
  '.mf-roles-btn.primary:hover{opacity:.9}',
  '.mf-roles-error{margin-top:8px;padding:8px 10px;border:1px solid rgba(220,38,38,.45);border-radius:6px;color:#dc2626;font-size:12px;background:rgba(220,38,38,.08);word-break:break-all}',
  '.mf-roles-instructions{display:flex;flex-direction:column;gap:6px;margin:12px 0 4px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}.mf-roles-section-title{font-size:11px;font-weight:650;color:var(--dsw-alias-label-primary)}.mf-roles-instruction{display:flex;align-items:flex-start;gap:7px;padding:5px 6px;border-radius:5px;background:transparent;cursor:pointer}.mf-roles-instruction:hover,.mf-roles-instruction.on{background:var(--dsw-alias-interactive-bg-hover)}.mf-roles-instruction input{margin-top:2px;accent-color:var(--dsw-alias-state-business-primary)}.mf-roles-instruction-main{display:flex;flex-direction:column;gap:2px;min-width:0}.mf-roles-instruction-main strong{font-size:11px}.mf-roles-instruction-main small{font-size:10px;color:var(--dsw-alias-label-secondary);line-height:1.35}.mf-roles-hint{margin:6px 0 0;font-size:10px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
].join('\n')

/** 去重注入样式表。 */
export function ensureRolesPanelStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-mf-roles]')) return
  const style = document.createElement('style')
  style.setAttribute('data-mf-roles', '')
  style.textContent = ROLES_PANEL_CSS
  document.head.appendChild(style)
}

// ---- 组件 ------------------------------------------------------------------

/** 更新日期格式化。 */
function fmtUpdatedAt(role) {
  const t = role && role.updatedAt
  if (t == null || t === '' || !Number.isFinite(Number(t)) || Number(t) <= 0) return ''
  const d = new Date(Number(t))
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => (n < 10 ? '0' + n : String(n))
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/**
 * RolesPanel —— 子代理提示词面板：提示词列表 + 编辑器（entries 多段可开关/排序/增删）。
 *
 * props = {
 *   open, onClose(),
 *   roles: [{ id, name, entryCount, enabledCount, updatedAt }],
 *   activeRoleId, onSelect(id),
 *   detail: { id, name, entries: [{ name, content, order, isEnabled }], updatedAt } | null,
 *   busy, error,
 *   onSave({ roleId?, name, entries }),
 *   onDelete(role),
 *   onAddEntry(),
 * }
 */
export function RolesPanel(props) {
  ensureRolesPanelStyles()
  const resolved = resolveReact()
  if (!resolved) throw new Error('墨扉 RolesPanel 无法解析 React：请在宿主注入全局 React 或确保 require("react") 可用')
  const h = resolved.h

  const open = !!(props && props.open)
  const onClose = (props && props.onClose) || null
  const roles = (props && Array.isArray(props.roles)) ? props.roles : []
  const activeRoleId = props && props.activeRoleId != null ? props.activeRoleId : null
  const onSelect = (props && props.onSelect) || null
  const detail = (props && props.detail) || null
  const busy = !!(props && props.busy)
  const error = (props && props.error) ? String(props.error) : ''
  const onSave = (props && props.onSave) || null
  const onDelete = (props && props.onDelete) || null
  const onAddEntry = (props && props.onAddEntry) || null
  const onUpdateEntry = (props && props.onUpdateEntry) || null
  const onDeleteEntry = (props && props.onDeleteEntry) || null
  const onUpdateName = (props && props.onUpdateName) || null
  const instructions = (props && Array.isArray(props.instructions)) ? props.instructions : []
  const onToggleInstruction = (props && props.onToggleInstruction) || null

  if (!open) return null

  const active = roles.find((r) => r && r.id === activeRoleId)
    || (roles.length ? roles[0] : null)

  const entries = (detail && Array.isArray(detail.entries)) ? detail.entries : []
  const detailName = detail && detail.name != null ? String(detail.name) : ''

  function pick(role) {
    if (onSelect) onSelect(role && role.id)
  }

  function fireSave() {
    if (!onSave) return
    onSave({
      roleId: active ? active.id : undefined,
      name: detailName,
      entries,
      defaultInstructions: bindings,
    })
  }

  const listBody = roles.length
    ? roles.map((role, index) => {
        const id = role && role.id != null ? role.id : null
        const key = id != null ? id : index
        const name = normalizeRoleName(role && role.name)
        const date = fmtUpdatedAt(role)
        const isActive = active && id != null && active.id === id
        const entryCount = (role && role.entryCount) || 0
        const enabledCount = (role && role.enabledCount) || 0
        const sourceLabel = role && role.isBuiltin
          ? (role.isOverridden ? '项目定制' : '内置默认')
          : '项目自建'
        const canRemove = !!(role && (role.canReset || !role.isBuiltin))
        return h('div', { className: 'mf-roles-item' + (isActive ? ' on' : ''), key, onClick: () => pick(role) },
          h('div', { className: 'mf-roles-item-main' },
            h('div', { className: 'mf-roles-item-name' }, name),
            h('div', { className: 'mf-roles-item-meta' }, sourceLabel + ' · ' + String(enabledCount) + '/' + String(entryCount) + ' 条' + (date ? ' · ' + date : ''))),
          canRemove ? h('button', {
            className: 'mf-roles-del',
            type: 'button',
            title: role && role.canReset ? '清除项目定制并恢复内置默认' : '删除该提示词',
            onClick: (event) => {
              if (event && event.stopPropagation) event.stopPropagation()
              if (onDelete) onDelete(role)
            },
          }, role && role.canReset ? '恢复' : '删除') : null)
      })
    : h('div', { className: 'mf-roles-list-empty' }, '暂无子代理提示词')

  const entriesBody = entries.length
    ? entries.map((entry, index) => {
        const isEnabled = entry && entry.isEnabled !== false
        return h('div', { className: 'mf-roles-entry' + (isEnabled ? '' : ' disabled'), key: index },
          h('div', { className: 'mf-roles-entry-head' },
            h('button', {
              className: 'mf-roles-entry-toggle' + (isEnabled ? ' on' : ''),
              type: 'button',
              title: isEnabled ? '已启用（点击禁用）' : '已禁用（点击启用）',
              onClick: () => { if (onUpdateEntry) onUpdateEntry(index, { isEnabled: !isEnabled }) },
            }),
            h('input', {
              className: 'mf-roles-entry-name',
              type: 'text',
              value: normalizeEntryName(entry && entry.name),
              placeholder: '条目名称',
              onChange: (event) => { if (onUpdateEntry) onUpdateEntry(index, { name: event && event.target ? event.target.value : '' }) },
            }),
            h('input', {
              className: 'mf-roles-entry-order',
              type: 'number',
              value: String((entry && entry.order) || 0),
              title: '排序',
              onChange: (event) => { if (onUpdateEntry) onUpdateEntry(index, { order: Number(event && event.target ? event.target.value : 0) }) },
            }),
            h('button', {
              className: 'mf-roles-entry-del',
              type: 'button',
              title: '删除该条目',
              onClick: () => { if (onDeleteEntry) onDeleteEntry(index) },
            }, '×')),
          h('textarea', {
            className: 'mf-roles-entry-content',
            value: (entry && entry.content) || '',
            placeholder: '输入该条目的人格/指令内容…',
            onChange: (event) => { if (onUpdateEntry) onUpdateEntry(index, { content: event && event.target ? event.target.value : '' }) },
          }))
      })
    : h('div', { className: 'mf-roles-list-empty' }, '暂无条目，点击下方添加')

  const bindings = (detail && Array.isArray(detail.defaultInstructions)) ? detail.defaultInstructions : []
  const instructionBlock = h('div', { className: 'mf-roles-instructions' },
    h('div', { className: 'mf-roles-section-title' }, '默认注入的写作指令'),
    instructions.length ? instructions.map((item) => {
      const bindingIndex = bindings.findIndex((binding) => binding.instructionId === item.id)
      const enabled = bindingIndex >= 0 && bindings[bindingIndex].isEnabled !== false
      return h('label', { className: 'mf-roles-instruction' + (enabled ? ' on' : ''), key: item.id },
        h('input', { type: 'checkbox', checked: enabled, onChange: () => {
          if (!onToggleInstruction) return
          if (bindingIndex >= 0) onToggleInstruction(bindingIndex, { isEnabled: !enabled })
          else onToggleInstruction(bindings.length, { instructionId: item.id, order: (bindings.length + 1) * 10, isEnabled: true })
        } }),
        h('span', { className: 'mf-roles-instruction-main' }, h('strong', null, item.name || item.id), h('small', null, item.description || '私有写作指令'))
      )
    }) : h('div', { className: 'mf-roles-list-empty' }, '暂无私有写作指令'),
    h('div', { className: 'mf-roles-hint' }, '勾选项会在创建该子代理时强制注入；中控只能为单次任务追加，不能移除这里的默认指令。'))

  const sourceLabel = active && active.isBuiltin
    ? (active.isOverridden ? '项目定制' : '内置默认')
    : '项目自建'

  const editor = h('div', { className: 'mf-roles-editor' },
    h('div', { className: 'mf-roles-ed-name' },
      h('label', null, '提示词名'),
      h('input', {
        className: 'mf-roles-name',
        type: 'text',
        value: detailName,
        disabled: !!(active && active.isBuiltin),
        placeholder: '未命名提示词',
        onChange: (event) => { if (onUpdateName) onUpdateName(event && event.target ? event.target.value : '') },
      }),
      active ? h('span', { className: 'mf-roles-source' + (active.isOverridden || !active.isBuiltin ? ' custom' : '') }, sourceLabel + (active.effort ? ' · ' + active.effort : '')) : null),
    h('div', { className: 'mf-roles-entries' },
      entriesBody,
      h('button', {
        className: 'mf-roles-add-entry',
        type: 'button',
        onClick: () => { if (onAddEntry) onAddEntry() },
      }, '＋ 添加条目')),
    h('div', { className: 'mf-roles-hint' }, '每个提示词由多条 entries 组成，使用时按 order 排序拼接启用的条目注入子代理。开关 isEnabled 可临时禁用某条而不删除。'),
    instructionBlock,
    h('div', { className: 'mf-roles-actions' },
      h('button', { className: 'mf-roles-btn primary', type: 'button', disabled: busy || !detail, onClick: fireSave }, active && active.isBuiltin && !active.isOverridden ? '保存为项目定制' : (active ? '保存' : '新建')),
      active && active.canReset ? h('button', { className: 'mf-roles-btn', type: 'button', disabled: busy, onClick: () => { if (onDelete) onDelete(active) } }, '恢复内置默认') : null,
      h('button', { className: 'mf-roles-btn', type: 'button', onClick: () => { if (onClose) onClose() } }, '关闭')),
    error ? h('div', { className: 'mf-roles-error' }, error) : null,
  )

  const body = h('div', { className: 'mf-roles-body' },
    h('div', { className: 'mf-roles-list' }, listBody),
    editor)

  return h('div', { className: 'mf-roles-overlay', onClick: () => { if (onClose) onClose() } },
    h('div', { className: 'mf-roles', onClick: (event) => { if (event && event.stopPropagation) event.stopPropagation() } },
      h('div', { className: 'mf-roles-head' },
        h('span', { className: 'mf-roles-title' }, '子代理提示词'),
        h('button', { className: 'mf-roles-btn', type: 'button', onClick: () => { if (onClose) onClose() } }, '关闭')),
      body))
}
