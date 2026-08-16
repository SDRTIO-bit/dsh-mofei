// 墨扉（Mofei）项目网格组件 —— 工作包 C。
// 参考 OpenFic-main（Apache-2.0）的项目列表交互，重写为 DSH 插件内独立组件。
// 纯展示组件：数据全部经由 props 传入，不发起 fetch/RPC；由主代理负责与 legacy.js 集成。
//
// 关于 React：本文件保持 ESM，但不在顶层静态 import 'react'。
// 原因：esbuild 以 external=['react'] 打包（见 esbuild.config.js），顶层 `import x from 'react'`
// 会生成 `require('react')`；而纯 node 测试环境没有 react，顶层静态 import 会让
// `node project-grid.test.mjs` 直接崩掉。因此这里采用惰性解析（require 守卫）+ 全局兜底：
// 纯函数导出（filterProjects / sortProjects）完全不依赖 React；只有真正渲染组件时才需要
// React，届时若仍不可用则显式抛出可读错误。

// ---- React 惰性解析（require 守卫）----------------------------------------
let reactBinding = null // { h, useState } | null（缓存解析结果）
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

/** 大小写不敏感的模糊匹配：先试子串，再试「字符顺序存在」（子序列）匹配。 */
function fuzzyMatch(haystack, query) {
  const target = String(haystack == null ? '' : haystack).toLowerCase()
  const q = String(query == null ? '' : query).toLowerCase().trim()
  if (!q) return true
  if (target.includes(q)) return true
  const needles = q.replace(/\s+/g, '')
  if (!needles) return true
  let i = 0
  for (let pos = 0; pos < target.length && i < needles.length; pos++) {
    if (target.charCodeAt(pos) === needles.charCodeAt(i)) i++
  }
  return i === needles.length
}

/** 按标题的中文 locale 排序（防缺字段）。 */
function compareTitle(a, b) {
  const ta = String(a && a.title != null ? a.title : '')
  const tb = String(b && b.title != null ? b.title : '')
  return ta.localeCompare(tb, 'zh-Hans-CN')
}

/**
 * 模糊过滤：query 命中 title 或 description（大小写不敏感）则保留。
 * 空 query 返回原列表副本；非法输入返回空数组（不抛错）。
 */
export function filterProjects(projects, query) {
  const list = Array.isArray(projects) ? projects.slice() : []
  const q = String(query == null ? '' : query)
  if (!q.trim()) return list
  return list.filter((p) => p && (fuzzyMatch(p.title, q) || fuzzyMatch(p.description, q)))
}

/**
 * 排序：'title' 用 localeCompare('zh-Hans-CN')；
 * 'updated' / 'created' 降序（最近在前），字段缺失时该对回退为按标题排序；
 * 其余值一律按标题排序。返回新数组，不改动入参。
 */
export function sortProjects(projects, by) {
  const list = Array.isArray(projects) ? projects.slice() : []
  const field = by === 'updated' || by === 'created' ? by : 'title'
  if (field === 'title') {
    list.sort(compareTitle)
    return list
  }
  list.sort((a, b) => {
    const av = a && a[field]
    const bv = b && b[field]
    const aHas = av !== undefined && av !== null && av !== ''
    const bHas = bv !== undefined && bv !== null && bv !== ''
    // 任一缺失 → 该对回退为按标题排序
    if (!aHas || !bHas) return compareTitle(a, b)
    const an = typeof av === 'number' && !Number.isNaN(av)
    const bn = typeof bv === 'number' && !Number.isNaN(bv)
    let cmp
    if (an && bn) cmp = bv - av
    else if (an) cmp = 1 // 数字视为更新，排前（降序）
    else if (bn) cmp = -1
    else cmp = av < bv ? 1 : av > bv ? -1 : 0 // 字符串（如 ISO 日期）按降序
    return cmp !== 0 ? cmp : compareTitle(a, b)
  })
  return list
}

/** 目标进度（内部）：字数 = 有 content 的章节长度之和 + 缺 content 章节按 order 估算。 */
function computeGoalProgress(chapters, goal) {
  const list = Array.isArray(chapters) ? chapters : []
  const g = Number(goal)
  if (!Number.isFinite(g) || g <= 0) return null // 未设目标 → 显示「—」
  let total = 0
  let knownCount = 0
  let knownOrderSum = 0
  const missingOrders = []
  for (const c of list) {
    const len = (c && typeof c.content === 'string') ? c.content.length : 0
    const order = (c && typeof c.order === 'number' && Number.isFinite(c.order) && c.order > 0) ? c.order : null
    if (len > 0) {
      total += len
      knownCount++
      if (order != null) knownOrderSum += order
    } else if (len === 0) {
      // 无正文章节：稍后用 order 估算
      missingOrders.push(order)
    }
  }
  if (knownCount === 0) return null // 完全无正文 → 显示「—」
  // 每 order 对应多少字：用有正文的章节校准；没有 order 数据时退化为平均每章长度
  const rate = knownOrderSum > 0 ? total / knownOrderSum : total / knownCount
  let estimated = total
  for (const order of missingOrders) {
    estimated += (order != null ? order : 1) * rate
  }
  return Math.min(100, Math.max(0, Math.round((estimated / g) * 100)))
}

// ---- 样式 -------------------------------------------------------------------

export const PROJECT_GRID_CSS = [
  '.mf-grid-root{display:flex;flex-direction:column;gap:10px;min-width:0}',
  '.mf-grid-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.mf-grid-toggle{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;overflow:hidden}',
  '.mf-grid-toggle button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 10px;cursor:pointer;font:600 12px/1.2 sans-serif}',
  '.mf-grid-toggle button.on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.mf-grid-search{flex:1;min-width:140px;box-sizing:border-box;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}',
  '.mf-grid-select{font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;padding:5px 6px}',
  '.mf-grid-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}',
  '.mf-grid-card{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-elevated,transparent);cursor:pointer;transition:border-color .12s ease,background .12s ease}',
  '.mf-grid-card:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-grid-card.active{border-color:var(--dsw-alias-state-business-primary)}',
  '.mf-grid-cover{display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);font-size:20px;font-weight:700;flex-shrink:0}',
  '.mf-grid-card-head{display:flex;align-items:center;gap:10px;min-width:0}',
  '.mf-grid-card-title{flex:1;min-width:0;font-size:14px;font-weight:650;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mf-grid-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.mf-grid-progress{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.mf-grid-progress-track{flex:1;min-width:40px;height:6px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}',
  '.mf-grid-progress-fill{height:100%;border-radius:3px;background:var(--dsw-alias-state-business-primary);transition:width .2s ease}',
  '.mf-grid-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}',
  '.mf-grid-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);padding:4px 9px;cursor:pointer;font-size:11.5px;line-height:1;flex-shrink:0;transition:background .12s ease,color .12s ease}',
  '.mf-grid-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.mf-grid-del{color:var(--dsw-alias-state-error-primary);border-color:rgba(224,117,110,.35)}',
  '.mf-grid-del:hover{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}',
  '.mf-grid-del.armed{background:rgba(224,117,110,.2);font-weight:650}',
  '.mf-grid-list{display:flex;flex-direction:column;gap:6px}',
  '.mf-grid-row{display:flex;align-items:center;gap:12px;min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-elevated,transparent);cursor:pointer}',
  '.mf-grid-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-grid-row.active{border-color:var(--dsw-alias-state-business-primary)}',
  '.mf-grid-row .mf-grid-cover{width:32px;height:32px;border-radius:6px;font-size:15px}',
  '.mf-grid-row-title{flex:1;min-width:0;font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mf-grid-row-meta{display:flex;align-items:center;gap:14px;font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}',
  '.mf-grid-row-actions{display:flex;gap:6px;flex-shrink:0}',
  '.mf-grid-empty{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
].join('\n')

/** 去重注入样式表（依据 data-mf-grid 属性）。 */
export function ensureGridStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-mf-grid]')) return
  const style = document.createElement('style')
  style.setAttribute('data-mf-grid', '')
  style.textContent = PROJECT_GRID_CSS
  document.head.appendChild(style)
}

// ---- 组件 -------------------------------------------------------------------

function coverChar(title) {
  const t = String(title == null ? '' : title).trim()
  if (!t) return '墨'
  const chars = Array.from(t)
  return chars[0] || '墨'
}

function ActionButtons(props) {
  const { project, armed, onChangeArmed, onRename, onDelete, h } = props
  // 两次点击确认删除：第一次武装，第二次调用 onDelete；超时 / 失焦由父组件解除武装。
  function handleDelete(event) {
    event.stopPropagation()
    if (armed === project.id) {
      if (onChangeArmed) onChangeArmed(null)
      if (onDelete) onDelete(project)
      return
    }
    if (onChangeArmed) onChangeArmed(project.id)
  }
  return h('div', { className: 'mf-grid-actions' },
    h('button', {
      className: 'mf-grid-btn',
      type: 'button',
      title: '重命名',
      onClick: (event) => { event.stopPropagation(); if (onRename) onRename(project) },
    }, '重命名'),
    h('button', {
      className: 'mf-grid-btn mf-grid-del' + (armed === project.id ? ' armed' : ''),
      type: 'button',
      title: armed === project.id ? '再次点击确认删除' : '删除',
      onBlur: () => { if (armed === project.id && onChangeArmed) onChangeArmed(null) },
      onClick: handleDelete,
    }, armed === project.id ? '确认删除' : '删除'))
}

export function ProjectGrid(props) {
  ensureGridStyles()
  const resolved = resolveReact()
  if (!resolved) throw new Error('墨扉 ProjectGrid 无法解析 React：请在宿主注入全局 React 或确保 require("react") 可用')
  const h = resolved.h
  const useSt = resolved.useState

  const projects = (props && Array.isArray(props.projects)) ? props.projects : []
  const activeId = props && props.activeId
  const onPick = props && props.onPick
  const onRename = props && props.onRename
  const onDelete = props && props.onDelete

  const [view, setView] = useSt('grid') // 'grid' | 'list'，默认 grid
  const [query, setQuery] = useSt('')
  const [sortBy, setSortBy] = useSt('updated') // 'updated' | 'created' | 'title'
  const [armed, setArmed] = useSt(null) // 已武装删除的项目 id
  const [armTimer, setArmTimer] = useSt(null) // 武装超时定时器 id

  function changeArmed(id) {
    if (armTimer != null) { clearTimeout(armTimer); setArmTimer(null) }
    if (id == null) { setArmed(null); return }
    setArmed(id)
    const timer = setTimeout(() => { setArmed((current) => (current === id ? null : current)); setArmTimer(null) }, 3000)
    setArmTimer(timer)
  }

  const visible = sortProjects(filterProjects(projects, query), sortBy)

  function progressLabel(project) {
    const percent = computeGoalProgress(project && project.chapters, project && project.goal)
    return percent == null ? '—' : percent + '%'
  }

  function chapterCount(project) {
    const list = project && Array.isArray(project.chapters) ? project.chapters : []
    return list.length
  }

  function renderProgress(project) {
    const percent = computeGoalProgress(project && project.chapters, project && project.goal)
    const label = percent == null ? '—' : percent + '%'
    return h('div', { className: 'mf-grid-progress', title: '目标字数进度' },
      h('span', null, '进度'),
      h('div', { className: 'mf-grid-progress-track' },
        h('div', { className: 'mf-grid-progress-fill', style: { width: (percent == null ? 0 : percent) + '%' } })),
      h('span', null, label))
  }

  const toolbar = h('div', { className: 'mf-grid-toolbar' },
    h('div', { className: 'mf-grid-toggle' },
      h('button', { type: 'button', className: view === 'grid' ? 'on' : '', onClick: () => setView('grid') }, '网格'),
      h('button', { type: 'button', className: view === 'list' ? 'on' : '', onClick: () => setView('list') }, '列表')),
    h('input', {
      className: 'mf-grid-search',
      type: 'search',
      placeholder: '搜索项目（标题 / 简介）',
      value: query,
      onChange: (event) => setQuery(event.target.value),
    }),
    h('select', { className: 'mf-grid-select', value: sortBy, onChange: (event) => setSortBy(event.target.value) },
      h('option', { value: 'updated' }, '最近更新'),
      h('option', { value: 'created' }, '创建时间'),
      h('option', { value: 'title' }, '按标题')))

  let body = null
  if (!visible.length) {
    body = h('div', { className: 'mf-grid-empty' }, '没有符合条件的项目')
  } else if (view === 'grid') {
    body = h('div', { className: 'mf-grid-grid' }, visible.map((project) => {
      const title = String(project.title == null ? '' : project.title).trim() || '未命名项目'
      return h('div', {
        key: project.id,
        className: 'mf-grid-card' + (activeId === project.id ? ' active' : ''),
        onClick: () => { if (onPick) onPick(project) },
      },
        h('div', { className: 'mf-grid-card-head' },
          h('div', { className: 'mf-grid-cover' }, coverChar(project.title)),
          h('div', { className: 'mf-grid-card-title', title: title }, title)),
        h('div', { className: 'mf-grid-meta' },
          h('span', null, chapterCount(project) + ' 章')),
        renderProgress(project),
        h(ActionButtons, { project, armed, onChangeArmed: changeArmed, onRename, onDelete, h }))
    }))
  } else {
    body = h('div', { className: 'mf-grid-list' }, visible.map((project) => {
      const title = String(project.title == null ? '' : project.title).trim() || '未命名项目'
      return h('div', {
        key: project.id,
        className: 'mf-grid-row' + (activeId === project.id ? ' active' : ''),
        onClick: () => { if (onPick) onPick(project) },
      },
        h('div', { className: 'mf-grid-cover' }, coverChar(project.title)),
        h('div', { className: 'mf-grid-row-title', title: title }, title),
        h('div', { className: 'mf-grid-row-meta' },
          h('span', null, chapterCount(project) + ' 章'),
          h('span', null, progressLabel(project))),
        h(ActionButtons, { project, armed, onChangeArmed: changeArmed, onRename, onDelete, h }))
    }))
  }

  return h('div', { className: 'mf-grid-root' }, toolbar, body)
}
