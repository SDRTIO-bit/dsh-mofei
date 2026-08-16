# 墨扉 × DSH 并行开发交接文档（WSL 侧 / 新会话专用）

> 用途：让 **WSL 里的 DSH 会话**（或任何新会话）在**零上下文**情况下接手墨扉（Mofei）开发，
> 与 Windows 侧会话**并行工作**而不互相踩踏。
> 阅读顺序：§1 现状 → §2 协作协议（先读！）→ §3 环境 → §4 架构 → §5 命令 → §6 待办分工。

---

## 1. 30 秒现状（交接时刻快照）

**用户最终拍板的方向（权威，不可回退）**：

> 「3088 是被改造的 dsh web，不是加一个墨扉的标签。」

即：`http://127.0.0.1:3088` 打开后 **整体就是墨扉 web**（写作工作台 + Agent 对话 + 底部官方 composer），
不是「官方 DSH web + 墨扉 tab」。之前的 `conversation.view` 标签方案**已废弃**。

当前实现（plan C + v0.13 布局定稿，用户 4 轮 HTML 预览确认）：

- **中 = 墨菲文字展现与修改区**：左内栏 264px（项目→章节两级导航 + 底部迷你导航）+ 编辑器。
- **右 = 缩小版 dsh web 气泡**：官方会话条（非驻留：默认「‹ 会话列表」方向键，选择/新建后收起）+ 官方质感对话（22px 圆角）+ 面板内输入框（`binding.prompt`）。
- 官方 frame 轨道压成 `0 minmax(0,1fr) 0`（⚠️ 不能 display:none 官方列——grid auto-placement 会让 centerCol 塌进 280px 轨道）；官方侧边栏/详情列/底部 composer 全部退场。
- 墨韵皮肤强制生效（overrideTokens，纯黑 + 灰阶 + 蓝 accent #4d8dff，无暖棕）。

**交接时刻验证状态**：

| 项 | 状态 |
| --- | --- |
| `verify-v0.12-view.cjs`（web 模式端到端：Studio 可见/无标签环/无 overlay/对话面板/官方 composer/发消息流式回复） | ✅ 全 PASS（8/8） |
| `verify-v0.11-chat.cjs`（web 模式改造版：唯一主面板/对话面板/官方 composer 通道/流式回复/「＋」新建/活动栏折叠展开） | ✅ 全 PASS（11/11） |
| 11 个单元测试（chat-utils 6、agent-bridge 29、project-grid 22、project-page 23、prompt-chains 35、summary-panel 40、writing-dashboard 34、editor-limits 16、workspace-utils 3、layout、worldbook-tools） | ✅ 全 PASS |
| `verify-v0.10-isolation.cjs`（web 改造：唯一主面板 3 轮回归/无叠层/无浮动/CSS 注入） | ✅ 全 PASS（21/21） |
| `verify-v0.10-workbench.cjs`（web 改造：网格卡片打开项目/编辑器/标签/状态栏/风格/命令面板） | ✅ 全 PASS（7/7） |
| 3088 服务 | ✅ 运行中（Windows 侧 detached node 进程） |
| 版本 | `plugin/package.json` = **0.12.1**（已 bump，无 BOM） |
| changelog / NEXT-SESSION.md | ✅ **已更新**（`v0.12.1-changelog.md`；NEXT-SESSION §1/§11/§12/§13 已改写为「3088=墨扉 web」叙事） |

---

## 2. 协作协议（并行开发必读）

**关键事实：WSL 与 Windows 是同一台机器**，WSL 通过 `/mnt/f` 直接读写**同一个工作树**
（`F:\game\SillyTavern-1.13.2\OpenFic-DSH` = `/mnt/f/game/SillyTavern-1.13.2/OpenFic-DSH`）。
不需要 git 同步源码（本仓库 git **只跟踪 `.mofei/` 写作数据**，源码不在 git 里！）。

由此产生三条铁律：

1. **文件租约（LEASE）**：同一时刻只有一方编辑同一文件。动手改代码前，在该文件第一行注释写
   `// LEASE: <会话标识> <日期>`（WSL 侧写 `wsl`，Windows 侧写 `win`），完成并验证后删除。
   发现文件已有别人的 LEASE → 不碰，做别的任务。
2. **禁止双服务写同一数据**：Windows 3088 进程正持有 `.mofei-*.json`（根目录）与 `.mofei/` 文件树。
   WSL 侧**不要**再起一个指向同一数据目录的 dsh 服务，否则 JSON 写竞争会损坏数据。
   WSL 需要跑服务验证时：要么先让 Windows 侧停 3088（§5.3 有命令），要么在 WSL 里用**复制出来的数据目录**验证。
   只读源码 / 只改代码是安全的。
3. **完成即留痕**：每完成一个任务，更新 `docs/CHANGELOG 对应文件` 与本文档 §6 勾选，并（若涉及数据）git commit 照旧自动。

---

## 3. 环境速查

### 3.1 路径（Windows ↔ WSL 对照）

| 内容 | Windows | WSL |
| --- | --- | --- |
| 项目根 | `F:\game\SillyTavern-1.13.2\OpenFic-DSH` | `/mnt/f/game/SillyTavern-1.13.2/OpenFic-DSH` |
| 插件目录 | `...\OpenFic-DSH\plugin` | 同上（`/mnt/f/.../plugin`） |
| 客户端源码 | `plugin\src\client\*.js`（legacy.js 为主） | 同上 |
| Host 核心 | `plugin\lib\index.js`（构建产物，别手改） | 同上 |
| 写作数据 | `OpenFic-DSH\.mofei-projects.json` 等 + `.mofei\` 目录 | 同上 |
| DSH 本体 | `C:\Users\zhao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh` | WSL 自己的安装（`which dsh` 查） |
| DSH 用户配置 | `C:\Users\zhao\.dsh\profiles\novel\cordis.patch.yml`、`.dsh\.agent-presets\mofei-writer\*` | WSL 的 `~/.dsh/...`（需自行装 preset，见 §5.5） |
| 预设仓库副本 | `OpenFic-DSH\presets\mofei-writer\*` | 同上 |

### 3.2 启动 / 重启 3088（Windows 侧命令，WSL 可远程触发但不能开第二个）

```powershell
# 查当前进程
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '3088' } | ForEach-Object { $_.CommandLine }

# 停止
Stop-Process -Id <PID> -Force

# 启动（detached，工作目录 = 项目根，数据文件解析依赖 cwd！）
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'C:\Users\zhao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js','--profile','novel','--port','3088' -WorkingDirectory 'F:\game\SillyTavern-1.13.2\OpenFic-DSH' -WindowStyle Hidden
```

### 3.3 构建客户端 bundle（改 `src/client/*` 后必做）

```powershell
cd F:\game\SillyTavern-1.13.2\OpenFic-DSH\plugin
npm run build        # esbuild → lib/client.js + verify-client-bundle.mjs 契约检查
npm run check        # node --check 所有 lib/*.js
```

`lib/client.js` 是构建产物（含 sourcemap），**不要手改**；改 `src/client/` 后重新 build。

---

## 4. 架构心智模型（必读，全是踩过的坑换来的）

### 4.1 插件构成

- `plugin/lib/index.js` — Host 核心（约 2160 行）：数据文件镜像（`.mofei-*.json`）、文件树 `.mofei/projects/`
  （project.yml + chapters/*.md）、工具注册（36 mofei_ + 36 openfic_）、RAG 检索（CJK bigram 倒排）、
  风格 CRUD、git 自动提交（节流 10s、串行队列）、Jobs 系统（批量摘要等）、RPC 通道 `/api/mofei`。
- `plugin/lib/tools.js` — Agent 工具插件；`lib/skills-plugin.js` — 17 个写作技能；
  `lib/summary.js`、`lib/prompt-chain.js` — 摘要与提示词链。
- `plugin/src/client/*.js` — 浏览器端，esbuild 打包成 `lib/client.js`：
  - `legacy.js` — 墨扉 Studio 全部 UI（`Workspace` 组件 + `apply(ctx)` 注册）；**主战场**。
  - `chat-utils.js` — 纯函数 `normalizeChatItems(snap) → items{kind: user/assistant/tool/meta}`（有单测）。
  - `agent-bridge.js` — 送章/送选中 @提及构造（`buildWriterMention`/`buildReviewerMention`）。
  - `index.js` — 入口（load/apply）。
- `plugin/web/` — vendor react 注入。

### 4.2 DSH 客户端契约（改客户端必须遵守）

- bundle 是 classic `<script>`，**不能有 import/export**；通过 `window.__ModuleLoader__.load({id:'mofei-dsh', factory})` 注册。
- `factory = (require) => exports`，`require` 由加载器注入；**跨插件 require 其他 DSH 包被硬阻断**（makeRequire）。
  `react`/`react-dom` 来自 shell seed（esbuild external）。
- 客户端运行时三件套由 package.json `dsh.client.inject` 声明：
  `@deepseek-ai/dsh-client-runtime`、`-connection`、`-ui-slots`。

### 4.3 插槽系统（本方向的核心机制）

- `ctx.slots.inject(name, () => slots.register({name, id, priority/order}, Component))`。
- **单槽（single）可整体替换**：`conversation.session` 就是 single → `slots.register({name:'conversation.session', priority:-1}, ...)` 整体接管会话视图（web 模式即此）。
- `renderSlot` 只能渲染**本 entry 自己 children 声明过的槽**，渲染别人的槽会抛错
  （"slot 'conversation.view' is not declared by this entry's children"）——
  **因此官方对话组件无法嵌入墨扉右面板**，右面板必须自绘（chat-utils 方案即为此妥协）。
- list 槽的 child key 必须唯一，重复声明会抛 "already declared"。
- 官方 `ConversationRoot` = `conversation.session` 槽 + 底部 `composerSeat`（后者替换后仍在）。

### 4.4 会话 API（右面板数据源）

- `ctx.get('sessions')`：`list.getSnapshot()/.subscribe` → `{ids, byId, current}`；
  `sessions.binding(id).session` → ObservableSnapshot `.subscribe/.getSnapshot()` → `{nodes, partial, runningCalls, running, pending}`；
  `.prompt([{type:'text',text}], 'queue'|'steer')` 发消息；`.cancel()`；`sessions.create({cwd})`。
- `pending` 数组 = 待审批/待提问 → web 模式提示「请在页面底部输入区处理」（官方 composer 会接管）。
- 预设：`agentPresets.select({sessionId, agentPreset})`（仅 blank 会话可用）。

### 4.5 主题

- `ctx.theme.register({id:'mofei', colorScheme:'dark', tokens:{'--dsw-alias-*': ...}})` + `theme.setTheme('mofei')`。
- 官方对话样式关键值：气泡 `max-width:min(525px,82%)`、`border-radius:22px`、flex 溢出修复用 `min-width:0`；
  内容宽度 `--dsh-chat-content-width:748px`。令牌 `--dsw-specific-bubble` 等。

### 4.6 web 模式渲染结构（验收选择器契约）

```
.mf-view-root                      （mode==='web' 根，flex 列）
└─ section.mf-panel.mf-view        （唯一主面板！勿与 overlay 的 .mf-panel 混淆）
   ├─ header.mf-head
   ├─ div.mf-body
   │  ├─ nav.mf-activity           （活动栏）
   │  ├─ aside.mf-col              （左列表）
   │  ├─ div.mf-mid / main         （编辑器等）
   │  └─ aside.mf-chat             （右对话面板，chatOpen 时）
   │     ├─ .mf-chat-head          （标题 + 「＋」新建）
   │     ├─ .mf-chat-body          （消息流：.mf-chat-msg.user / .assistant / .mf-chat-tool）
   │     └─ （web 模式无 .mf-chat-input —— 输入在底部官方 composer）
   └─ ...（弹层：mf-import/mf-palette/mf-hist 等）
[data-composer-seat]               （官方底部输入卡，ConversationRoot 提供）
```

---

## 5. 命令与验证

### 5.1 单元测试（改完纯函数必跑）

```powershell
cd F:\game\SillyTavern-1.13.2\OpenFic-DSH\plugin
Get-ChildItem -Recurse -Filter *.test.mjs | ForEach-Object { node $_.FullName }
```

### 5.2 浏览器验收脚本（项目根运行，需 3088 在线）

| 脚本 | 状态 | 说明 |
| --- | --- | --- |
| `verify-v0.12-view.cjs` | ✅ 已过 | **当前权威验收**：web 模式全流程（见 §1 表） |
| `verify-v0.11-chat.cjs` | ✅ 已过 | web 化：官方 composer 通道 + 面板自绘流 |
| `verify-v0.10-isolation.cjs` | ✅ 已过 | web 化：唯一面板 3 轮回归 |
| `verify-v0.10-workbench.cjs` | ✅ 已过 | web 化：工作台全流程（含 RPC 种子后 reload） |
| `verify-t5-linkage.cjs` | ✅ 已过 | T5 联动：提及跳转/插入正文/预设选择器（输入走右气泡） |
| `verify-skin-snapshot.cjs` | ✅ 已过 | 墨韵令牌采样诊断（bubble/input-major/brand 全生效） |
| `verify-shots/layout-geometry.cjs` | ✅ 已过 | 布局几何断言（官方轨道 0 / 三区块位置） |
| `verify-final.cjs` 等 3080 脚本 | 🗑 历史 | 目标 3080（旧 profile），与现状无关，**不要跑** |

### 5.3 脚本 web 化改造方法（已完成，留档参考）

旧脚本交互模型是「点侧栏 `button.mf-side` → 打开 overlay 面板 → 断言 `.mf-panel`」。
web 模式下面板常驻，点 `mf-side` 会再开一个 overlay → `.mf-panel` 匹配 2 个 → strict-mode 崩溃。

改造要点（样板：已改好的 `verify-v0.11-chat.cjs` / `verify-v0.12-view.cjs`；注意 web 模式无「×」折叠按钮，折叠走活动栏 toggle）：

1. **删掉** `page.locator('button.mf-side').first().click()` 打开步骤；web 模式直接等 `.mf-panel.mf-view`。
2. 所有 `.mf-panel` 定位改 **`.mf-panel.mf-view`**。
3. 输入框断言：web 模式**没有** `.mf-chat-input textarea` → 改用官方 composer
   `[data-composer-seat] textarea`（`fill` + `press('Enter')` 发送）。
4. 会话绑定断言：改为「输入框可用（!disabled）」；hint 文案在 `.mf-chat-empty`。
5. 折叠/展开：走活动栏「对话」按钮 toggle（web 模式 `.mf-chat-head` 无「×」）。
6. 新建会话按钮 `.mf-chat-head .mf-mini`（＋）存在性断言保留。
7. RPC 种子的数据不会自动进 UI：脚本里 RPC 写数据后加 `page.reload()` 让 bootstrap 重新拉取。

### 5.4 重启后验证一次

改客户端 → `npm run build`（契约检查通过）→ 重启 3088（§3.2）→ 跑 `verify-v0.12-view.cjs` + 受影响的脚本。

### 5.5 WSL 侧首次装配（若要跑服务）

```bash
# WSL 内（数据用副本！见 §2 铁律 2）
cd /mnt/f/game/SillyTavern-1.13.2/OpenFic-DSH/plugin
npm install          # 若 plugin/node_modules 缺失（WSL 环境独立装）
npm pack             # 产出 mofei-dsh-0.12.x.tgz
dsh plugin --profile novel install <tgz路径>   # 或按 WSL dsh 的插件安装方式
# preset 同步：把 presets/mofei-writer 复制到 WSL ~/.dsh/.agent-presets/mofei-writer
dsh --profile novel --port 3099                 # 用不同端口 + 副本数据目录，避免与 3088 冲突
```

---

## 6. 已知坑（血泪清单，勿重蹈）

1. **BOM 崩溃**：用 PowerShell `Set-Content -Encoding UTF8` 写 JSON/package.json 会带 BOM →
   DSH `ClientModuleRegistry.resolveMeta` 的 `JSON.parse` 直接崩。**改 JSON 用 node `fs.writeFileSync`（utf8）或编辑器无 BOM 保存**。
2. **slot 已声明 / 所有权**：list 槽重复注册抛错；`renderSlot` 渲染别人的槽抛错 → 不要试图把官方组件嵌进右面板，自绘。
3. **标签环**：官方 header tab 只在非 blank 会话渲染（旧方案的事，web 模式无此问题，勿回退）。
4. **双 `.mf-panel`**：web 模式下再点 `mf-side` 会叠 overlay → 测试脚本必须用 `.mf-panel.mf-view` 精确选择。
5. **中文 commit**：git 提交中文信息乱码 `??` → 用临时 UTF-8 文件 + `git commit -F file`。
6. **数据文件唯一**：`.mofei-*.json` 只能被一个 dsh 服务持有；agent 写盘走 `mofei_update-chapter`（带 `expectedRevision` 冲突保护），
   不要绕过插件直接改 JSON。
7. **saveProjects 与 git**：保存会 await `gitCommitAll`（10s 节流、串行），链保存/删除用 force=true 立即提交；
   改这块注意别引入并发提交交错。
8. **客户端构建产物**：`lib/client.js` 手改无效（build 覆盖）；`npm run build` 的契约检查会抓 external 遗漏
   （新用到的全局/require 需登记 `tools/verify-client-bundle.mjs` 的 knownExternal）。
9. **检索实现**：RAG 是本地倒排（CJK 大/单字二元组 + 签名缓存），接口预留 RRF 混合位，**等 DSH 向量生态成熟再引**，勿提前造轮子。
10. **主题机制（v0.12.1 新坑）**：`theme.setTheme('mofei')` 只改内存偏好，设置层到达时 `adopt()` 会用持久化偏好（默认 system）覆盖 → 自定义主题永不生效。
    正确姿势：`theme.overrideTokens(source, { name: { light, dark } })` 叠加层（与偏好无关，强制生效；返回 disposer 在 apply 清理时调用）。
    内置 `light`/`dark` 主题的 tokens 是**空对象**，真正的官方色板在 `dsh-client-ui-theme/lib/styles/design-platform.css` 的 `body[data-ds-dark-theme]` 选择器里——自定义主题必须自备全套令牌（见 legacy.js 的 MOFEI_INK/MOFEI_PAPER）。
11. **网格列数必须与子元素数一致（v0.12.1 血泪）**：`.mf-body` 曾定义 8 列但只有 7 个子元素 → `.mf-chat` 落进 6px 沟槽列，面板**实际不可见**，而 Playwright `waitFor(visible)` 对 6px 元素照样报 visible → 测试全绿假象。修复后给聊天面板加了**宽度断言（>200px）**。改 grid 布局时同步数子元素，验证脚本务必带几何断言（boundingBox 宽度/高度）。
12. **视觉验收用 vision 模型闭环（v0.12.1 新增）**：本会话模型不支持读图 → 本地 OpenAI 兼容端点 `http://127.0.0.1:5001/v1`（key=`1`）有 `deepseek-v4-vision`。
    流程：`verify-shots/capture-mofei.cjs` 截三态 → `verify-shots/vision-look.cjs <图...>` 英文审查 → 修 → 复截复核。
    vision 抓过的真问题：空态占位符对比不足、危险操作纯红小字、actions 挤压重叠、官方 composerHero 杂讯（`[class*="composerHero"]` 隐藏）、placeholder 文案（`ta.dataset.mofeiPh` 一次性改写）。

---

## 6b. 待办与分工（建议，按文件隔离）

> 规则：改文件前检查该文件有无 `// LEASE:` 注释（见 §2）。

| # | 任务 | 建议归属 | 涉及文件（租约） | 说明 |
| --- | --- | --- | --- | --- |
| ~~T1~~ | ~~`verify-v0.11-chat.cjs` web 化~~ | ✅ **已完成**（Windows 侧） | verify-v0.11-chat.cjs | 11/11 PASS |
| ~~T2~~ | ~~v0.12.1 changelog + NEXT-SESSION.md 改写~~ | ✅ **已完成**（Windows 侧） | v0.12.1-changelog.md、NEXT-SESSION.md §1/§11/§12/§13 | 旧叙事→「3088=墨扉 web」 |
| ~~T3~~ | ~~`verify-v0.10-isolation.cjs` + `verify-v0.10-workbench.cjs` web 化~~ | ✅ **已完成**（WSL 改造 → Windows 侧实测通过，LEASE 已清除） | 两个 verify 脚本 | isolation 21/21、workbench 7/7（workbench 实测时补了一处：RPC 种子数据后需 `page.reload()` 让 UI bootstrap 重新拉取） |
| ~~T4~~ | ~~墨韵皮肤打磨（补 `--dsw-specific-bubble`/input-major 等令牌、浅色变体）~~ | ✅ **已完成**（Windows 侧，2026-08-16） | legacy.js（MOFEI_INK/MOFEI_PAPER 常量 + apply 主题块） | 完整覆盖官方全部令牌；**机制修正**：`setTheme('mofei')` 会被设置层 `adopt()` 覆盖回默认 → 改用 `theme.overrideTokens('mofei-dsh', pairs)` 叠加层强制生效（含宣纸浅色变体）；浏览器令牌采样验证生效 + 全量回归绿 |
| ~~T5~~ | ~~对话面板增强：审批面板内应答、新建会话预设选择、@提及跳转/回复插入正文~~ | ✅ **已完成**（Windows 侧，2026-08-16） | legacy.js（PendingCard + 预设选择 + 联动）+ verify-t5-linkage.cjs | PendingWait.respond（approval: `{sessionId,approvalId,outcome}`；question: `{sessionId,answer:{answers}}`）、agentPresets.list、提及解析 `projectId:/chapterId:`；**顺带修复 .mf-body 网格 8→7 列**（聊天面板此前一直塌缩在 6px 沟槽列，测试误报通过） |
| T6 | RAG/检索增强、Prompt Chains diff | 任一侧 | lib/index.js + src/client/ | 先读 docs/OPENFIC-RESEARCH.md 再动手 |
| T7 | 用户真实使用验证（收官前必须） | **用户本人** | — | NEXT-SESSION.md §13 清单 |

**当前无未完成的 Windows 侧租约**（T1–T5 已交）。WSL 可领 T6（RAG/检索增强、Prompt Chains diff）。

---

## 7. 交接时的精确状态（防漂移锚点）

- git HEAD：`6e76ec5`（本仓库只跟踪 `.mofei/` 数据，源码不在 git）。
- `plugin/package.json` version = `0.12.1`（node 写入，无 BOM）。
- 3088 在线；最后全量回归（本会话 2026-08-16）：`verify-v0.12-view` 9/9、`verify-v0.11-chat` 12/12、
  `verify-v0.10-isolation` 21/21、`verify-v0.10-workbench` 7/7、`verify-t5-linkage` 4/4、`verify-skin-snapshot` 令牌采样全生效
  —— **6 项全绿**（含聊天面板宽度断言，网格塌缩已修复）。
- 11 个单元测试文件全部 PASS（§1 表）。
- 客户端构建契约：`CLIENT BUNDLE CONTRACT OK`。
- 权威文档：`NEXT-SESSION.md`（理念 §0 必读，§1 已同步为 web 模式现状）、`v0.12.1-changelog.md`、
  `docs/MOFEI-SPEC.md`、`docs/OPENFIC-RESEARCH.md`、`AGENTS.md`（mofei_* 工具与写作流水线）。
