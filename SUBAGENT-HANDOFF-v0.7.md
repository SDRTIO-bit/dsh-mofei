# SUBAGENT-HANDOFF v0.7（摘要维护面板 / 世界书搜索与批量）

> 生成：2026-08-15。基线：v0.6.0 已全绿（test-host 23/23 + verify-v0.6/v7/v5-ui 三浏览器回归）。
> 本批范围：GAP-ANALYSIS v0.7。**子代理只写指定文件，主代理统一集成与打包。**
> 注意：A 会改 lib/index.js，因此 v0.7 的 Host 部分重启 DSH 后生效；B/C 为 client 纯展示/纯函数。

## 共享约束

- 工作目录：`F:\game\SillyTavern-1.13.2\OpenFic-DSH`
- 不破坏现有：23 个 `mofei_*` 工具 + 23 个 alias 注册、17 skills、既有 RPC 返回形状与错误码。
- 客户端新组件禁止顶层 `import 'react'`（原因同 v0.6 工作包），纯函数文件保持 ESM 无 DOM 无第三方依赖。
- 不要运行 esbuild；不要改 legacy.js / project-grid.js / project-page.js / layout.js / editor-limits.js / 文档。
- 自测必须全 PASS，交付回复含文件清单、导出签名、测试数、自测输出摘要、与规格出入。

## 工作包 A：Host 摘要流 + 世界书批量（独占 lib/index.js + test-host.mjs）

改：`plugin/lib/index.js`、`test-host.mjs`。不要新增其他文件（除非只在 lib 内复用，可接受不新增）。

关键现状锚点（行号可漂移）：
- `generateText()` ~L221；`streamAiAssist()` ~L275（SSE 写法照抄它）；`sseEvent` 来自 ai.js。
- handlers：`ai-summarize-chapters` ~L753、`ai-summarize-ranges` ~L821。
- `rpcHandler` ~L856，L865 已对 `/api/mofei/stream/ai-assist` 提前分流（新流式路由照此加一行）。
- 世界书 handlers：`create-world-entry` ~L625 / `update-world-entry` ~L631 / `delete-world-entry` ~L642。
- test-host 的 `sse(payload)` helper 目前写死 `/api/mofei/stream/ai-assist`。

要求：

### A1. 批量章摘要 RPC `chapter-summaries`
```js
'chapter-summaries': async (args) => {
  await load(); await queue
  const project = projectBy(args && args.projectId)
  if (!project) return { error: 'PROJECT_NOT_FOUND' }
  const chapters = project.chapters.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
  return { chapters: chapters.map((chapter) => {
    const entry = chapterSummaryView(summaryStore, chapter.id)
    return { chapterId: chapter.id, title: chapter.title, order: chapter.order, revision: chapter.revision, volumeId: chapter.volumeId || null, entry, stale: isChapterSummaryStale(entry, chapter, args) }
  }) }
}
```

### A2. `ai-summarize-ranges` 支持 `rangeIds`
- 可选参数 `rangeIds`（string[]）：提供且非空时，只处理 id 在该集合内的 group；没有命中任何 group 返回 `{ error: 'RANGE_NOT_FOUND' }`。
- 返回 `total` 为「本次选中处理的 group 数」；stale/fresh 只统计选中集合。
- 不传 `rangeIds` 时行为与现在完全一致（现有 test-host 必须不回归）。

### A3. 摘要 SSE `POST /api/mofei/stream/ai-summarize`（+ `/api/openfic/...` alias）
- args：`{ kind: 'chapters'|'ranges', projectId, chapterIds?, rangeIds?, size?, maxChars?, maxAgeDays? }`。
- 响应事件序列（全部用 `sseEvent`）：
  - 每个待生成项生成前：`progress`，payload：
    - chapters：`{ done: 已完成数, total: 待生成总数, chapterId, title }`
    - ranges：`{ done, total, rangeId, title }`
  - 全部完成：`done`，payload 与对应非流式 handler 成功返回一致
    （chapters 含 `summaries/count/total/staleCount/freshCount/fresh`；ranges 含 `summaries/count/total/staleCount/freshCount`）。
  - 失败：`error`，payload `{ code, message }`（复用 `sseErrorFrame` 风格）。
- 实现约束：
  - 复用现有 `generateText + summaryRequest + applyChapterSummary + saveSummaries` 持久化逻辑，不要另写一套口径；
    可以把两个 handler 的循环体提炼成内部函数供 handler 与 SSE 共用（handler 的返回值保持原样）。
  - 逐项 `mutate` 落盘（与现在一致）；`progress.done` 是「本次已完成生成数」，生成前发。
  - 客户端断开处理照抄 `streamAiAssist` 的 `req.once('close')` + `llm.stream.return()` 模式。
  - `kind` 非法 → `error { code:'INVALID_KIND' }`。
- `rpcHandler` 在 L865 那行附近加：
  `if (pathname === '/api/mofei/stream/ai-summarize' || pathname === '/api/openfic/stream/ai-summarize') { await streamSummarize(req, res, body && body.args || {}); return }`

### A4. 世界书批量与名称唯一性
```js
'update-world-entries': async (args) => mutate(async () => {
  const project = projectBy(args && args.projectId); if (!project) return { error: 'PROJECT_NOT_FOUND' }
  const ids = Array.isArray(args && args.entryIds) ? args.entryIds.filter((id) => typeof id === 'string') : []
  if (!ids.length) return { error: 'INVALID_IDS' }
  const byId = new Map((project.worldEntries || []).map((entry) => [entry.id, entry]))
  const missing = ids.find((id) => !byId.has(id)); if (missing) return { error: 'WORLD_ENTRY_NOT_FOUND' }
  const patch = args && args.patch || {}
  ids.forEach((id) => { const entry = byId.get(id); if (typeof patch.isEnabled === 'boolean') entry.isEnabled = patch.isEnabled; if (typeof patch.constant === 'boolean') entry.constant = patch.constant })
  await saveProjects()
  return { entries: ids.map((id) => worldEntryView(byId.get(id))) }
}),
'delete-world-entries': async (args) => mutate(async () => {
  const project = projectBy(args && args.projectId); if (!project) return { error: 'PROJECT_NOT_FOUND' }
  const ids = Array.isArray(args && args.entryIds) ? args.entryIds.filter((id) => typeof id === 'string') : []
  if (!ids.length) return { error: 'INVALID_IDS' }
  const missing = ids.find((id) => !worldEntryBy(project, id)); if (missing) return { error: 'WORLD_ENTRY_NOT_FOUND' }
  project.worldEntries = (project.worldEntries || []).filter((entry) => !ids.includes(entry.id))
  project.worldEntries.forEach((entry, order) => { entry.order = order })
  await saveProjects()
  return { deleted: true, count: ids.length }
}),
```
- 名称唯一性：在 `create-world-entry` 与 `update-world-entry`（仅 name 变化时）校验：
  `cleanText(name)` 为空则跳过；不区分大小写去首尾空白后与同项目其他条目比较，冲突返回 `{ error: 'DUPLICATE_WORLD_NAME' }`。
  建议本地 helper：`function worldEntryNameConflict(project, name, excludeId)`。
  `import-world-info-json` **不**做唯一性校验（保持导入宽松）。

### A5. test-host 新增测试（至少 6 项，全部保持既有 23 项不回归）
- 用独立新项目隔离（像「工具 output schema」测试那样创建后删除）。
- 覆盖：
  1. `chapter-summaries` 返回全部章节 + entry/stale 正确（先 save-chapter-summary 一个）。
  2. `ai-summarize-ranges` 带 `rangeIds` 只处理选中组（造 3 章 size=2 → 两组，只传一组，mock LLM 断言只生成该组）。
  3. SSE `stream/ai-summarize`（chapters）：收到 `progress` 与 `done`，done payload 含 `fresh`；mock llm 文本仍为「摘要：测试正文。」。
  4. SSE `stream/ai-summarize`（ranges）或非法 kind error（至少覆盖一种错误路径）。
  5. `update-world-entries` 批量开关后 `list-world-entries`/project 数据落盘正确。
  6. `delete-world-entries` 批量删除后数量正确且 order 重排。
  7. `create-world-entry` 重名拒绝（含大小写不敏感）；`update-world-entry` 改成重名也拒绝、改成不重名放行。
- 若需要扩展 `sse()` helper 的 pathname 参数，允许修改 helper（保持旧调用不回归）。

自测：
```text
node --check plugin\lib\index.js
node test-host.mjs
```

## 工作包 B：摘要面板组件（新文件）

新增：`plugin/src/client/summary-panel.js` + `summary-panel.test.mjs`。不 fetch/RPC，数据全部 props。

导出：

```js
export const SUMMARY_PANEL_CSS
export function ensureSummaryPanelStyles()            // style[data-mf-summary] 去重
export function previewSummary(text, max = 120)       // 字符串化/trim/截断（码点）
export function chapterSummaryStats(rows)             // -> { total, hasSummary, stale }
export function rangeSummaryStats(ranges)             // -> { total, hasSummary }
export function progressPercent(progress)             // progress {done,total} -> null|0..100；非法安全
export function SummaryPanel(props)
```

props：
```js
{
  open: boolean, onClose(),
  projectTitle: string|null,
  chapterRows: [{ chapterId, title, order, revision, entry, stale }],
  ranges: [{ id, title, chapterIds, summary, updatedAt, hasSummary }],
  loading: boolean, error: string,
  busy: { kind: 'chapter'|'range'|'chapters'|'ranges', id?: string } | null,
  progress: { done, total, label } | null,
  result: { kind, count, total, staleCount, freshCount } | null,
  onRegenerateChapter(row), onRegenerateRange(row),
  onGenerateChapters(), onGenerateRanges(), onRefresh(),
}
```

UI 要求（class 全部 `mf-sum-*`）：
- `open` 时渲染覆盖层 `.mf-sum-overlay`（点击背景关闭）+ 对话框 `.mf-sum`（约 min(920px, 92vw)，高 78vh）。
- 头：标题「摘要」+ 项目名 + 刷新按钮 + 关闭。
- 三个 tab：`章节` / `区间` / `生成`（本地 useState）。
- 章节 tab：
  - `loading` 显示「加载中…」；`error` 显示 `.mf-sum-error`。
  - 每行：序号（order+1）、标题、badge（`无` 灰 / `过期` 橙 / `有` 绿）、`previewSummary(entry?.summary)`、
    按钮「重算」（busy 时禁用该行，其余行仍可点）。
  - 顶部统计小字：共 N 章 · 已有摘要 X · 过期 Y。
- 区间 tab：每行 range title（缺省用 rangeId）、badge（有/无）、preview、按钮「重算」。
- 生成 tab：
  - 两个主按钮：「生成全部过期章节摘要」「生成全部过期区间摘要」；busy 时对应禁用。
  - `progress` 非空显示进度条（宽度 progressPercent%）与文字 `label（done/total）`；否则 `busy` 显示「生成中…」。
  - `result` 非空显示上次结果：`生成 X 项（过期 Y / 新鲜 Z）`。
- React 惰性解析照 v0.6 组件模式（可复制 resolvePageReact 思路）。

测试 ≥12 项：previewSummary 空/长/码点截断/非字符串、stats 脏输入、progressPercent 0/完整/非法、
以及至少一个纯函数组合场景（模拟 rows）。

自测：
```text
node --check plugin\src\client\summary-panel.js
node plugin\src\client\summary-panel.test.mjs
```

## 工作包 C：世界书工具纯函数（新文件）

新增：`plugin/src/client/worldbook-tools.js` + `worldbook-tools.test.mjs`。纯函数，不渲染组件。

导出：

```js
export function filterWorldEntries(entries, query)
// 大小写不敏感：query 命中 name 或 keys 中任一 key；空 query 返回副本；非法输入返回 []
export function worldNameConflict(entries, name, excludeId)
// 与 Host DUPLICATE_WORLD_NAME 同口径：trim+toLowerCase 比较；冲突返回条目或 null（非对象安全）
export function toggleAllSelection(entries, selected, visible)
// entries/visible 为数组，selected 为数组或 Set；全部可见已选 → 清空；否则并集全部可见 id；返回新数组
export function buildBulkTogglePlan(entries, selectedIds, isEnabled)
// -> { entryIds, changed }：只包含当前值与目标不同的条目；脏输入安全 { entryIds: [], changed: 0 }
export function buildBulkDeletePlan(entries, selectedIds)
// -> { entryIds, count }：只包含存在的条目；去重保序
```

测试 ≥10 项：filter 名称/key/空 query/大小写/非法、conflict 同名/大小写/自身排除/缺失、
toggleAll 全选/反选/空集、bulkToggle 已同值跳过、bulkDelete 去重与不存在 id、非数组输入。

自测：
```text
node --check plugin\src\client\worldbook-tools.js
node plugin\src\client\worldbook-tools.test.mjs
```

## 主代理后续集成（子代理不要做）

- legacy.js 接 SummaryPanel（新 RPC/SSE + 回退逻辑）+ 世界书搜索/选择/批量 UI。
- esbuild + 全量单测 + 新增 `verify-v0.7.cjs`（需重启 DSH 后跑；写好后标注）。
- 更新 NEXT-SESSION / HANDOFF / runtime-state / GAP-ANALYSIS / v0.7.0-changelog。
