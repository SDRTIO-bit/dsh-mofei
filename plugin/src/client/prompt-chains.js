// 墨扉（Mofei）prompt chains 面板组件 —— 工作包 C。
// 纯展示组件：数据（chains / activeChainId / busy / error / result / lastPrompt）全部经由 props 传入，
// 不发起 fetch/RPC；所有写/运行动作通过 onSave / onDelete / onRun / onSelect 回调交由父组件处理。
//
// 关于 React：本文件保持 ESM，但不在顶层静态 import 'react'。
// 原因同 v0.6 组件：esbuild 以 external=['react'] 打包，顶层静态 import 会生成 require('react')；
// 纯 node 测试环境没有 react，顶层静态 import 会让 `node prompt-chains.test.mjs` 直接崩掉。
// 因此这里采用惰性解析（require 守卫）+ 全局兜底：纯函数导出
// （normalizeChainName / chainTemplateVars）完全不依赖 React；只有真正渲染组件时才需要 React，
// 届时若仍不可用则显式抛出可读错误。

// ---- React 惰性解析（require 守卫）----------------------------------------
let reactBinding = null // { h, useState, useRef } | null（缓存解析结果）
let reactResolved = false

export function resolveReact() {
  if (reactResolved) return reactBinding
  reactResolved = true
  let React = null
  const g = (typeof globalThis !== 'undefined') ? globalThis : null
  // 兜底 1：宿主把 React 挂在全局上
  if (g && g.React && typeof g.React.createElement === 'function' && typeof g.React.useState === 'function') React = g.React
  if (!React && typeof window !== 'undefined' && window.React && typeof window.React.createElement === 'function') React = window.React
  // 兜底 2：DSH ModuleLoader 注入的 require（构建产物为 CJS 时可用；ESM 纯 node 下 typeof require === 'undefined'，不会抛错）
  if (!React) {
    try {
      const req = (typeof require === 'function') ? require : (g && typeof g.__mfRequire === 'function' ? g.__mfRequire : null)
      if (req) React = req('react')
    } catch (error) { /* react 不可用：保持 null */ }
  }
  // 兜底 3：主代理自定义注入点
  if (!React && g && g.__mofeiReact && typeof g.__mofeiReact.createElement === 'function') React = g.__mofeiReact
  reactBinding = React
    ? { h: React.createElement, useState: React.useState }
    : null
  return reactBinding
}

// ---- 纯函数 -------------------------------------------------------------

/** 受支持的 8 个模板宏（与 Host compile-prompt-chain 一致）。 */
const SUPPORTED_MACROS = ['project', 'chapter', 'chapterText', 'selected', 'characters', 'world', 'notes', 'instruction']

/**
 * 链名称规范化：String / trim / 按 Unicode 码点（Array.from）截断到 40；空结果回退「未命名链」。
 * 非字符串输入安全（String 兜底）；null/undefined 得回退名；截断不拆散代理对。
 */
export function normalizeChainName(name) {
  const s = String(name == null ? '' : name).trim()
  const chars = Array.from(s)
  const clipped = chars.length > 40 ? chars.slice(0, 40).join('') : s
  return clipped.length > 0 ? clipped : '未命名链'
}

/**
 * 提取 template 中 {{...}} 里受支持的 8 个宏（未知宏忽略），返回按首次出现顺序的去重数组。
 * template 非字符串按 '' 处理；无匹配返回 []。
 */
export function chainTemplateVars(template) {
  if (typeof template !== 'string') return []
  const out = []
  const re = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g
  let m = null
  while ((m = re.exec(template)) !== null) {
    const name = m[1]
    if (SUPPORTED_MACROS.indexOf(name) !== -1 && out.indexOf(name) === -1) out.push(name)
  }
  return out
}

// ---- 样式 -------------------------------------------------------------------

export const PROMPT_CHAINS_CSS = [
  '.mf-ch-overlay{position:fixed;inset:0;z-index:132;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}',
  '.mf-ch{display:grid;grid-template-rows:48px minmax(0,1fr) auto;width:min(860px,92vw);height:76vh;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 20px 60px rgba(0,0,0,.28)}',
  '.mf-ch-head{display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
  '.mf-ch-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);flex:1;min-width:0}',
  '.mf-ch-body{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:0;flex:1;overflow:hidden}',
  '.mf-ch-list{display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--dsw-alias-border-l1);overflow-y:auto}',
  '.mf-ch-list-empty{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
  '.mf-ch-item{display:flex;align-items:center;gap:8px;min-width:0;padding:9px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;border-left:0;border-right:0;border-top:0;cursor:pointer;text-align:left}',
  '.mf-ch-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-ch-item.on{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-ch-item-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
  '.mf-ch-item-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mf-ch-item-date{font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mf-ch-del{flex-shrink:0;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);padding:2px 6px;font-size:11px;cursor:pointer;line-height:1}',
  '.mf-ch-del:hover{background:rgba(220,38,38,.14);color:#dc2626}',
  '.mf-ch-editor{display:flex;flex-direction:column;min-width:0;min-height:0;padding:12px}',
  '.mf-ch-ed-name{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
  '.mf-ch-ed-name label{font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}',
  '.mf-ch-name{flex:1;min-width:0}',
  '.mf-ch-content{flex:1;min-height:0;width:100%;box-sizing:border-box;resize:none;font-family:Consolas,Menlo,Monaco,Courier New,monospace;font-size:12px;line-height:1.6;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-elevated,transparent);color:var(--dsw-alias-label-primary)}',
  '.mf-ch-hint{margin:6px 0 0;font-size:10px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
  '.mf-ch-actions{display:flex;align-items:center;gap:8px;margin-top:10px}',
  '.mf-ch-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:transparent;color:inherit;padding:5px 10px;cursor:pointer;font-size:12px;line-height:1;transition:background .12s ease,opacity .12s ease}',
  '.mf-ch-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-ch-btn:disabled{opacity:.45;cursor:default}',
  '.mf-ch-btn.primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}',
  '.mf-ch-btn.primary:hover{opacity:.9}',
  '.mf-ch-foot{border-top:1px solid var(--dsw-alias-border-l1);padding:8px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}',
  '.mf-ch-busy{font-size:12px;color:var(--dsw-alias-label-secondary)}',
  '.mf-ch-error{padding:8px 10px;border:1px solid rgba(220,38,38,.45);border-radius:10px;color:#dc2626;font-size:12px;background:rgba(220,38,38,.08);word-break:break-all}',
  '.mf-ch-result{white-space:pre-wrap;word-break:break-all;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-elevated,transparent);color:var(--dsw-alias-label-primary);padding:10px 12px;font-size:12px;max-height:220px;overflow:auto}',
  '.mf-ch-prompt-toggle{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:0;font-size:11px;cursor:pointer;text-align:left}',
  '.mf-ch-prompt-toggle:hover{color:var(--dsw-alias-label-primary)}',
  '.mf-ch-prompt{margin-top:4px;padding:8px 10px;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-elevated,transparent);white-space:pre-wrap;word-break:break-all;font-size:11px;color:var(--dsw-alias-label-secondary);max-height:160px;overflow:auto}',
].join('\n')

/** 去重注入样式表（依据 data-mf-chains 属性）。 */
export function ensurePromptChainsStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-mf-chains]')) return
  const style = document.createElement('style')
  style.setAttribute('data-mf-chains', '')
  style.textContent = PROMPT_CHAINS_CSS
  document.head.appendChild(style)
}

// ---- 组件 -------------------------------------------------------------------

/** 更新日期格式化：非法/缺省回退空串。 */
function fmtUpdatedAt(chain) {
  const t = chain && chain.updatedAt
  if (t == null || t === '' || !Number.isFinite(Number(t)) || Number(t) <= 0) return ''
  const d = new Date(Number(t))
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => (n < 10 ? '0' + n : String(n))
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/**
 * PromptChainsPanel —— prompt chains 面板：链列表 + 编辑器 + 运行结果区的纯展示组件。
 *
 * props = {
 *   open, onClose(),
 *   chains: [{ id, name, content, updatedAt }],
 *   activeChainId, onSelect(id),
 *   busy, error, result, lastPrompt,
 *   onSave({ chainId?, name, content }), onDelete(chain), onRun(chain),
 * }
 * 不发起任何 fetch/RPC；「删除由父组件两击确认后传入」——组件内只调 onDelete(chain)。
 */
export function PromptChainsPanel(props) {
  ensurePromptChainsStyles()
  const resolved = resolveReact()
  if (!resolved) throw new Error('墨扉 PromptChainsPanel 无法解析 React：请在宿主注入全局 React 或确保 require("react") 可用')
  const h = resolved.h
  const useSt = resolved.useState

  const open = !!(props && props.open)
  const onClose = (props && props.onClose) || null
  const chains = (props && Array.isArray(props.chains)) ? props.chains : []
  const activeChainId = props && props.activeChainId != null ? props.activeChainId : null
  const onSelect = (props && props.onSelect) || null
  const busy = !!(props && props.busy)
  const error = (props && props.error) ? String(props.error) : ''
  const result = (props && props.result != null) ? String(props.result) : ''
  const lastPrompt = (props && props.lastPrompt != null) ? String(props.lastPrompt) : ''
  const onSave = (props && props.onSave) || null
  const onDelete = (props && props.onDelete) || null
  const onRun = (props && props.onRun) || null
  const onHistory = (props && props.onHistory) || null

  const [draft, setDraft] = useSt({ name: '', content: '' })
  const [showPrompt, setShowPrompt] = useSt(false)

  if (!open) return null

  // 当前激活链（fallback：activeChainId 匹配不到时取第一条）。
  const active = chains.find((c) => c && c.id === activeChainId)
    || (chains.length ? chains[0] : null)

  function pick(chain) {
    if (onSelect) onSelect(chain && chain.id)
    setDraft({
      name: chain && chain.name != null ? String(chain.name) : '',
      content: chain && chain.content != null ? String(chain.content) : '',
    })
  }

  function fireSave() {
    if (!onSave) return
    onSave({
      chainId: active ? active.id : undefined,
      name: draft.name,
      content: draft.content,
    })
  }

  function fireRun() {
    if (!onRun) return
    if (active) {
      onRun(Object.assign({}, active, { name: draft.name, content: draft.content }))
    } else {
      // 无链时运行当前草稿（父组件可据此新建并运行）
      onRun({ id: null, name: draft.name, content: draft.content })
    }
  }

  const listBody = chains.length
    ? chains.map((chain, index) => {
        const id = chain && chain.id != null ? chain.id : null
        const key = id != null ? id : index
        const name = normalizeChainName(chain && chain.name)
        const date = fmtUpdatedAt(chain)
        const isActive = active && id != null && active.id === id
        return h('div', { className: 'mf-ch-item' + (isActive ? ' on' : ''), key, onClick: () => pick(chain) },
          h('div', { className: 'mf-ch-item-main' },
            h('div', { className: 'mf-ch-item-name' }, name),
            h('div', { className: 'mf-ch-item-date' }, date || '（无日期）')),
          h('button', {
            className: 'mf-ch-del',
            type: 'button',
            title: '删除该链',
            onClick: (event) => {
              if (event && event.stopPropagation) event.stopPropagation()
              if (onDelete) onDelete(chain)
            },
          }, '删除'))
      })
    : h('div', { className: 'mf-ch-list-empty' }, '暂无链')

  const hint = '支持宏：' + (['{{project}}', '{{chapter}}', '{{chapterText}}', '{{selected}}', '{{characters}}', '{{world}}', '{{notes}}', '{{instruction}}'].join('　'))

  const editor = h('div', { className: 'mf-ch-editor' },
    h('div', { className: 'mf-ch-ed-name' },
      h('label', null, '名称'),
      h('input', {
        className: 'mf-ch-name',
        type: 'text',
        value: draft.name,
        placeholder: '未命名链',
        onChange: (event) => setDraft(Object.assign({}, draft, { name: event && event.target ? event.target.value : '' })),
      })),
    h('textarea', {
      className: 'mf-ch-content',
      value: draft.content,
      placeholder: '输入模板内容，支持 {{project}} 等宏…',
      onChange: (event) => setDraft(Object.assign({}, draft, { content: event && event.target ? event.target.value : '' })),
    }),
    h('div', { className: 'mf-ch-hint' }, hint),
    h('div', { className: 'mf-ch-actions' },
      h('button', { className: 'mf-ch-btn primary', type: 'button', disabled: busy, onClick: fireSave }, active ? '保存' : '新建'),
      h('button', { className: 'mf-ch-btn', type: 'button', disabled: busy, onClick: fireRun }, '运行'),
      h('button', { className: 'mf-ch-btn', type: 'button', disabled: !active, title: 'git 版本历史 / diff（需工作区为 git 仓库）', onClick: () => { if (onHistory && active) onHistory(active) } }, '历史/对比'),
      h('button', { className: 'mf-ch-btn', type: 'button', onClick: () => { if (onClose) onClose() } }, '关闭')))

  let foot = null
  const footItems = []
  if (busy) footItems.push(h('div', { className: 'mf-ch-busy', key: 'busy' }, '运行中…'))
  if (error) footItems.push(h('div', { className: 'mf-ch-error', key: 'error' }, error))
  if (result) footItems.push(h('div', { className: 'mf-ch-result', key: 'result' }, result))
  if (lastPrompt) {
    footItems.push(h('button', {
      className: 'mf-ch-prompt-toggle',
      type: 'button',
      key: 'toggle',
      onClick: () => setShowPrompt(!showPrompt),
    }, showPrompt ? '收起提示词' : '查看本次编译提示词'))
    if (showPrompt) footItems.push(h('div', { className: 'mf-ch-prompt', key: 'prompt' }, lastPrompt))
  }
  if (footItems.length) foot = h('div', { className: 'mf-ch-foot' }, footItems)

  const body = h('div', { className: 'mf-ch-body' },
    h('div', { className: 'mf-ch-list' }, listBody),
    editor)

  return h('div', { className: 'mf-ch-overlay', onClick: () => { if (onClose) onClose() } },
    h('div', { className: 'mf-ch', onClick: (event) => { if (event && event.stopPropagation) event.stopPropagation() } },
      h('div', { className: 'mf-ch-head' },
        h('span', { className: 'mf-ch-title' }, 'Prompt Chains'),
        h('button', { className: 'mf-ch-btn', type: 'button', onClick: () => { if (onClose) onClose() } }, '关闭')),
      body,
      foot))
}
