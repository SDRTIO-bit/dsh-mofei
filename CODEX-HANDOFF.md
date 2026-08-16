# 墨扉（Mofei）× DSH —— 交接给 Codex 的开发文档

> 生成时间：2026-08-16（v0.14.1 之后，写作隔离改造进行中）。
> 读者：接手本项目的 Codex（或其他编码 Agent）。
> 请先读 §1（用户最新反馈）和 §5（未完成工作），再动代码。

---

## 0. 一句话现状

墨扉是一个 DSH 插件（`novel` profile，端口 3088），把 DSH web 变成小说写作环境。
当前形态（v0.14.1）用户已认可**布局**（原版 web + 变形金刚式墨扉气泡），但**不满意**：
① UI 审美；② **写作状态隔离**（最重要，正在修，未验证完）。

---

## 1. 用户最新反馈（原话要点，最优先处理）

1. 「不行，做的不太好，我打算交给 codex 完成，因为其审美更好」——UI 审美交给 Codex 重做。
2. 「最主要的是没有做好隔离」：
   - 变形进入墨扉（写作状态）后，**仍能看到正常 coding 的对话**（会话历史混杂）；
   - **仍能正常使用 coding 工具**（bash/pwsh/fs 等）；
   - 让其写小说「一问三不知」；
   - 甚至想在本地项目里「搞一个小说平台」（AI 把写小说理解成 coding 任务）。
3. 用户目标：写作状态下，AI 是**纯写作助手**——写作 persona、只有写作工具、
   不碰 coding 工具、不碰项目文件、不想搭平台。

**根因（已定位）**：`mofei-writer` agent preset 原本是 standard 预设的原样拷贝
（persona 是 "You are a coding agent…"，coding 工具全保留），只是额外挂了墨扉工具。
写作会话里的 AI 自然还是 coding 思维。

---

## 2. 环境与常用命令

```powershell
# 项目根（源码 + 数据 + 回归脚本）
cd F:\game\SillyTavern-1.13.2\OpenFic-DSH

# 客户端构建（改 plugin/src/client/* 后必做；lib/client.js 是构建产物，勿手改）
cd F:\game\SillyTavern-1.13.2\OpenFic-DSH\plugin
npm run build        # esbuild → lib/client.js + 契约检查（新增全局/require 需登记 tools/verify-client-bundle.mjs 的 knownExternal）

# 重启 3088（改代码后必重启）
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '3088' } | Select-Object -First 1
if ($p) { Stop-Process -Id $p.ProcessId -Force; Start-Sleep -Seconds 2 }
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'C:\Users\zhao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js','--profile','novel','--port','3088' -WorkingDirectory 'F:\game\SillyTavern-1.13.2\OpenFic-DSH' -WindowStyle Hidden

# 单元测试（plugin 目录）
Get-ChildItem -Recurse -Filter *.test.mjs | ForEach-Object { node $_.FullName }

# 浏览器回归（项目根；需 3088 在线）
node verify-v0.14-view.cjs        # 18 项：默认原版 web + orb 变形 + 还原 + 双入口
node verify-v0.14-chat.cjs        #  9 项：官方 composer 两态可用 + 联动按钮
node verify-v0.14-writing.cjs     #  7 项：写作状态按钮（徽标/切换/新建）
node verify-v0.14-isolation.cjs   #  写作隔离端到端（未调通，见 §5）
node verify-v0.14-workbench.cjs   #  7 项：工作台全流程
node verify-v0.14-isolation2.cjs  #  （不存在；v0.14-isolation.cjs 就是隔离验证，名字易混）
node verify-v0.14-t5.cjs          #  3 项：送章→官方对话→插入回复（真实 LLM 回合）
node verify-shots/layout-geometry.cjs   # 两态几何
node verify-shots/capture-mofei.cjs     # 三态截图（mofei-01-default/02-transformed/03-workspace.png）
node verify-shots/vision-look.cjs verify-shots/mofei-0*.png   # 视觉审查（本机 vision 网关，英文输出）

# 旧脚本 verify-v0.10/0.11/0.12/verify-t5-*.cjs 断言「全屏墨扉」旧形态——已废弃，跑了 FAIL 属预期，勿跑。
```

DSH 本体：`C:\Users\zhao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh`
（读官方源码时用，如 dsh-agent-presets / dsh-host-apiproxy 的预设与 RPC 机制）。
Playwright：`C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright`。

---

## 3. 架构速览（接手前必懂）

- **DSH = 一切皆插件**。墨扉是 `plugin/` 包（package.json name=mofei-dsh），装在 novel profile
  （`cordis.patch.yml` 只挂 `./plugin`；默认 web profile 不加载墨扉 → standard 会话零墨扉）。
- **插件两半**：
  - **Host 半区** `plugin/lib/index.js`（~2160 行，勿手改——是源码但即构建产物）：数据文件
    `.mofei-*.json` + 文件树 `.mofei/projects/**/*.md`、82 个 RPC（`POST /api/mofei`）、
    36+36 Agent 工具（tools.js）、17+17 写作技能（skills-plugin.js）、RAG、git、Jobs。
  - **Client 半区** `plugin/src/client/*.js` → esbuild 成 `lib/client.js`（classic script，
    `window.__ModuleLoader__.load({id:'mofei-dsh', factory:createClient})`）。
- **当前 web 形态（v0.14.1，用户认可布局）**：
  - 默认 = 原版 DSH web 完整（官方侧栏/对话/composer 全可见）+ 右下角圆形「墨」orb 按钮。
  - 点 orb → 0.32s 变形：官方侧栏走官方折叠机制收成 55px 窄条（点击 `[class*="hHd-Xa_toggle"]` 同步）、
    官方对话+composer 被 CSS 挤到右侧 430px（`body.mf-transform [class*="centerCol"] [class*="root"]{padding-left:calc(100% - 446px)}`）、
    墨扉工作台（`.mf-bubble-panel`）从左侧滑入。收起走工作台顶栏「✕ 收起」（`onCollapse`）。
  - 墨扉挂 **shell.overlay 槽**（不再替换 conversation.session）；官方对话是官方原组件，不可侵入。
  - 写作联动（官方对话不可加按钮 → 移到墨扉侧）：编辑器头部「送章/送选中」写官方会话、
    「📄 跳转提及」「⌄ 插入回复」（助手回复完成后出现）。
- **写作状态机制（官方 API，读源码确认）**：
  - 写作状态 = 会话挂 `mofei-writer` agent preset。
  - `POST /api/agentPreset.select`：仅 **blank 会话**（事件流无 `turn/start`）可 recompose 预设；
    已开始会话返回 `agent-preset-locked`（官方设计，勿试图绕过）。
  - `POST /api/session.create` payload 直接支持 `agentPreset`（创建即写作会话）。
  - 客户端 RPC 信封：`{ type:'client-request', rpcId:'<string>', method, payload }`，
    端点 `POST /api/<method>`（如 `/api/session.create`、`/api/session.list`、`/api/session.history`、`/api/session.prompt`）。
  - `session.history` 响应字段是 **`events`**（不是 items）；事件结构含 `type`（含 'assistant'/'agent' 字样）与 `data`（text 或 blocks）。
  - 墨扉 UI 按钮逻辑在 legacy.js `enterWritingMode()`：blank 会话原地 select；locked/已开聊 → 新建写作会话并打开；已是写作会话 → 提示。

---

## 4. 关键文件

```text
plugin/src/client/legacy.js    墨扉全部 UI（MofeiBubble/变形 CSS/工作台/写作状态按钮/联动）——主战场
plugin/src/client/project-grid.js  项目网格（overlay 模式用；web 模式用 legacy.js 内 .mf-proj 极简行）
plugin/lib/index.js            Host 核心（RPC/工具/检索/git/Jobs）
plugin/lib/tools.js            36 mofei_ + 36 openfic_ Agent 工具
plugin/lib/skills-plugin.js    17+17 写作技能注册（技能定义在 plugin/lib/skills.js）
presets/mofei-writer/          ★ 写作 agent preset（agent.cordis.yml + preset.yml）——隔离改造主战场
C:\Users\zhao\.dsh\.agent-presets\mofei-writer\   ★ 运行时加载的副本（改 preset 后必须同步这里 + 重启）
skills/mofei-writing.md        写作红线（persona 内容参考此文档）
preview-mofei-v2.html          用户曾确认的设计稿（v0.13 时代；现布局已按用户新拍板变形金刚化，仅参考配色）
BUGFIX-HANDOFF.md              历史交接文档（§9 有本会话执行记录）
HANDOFF-WSL.md                 并行开发交接/坑位清单
NEXT-SESSION.md                理念（§0 必读：墨扉绝不污染 DSH、写作域边界）
AGENTS.md                      mofei_* 工具清单与 Writer/Reviewer 流水线
verify-v0.14-*.cjs             6 个回归脚本（view/chat/writing/isolation/workbench/t5）
```

---

## 5. 已完成但未验证的工作（Codex 接手第一件事）

### 5.1 写作隔离预设重写（已完成代码，验证中断）

已重写两处文件（内容一致）：
- `presets/mofei-writer/agent.cordis.yml`
- `C:\Users\zhao\.dsh\.agent-presets\mofei-writer\agent.cordis.yml`

改动内容：persona 改为中文写作助手（明确「你不是编程助手，不写代码、不操作项目文件、不搭平台」+
写作纪律）；**移除** bash/pwsh/fs/fs-search/jobs/goal/workflow/ralph/plan-mode；
**保留** tool-skill、mofei-tools、mofei-skills、ask-user、todo、web(fetch:false)、
subagent+subagent_fork（Writer→Reviewer 流水线，子代理继承本预设）、compaction。

**验证状态**：3088 已用新预设重启；`session.create({agentPreset:'mofei-writer'})` 挂载成功；
`session.prompt` accepted 且会话真实跑完一轮（blank→false）；但 **history 事件解析没调通**
（最后一轮调试 probe-hist3.cjs 被中断）。`verify-v0.14-isolation.cjs` 已按 `events` 字段改写，
未跑通。**Codex 第一步：跑 `node verify-v0.14-isolation.cjs`，用 probe-hist3.cjs 的思路
把 history 事件结构摸清，确认写作会话回复 persona 是写作助手。**

### 5.2 开发会话误切事故（已处理）

本开发会话（SillyTavern-1.13.2 那条）曾被 select 成 mofei-writer。已用后台脚本
`tools/switchback-mofei.cjs`（循环 select 回 router-standard）处理完毕，最后状态 ALL CLEAR
（无残留 blank 的 mofei-writer 会话；locked 的历史测试子代理会话切不动，可留可删）。

### 5.3 探针/调试脚本残留（可清理）

根目录：`probe-list.cjs`、`probe-hist.cjs`、`probe-hist2.cjs`、`probe-hist3.cjs`、
`probe-switchback.cjs`；`tools/switchback-mofei.cjs`（这个建议保留，切回会话有用）。
`verify-v0.14-isolation.cjs` 是正式回归脚本（保留）。

---

## 6. 待办清单（按优先级）

- **P0 写作隔离验证收尾**（§5.1）：确认写作会话回复 persona 为写作助手、
  工具目录无 coding 工具（可在写作会话里问「列出你的工具」验证）。
  若 persona 仍不对：检查 persona 插件是否读取 `config.text`（参考 dsh-persona 插件源码）。
- **P1 UI 审美重做**（用户交给 Codex 的主任务）：重点区域——右窄条 430px 内官方 composer 拥挤、
  工作台视觉细节（徽标/按钮/状态栏密度）、变形动画手感。可参考 preview-mofei-v2.html 的配色
  （纯黑 #0a0a0a + 灰阶 + 唯一蓝 accent #4d8dff，无暖棕）。
- **P2 会话历史隔离**：用户不满「写作状态还能看到 coding 对话」。官方侧栏列表是官方 UI，
  墨扉不便干预；可考虑：官方列表按 preset 分组展示（官方功能，观察是否有），或墨扉工作台内
  提供「只显示写作会话」的会话切换条。方向需与用户确认。
- **P2 其它**：locked 的历史测试子代理会话清理工具；v0.14.2 changelog（本轮 preset 改造未写）。
- **P3 backlog**（NEXT-SESSION.md §2-§8）：检索增强、链版本 diff、写作时长记录、Agent 操作审计。

---

## 7. 血泪坑清单（勿重蹈）

1. **BOM 崩溃**：PowerShell `Set-Content -Encoding UTF8` 写 JSON/package.json 会带 BOM →
   DSH 解析崩溃。改 JSON 用 node `fs.writeFileSync(p, ..., 'utf8')`。
2. **官方 frame 是 grid**：隐藏官方列**不能用 display:none**（grid auto-placement 会让 centerCol
   塌进第一列轨道 → 整页压扁）。v0.13 时代用轨道压 0；v0.14 已撤销（原版 web 保留）。
3. **slot 所有权**：renderSlot 只能渲染本 entry 声明的槽；官方对话组件无法嵌入墨扉面板 → 自绘或联动外置。
4. **agentPreset.select 仅 blank 会话**：已开始会话 `agent-preset-locked`；`agent-busy` 表示会话正在跑，
   需等空闲。会话一旦产生 `turn/start` 事件即锁定（官方设计）。
5. **官方哈希类名**：`hHd-Xa_*`/`wSkVaW_*`/`pI_x6G_*` 前缀是构建哈希，选择器靠语义段
   （`_root`/`_toggle`/`centerCol`/`composerSeat`/`scrollBody`/`composerHero`）。centerCol 与对话根之间
   隔着一个 `display:contents` 包装层 → 用后代选择器而非 `>` 直接子选择器。随 DSH 升级需复核。
6. **客户端构建产物**：`lib/client.js` 手改无效；改 `src/client/*` 后 `npm run build`。
7. **数据文件唯一**：`.mofei-*.json` 只能被一个 dsh 服务持有；勿在 3088 运行时开第二个指向同目录的服务。
8. **客户端 RPC 信封**：官方 `/api/<method>` 需要 `{type:'client-request', rpcId, method, payload}`，
   `method` 必须与 URL 路径段一致（如 `/api/session.create` + method='session.create'）。
9. **回归脚本会向当前 DSH 会话注入测试消息**（既有工作流副作用，历史一致）；跑含 LLM 回合的脚本
   （t5/isolation）会真实消耗模型调用。
10. **grid 列数 = 子元素数**：flex/grid 布局改动后验证脚本务必带几何断言（boundingBox），
    防止「6px 沟槽塌缩测试全绿假象」复发。

---

## 8. 验证手段总结

- 6 个浏览器回归脚本（§2）+ 11 个单元测试文件 + layout-geometry（几何）+ vision-look（视觉）。
- 视觉审查模型：本会话模型不支持读图 → 用 `verify-shots/vision-look.cjs`（本地 vision 网关
  http://127.0.0.1:5001/v1，key=1，模型 deepseek-v4-vision，英文输出）。
- 改 UI 后闭环：npm run build → 重启 3088 → capture-mofei.cjs 截图 → vision-look → 修 → 复截。
- 改 preset 后闭环：同步 presets/ 到 ~/.dsh/.agent-presets/ → 重启 3088 →
  session.create({agentPreset:'mofei-writer'}) + prompt 实测回复。

---

## 9. 收尾前检查

- [ ] verify-v0.14-isolation.cjs 跑通（写作隔离验证）
- [ ] 写作会话实测：问「你是谁」→ 回复是写作助手；问「列出工具」→ 无 bash/pwsh/fs
- [ ] 6 个回归脚本全绿 + 单元测试全绿
- [ ] 清理根目录 probe-*.cjs
- [ ] v0.14.2-changelog.md + package.json bump（本轮 preset 改造）
- [ ] 与用户确认 UI 审美方向后动手改视觉

祝顺利。
