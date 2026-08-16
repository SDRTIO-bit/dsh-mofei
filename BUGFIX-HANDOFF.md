# 墨扉 Bug 排查交接文档（新会话专用）

> 用途：接手 **3088 = 墨扉 web** 的 bug 排查与「实现 vs 预览」对齐工作。
> 作者会话已尽力交付 v0.13.0，用户反馈「有不少 bug，且实现与 HTML 预览有出入」，决定换新会话继续。
> **先读**：本文档 → `HANDOFF-WSL.md`（架构/协作/坑）→ `NEXT-SESSION.md`（理念/实测清单）→ `v0.13.0-changelog.md`（本版改动）。

---

## 1. 三十秒现状

- **版本**：`plugin/package.json` = **0.13.0**；3088 正在运行（Windows 侧 detached node，`--profile novel --port 3088`，工作目录 = `F:\game\SillyTavern-1.13.2\OpenFic-DSH`）。
- **定稿布局**（用户 4 轮 HTML 预览确认）：
  - **中 = 墨菲文字展现与修改区**：左内栏 264px（项目 → 章节两级导航 + 底部迷你导航）+ 编辑器（标签页/标题/工具条/正文/状态栏）。
  - **右 = 缩小版 dsh web 气泡**：官方会话条（**非驻留**：默认仅「‹ 会话列表」方向键，点击弹出列表，选择/新建后收起）+ 官方质感对话（22px 圆角深灰气泡 + ⚙ 工具帧 + PendingCard 审批 + 预设选择）+ **面板内输入框**（底部官方 composer 已隐藏）。
- **配色**：纯黑 `#0a0a0a` + 灰阶文字 + **唯一蓝 accent `#4d8dff`**（无暖棕；本轮刚完成双色板重配色，令牌采样已确认生效）。
- **唯一权威设计稿**：`preview-mofei-v2.html`（v5 最终版，浏览器打开即看）。

## 2. 用户反馈（未细说，需实测确认）

1. **「有不少 bug」** —— 未列举。建议新会话按 §4 的差异清单 + 实际点一遍找。
2. **「感觉跟前面的 html 有出入」** —— 实现保留了大量功能区，预览更极简，详见 §4。

## 3. 技术速查（新会话必备）

```powershell
# 构建客户端（改 src/client/* 后必做；产物 lib/client.js 勿手改）
cd F:\game\SillyTavern-1.13.2\OpenFic-DSH\plugin
npm run build        # esbuild → lib/client.js + 契约检查

# 重启 3088（改完必重启，页面缓存另说）
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '3088' } | Select-Object -First 1
if ($p) { Stop-Process -Id $p.ProcessId -Force; Start-Sleep -Seconds 2 }
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'C:\Users\zhao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js','--profile','novel','--port','3088' -WorkingDirectory 'F:\game\SillyTavern-1.13.2\OpenFic-DSH' -WindowStyle Hidden

# 回归（项目根跑；需 3088 在线）
node verify-v0.12-view.cjs / verify-v0.11-chat.cjs / verify-t5-linkage.cjs / verify-v0.10-workbench.cjs / verify-v0.10-isolation.cjs
# 单元测试
Get-ChildItem plugin -Recurse -Filter *.test.mjs | ForEach-Object { node $_.FullName }

# 看图（本会话模型不支持读图时，用本地 vision 网关）
node verify-shots/capture-mofei.cjs                          # 截当前两态
node verify-shots/vision-look.cjs verify-shots/mofei-0*.png  # vision 审查（英文输出）
node verify-shots/layout-geometry.cjs                        # 布局几何断言
```

## 4. 实现 vs 预览差异清单（「出入」重点排查区）

| # | 预览 v5（用户认可） | 实现 v0.13.0 | 差异性质 |
| --- | --- | --- | --- |
| 1 | 项目卡片：封面块 + 标题 + 字数/章数，**无操作按钮** | `ProjectGrid` 卡片：+ 进度条 + 重命名/删除按钮（vision 批"进度条细、按钮小挤"） | **视觉重** |
| 2 | 章节行：标题 + revision，**无按钮** | 章节行：`卷/↑/↓/×` 四个 MiniButton（vision 批"小、挤"） | **视觉重** |
| 3 | 章节视图头部：← 返回 + 项目名 + 搜索 + 新建 | 实现一致 | OK |
| 4 | 底部状态栏：字数 + 今日/连续/累计 | 实现 foot 还带 **任务/写作记录/写作热力图/保存正文** 按钮 | **视觉重** |
| 5 | 项目视图头部：无「宽幅」 | 实现保留「宽幅/收起」按钮 + 目标字数 goal 区块 | **视觉重** |
| 6 | 右气泡三段（会话条/对话/输入） | 实现一致（402px vs 预览 430px） | 接近 |
| 7 | 顶栏：墨扉 + 项目名 + 风格/命令/导入/新建 | 实现 mf-head 一致（多 导出/保存状态） | 接近 |
| 8 | 编辑区空态「开始写作…」 | 实现「选择章节后开始写作。」+ foot 字数 | 接近 |
| 9 | 配色纯黑+蓝 | 本轮已重配色生效 | ✅ 已修 |

**结论**：主要出入 = 实现里 `ProjectGrid`/章节行/状态栏的**功能按钮密度**高于预览的极简形态。是否精简（隐藏次要按钮/收入右键或 hover 才显示）需用户拍板，但这是最可能的"出入"来源。

## 5. 已知问题池（按优先级）

- [ ] **用户报"不少 bug"未细说** —— 实测复现清单：两级导航返回、会话条收放、右气泡发消息、新建项目/章节、迷你导航切 tab、弹层（命令面板/导入/历史）、专注模式、宽幅页。
- [ ] vision 视觉瑕疵：项目卡进度条细/按钮小、章节行按钮小、左导航「未分卷 1 章」字小、工具条图标小淡、Agent 对话标题挤、编辑区空态状态栏"漂浮"。
- [ ] `verify-v0.11-chat.cjs` 里 "Activity Bar 含「对话」按钮" 断言已失效语义（activity 隐藏但 DOM 在，count 仍过）——可清理。
- [ ] `verify-skin-snapshot.cjs` 过时（依赖已隐藏的 `[data-composer-seat]`），采样逻辑已迁移到临时内联脚本 —— 需要时可重写为 body 令牌采样。

## 6. 已踩的坑（改代码前必读，详细见 HANDOFF-WSL.md §6）

1. **官方 frame 是 grid**：隐藏官方列**不能用 display:none**（grid auto-placement 会让 centerCol 塌进 280px 轨道 → 整页压扁）。当前用 `[class*="_frame"]{grid-template-columns:0 minmax(0,1fr) 0 !important}` 压轨道。哈希类选择器依赖语义段（`_frame`/`sidebarCol`/`detailsCol`/`composerHero`）。
2. **主题**：`setTheme` 会被设置层 adopt 覆盖 → 用 `theme.overrideTokens('mofei-dsh', {light,dark} 对)` 强制生效；双色板常量在 legacy.js 顶部（`MOFEI_INK`/`MOFEI_PAPER`）。
3. **JSON 别用 PowerShell `Set-Content -Encoding UTF8`**（BOM 会崩 DSH 解析）；改 package.json 用 node。
4. **客户端构建产物**：手改 `lib/client.js` 无效，改 `src/client/*` 后 `npm run build`。
5. **grid 列数 = 子元素数**（之前 chat 塌进 6px 沟槽的教训）；验证脚本务必带几何断言（boundingBox）。
6. **数据文件唯一**：`.mofei-*.json` 只能一个 dsh 服务持有；别在 3088 运行时开第二个指向同目录的服务。

## 7. 关键文件

```text
plugin/src/client/legacy.js      一切 UI（Workspace + apply + 双色板 + PendingCard + 会话条 + 两级导航）
plugin/src/client/project-grid.js 项目网格/列表（预览差异 #1 所在）
plugin/src/client/chat-utils.js   对话快照纯函数
plugin/src/client/agent-bridge.js 送章/送选中提及
plugin/lib/index.js               Host 核心（工具/RAG/风格/git/Jobs/RPC）
preview-mofei-v2.html             唯一权威设计稿（v5）
HANDOFF-WSL.md                    架构/协作/坑位（详细）
NEXT-SESSION.md                   理念/完成定义/§13 实测清单
v0.13.0-changelog.md              本版变更与验证
verify-*.cjs                      浏览器回归（项目根）
verify-shots/                     截图/vision/几何脚本
```

## 8. 给新会话的开场建议

1. 打开 `preview-mofei-v2.html` 与 `http://127.0.0.1:3088` 并排；
2. 跑一遍 §5 的实测清单，复现用户说的 bug；
3. 对 §4 差异逐项与用户确认取舍（是否精简卡片/章节行/状态栏按钮）；
4. 修复后 `npm run build` → 重启 3088 → 5 个回归脚本 + 单元测试全绿 → 截图 vision 复核；
5. 走 NEXT-SESSION §13 实测后收官。

---

## 9. 交接会话执行记录（2026-08-16，v0.14.1 已交付）

> 本交接由新会话接手并完成三轮：
> ① v0.13.1：bug 复现 + 实现向 preview v5 对齐（见 §9a 与 `v0.13.1-changelog.md`）；
> ② v0.14.0：用户重新拍板「原版 web + 变形金刚式墨扉」，推翻全屏形态（见 §9b 与 `v0.14.0-changelog.md`）；
> ③ **v0.14.1：写作状态——让 AI 会话进入 mofei-writer**（见 §9c 与 `v0.14.1-changelog.md`）。
> 当前 3088 运行 **v0.14.1**。

## 9a. 第一轮（v0.13.1，已被 v0.14.0 取代）

- 修复迷你导航竖向窄条 bug；web 模式对齐 preview v5（极简项目行/章节行 hover 显现/状态栏精简/宽度 250+430）。
- 5 个回归脚本 + 11 单元测试当时全绿。

## 9b. 第二轮（v0.14.0，当前形态）—— 用户新拍板

> 用户明确：墨扉不是独立界面/新界面/覆盖层；**原版 web 完整保留，墨扉 = 加在原版 web 上的气泡**；
> 一个按钮点击 → 同一页面像变形金刚一样变形，墨扉部件冒出来；再点还原。AI 写作是重点。

### 两态变形（已交付）

| 状态 | 形态 |
| --- | --- |
| 默认 | 原版 DSH web 完整（官方侧栏 280 / 官方对话 / 官方 composer 全可见）+ 右下角圆形「墨」orb 按钮；墨扉面板屏幕外；无遮罩无叠层 |
| 点 orb 变形 | 官方侧栏走**官方原生折叠**收成 55px 窄条（图标保留可点）；官方对话+composer 挤到右侧 430px；墨扉工作台（左内栏+编辑器+迷你导航）从左侧滑入（0.32s 过渡）；orb 退场，顶栏「✕ 收起」还原 |
| 双入口 | 官方侧栏底部「墨扉」入口同样触发变形 |

### 撤销的旧方案

- 不再替换 conversation.session（官方对话回归）；不再压 frame 轨道；不再隐藏官方 composer/hero；自绘对话面板退役。

### AI 写作联动（官方对话不可侵入 → 联动在墨扉侧）

- 「送章/送选中」注入官方会话 ✓；新增「📄 跳转提及」「⌄ 插入回复」（助手回复完成后出现）✓。

### 验证（全绿）

- verify-v0.14-view 18 / v0.14-chat 9 / v0.14-t5 3（真实回合）/ v0.14-workbench 7 / v0.14-isolation 21
- 单元测试 11 文件；layout-geometry 两态；vision 三态复核。
- 旧 verify-v0.10/0.11/0.12/verify-t5 断言「全屏墨扉」形态，**已废弃勿跑**（跑了 FAIL 属预期）。

### 遗留

- 依赖官方哈希类名的三处选择器（hHd-Xa_root/toggle、centerCol、composerSeat）随 DSH 升级需复核。
- 430px 右窄条内官方 composer 控件较紧凑（用户拍板 430px，实际使用再看）。
- §5 旧问题池：verify-v0.11-chat 失效断言、verify-skin-snapshot 过时——仍未动（非阻塞）。

## 9c. 第三轮（v0.14.1，当前版本）—— 写作状态

> 用户需求：如何让 AI 会话进入写作状态。

### 机制（dsh 官方 API，读源码确认）

- 写作状态 = 会话挂 `mofei-writer` agent preset（墨扉工具/技能只在该预设的 agent plane）。
- `agentPreset.select`：仅 **blank 会话**（事件流无 turn/start）可原地 recompose；已开始会话 `agent-preset-locked`。
- `session.create({ agentPreset: 'mofei-writer' })`：创建即写作会话（响应回显 agentPreset）。
- 客户端 RPC 信封：`{ type:'client-request', rpcId, method, payload }`，端点 `POST /api/<method>`（如 /api/session.create）。

### 交付

- 工作台顶栏（变形后）「写作状态」徽标（✍ 写作中 / ○ 空白会话 / · 标准会话）+「✍ 进入写作状态」按钮：
  空白会话原地切换；已开聊自动新建写作会话并打开；已是写作会话提示。select 被判 locked 自动降级新建。
- 回归：verify-v0.14-writing 7 项 + 其余 5 脚本全回归 ALL PASS。
- 注意：交付测试中当前开发会话已切为 mofei-writer（真实生效证明；standard 工具全保留）。
