# 墨扉（Mofei）DSH 插件 · 子代理完整交接文档

> 用途：你拿着本文档去 DSH 官方 Web 开一个**支持子代理的会话**，把「工作包 A / B / C」
> 分别派给 2–3 个子代理并行执行。本文档自包含，子代理不需要任何额外上下文。
> 最后更新：2026-08-15，对应源码 v0.5.0（已改码，未重启）。

## 1. 项目背景（子代理必读，30 秒版）

- 墨扉是一个运行在 DeepSeek Harness（DSH）里的**小说写作平台插件**。
- 产品原则：**首先是优秀的小说写作平台，其次才是 AI 写作平台**。
- 品牌：中文「墨扉」，代码名 `mofei`，包名 `mofei-dsh`。旧 `openfic` 只是兼容别名，不要新增使用。
- 参考实现：`F:\game\SillyTavern-1.13.2\OpenFic-main\OpenFic-main`（Apache-2.0）。
  我们**借鉴它的交互与设计，但不照搬品牌，也不复制它的后端**。
- 本次子代理目标：并行推进 v0.5「平台体验批」，不碰运行时。

## 2. 硬性环境约束（违反即返工）

1. **禁止重启 DSH**。用户其他项目正在跑。
2. **禁止修改 `~/.dsh`** 下的任何文件。
3. **禁止修改 `plugin/package.json`、`plugin/lib/index.js`、`cordis.patch.yml`**（共享文件归主代理）。
4. 每个子代理**只准修改自己负责的文件**；发现跨文件需求，写 `// TODO(主代理)` 并停止越界。
5. 不要运行浏览器验证、不要调用 LLM、不要 `pnpm install`、不要改数据文件。
6. 不要改品牌名、不要新增 `openfic` 标识（旧兼容除外）。
7. 所有文本文件 UTF-8（无 BOM）。Node 命令工作目录统一为 `F:\game\SillyTavern-1.13.2\OpenFic-DSH`。

## 3. 环境地图

```text
工作区根:     F:\game\SillyTavern-1.13.2
插件源码:     F:\game\SillyTavern-1.13.2\OpenFic-DSH\plugin\
  ├── package.json              插件包 mofei-dsh v0.5.0（只读，主代理独占）
  ├── esbuild.config.js         client 构建（主代理独占；子代理可用命令构建，不改文件）
  ├── src\client\index.js       client 入口（只读）
  ├── src\client\legacy.js      UI 主文件，~110KB（工作包 A 独享）
  ├── lib\index.js              Host 半体（只读，主代理独占）
  ├── lib\txt.js / world.js / ai.js / skills.js   纯逻辑（只读）
  ├── lib\client.js             构建产物（只读，由 build 生成）
  └── web\                      独立站点静态资源（只读）
测试:         OpenFic-DSH\test-*.mjs / tools\verify-client-bundle.mjs / verify-v7.cjs
参考源码:     OpenFic-main\OpenFic-main\frontend\src\features\ 与 backend\app\
数据文件:     .mofei-*.json（旧 .openfic-*.json 自动迁移），本轮不要动
```

## 4. 当前技术状态（2026-08-15）

```text
包名 mofei-dsh v0.5.0
Host:  /api/mofei JSON RPC + /api/mofei/stream/ai-assist SSE + /mofei 独立站点
工具:  18 个 mofei_*（+18 个 openfic_* alias）
技能:  17 个 mofei-*（+17 个 openfic-* alias）
UI:    React 18，createElement 风格（代码里用 h(...)），CSS 前缀 mf-*
测试:  test-txt 9/9 · test-world 7/7 · test-ai 7/7 · test-host 17/17 · client 契约 OK
```

**改动生效规则**：改 `plugin/lib/*.js` 需重启 DSH；改 `plugin/src/client/*.js` 后运行
`node plugin\esbuild.config.js` 重新打包到 `lib\client.js`，下次刷新页面生效。
本轮不需要追求生效，只要**源码 + 单测/构建**正确。

## 5. 三个工作包（并行，文件零冲突）

### 工作包 A：编辑器体验（只改 `plugin/src/client/legacy.js`）

参考原版：
- `OpenFic-main\OpenFic-main\frontend\src\features\writing\components\chapter-editor.tsx`
- `...\writing\hooks\use-auto-save.ts`
- `...\writing\lib\editor-config.ts`（Tab 缩进、剪贴板、快捷键）

现状关键行（以当前文件为准，行号可能有 ±10 漂移）：
```text
L243 saveChapter()                 保存正文（revision 冲突保护，不要改协议）
L251 草稿 800ms debounce           保留
L252 正文 180000ms 自动保存        ← 改成 3000
L271 pickChapter(next)             切换章节，恢复草稿
L419 switchChapterTab(id)          章节标签切换
L729 编辑器头部                     当前显示 chapter.title 文本
L756 textarea onKeyDown            目前只处理 Ctrl+S / Ctrl+F
L778 页脚统计                      目前显示 String(draft.length) + ' 字符'
```

要实现的 5 项：
1. **正文自动保存 3s**：把 L252 的 `180000` 改成 `3000`。冲突/status/saving 逻辑原样保留。
2. **编辑器内联章节标题**：
   - 在正文上方（Markdown 工具条之前）加一行标题 input（class `mf-title-input`）。
   - 初始值来自 `chapter.title`；切换章节时用 `chapter.id` 作 key 或 effect 同步。
   - onChange 记录本地 state；Enter/blur 调 `call('update-chapter-meta', { projectId, chapterId, title })`，
     成功后同步 `projects` 里该章节 title、`openTabs` 对应标签 title；失败 setError 不覆盖正文。
3. **字数统计**：加纯函数 `countWords(text) = String(text).replace(/\s+/g, '').length`（中文口径）。
   L778 改为 `countWords(draft) + ' 字'`。
4. **Tab 全角缩进**：L756 onKeyDown 增加：
   - `key === 'Tab'` 且无 Ctrl/Alt/Meta：preventDefault，在 selectionStart/End 插入 `\u3000\u3000`，
     光标移到插入内容之后，复用现有 setDraft + status('unsaved') 逻辑。
5. **最后章节恢复**：
   - `pickChapter` 成功时写 `localStorage['mofei.lastChapter.' + projectId] = chapter.id`（try/catch）。
   - 项目加载完成且用户还没有选章节时（bootstrap/pickProject 后），若该 key 存在且章节仍存在则自动 pickChapter。
   - 删除章节时若 key 指向被删章节则删除该 key。

**A 验收**（工作目录 `OpenFic-DSH`）：
```text
node --check plugin\src\client\legacy.js
node plugin\esbuild.config.js
node tools\verify-client-bundle.mjs     # 必须 CLIENT BUNDLE CONTRACT OK
```
不改 lib/index.js，不动 CSS 前缀 `mf-`。

### 工作包 B：摘要体系纯逻辑（新建 `plugin/lib/summary.js` + `test-summary.mjs`）

参考原版：
- `backend\app\memory\chapter\summary_service.py`（摘要生成/过期）
- `backend\app\background\jobs\definitions\chapter_summary.py` / `long_term_summary.py`
- `frontend\src\features\writing\components\summary-panel*.tsx`

**B 只做纯逻辑，不 import lib/index.js，不调 LLM。** 导出如下（接口必须完全一致，主代理会按此接入）：

```js
// 输入任意持久化 JSON 或 undefined，输出规范 store
export function normalizeSummaryStore(input)
// -> { version: 1, chapters: { [chapterId]: { summary, chapterRevision, updatedAt } }, ranges: [] }

export function chapterSummaryView(store, chapterId)
// -> entry 或 null

export function isChapterSummaryStale(entry, chapter, options = {})
// chapter 至少含 { id, revision }；默认 maxAgeDays=30
// 过期条件：!entry || entry.chapterRevision !== chapter.revision
//          || Date.now() - entry.updatedAt > maxAgeDays*86400e3

export function applyChapterSummary(store, chapterId, chapterRevision, summary)
// 返回新 store（immutable），summary 为 string，updatedAt=Date.now()

export function buildRangeGroups(chapters, size = 10)
// chapters 按 order 升序；每 size 章一组
// -> [{ id:'range-<firstId>-<lastId>', title:`第${firstOrder+1}-${lastOrder+1}章`, chapterIds:[...] }]

export function applyRangeSummary(store, rangeId, chapterIds, summary)
// ranges 数组内按 rangeId upsert；返回新 store

export function planSummaryBatch(chapters, store, options = {})
// 返回 { stale:[chapter], fresh:[chapter], total }
// stale = isChapterSummaryStale(...) 为 true；fresh 反之；保持 order 排序
```

数据模型：
```text
store = {
  version: 1,
  chapters: { [chapterId]: { summary, chapterRevision, updatedAt } },
  ranges: [ { id, title, chapterIds, summary, updatedAt } ],
}
```

**B 验收**：`node test-summary.mjs` 至少覆盖：
```text
1. normalizeSummaryStore(null / 脏数据) 得到安全空 store
2. applyChapterSummary 不可变写入（原对象不被修改）
3. isChapterSummaryStale：缺条目 true / revision 不匹配 true / 超期 true / 新鲜 false
4. buildRangeGroups：3 章 size=2 → [2,1] 两组；order 乱序输入先排序；空数组 → []
5. applyRangeSummary upsert 与 updatedAt 更新
6. planSummaryBatch 正确分 stale/fresh 且按 order
7. 大输入性能：1000 章 planSummaryBatch < 200ms（宽松）
```
验收命令：`node test-summary.mjs` 全 PASS；`node --check plugin\lib\summary.js`。

### 工作包 C：项目网格页组件（新建 `plugin/src/client/project-grid.js` + `plugin/src/client/project-grid.test.mjs` 纯函数测试）

参考原版：
- `frontend\src\features\projects\pages\projects-page.tsx`
- `...\projects\components\projects-toolbar.tsx`
- `...\projects\components\project-card.tsx`
- `...\projects\components\project-list-item.tsx`

文件要求：
- 用 ESM，`import { createElement as h, useState } from 'react'`，**不写 JSX**（与 legacy.js 风格一致）。
- 导出组件：`export function ProjectGrid(props)`。
  props：`{ projects, activeId, onPick(project), onRename(project), onDelete(project) }`。
  project 字段至少：`{ id, title, description, goal, chapters }`。
- 功能：
  1. 视图切换按钮（网格 `grid` / 列表 `list`），默认网格；用内部 useState。
  2. 搜索框：标题/简介大小写不敏感模糊过滤。
  3. 排序下拉：`updated`（缺字段按 title）、`created`（缺字段按 title）、`title` 拼音不要求，按 localeCompare('zh-Hans-CN')。
  4. 网格卡片：首字/emoji 封面占位（不实现上传）、标题、章节数、目标进度 `goal ? min(100, round(chapters字数/goal))` 用 `chapters` 里 `content` 长度或 `order` 估算（chapters 无 content 时显示「—」）、重命名/删除小按钮（删除两击确认，armed 状态）。
  5. 列表行：标题 + 章节数 + 进度 + 操作按钮。
- 导出纯函数供单测：`export function filterProjects(projects, query)`、`export function sortProjects(projects, by)`。
- 导出 CSS 字符串：`export const PROJECT_GRID_CSS`，class 前缀 `mf-grid-*`；组件内部
  `ensureGridStyles()`（复用 document style 注入，用 data-mf-grid 标记去重）。
- 组件**不调用 fetch/RPC**，数据由父组件传入；**不修改 legacy.js**。

**C 验收**：
```text
node --check plugin\src\client\project-grid.js
node plugin\src\client\project-grid.test.mjs   # filter/sort 单测全过
```

## 6. 测试/构建命令统一（工作目录 OpenFic-DSH）

```text
node --check <文件>
node plugin\esbuild.config.js
node tools\verify-client-bundle.mjs
node test-summary.mjs                    # B 包
node plugin\src\client\project-grid.test.mjs   # C 包
```

注意：`pnpm install` 报 ignored build scripts（esbuild）是已知噪音，忽略即可。

## 7. 子代理交付格式（严格照此输出）

```text
[PACKAGE] A / B / C
[FILES] 修改/新增的文件列表
[SUMMARY] 3-5 句：做了什么、为什么
[COMPAT] 是否保持 mf-* 前缀 / mofei 品牌 / 不碰共享文件
[TESTS] 跑了哪些命令、结果原文
[RISKS] 未完成项、需要主代理接入的 TODO（若有）
```

## 8. 主代理集成顺序（子代理不用做）

```text
1. review C → 把 project-grid.js 接入 legacy.js 项目页 tab（替换现有列表）
2. review A → build + contract + verify-v7
3. review B → 把 summary.js 接入 lib/index.js：
   新增 summaries 持久化文件 .mofei-summaries.json + RPC + 批量摘要过期重算
4. 统一 build + 全套 test + 更新文档
```

## 9. 禁止事项清单

- 不重启 DSH、不碰 `~/.dsh`、不碰 profile。
- 不碰 `lib/index.js`、`package.json`、`lib/client.js`、`web/`。
- 不引入新 npm 依赖；只用 react（external）。
- 不使用 `openfic`/`OpenFic` 作为产品名；参考署名处可保留 `OpenFic-main` / Apache-2.0。
- 不做浏览器/LLM/网络验证；只做 node 级验证。

## 10. 快速自检（每个子代理开始前跑一遍）

```powershell
cd F:\game\SillyTavern-1.13.2\OpenFic-DSH
node --check plugin\src\client\legacy.js
node plugin\esbuild.config.js
node tools\verify-client-bundle.mjs
```

若最后一行不是 `CLIENT BUNDLE CONTRACT OK`，先停下向主代理报告。
