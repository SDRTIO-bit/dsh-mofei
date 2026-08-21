// 墨扉（Mofei）写作记录仪表盘组件 —— 工作包 B。
// 纯展示组件：数据全部经由 props 传入，不发起 fetch/RPC；由主代理负责与 legacy.js 集成。
//
// 关于 React：本文件保持 ESM，但不在顶层静态 import 'react'。
// 原因同 v0.6/v0.9 其他组件：esbuild 以 external=['react'] 打包，顶层静态 import 会生成
// require('react')；纯 node 测试环境没有 react，顶层静态 import 会让
// `node writing-dashboard.test.mjs` 直接崩掉。因此这里采用惰性解析（require 守卫）+ 全局兜底：
// 纯函数导出（dailyRows / defaultRange / rangeStats / weekdayName）完全不依赖 React；
// 只有真正渲染组件时才需要 React，届时若仍不可用则显式抛出可读错误。

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

// ---- 日期工具（纯函数，不依赖时区之外的全局状态）--------------------------

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 星期序号（0=周日 … 6=周六）→ 中文「日一二三四五六」；仅接受整数数字，其余回退空串。 */
export function weekdayName(dayIndex) {
  if (typeof dayIndex !== 'number' || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return ''
  return WEEKDAY_LABELS[dayIndex]
}

/** 'YYYY-MM-DD' 是否合法（含日月越界校验，如 2024-02-31 视为非法）。 */
function isValidDateKey(key) {
  if (typeof key !== 'string') return false
  const m = key.match(DATE_KEY_RE)
  if (!m) return false
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const date = new Date(y, mo - 1, d)
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
}

/** 日期键 → 中文星期（非法返回空串）。 */
function weekdayOf(dateKey) {
  if (typeof dateKey !== 'string') return ''
  const m = dateKey.match(DATE_KEY_RE)
  if (!m) return ''
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return ''
  return weekdayName(date.getDay())
}

function pad2(value) { return value < 10 ? '0' + String(value) : String(value) }

/** 'YYYY-MM-DD' → 'YYYY-MM-DD' 平移 deltaDays 天（Date 自动处理跨月/跨年）。 */
function shiftDateKey(dateKey, deltaDays) {
  const m = (typeof dateKey === 'string') ? dateKey.match(DATE_KEY_RE) : null
  if (!m) return ''
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const date = new Date(y, mo - 1, d + deltaDays)
  return String(date.getFullYear()) + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
}

/** days 参数归一：仅普通对象（非数组/null）可用，其余按空对象处理。 */
function normalizeDays(days) {
  return (days && typeof days === 'object' && !Array.isArray(days)) ? days : {}
}

// ---- 纯函数 ---------------------------------------------------------------

/**
 * 把写作天数对象展开为明细行。
 * days 形态兼容两种：
 *   { '2024-03-01': { chars: 123 }, ... }（服务端统计原始形态）
 *   { '2024-03-01': 123, ... }（简化形态）
 * 返回值 [{ date, chars, weekday }]；date 为 'YYYY-MM-DD'，chars 为有限非负数（脏值回退 0），
 * weekday 为中文「日一二三四五六」（非法日期回退 ''）。
 * 按日期升序；start/end（'YYYY-MM-DD'，空串不限）闭区间过滤。
 * days 脏数据安全：非普通对象 → {} → 空数组。
 */
export function dailyRows(days, start, end) {
  const src = normalizeDays(days)
  const startKey = (typeof start === 'string') ? start : ''
  const endKey = (typeof end === 'string') ? end : ''
  const rows = []
  for (const key of Object.keys(src)) {
    if (startKey && key < startKey) continue
    if (endKey && key > endKey) continue
    const raw = src[key]
    let chars = 0
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      chars = raw > 0 ? raw : 0
    } else if (raw && typeof raw === 'object') {
      const c = raw.chars
      if (typeof c === 'number' && Number.isFinite(c)) chars = c > 0 ? c : 0
    }
    rows.push({ date: key, chars: chars, weekday: weekdayOf(key) })
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return rows
}

/**
 * 默认区间：以 days 中最大日期为 end，向前取 daysBack 天（含 end 当日共 daysBack 天，
 * 即 start = end - (daysBack - 1) 天），对应「近 N 天」语义。
 * daysBack 非法（非正整数）回退 30；无数据（无合法日期）返回 { start:'', end:'' }。
 */
export function defaultRange(days, daysBack = 30) {
  const src = normalizeDays(days)
  let end = ''
  for (const key of Object.keys(src)) {
    if (isValidDateKey(key) && key > end) end = key
  }
  if (!end) return { start: '', end: '' }
  let back = Number(daysBack)
  if (!Number.isInteger(back) || back < 1) back = 30
  const start = shiftDateKey(end, -(back - 1))
  return { start: start || '', end: end }
}

/**
 * 区间统计：rows 为 dailyRows 输出（或任意行数组）。
 * -> { days, totalChars, average }；average = 非空时四舍五入取整，空时 0。
 * 脏数据安全：非数组 → 空；非对象行跳过；chars 取有限非负数。
 */
export function rangeStats(rows) {
  const list = Array.isArray(rows) ? rows : []
  let days = 0
  let totalChars = 0
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    days += 1
    const c = row.chars
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) totalChars += c
  }
  const average = days > 0 ? Math.round(totalChars / days) : 0
  return { days: days, totalChars: totalChars, average: average }
}

// ---- 样式 -------------------------------------------------------------------

export const WRITING_DASHBOARD_CSS = [
  '.mf-dash-overlay{position:fixed;inset:0;z-index:135;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}',
  '.mf-dash-card{display:flex;flex-direction:column;width:min(760px,92vw);max-height:80vh;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 20px 60px rgba(0,0,0,.28)}',
  '.mf-dash-head{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0}',
  '.mf-dash-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);flex-shrink:0}',
  '.mf-dash-head-actions{display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0}',
  '.mf-dash-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:transparent;color:inherit;padding:4px 10px;cursor:pointer;font-size:11px;line-height:1.2;transition:background .12s ease}',
  '.mf-dash-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-dash-btn.mf-dash-on{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}',
  '.mf-dash-btn.mf-dash-close{font-size:14px;padding:2px 8px;border-radius:10px}',
  '.mf-dash-toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}',
  '.mf-dash-label{font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}',
  '.mf-dash-date{box-sizing:border-box;flex:1;min-width:130px;max-width:170px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-elevated,transparent);color:inherit;padding:5px 8px;font-size:12px;line-height:1.2}',
  '.mf-dash-sep{font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.mf-dash-stats{padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}',
  '.mf-dash-stats strong{color:var(--dsw-alias-label-primary);font-weight:600}',
  '.mf-dash-body{min-height:0;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:6px}',
  '.mf-dash-row{display:flex;align-items:center;gap:12px;min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-elevated,transparent)}',
  '.mf-dash-row-date{font-size:12px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;flex-shrink:0}',
  '.mf-dash-row-weekday{flex-shrink:0;font-size:11px;color:var(--dsw-alias-label-secondary);padding:1px 7px;border-radius:14px;background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-dash-row-chars{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-primary);flex-shrink:0;font-variant-numeric:tabular-nums}',
  '.mf-dash-empty{padding:22px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
].join('\n')

/** 去重注入样式表（依据 data-mf-dashboard 属性）。 */
export function ensureWritingDashboardStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-mf-dashboard]')) return
  const style = document.createElement('style')
  style.setAttribute('data-mf-dashboard', '')
  style.textContent = WRITING_DASHBOARD_CSS
  document.head.appendChild(style)
}

// ---- 组件 -------------------------------------------------------------------

/**
 * WritingDashboard —— 写作记录仪表盘：按日期区间展示每日字数明细。
 *
 * props = {
 *   open, onClose(), days, onRangeChange?,
 * }
 * days 为天数对象（{ 'YYYY-MM-DD': { chars } | number }，服务端统计原始形态）。
 * 组件内部本地 state：start/end（初始 defaultRange(days, 30)）。
 * 顶部快捷按钮：近7天 / 近30天 / 全部。
 * 不发起任何 fetch/RPC；总览热力图保留在外部，面板内不重复。
 */
export function WritingDashboard(props) {
  ensureWritingDashboardStyles()
  const resolved = resolveReact()
  if (!resolved) throw new Error('墨扉 WritingDashboard 无法解析 React：请在宿主注入全局 React 或确保 require("react") 可用')
  const h = resolved.h
  const useSt = resolved.useState

  const open = !!(props && props.open)
  const onClose = props && props.onClose
  const onRangeChange = props && props.onRangeChange
  const daysData = normalizeDays(props && props.days)

  const initial = defaultRange(daysData, 30)
  const [start, setStart] = useSt(initial.start)
  const [end, setEnd] = useSt(initial.end)

  if (!open) return null

  function applyRange(next) {
    const nextStart = next && next.start != null ? String(next.start) : ''
    const nextEnd = next && next.end != null ? String(next.end) : ''
    setStart(nextStart)
    setEnd(nextEnd)
    if (onRangeChange) onRangeChange({ start: nextStart, end: nextEnd })
  }

  function changeStart(value) {
    setStart(value)
    if (onRangeChange) onRangeChange({ start: value, end: end })
  }

  function changeEnd(value) {
    setEnd(value)
    if (onRangeChange) onRangeChange({ start: start, end: value })
  }

  const rows = dailyRows(daysData, start, end)
  const stats = rangeStats(rows)

  const quickButtons = h('div', { className: 'mf-dash-head-actions' },
    h('button', {
      className: 'mf-dash-btn' + (start === defaultRange(daysData, 7).start && end === defaultRange(daysData, 7).end ? ' mf-dash-on' : ''),
      type: 'button',
      onClick: () => applyRange(defaultRange(daysData, 7)),
    }, '近7天'),
    h('button', {
      className: 'mf-dash-btn' + (start === initial.start && end === initial.end ? ' mf-dash-on' : ''),
      type: 'button',
      onClick: () => applyRange(defaultRange(daysData, 30)),
    }, '近30天'),
    h('button', {
      className: 'mf-dash-btn' + (start === '' && end === '' ? ' mf-dash-on' : ''),
      type: 'button',
      onClick: () => applyRange({ start: '', end: '' }),
    }, '全部'),
    h('button', {
      className: 'mf-dash-btn mf-dash-close',
      type: 'button',
      title: '关闭',
      onClick: () => { if (onClose) onClose() },
    }, '×'))

  const head = h('div', { className: 'mf-dash-head' },
    h('span', { className: 'mf-dash-title' }, '写作记录'),
    quickButtons)

  const toolbar = h('div', { className: 'mf-dash-toolbar' },
    h('span', { className: 'mf-dash-label' }, '起始'),
    h('input', {
      className: 'mf-dash-date',
      type: 'date',
      value: start,
      onChange: (event) => changeStart(event.target.value),
    }),
    h('span', { className: 'mf-dash-sep' }, '至'),
    h('input', {
      className: 'mf-dash-date',
      type: 'date',
      value: end,
      onChange: (event) => changeEnd(event.target.value),
    }))

  const statsBar = h('div', { className: 'mf-dash-stats' },
    h('strong', null, String(stats.days)), ' 天 · 共 ',
    h('strong', null, String(stats.totalChars)), ' 字 · 日均 ',
    h('strong', null, String(stats.average)), ' 字')

  let body = null
  if (!rows.length) {
    body = h('div', { className: 'mf-dash-empty' }, '该范围内暂无写作记录')
  } else {
    body = rows.map((row, index) => h('div', {
      className: 'mf-dash-row',
      key: row && row.date != null ? row.date : index,
    },
      h('span', { className: 'mf-dash-row-date' }, row.date),
      h('span', { className: 'mf-dash-row-weekday' }, row.weekday ? '周' + row.weekday : '—'),
      h('span', { className: 'mf-dash-row-chars' }, String(row.chars) + ' 字')))
  }

  return h('div', { className: 'mf-dash-overlay', onClick: () => { if (onClose) onClose() } },
    h('div', { className: 'mf-dash-card', onClick: (event) => { if (event && event.stopPropagation) event.stopPropagation() } },
      head,
      toolbar,
      statsBar,
      h('div', { className: 'mf-dash-body' }, body)))
}
