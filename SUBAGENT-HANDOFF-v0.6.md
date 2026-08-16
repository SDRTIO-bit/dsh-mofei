# SUBAGENT-HANDOFF v0.6（三栏可调宽 / 项目宽幅页 / 编辑器内容上限）

> 生成：2026-08-15。上一批（v0.5.0）已全部验证通过：test-host 23/23、verify-v7 ALL PASS、verify-v5-ui ALL PASS。
> 本批范围：GAP-ANALYSIS v0.6 三件套。**子代理只写指定文件，主代理统一集成与打包。**

## 共享约束（三个工作包都必须遵守）

- 工作目录：`F:\game\SillyTavern-1.13.2\OpenFic-DSH`
- 客户端最终打包方式：esbuild classic bundle，`external: ['react']`。
  **新建的组件文件禁止顶层静态 `import 'react'` / `import React from 'react'`**，
  否则 bundle 顶层生成 `require("react")` 会导致 classic script 加载崩溃，且纯 node 测试无法 import。
  React 一律惰性解析（参考 `plugin/src/client/project-grid.js` 的 `resolveReact()` 模式，可复用或导出它）。
- 纯函数测试文件用 `.mjs` + `node:assert/strict`，不依赖第三方包，不依赖 DOM。
- 不要改：`plugin/lib/index.js`、`plugin/lib/client.js`、`test-host.mjs`、任何 `.md`。
- 不要运行 `node plugin\esbuild.config.js`（主代理集成后统一打包）。
- 每个工作包自行验证：
  ```text
  node --check <改动/新增的 .js 文件>
  node <新增的 .test.mjs>
  ```
  全部 PASS 后再交付。
- CSS 前缀统一 `mf-`；文案中文；遵循现有 `mf-*` 样式变量（`var(--dsw-alias-*)`）。
- 交付说明写在最终回复里：改了哪些文件、新增导出签名、测试数、自测命令输出摘要。

## 工作包 A：三栏可拖拽调宽 + 布局持久化（独占 `legacy.js`）

改：`plugin/src/client/legacy.js`；新增：`plugin/src/client/layout.js` + `layout.test.mjs`。

现状（`legacy.js` 关键行）：
```js
// 约 L30
'.mf-body{display:grid;grid-template-columns:210px 250px minmax(0,1fr);min-height:0}',
// 约 L57
'.mf-panel.mf-focus .mf-body{grid-template-columns:minmax(0,1fr)}.mf-panel.mf-focus .mf-col{display:none}',
// 约 L58
'@media(max-width:760px){... .mf-body{grid-template-columns:110px minmax(0,1fr)}.mf-body>.mf-col:nth-child(2){display:none}...}',
// 约 L664-724：.mf-body 内三个子元素：
//   <aside className='mf-col'>（项目/角色/笔记/世界 tab 栏）
//   <aside className='mf-col'>（章节栏）
//   <main className='mf-editor'>
```

要求：

1. 新增纯逻辑 `plugin/src/client/layout.js`，导出：
   - `LAYOUT_DEFAULTS = { left: 210, middle: 250 }`
   - `LAYOUT_MIN = { left: 180, middle: 180 }`
   - `LAYOUT_MAX = { left: 420, middle: 640 }`
   - `EDITOR_MIN = 320`
   - `normalizeLayout(input)`：未知输入（null/undefined/非对象/非有限数字/负数/字符串数字）安全返回合法值；
     逐字段 clamp 到 min/max；**且 left+middle 不超过 containerWidth-EDITOR_MIN 时原样，否则按比例压缩使和为 containerWidth-EDITOR_MIN**
     （签名 `normalizeLayout(input, containerWidth)`，containerWidth 非法时用 1240 兜底）。
   - `nextLayout(current, axis, delta, containerWidth)`：axis 'left'|'middle'，返回 clamp 后新对象（不可变，new 新对象）；
     拖动 left 允许 left 吃掉 middle/编辑器，但 middle 不得小于 min；拖动 middle 同理且编辑器保留 EDITOR_MIN。
   - `loadLayout(storage, key)` / `saveLayout(storage, key, layout)`：storage 可能为 undefined，全部 try/catch，
     JSON 解析失败返回默认；key 默认 `'mofei.layout'`。
2. `layout.test.mjs` 至少 12 项：默认值、脏输入（null/字符串/负数/Infinity/数组）、单字段 clamp、
   组合超宽压缩、nextLayout 左右两个方向、编辑器保底、load/save roundtrip、storage 抛错安全、无 storage。
3. `legacy.js` 集成（**不要改其他功能逻辑**）：
   - `import { ... } from './layout.js'`（相对导入，esbuild 会打进同一 bundle）。
   - Workspace 内 `const [layout, setLayout] = React.useState(() => loadLayout(typeof localStorage !== 'undefined' ? localStorage : null))`
     ——注意 `loadLayout` 内部要处理无 localStorage；此处传入 null 即可。
   - `.mf-body` 不再写死列宽：CSS 改为
     `.mf-body{display:grid;grid-template-columns:var(--mf-left,210px) 6px var(--mf-middle,250px) 6px minmax(0,1fr);min-height:0}`。
   - render 时给 `.mf-body` 加 `style={{ '--mf-left': layout.left + 'px', '--mf-middle': layout.middle + 'px' }}`。
     这样 focus 与移动端 CSS 仍能整体覆盖（不改 L57/L58 的覆盖规则，但补 gutter 隐藏）。
   - 在三个子元素之间插两个 `<div className={'mf-gutter' + (dragAxis ? ' dragging' : '')} data-axis="left|middle" role="separator" title="拖动调整宽度" onPointerDown={...} onDoubleClick={reset}>`。
     第一根调整左栏宽，第二根调整中栏宽。
   - Pointer 逻辑：`setPointerCapture`；`window.innerWidth` 作为 containerWidth（面板实际宽度取 `document.querySelector('.mf-panel')?.clientWidth || window.innerWidth` 更准）；
     move 时 `setLayout(nextLayout(...))`；up 时 `saveLayout(localStorage, 'mofei.layout', layoutRef.current)` 并清 dragging 状态；
     拖动期间给 `.mf-body` 加 class `resizing`（CSS `user-select:none`）。
     `layoutRef` 用 `React.useRef(layout)` 并在每次 set 时同步，避免闭包旧值。
   - 双点击 gutter 恢复该轴默认值并保存（左轴→210，中轴→250）。
   - CSS 新增：
     `.mf-gutter{flex:0 0 6px;width:6px;min-width:6px;cursor:col-resize;background:transparent;border:0;padding:0;z-index:1}`
     `.mf-gutter:hover,.mf-gutter.dragging{background:var(--dsw-alias-state-business-primary);opacity:.55}`
     `.mf-body.resizing{user-select:none}`；
     媒体查询与 focus 规则中 `.mf-gutter{display:none}`。
   - 移动端媒体查询不要用 inline style 覆盖问题：我们用的是 CSS 变量，无需 JS 处理。
   - 面板宽度变化不强制重算；下次拖动时 clamp 即可。
4. 自测：`node --check plugin\src\client\legacy.js`、`node --check plugin\src\client\layout.js`、`node plugin\src\client\layout.test.mjs`。

## 工作包 B：项目宽幅页 + 简介编辑（新文件，顺带 export resolveReact）

改：`plugin/src/client/project-grid.js`（只加一个 `export`，其他不许动）；
新增：`plugin/src/client/project-page.js` + `project-page.test.mjs`。

要求：

1. `project-grid.js`：把 `function resolveReact()` 改为 `export function resolveReact()`，其余一行不动。
2. 新增 `project-page.js`，不发起任何 fetch/RPC，数据全部 props 传入：
   - 惰性 React：`import { resolveReact, ProjectGrid, ensureGridStyles } from './project-grid.js'`，本地 import 是安全的。
   - 导出 `PROJECT_PAGE_CSS` + `ensureProjectPageStyles()`（`style[data-mf-project-page]` 去重）。
   - 导出纯函数（供 node 测试）：
     - `normalizeDescription(text)`：`String(text ?? '')`，去首尾空白，超 500 字截断（Unicode `Array.from` 码点计数）。
     - `isDescriptionDirty(project, draft)`：`normalizeDescription(draft) !== normalizeDescription(project?.description)`。
   - 导出组件：
     ```js
     export function ProjectPage(props)
     // props = {
     //   projects: array, activeId: string|null,
     //   onPick(project), onRename(project), onDelete(project), onCreate(), onClose(),
     //   onSaveDescription(project, description),   // 用户点「保存简介」时调用
     // }
     ```
   - DOM 结构（class 全部 `mf-pp-*`）：
     - 根 `.mf-pp`（flex column，占满父容器）。
     - 头 `.mf-pp-head`：`strong`「项目」，`span.mf-pp-actions` 内 `button.mf-btn`「+ 新建」（onCreate）、`button.mf-btn`「收起」（onClose，title「返回编辑器」）。
     - `.mf-pp-body`（overflow auto，padding 14px）：内部先渲染 `ProjectGrid`（grid 默认视图在此宽容器下自然多列）。
     - 有 active 项目时，下方 `.mf-pp-detail`：
       - `.mf-pp-detail-head`：封面 `.mf-pp-cover`（首字/emoji，同 ProjectGrid 逻辑）、标题 `.mf-pp-title`、`small`「N 章」。
       - `.mf-pp-desc-label`「简介」+ `textarea.mf-pp-desc`（placeholder「一句话介绍这本书（用于搜索与项目页展示）」，
         value 本地 state，activeId 变化时用 `useEffect` 同步 `project.description`）。
       - `.mf-pp-desc-foot`：`small.mf-pp-hint`「简介用于项目网格搜索」+ `button.mf-btn.mf-primary`「保存简介」，
         disabled 条件 = 未 dirty；onClick 调 `onSaveDescription(project, normalizeDescription(draft))`。
     - 无 active 项目时 detail 区显示 `.mf-pp-empty`「选择项目后编辑简介与目标。」
   - 组件不管理删除确认（ProjectGrid 已管理），不管理目标字数（父组件 sidebar 已有）。
3. `project-page.test.mjs` 至少 8 项：normalizeDescription 空/trim/截断 500 码点/emoji 多码点、
   isDescriptionDirty 同值/不同值/undefined project、非字符串输入安全。
4. 自测：`node --check plugin\src\client\project-grid.js`、`node --check plugin\src\client\project-page.js`、`node plugin\src\client\project-page.test.mjs`。

## 工作包 C：编辑器内容上限（新文件，不碰 legacy.js）

新增：`plugin/src/client/editor-limits.js` + `editor-limits.test.mjs`。

来源：原版 `OpenFic-main/OpenFic-main/frontend/src/lib/editor-content-limits.ts`（Apache-2.0，文件头注明来源）。

1. 常量：
   - `MAX_EDITOR_CONTENT_CHARACTERS = 100_000`（Unicode 码点计数：`Array.from(content).length`）
   - `MAX_EDITOR_CONTENT_LINES = 2_000`
   - 行分隔符集合与原版一致：`\n \r \u000B \u000C \u001C \u001D \u001E \u0085 \u2028 \u2029`；
     CRLF 算一个换行；空字符串 0 行；结尾分隔符不计额外行。
2. 导出 `getEditorContentLimit(content)` → `{ lineCount, characterCount, isWithinLimit }`（行为与原版逐字符一致）。
3. 导出 `formatContentLimitError(limit)` → 中文：
   `正文超出上限：当前 ${characterCount} 字 / ${MAX_EDITOR_CONTENT_CHARACTERS} 字，${lineCount} 行 / ${MAX_EDITOR_CONTENT_LINES} 行。请拆分章节后再保存。`
   limit 字段缺失时安全兜底 0。
4. 测试至少 12 项：空串、无换行、单 \n、CRLF 只算一个、\r 单独算、尾部换行不额外计行、
   混合 Unicode 分隔符、emoji 码点计数、恰好 100000 字通过、100001 字拒绝、恰好 2000 行通过、
   2001 行拒绝、format 兜底。
5. 自测：`node --check plugin\src\client\editor-limits.js`、`node plugin\src\client\editor-limits.test.mjs`。

## 主代理后续集成（子代理不要做）

- A/B/C 结果合并进 `legacy.js`：import、projectWide 开关、ProjectPage 渲染、saveChapter 上限拦截。
- `node plugin\esbuild.config.js` 统一打包 + `tools/verify-client-bundle.mjs`。
- 全量单测 + 新增 `verify-v6.cjs` 浏览器回归（拖拽持久化 / 宽幅页简介保存 / 上限拦截）。
- 更新 NEXT-SESSION / HANDOFF / runtime-state / v0.6.0-changelog。
