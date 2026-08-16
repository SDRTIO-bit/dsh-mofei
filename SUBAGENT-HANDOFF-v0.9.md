# SUBAGENT-HANDOFF v0.9（写作记录仪表盘 / prompt chains 简版 / 继续模块化）

> 生成：2026-08-15。基线：v0.8.0 全绿（test-host 39/39 + 五浏览器回归 + 流水线冒烟）。
> 本批范围：GAP-ANALYSIS v0.9。**子代理只写指定文件，主代理统一集成。**

## 共享约束

- 工作目录：`F:\game\SillyTavern-1.13.2\OpenFic-DSH`
- 不破坏现有 46 工具/17 skills/既有 RPC。
- 客户端新组件禁止顶层 `import 'react'`；纯函数 ESM 无 DOM 无第三方依赖。
- 不要运行 esbuild；不要改 legacy.js 或既有模块（C 除新文件外零改动）；A 只改 lib/index.js + test-host.mjs（可新建 plugin/lib/prompt-chain.js + test-prompt-chain.mjs）。
- 自测全 PASS 交付：文件清单、导出/RPC 签名、测试数、输出摘要、与规格出入。

## 工作包 A：prompt chains 简版（Host）

可新建：`plugin/lib/prompt-chain.js`、`test-prompt-chain.mjs`；修改：`plugin/lib/index.js`、`test-host.mjs`。

### A1. 纯逻辑 `prompt-chain.js`

导出：
```js
export function normalizeChainStore(input)   // -> { version: 1, byProject: {} }，脏数据安全
export function compilePromptChain(template, context)
// context: { projectTitle, chapterTitle, chapterText, selected, characters, world, notes, instruction }
// 宏替换（按顺序执行，支持重复出现；未提供变量用空串）：
//   {{project}} {{chapter}} {{chapterText}} {{selected}} {{characters}} {{world}} {{notes}} {{instruction}}
// 返回替换后的字符串；template 非字符串返回 ''
export function promptChainView(chain)      // -> { id, name, content, updatedAt }
```

`test-prompt-chain.mjs` ≥14 项：store 脏输入、单/多宏、未提供变量、长文本、非字符串模板、链视图缺字段、组合顺序。

### A2. Host 持久化与 RPC

- 新数据文件 `.mofei-chains.json`：`{ version:1, byProject: { [projectId]: [{ id, name, content, updatedAt }] } }`。
- 仿 summaryStore 的模式：模块级 `chainStore`、`loadChains/saveChains`（load() 中顺带加载，文件缺失/坏 JSON 归一为空 store）、`dropChainsFor(projectId)`；`delete-project` 时调用 `dropChainsFor(project.id)`。
- 链条目：`{ id: allocate('chain'), name: text(name,'未命名链'), content: string, updatedAt: Date.now() }`。
- RPC：
```js
'list-prompt-chains': { projectId } -> { chains: [...promptChainView] }
'save-prompt-chain': { projectId, chainId?, name, content } -> mutate upsert -> { chain }
   // content 非字符串返回 { error: 'CHAIN_CONTENT_REQUIRED' }；name 可空回落未命名链
'delete-prompt-chain': { projectId, chainId } -> { deleted: true, chainId }
'compile-prompt-chain': { projectId, chainId, chapterId?, selected?, instruction? }
   // 组装 context：project.title / chapter.title / chapter.content.slice(0,12000) /
   //   selected / characters(name+description 前 200 字，join '\n') /
   //   world（enabled entries name+content 前 200 字，join '\n'）/
   //   notes（未隐藏 note title+content 前 200 字，join '\n'）/ instruction
   // -> { prompt }
'run-prompt-chain': { projectId, chainId, chapterId?, selected?, instruction?, maxTokens? }
   // 编译后走 generateText（currentModel + llm，maxTokens 默认 4096），成功后 persistAiExchange(project.id, prompt, 'prompt-chain', text)
   // -> { text, prompt, historyCount }
```
- 错误码沿用：PROJECT_NOT_FOUND / CHAIN_NOT_FOUND / CHAPTER_NOT_FOUND / LLM_UNAVAILABLE / LLM_*。
- 不注册新 Agent 工具。

### A3. test-host（新增 ≥6 项，既有 39 项全不回归）

独立项目隔离：save/list/delete 持久化（写盘后第二实例仍可读）、compile 宏替换与上下文组装、run-prompt-chain mock LLM 文本 + historyCount、delete-project 清理链数据、错误码。测试数量最终以实际新增为准（≥6）。

自测：
```text
node --check plugin\lib\prompt-chain.js
node test-prompt-chain.mjs
node --check plugin\lib\index.js
node test-host.mjs
```

## 工作包 B：写作记录仪表盘组件（新文件）

新增：`plugin/src/client/writing-dashboard.js` + `writing-dashboard.test.mjs`。纯展示，不 fetch。

导出：
```js
export const WRITING_DASHBOARD_CSS
export function ensureWritingDashboardStyles()   // style[data-mf-dashboard] 去重
export function dailyRows(days, start, end)     // -> [{ date, chars, weekday }]，按日期升序，days 脏数据安全（非对象->{}）
export function defaultRange(days, daysBack = 30) // -> { start, end }：以 days 最大日期为 end，向前 daysBack 天；无数据返回 { start:'', end:'' }
export function rangeStats(rows)                // -> { days, totalChars, average }
export function WritingDashboard(props)
// props = { open, onClose(), days, onRangeChange?, }
// 组件内部本地 state: start/end（初始 defaultRange(days, 30)）；顶部快捷按钮 近7天/近30天/全部
// UI class 全部 mf-dash-*：覆盖层 + 卡片（min(760px,92vw)）；
//   日期输入 start/end（type=date，变化后本地 state 与 onRangeChange 回调）；
//   统计条「N 天 · 共 M 字 · 日均 A 字」；
//   明细列表（.mf-dash-row）：日期 + 周几 + N 字；空列表显示 .mf-dash-empty；
//   总览热力图行保留在外部（主代理已另有），面板内不重复。
```

测试 ≥14 项：dailyRows 排序/缺字段/非法 days/范围过滤、defaultRange 无数据/30 天/单日、rangeStats 求和/均值、weekday 中文映射（日一二三四五六）。

自测：
```text
node --check plugin\src\client\writing-dashboard.js
node plugin\src\client\writing-dashboard.test.mjs
```

## 工作包 C：prompt chains 面板组件（新文件）

新增：`plugin/src/client/prompt-chains.js` + `prompt-chains.test.mjs`。纯展示，不 fetch。

导出：
```js
export const PROMPT_CHAINS_CSS
export function ensurePromptChainsStyles()       // style[data-mf-chains] 去重
export function normalizeChainName(name)         // String/trim/截 40 码点/空回退未命名链
export function chainTemplateVars(template)      // 提取 {{...}} 中受支持的 8 个宏（未知忽略），返回去重数组
export function PromptChainsPanel(props)
// props = {
//   open, onClose(), chains: [{id,name,content,updatedAt}],
//   activeChainId, onSelect(id), busy, error, result, lastPrompt,
//   onSave({ chainId?, name, content }), onDelete(chain), onRun(chain),
// }
// UI class 全部 mf-ch-*：覆盖层 + 卡片（min(860px,92vw)，高 76vh）
//   左栏链列表（.mf-ch-list）：每项名称 + 更新日期 + 删除按钮（删除由父组件两击确认后传入，组件内只调 onDelete）
//   右栏编辑器：名称 input(.mf-ch-name) + 内容 textarea(.mf-ch-content)（monospace）+ 宏提示小字（支持 {{project}} 等 8 个宏）
//     按钮：保存（无 id 则新建）/ 运行（运行当前链）/ 关闭
//   底部：busy 显示「运行中…」；error 红条；result 白条展示返回文本；lastPrompt 折叠显示本次编译提示词
```

测试 ≥12 项：normalizeChainName 空/长/码点/非字符串、chainTemplateVars 已知宏/未知忽略/去重/顺序、脏输入。

自测：
```text
node --check plugin\src\client\prompt-chains.js
node plugin\src\client\prompt-chains.test.mjs
```

## 主代理后续（子代理不要做）

- legacy.js 集成：写作热力图旁「写作记录」按钮打开 WritingDashboard（数据用 stats.days）；
  AI 面板/编辑器头部「链」按钮打开 PromptChainsPanel，接 list/save/delete/run RPC（旧 Host 回退显示错误）。
- 小步模块化：把 `countWords / fmtTime / dateKey` 抽到 `plugin/src/client/workspace-utils.js` + 单测，legacy.js 改 import（降低 legacy 体积）。
- esbuild + 全量测试 + `verify-v0.9.cjs`（仪表盘可即时验收；prompt chains 重启后验收）。
- 文档/changelog/GAP 更新。
