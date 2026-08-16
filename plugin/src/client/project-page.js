// 墨扉（Mofei）项目宽幅页组件 —— 工作包 B。
// 纯展示组件：数据全部经由 props 传入，不发起 fetch/RPC；由主代理负责与 legacy.js 集成。
//
// 关于 React：本文件保持 ESM，但不在顶层静态 import 'react'。
// 与 project-grid.js 同理：esbuild 以 external=['react'] 打包（见 esbuild.config.js），
// 顶层静态 import 会生成 require('react')，而纯 node 测试环境没有 react。因此本文件
// 导入同为 ESM 的 './project-grid.js'（本地 import 安全），经由其 export 的 resolveReact
// 惰性解析 React；只有真正渲染组件时才需要 React。
import { resolveReact, ProjectGrid, ensureGridStyles } from './project-grid.js'

// ---- 纯函数 ------------------------------------------------------------------

const MAX_DESCRIPTION_CHARS = 500

/**
 * 规范化简介：String(text ?? '')，去首尾空白，超 500 字按 Unicode（Array.from）码点截断。
 * 非字符串输入安全（String 兜底），null/undefined 得空串。
 */
export function normalizeDescription(text) {
  const s = String(text == null ? '' : text).trim()
  const chars = Array.from(s)
  return chars.length > MAX_DESCRIPTION_CHARS ? chars.slice(0, MAX_DESCRIPTION_CHARS).join('') : s
}

/**
 * 草稿是否相对项目当前简介有变动：两侧均经 normalizeDescription 后比较。
 * project 缺失 / 非对象（如 null / undefined）时 description 按空串处理。
 */
export function isDescriptionDirty(project, draft) {
  const current = project && typeof project === 'object' && 'description' in project ? project.description : undefined
  return normalizeDescription(draft) !== normalizeDescription(current)
}

// ---- 样式 ---------------------------------------------------------------------

export const PROJECT_PAGE_CSS = [
  '.mf-pp{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%}',
  '.mf-pp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;min-height:44px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
  '.mf-pp-head strong{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary)}',
  '.mf-pp-actions{display:flex;align-items:center;gap:6px}',
  '.mf-pp-body{flex:1;min-height:0;overflow:auto;padding:14px}',
  '.mf-pp-detail{display:grid;gap:10px;margin-top:14px;padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-elevated,transparent)}',
  '.mf-pp-detail-head{display:flex;align-items:center;gap:10px;min-width:0}',
  '.mf-pp-cover{display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);font-size:20px;font-weight:700;flex-shrink:0;color:var(--dsw-alias-label-primary)}',
  '.mf-pp-title{flex:1;min-width:0;font-size:15px;font-weight:650;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mf-pp-detail-head small{font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}',
  '.mf-pp-desc-label{font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary)}',
  '.mf-pp-desc{box-sizing:border-box;width:100%;min-height:84px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:13px/1.6 sans-serif;resize:vertical}',
  '.mf-pp-desc-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}',
  '.mf-pp-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.mf-pp-empty{margin-top:14px;padding:18px 12px;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
].join('\n')

/** 去重注入样式表（依据 data-mf-project-page 属性）。 */
export function ensureProjectPageStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-mf-project-page]')) return
  const style = document.createElement('style')
  style.setAttribute('data-mf-project-page', '')
  style.textContent = PROJECT_PAGE_CSS
  document.head.appendChild(style)
}

// ---- 组件 ---------------------------------------------------------------------

// resolveReact() 返回 { h, useState }（见 project-grid.js），不含 useEffect。
// ProjectPage 需要 useEffect 同步 active 变化，故此处按同一套惰性解析路径取完整 React 对象。
let pageReact = null
let pageReactResolved = false

function resolvePageReact() {
  if (!pageReactResolved) {
    pageReactResolved = true
    let React = null
    const g = (typeof globalThis !== 'undefined') ? globalThis : null
    if (g && g.React && typeof g.React.createElement === 'function' && typeof g.React.useState === 'function' && typeof g.React.useEffect === 'function') React = g.React
    if (!React && typeof window !== 'undefined' && window.React && typeof window.React.createElement === 'function') React = window.React
    if (!React) {
      try {
        const req = (typeof require === 'function') ? require : (g && typeof g.__mfRequire === 'function' ? g.__mfRequire : null)
        if (req) React = req('react')
      } catch (error) { /* react 不可用：保持 null */ }
    }
    if (!React && g && g.__mofeiReact && typeof g.__mofeiReact.createElement === 'function') React = g.__mofeiReact
    pageReact = (React && typeof React.createElement === 'function' && typeof React.useState === 'function' && typeof React.useEffect === 'function') ? React : null
  }
  return pageReact
}

/** 封面字符：首字 / emoji，同 ProjectGrid 的 coverChar 逻辑。 */
function coverChar(title) {
  const t = String(title == null ? '' : title).trim()
  if (!t) return '墨'
  const chars = Array.from(t)
  return chars[0] || '墨'
}

function chapterCount(project) {
  const list = project && Array.isArray(project.chapters) ? project.chapters : []
  return list.length
}

/**
 * ProjectPage —— 项目宽幅页：宽幅项目网格 + 选中项目的简介编辑卡片。
 *
 * props = {
 *   projects: array, activeId: string|null,
 *   onPick(project), onRename(project), onDelete(project), onCreate(), onClose(),
 *   onSaveDescription(project, description),
 * }
 * 不发起任何 fetch/RPC；删除确认由 ProjectGrid 自行管理；目标字数由父组件负责。
 */
export function ProjectPage(props) {
  ensureGridStyles()
  ensureProjectPageStyles()
  const resolved = resolveReact()
  const react = resolvePageReact()
  if (!resolved || !react) throw new Error('墨扉 ProjectPage 无法解析 React：请在宿主注入全局 React 或确保 require("react") 可用')
  const h = resolved.h
  const useSt = resolved.useState
  const useEf = react.useEffect

  const projects = (props && Array.isArray(props.projects)) ? props.projects : []
  const activeId = props && props.activeId
  const onPick = props && props.onPick
  const onRename = props && props.onRename
  const onDelete = props && props.onDelete
  const onCreate = props && props.onCreate
  const onClose = props && props.onClose
  const onSaveDescription = props && props.onSaveDescription

  const active = activeId == null
    ? null
    : (projects.find((p) => p && p.id === activeId) || null)

  const [draft, setDraft] = useSt('')

  // activeId 变化时同步 project.description（以规范化后的值为准，保证编辑基准稳定）。
  useEf(() => {
    setDraft(active ? normalizeDescription(active.description) : '')
  }, [activeId])

  const dirty = isDescriptionDirty(active, draft)
  const descriptionValue = normalizeDescription(draft)

  function handleTextareaChange(event) {
    // 超过 500 字截断（按码点）；其余原始输入进入 state。
    setDraft(String(event.target.value == null ? '' : event.target.value))
  }

  function handleSave() {
    if (!active || !dirty) return
    if (onSaveDescription) onSaveDescription(active, descriptionValue)
  }

  const head = h('div', { className: 'mf-pp-head' },
    h('strong', null, '项目'),
    h('span', { className: 'mf-pp-actions' },
      h('button', { className: 'mf-btn', type: 'button', onClick: () => { if (onCreate) onCreate() } }, '+ 新建'),
      h('button', { className: 'mf-btn', type: 'button', title: '返回编辑器', onClick: () => { if (onClose) onClose() } }, '收起')))

  const grid = h(ProjectGrid, {
    projects,
    activeId,
    onPick,
    onRename,
    onDelete,
  })

  let detail = null
  if (active) {
    detail = h('div', { className: 'mf-pp-detail' },
      h('div', { className: 'mf-pp-detail-head' },
        h('div', { className: 'mf-pp-cover' }, coverChar(active.title)),
        h('div', { className: 'mf-pp-title', title: String(active.title == null ? '' : active.title).trim() || '未命名项目' }, String(active.title == null ? '' : active.title).trim() || '未命名项目'),
        h('small', null, chapterCount(active) + ' 章')),
      h('div', { className: 'mf-pp-desc-label' }, '简介'),
      h('textarea', {
        className: 'mf-pp-desc',
        placeholder: '一句话介绍这本书（用于搜索与项目页展示）',
        value: descriptionValue,
        onChange: handleTextareaChange,
      }),
      h('div', { className: 'mf-pp-desc-foot' },
        h('small', { className: 'mf-pp-hint' }, '简介用于项目网格搜索'),
        h('button', { className: 'mf-btn mf-primary', type: 'button', disabled: !dirty, onClick: handleSave }, '保存简介')))
  } else {
    detail = h('div', { className: 'mf-pp-empty' }, '选择项目后编辑简介与目标。')
  }

  return h('div', { className: 'mf-pp' },
    head,
    h('div', { className: 'mf-pp-body' }, grid, detail))
}
