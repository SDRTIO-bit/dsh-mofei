# 墨扉工作区模式交接

日期：2026-08-17

## 本轮目标与结论

已完成“当前 DSH 工作区即小说库”的基础联动，并完成运行态验证。

墨扉继续保留现有写作工作台和项目/章节/角色/世界书布局；参考 DSH/VS Code 的工作区信息层级，但没有把界面重做成另一套 DSH 页面。

## 已实现

### 工作区发现和文件同步

- 新项目在 Client 端以当前 DSH 会话 `cwd` 作为默认 `rootDir`。
- Host 新增 RPC：`discover-workspace({ workspaceRoot })`。
- 发现规则：
  - `<workspaceRoot>/project.yml` 视为一个墨扉项目根目录。
  - `<workspaceRoot>/.mofei/projects/*/project.yml` 视为旧式嵌入项目。
- 发现到的项目会保存真实 `rootDir`，因此后续 `fileTreeStamp()` 和 `reload-from-files` 会继续追踪同一文件树。
- Web Client 原有 2 秒同步循环中，每 5 秒调用一次工作区发现；发现路径或周期到期时触发。
- 项目栏标题右侧新增“同步”按钮，调用 `discover-workspace` 后执行 `reload()`。
- 项目标题悬停会显示当前 DSH 工作区路径。

### AI 与工作区

- `activateProjectWriterSession()` 创建 `mofei-writer` 会话时，向 `session.create` 传入当前 DSH 工作区 `cwd`。
- 因此新写作 Agent 的原生文件工具和墨扉项目文件指向同一工作区。
- 旧会话不会被迁移或修改；仅新创建的写作会话带 `cwd`。

### 工作区级资产

- 项目范围的 style 写入路径改为 `projectFileBase(project)/styles`。
- 项目根目录在当前 DSH 工作区时，文风会作为工作区可见、可 Git 管理的 Markdown 资产。
- DSH 的工作区级技能仍由 DSH 原生技能机制负责；本轮没有另建一套墨扉技能目录或 UI。

### 响应式工作台

- 右侧官方 DSH 侧栏展开时，`body.mf-sidebar-expanded` 触发紧凑态：项目列从 286px 缩至 204px，顶栏和编辑内边距同步收紧。
- `.mf-bubble-panel` 启用 `container-type:inline-size`。
- Composer 根节点只按自身宽度预留空间；修复重复扣除官方侧栏造成的内容遮挡。
- Container Query：
  - 小于 680px：项目列 190px、隐藏顶栏上下文、缩小正文留白。
  - 小于 510px：项目列 164px、隐藏次要导航和文风选择器，正文优先。
- 项目项 hover/active 的圆角、背景和边框改为使用 DSH 原生令牌，减少与官方 UI 的视觉差异。

### 顶栏快捷操作

- 顶栏三点打开可搜索的快捷操作面板，操作名称使用作者可理解的中文文案。
- 面板支持关闭按钮、再次点击三点、`Escape` 和点击外部关闭；点击面板内部不会误关闭。
- 已移除重复的摘要入口，并保留新建、摘要、风格、检索、版本历史、后台任务和写作会话等常用动作。

## 关键文件

- `plugin/lib/index.js`
  - `importFileTree(options)`：工作区发现实现。
  - `discover-workspace` RPC。
  - project style 的保存与删除路径。
- `plugin/src/client/legacy.js`
  - `currentDshWorkspacePath()`。
  - 同步轮询中调用 `discover-workspace`。
  - 新写作会话的 `cwd`。
  - 项目栏“同步”入口。
  - 容器查询和右侧栏展开的紧凑 CSS。
- `plugin/lib/client.js`、`plugin/lib/client.js.map`
  - 由 `node plugin/esbuild.config.js` 生成，必须随 Client 源码提交。
- `test-host.mjs`
  - 已把过期工具数量硬编码改为动态别名数量检查；当前全量回归 `ALL 49 PASS`。
- `verify-v0.18-onboard.cjs`
  - 已覆盖 v0.19 工作区、快捷操作面板、官方侧栏、Composer 边界和窄屏行为的浏览器回归。
- `v0.19-changelog.md`
  - 上一轮的面向用户变更记录。

## 已验证证据

### 静态与回归

以下命令均在本轮通过：

```powershell
node --check plugin/lib/index.js
node --check plugin/src/client/legacy.js
node plugin/esbuild.config.js
node tools/verify-client-bundle.mjs
node test-host.mjs
node verify-v0.18-onboard.cjs
```

- `test-host.mjs`：`ALL 49 PASS`。
- Client bundle 契约检查通过。
- `verify-v0.18-onboard.cjs`：验证 rootDir 文件落盘、文件优先读回、快捷操作面板四种关闭方式、官方右侧栏展开与历史会话树。
- 1920px 右侧栏展开：Composer 与墨扉面板边界仅相差 1px 分隔线，未再发生内容覆盖。

### 运行态

- 已用 `http://127.0.0.1:3080/api/mofei` 调用 `discover-workspace`，临时含 `project.yml` 的目录被发现并导入。
- 临时目录和临时项目记录随后已清理。
- `3080` 页面刷新后，“同步”按钮可见；点击后无 `.mf-alert` 错误。
- 当右侧官方栏展开时，实测：
  - `body`: `mf-transform mf-sidebar-expanded`
  - 墨扉面板：604px
  - 项目列：205px
  - 编辑区：398px
  - 容器类型：`inline-size`

## 当前运行环境

- 项目目录：`F:\game\SillyTavern-1.13.2\OpenFic-DSH`
- DSH checkout：`C:\Users\zhao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh`
- 当前验证页：`http://127.0.0.1:3080/`
- 已装配包：`mofei-dsh`，目标 profile：`novel`。
- 当前 Web 页面显示当前工作区提示：`F:\game\SillyTavern-1.13.2`。

## 装配器注意事项

热重载期间曾出现 `mofei-dsh` fiber 失败，根因不是业务代码，而是卸载后 Web 路由残留导致重复 prefix route：

- `/api/mofei`
- `/api/openfic`
- `/mofei`

恢复流程已验证：

```text
1. dev_uninject_plugin(match: "mofei-dsh")
2. dev_clear_routes(prefix: "/api/mofei")
3. dev_clear_routes(prefix: "/api/openfic")
4. dev_clear_routes(prefix: "/mofei")
5. dev_install_package(dir: "F:\\game\\SillyTavern-1.13.2\\OpenFic-DSH\\plugin", profile: "novel")
6. 刷新 http://127.0.0.1:3080/
```

不要把 `dev_reload_package` 的 failed fiber 直接当作源码错误；先执行 `node --check` 和 Host 测试，再检查是否有残留路由。

## 建议的后续验收

1. 新建一个真实 DSH 工作区会话，在该目录创建一本文学项目。
2. 确认新项目 `rootDir` 即当前会话工作区，且 `project.yml`、`chapters/`、`styles/` 均落在此处。
3. 在工作区外部编辑章节 Markdown，等待自动轮询或点击“同步”，确认正文/项目列表更新。
4. 在当前工作区创建新的 `mofei-writer` 会话，让 Agent 用原生文件工具读取一个工作区文件，同时用 `mofei_read-chapter` 读取章节，确认两者路径一致。
5. 在 1280px 与更窄窗口中展开/收起官方右侧栏，检查项目列缩窄、正文没有水平溢出、顶部按钮不重叠。
6. 检查浅色和深色主题下的项目列表 hover、active、边框和正文对比度。

## 可继续开发的方向

- 在不改变现有项目栏结构的前提下，为每个项目显示简洁的 `rootDir` 或“当前工作区”来源标记。
- 对工作区 Markdown 增加只读文件预览入口；不要让它与章节编辑的修订/并发保护混淆。
- 增加“导入普通 Markdown 小说目录”为墨扉项目的向导，避免要求用户手写 `project.yml`。
- 提供项目级 `.dsh/skills` 与文风文件的发现/状态展示，但优先复用 DSH 原生技能机制。
- 针对多项目工作区，明确根目录项目与 `.mofei/projects/*` 项目的优先级、同 ID 冲突处理与删除策略。

## 未做的事

- 未做完整 VS Code 文件浏览器重构；用户明确表示截图是参考，不应改变当前墨扉整体布局。
- 未自动迁移既有 writer 会话的 `cwd`，只影响新建会话。
- 未添加完整的 workspace discovery 专用单元测试；目前有 Host 全量回归和运行态临时项目验证。
- 本轮修复已纳入 Git 提交，提交信息见当前分支日志。
