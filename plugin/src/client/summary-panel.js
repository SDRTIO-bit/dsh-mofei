// 墨扉（Mofei）摘要面板组件 —— 工作包 B。
// 纯展示组件：数据全部经由 props 传入，不发起 fetch/RPC；由主代理负责与 legacy.js 集成。
//
// 关于 React：本文件保持 ESM，但不在顶层静态 import 'react'。
// 原因同 v0.6 组件：esbuild 以 external=['react'] 打包，顶层静态 import 会生成
// require('react')；纯 node 测试环境没有 react，顶层静态 import 会让
// `node summary-panel.test.mjs` 直接崩掉。因此这里采用惰性解析（require 守卫）+ 全局兜底：
// 纯函数导出（previewSummary / chapterSummaryStats / rangeSummaryStats / progressPercent）
// 完全不依赖 React；只有真正渲染组件时才需要 React，届时若仍不可用则显式抛出可读错误。

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

/** 文本规范化：String(text ?? '')，去首尾空白；max 非法（非正有限数）回退到默认 120。 */
function normMax(max, fallback) {
  const n = Number(max)
  return (Number.isFinite(n) && n > 0) ? Math.floor(n) : fallback
}

/**
 * 预览摘要：字符串化 / trim / 按 Unicode 码点（Array.from）截断到 max（默认 120）。
 * 非字符串输入安全（String 兜底）；null/undefined 得空串；截断不拆散代理对。
 */
export function previewSummary(text, max = 120) {
  const limit = normMax(max, 120)
  const s = String(text == null ? '' : text).trim()
  const chars = Array.from(s)
  return chars.length > limit ? chars.slice(0, limit).join('') : s
}

/** 非空摘要判定：String 化去空白后是否仍有内容。 */
function hasSummaryText(entry) {
  const summary = (entry && typeof entry === 'object') ? entry.summary : null
  return String(summary == null ? '' : summary).trim().length > 0
}

/**
 * 章节摘要统计：rows 为数组（脏输入安全）。
 * -> { total, hasSummary, stale }：total 总行数；hasSummary 已有内容摘要的行数；stale 标记过期的行数。
 */
export function chapterSummaryStats(rows) {
  const list = Array.isArray(rows) ? rows : []
  let hasSummary = 0
  let stale = 0
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    if (hasSummaryText(row.entry)) hasSummary++
    if (row.stale === true) stale++
  }
  return { total: list.length, hasSummary, stale }
}

/**
 * 区间摘要统计：ranges 为数组（脏输入安全）。
 * -> { total, hasSummary }：total 组数；hasSummary 已有摘要的组数（hasSummary 或 summary 有内容均计）。
 */
export function rangeSummaryStats(ranges) {
  const list = Array.isArray(ranges) ? ranges : []
  let hasSummary = 0
  for (const range of list) {
    if (!range || typeof range !== 'object') continue
    const has = range.hasSummary === true || String(range.summary == null ? '' : range.summary).trim().length > 0
    if (has) hasSummary++
  }
  return { total: list.length, hasSummary }
}

/**
 * progress {done,total} -> null | 0..100。
 * 非法安全：非对象 / done/total 非有限数 / total<=0 / done<0 均返回 null；
 * 结果按四舍五入取整并夹在 0..100（done>total 时封顶 100）。
 */
export function progressPercent(progress) {
  if (!progress || typeof progress !== 'object') return null
  const done = progress.done
  const total = progress.total
  if (typeof done !== 'number' || typeof total !== 'number') return null
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0 || done < 0) return null
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)))
}

// ---- 样式 -------------------------------------------------------------------

export const SUMMARY_PANEL_CSS = [
  '.mf-sum-overlay{position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}',
  '.mf-sum{display:grid;grid-template-rows:48px 40px minmax(0,1fr);width:min(920px,92vw);height:78vh;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 20px 60px rgba(0,0,0,.28)}',
  '.mf-sum-head{display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0}',
  '.mf-sum-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);flex-shrink:0}',
  '.mf-sum-project{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mf-sum-head-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}',
  '.mf-sum-tabs{display:flex;gap:4px;padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
  '.mf-sum-tab{flex:1;border:0;border-radius:14px;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 0;cursor:pointer;font-weight:600;font-size:12px;line-height:1.2}',
  '.mf-sum-tab.on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.mf-sum-body{min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px}',
  '.mf-sum-stats{font-size:11px;color:var(--dsw-alias-label-secondary);padding:0 2px}',
  '.mf-sum-list{display:flex;flex-direction:column;gap:6px;min-width:0}',
  '.mf-sum-row{display:flex;align-items:flex-start;gap:10px;min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-elevated,transparent)}',
  '.mf-sum-order{flex-shrink:0;width:20px;font-size:11px;color:var(--dsw-alias-label-secondary);padding-top:2px;text-align:right}',
  '.mf-sum-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}',
  '.mf-sum-name{display:flex;align-items:center;gap:8px;min-width:0}',
  '.mf-sum-name strong{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.mf-sum-badge{flex-shrink:0;font-size:10px;padding:1px 6px;border-radius:14px}',
  '.mf-sum-badge.none{background:var(--dsw-alias-state-neutral, #6b7280);color:#fff}',
  '.mf-sum-badge.stale{background:var(--dsw-alias-state-warning, #f59e0b);color:#fff}',
  '.mf-sum-badge.ok{background:var(--dsw-alias-state-success, #16a34a);color:#fff}',
  '.mf-sum-preview{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-all;max-height:64px;overflow:hidden}',
  '.mf-sum-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}',
  '.mf-sum-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:transparent;color:inherit;padding:4px 8px;cursor:pointer;font-size:11px;line-height:1;transition:background .12s ease,opacity .12s ease}',
  '.mf-sum-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.mf-sum-btn:disabled{opacity:.45;cursor:default}',
  '.mf-sum-btn.primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}',
  '.mf-sum-btn.primary:hover{opacity:.9}',
  '.mf-sum-loading{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
  '.mf-sum-error{padding:12px;border:1px solid rgba(220,38,38,.45);border-radius:10px;color:#dc2626;font-size:12px;background:rgba(220,38,38,.08)}',
  '.mf-sum-empty{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
  '.mf-sum-generate{display:grid;gap:14px}',
  '.mf-sum-generate-actions{display:flex;gap:8px;flex-wrap:wrap}',
  '.mf-sum-generate-actions .mf-sum-btn{padding:8px 14px;font-size:12px}',
  '.mf-sum-progress{display:grid;gap:6px}',
  '.mf-sum-progress-track{height:8px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}',
  '.mf-sum-progress-fill{height:100%;border-radius:10px;background:var(--dsw-alias-state-business-primary);transition:width .2s ease}',
  '.mf-sum-progress-label{font-size:11px;color:var(--dsw-alias-label-secondary)}',
  '.mf-sum-busy{font-size:12px;color:var(--dsw-alias-label-secondary)}',
  '.mf-sum-result{padding:10px 12px;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;font-size:12px;color:var(--dsw-alias-label-primary)}',
].join('\n')

/** 去重注入样式表（依据 data-mf-summary 属性）。 */
export function ensureSummaryPanelStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-mf-summary]')) return
  const style = document.createElement('style')
  style.setAttribute('data-mf-summary', '')
  style.textContent = SUMMARY_PANEL_CSS
  document.head.appendChild(style)
}

// ---- 组件 -------------------------------------------------------------------

/** 章节行 badge：无（灰）/ 过期（橙）/ 有（绿）。 */
function chapterBadge(row) {
  if (!hasSummaryText(row && row.entry)) return { cls: 'none', text: '无' }
  if (row && row.stale === true) return { cls: 'stale', text: '过期' }
  return { cls: 'ok', text: '有' }
}

/** 区间行 badge：有 / 无。 */
function rangeBadge(range) {
  const has = range && (range.hasSummary === true || String(range.summary == null ? '' : range.summary).trim().length > 0)
  return has ? { cls: 'ok', text: '有' } : { cls: 'none', text: '无' }
}

/**
 * SummaryPanel —— 摘要面板：章节 / 区间 / 生成 三个 tab 的纯展示组件。
 *
 * props = {
 *   open, onClose(), projectTitle,
 *   chapterRows: [{ chapterId, title, order, revision, entry, stale }],
 *   ranges: [{ id, title, chapterIds, summary, updatedAt, hasSummary }],
 *   loading, error,
 *   busy: { kind: 'chapter'|'range'|'chapters'|'ranges', id? } | null,
 *   progress: { done, total, label } | null,
 *   result: { kind, count, total, staleCount, freshCount } | null,
 *   onRegenerateChapter(row), onRegenerateRange(row),
 *   onGenerateChapters(), onGenerateRanges(), onRefresh(),
 * }
 * 不发起任何 fetch/RPC。
 */
export function SummaryPanel(props) {
  ensureSummaryPanelStyles()
  const resolved = resolveReact()
  if (!resolved) throw new Error('墨扉 SummaryPanel 无法解析 React：请在宿主注入全局 React 或确保 require("react") 可用')
  const h = resolved.h
  const useSt = resolved.useState

  const open = !!(props && props.open)
  const onClose = props && props.onClose
  const projectTitle = props && props.projectTitle
  const chapterRows = (props && Array.isArray(props.chapterRows)) ? props.chapterRows : []
  const ranges = (props && Array.isArray(props.ranges)) ? props.ranges : []
  const loading = !!(props && props.loading)
  const error = props && props.error ? String(props.error) : ''
  const busy = props && props.busy ? props.busy : null
  const progress = props && props.progress ? props.progress : null
  const result = props && props.result ? props.result : null
  const onRegenerateChapter = props && props.onRegenerateChapter
  const onRegenerateRange = props && props.onRegenerateRange
  const onGenerateChapters = props && props.onGenerateChapters
  const onGenerateRanges = props && props.onGenerateRanges
  const onRefresh = props && props.onRefresh

  const [tab, setTab] = useSt('chapters') // 'chapters' | 'ranges' | 'generate'

  if (!open) return null

  function rowBusy(kind, id) {
    return !!(busy && busy.kind === kind && busy.id === id)
  }

  const chapterStats = chapterSummaryStats(chapterRows)
  const rangeStats = rangeSummaryStats(ranges)

  // 章节 tab
  let chapterBody = null
  if (loading) {
    chapterBody = h('div', { className: 'mf-sum-loading' }, '加载中…')
  } else if (error) {
    chapterBody = h('div', { className: 'mf-sum-error' }, error)
  } else if (!chapterRows.length) {
    chapterBody = h('div', { className: 'mf-sum-empty' }, '暂无章节')
  } else {
    chapterBody = h('div', { className: 'mf-sum-list' }, chapterRows.map((row, index) => {
      const badge = chapterBadge(row)
      const orderNum = (row && typeof row.order === 'number' && Number.isFinite(row.order)) ? row.order : index
      const title = String(row && row.title == null ? '' : row.title).trim() || '未命名章节'
      const preview = previewSummary(row && row.entry && row.entry.summary)
      const disabled = rowBusy('chapter', row && row.chapterId)
      return h('div', { className: 'mf-sum-row', key: row && row.chapterId != null ? row.chapterId : index },
        h('div', { className: 'mf-sum-order' }, String(orderNum + 1)),
        h('div', { className: 'mf-sum-main' },
          h('div', { className: 'mf-sum-name' },
            h('strong', null, title),
            h('span', { className: 'mf-sum-badge ' + badge.cls }, badge.text)),
          h('div', { className: 'mf-sum-preview' }, preview || '（暂无摘要）')),
        h('div', { className: 'mf-sum-actions' },
          h('button', {
            className: 'mf-sum-btn',
            type: 'button',
            disabled,
            onClick: () => { if (onRegenerateChapter) onRegenerateChapter(row) },
          }, '重算')))
    }))
  }

  // 区间 tab
  let rangeBody = null
  if (loading) {
    rangeBody = h('div', { className: 'mf-sum-loading' }, '加载中…')
  } else if (error) {
    rangeBody = h('div', { className: 'mf-sum-error' }, error)
  } else if (!ranges.length) {
    rangeBody = h('div', { className: 'mf-sum-empty' }, '暂无区间')
  } else {
    rangeBody = h('div', { className: 'mf-sum-list' }, ranges.map((range, index) => {
      const badge = rangeBadge(range)
      const title = String(range && range.title == null ? '' : range.title).trim() || String(range && range.id == null ? '' : range.id) || ('区间 ' + (index + 1))
      const preview = previewSummary(range && range.summary)
      const disabled = rowBusy('range', range && range.id)
      return h('div', { className: 'mf-sum-row', key: range && range.id != null ? range.id : index },
        h('div', { className: 'mf-sum-order' }, String(index + 1)),
        h('div', { className: 'mf-sum-main' },
          h('div', { className: 'mf-sum-name' },
            h('strong', null, title),
            h('span', { className: 'mf-sum-badge ' + badge.cls }, badge.text)),
          h('div', { className: 'mf-sum-preview' }, preview || '（暂无摘要）')),
        h('div', { className: 'mf-sum-actions' },
          h('button', {
            className: 'mf-sum-btn',
            type: 'button',
            disabled,
            onClick: () => { if (onRegenerateRange) onRegenerateRange(range) },
          }, '重算')))
    }))
  }

  // 生成 tab
  const chapterGenDisabled = !!(busy && (busy.kind === 'chapter' || busy.kind === 'chapters'))
  const rangeGenDisabled = !!(busy && (busy.kind === 'range' || busy.kind === 'ranges'))
  let progressArea = null
  const percent = progressPercent(progress)
  if (progress) {
    const label = String(progress.label == null ? '' : progress.label)
    progressArea = h('div', { className: 'mf-sum-progress' },
      h('div', { className: 'mf-sum-progress-track' },
        h('div', { className: 'mf-sum-progress-fill', style: { width: (percent == null ? 0 : percent) + '%' } })),
      h('div', { className: 'mf-sum-progress-label' },
        label + '（' + String(progress.done == null ? 0 : progress.done) + '/' + String(progress.total == null ? 0 : progress.total) + '）'))
  } else if (busy) {
    progressArea = h('div', { className: 'mf-sum-busy' }, '生成中…')
  }

  let resultArea = null
  if (result) {
    resultArea = h('div', { className: 'mf-sum-result' },
      '生成 ' + String(result.count == null ? 0 : result.count) + ' 项（过期 ' +
      String(result.staleCount == null ? 0 : result.staleCount) + ' / 新鲜 ' +
      String(result.freshCount == null ? 0 : result.freshCount) + '）')
  }

  const generateBody = h('div', { className: 'mf-sum-generate' },
    h('div', { className: 'mf-sum-generate-actions' },
      h('button', {
        className: 'mf-sum-btn primary',
        type: 'button',
        disabled: chapterGenDisabled,
        onClick: () => { if (onGenerateChapters) onGenerateChapters() },
      }, '生成全部过期章节摘要'),
      h('button', {
        className: 'mf-sum-btn primary',
        type: 'button',
        disabled: rangeGenDisabled,
        onClick: () => { if (onGenerateRanges) onGenerateRanges() },
      }, '生成全部过期区间摘要')),
    progressArea,
    resultArea)

  const tabs = h('div', { className: 'mf-sum-tabs' },
    h('button', { type: 'button', className: 'mf-sum-tab' + (tab === 'chapters' ? ' on' : ''), onClick: () => setTab('chapters') }, '章节'),
    h('button', { type: 'button', className: 'mf-sum-tab' + (tab === 'ranges' ? ' on' : ''), onClick: () => setTab('ranges') }, '区间'),
    h('button', { type: 'button', className: 'mf-sum-tab' + (tab === 'generate' ? ' on' : ''), onClick: () => setTab('generate') }, '生成'))

  const head = h('div', { className: 'mf-sum-head' },
    h('span', { className: 'mf-sum-title' }, '摘要'),
    h('span', { className: 'mf-sum-project', title: String(projectTitle == null ? '' : projectTitle) },
      projectTitle == null ? '' : String(projectTitle)),
    h('span', { className: 'mf-sum-head-actions' },
      h('button', { className: 'mf-sum-btn', type: 'button', onClick: () => { if (onRefresh) onRefresh() } }, '刷新'),
      h('button', { className: 'mf-sum-btn', type: 'button', onClick: () => { if (onClose) onClose() } }, '关闭')))

  let body = null
  if (tab === 'chapters') {
    body = h('div', { className: 'mf-sum-body' },
      h('div', { className: 'mf-sum-stats' },
        '共 ' + chapterStats.total + ' 章 · 已有摘要 ' + chapterStats.hasSummary + ' · 过期 ' + chapterStats.stale),
      chapterBody)
  } else if (tab === 'ranges') {
    body = h('div', { className: 'mf-sum-body' },
      h('div', { className: 'mf-sum-stats' },
        '共 ' + rangeStats.total + ' 组 · 已有摘要 ' + rangeStats.hasSummary),
      rangeBody)
  } else {
    body = h('div', { className: 'mf-sum-body' }, generateBody)
  }

  return h('div', { className: 'mf-sum-overlay', onClick: () => { if (onClose) onClose() } },
    h('div', { className: 'mf-sum', onClick: (event) => { if (event && event.stopPropagation) event.stopPropagation() } },
      head, tabs, body))
}
