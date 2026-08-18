# mofei-dsh 架构说明（v0.24）

> 面向维护者。装配与用法见 `README.md`，Agent 协作见 `AGENTS.md`。

## 1. 形态：一个 npm 包，四种装配面

`mofei-dsh`（`plugin/`）是**固定插件**（非动态插件，重启自动加载），同一包内按
`package.json` 的 `exports` 提供四个入口，分别在不同装配点加载：

| 入口 | 文件 | 装配点 | 职责 |
| --- | --- | --- | --- |
| `.`（core） | `lib/index.js` | novel profile（`~/.dsh/profiles/novel/cordis.patch.yml` 的 `mofei` 条目） | Host 半体：数据模型、持久化、webServer RPC、SSE、`ctx.provide('mofei')` 服务 |
| `./client` | `lib/client.js`（由 `src/client/` esbuild 构建） | DSH client-modules（`__ModuleLoader__`）+ `/mofei` 独立站 | UI：工作台、气泡、Slot 注册（sidebar.footer.action / shell.overlay） |
| `./tools` | `lib/tools.js` | mofei-writer 写作 preset（会话级） | 注册 73 个 `mofei_*` 工具 + `openfic_*` 旧名 alias，消费 `ctx.get('mofei')` 服务 |
| `./subagent-max` | `lib/subagent-max.js` | novel profile + mofei-writer preset | 注册 `subagent_with_model` 子代理工具（角色 persona / model / effort） |

隔离设计：core 只进 novel profile；`mofei_*` 工具与子代理工具只进写作会话
（`~/.dsh/.agent-presets/mofei-writer/agent.cordis.yml`），standard/coding 会话零污染
（web profile 的 patch 显式 `disabled` 阻断自装配）。

## 2. Host 半体（lib/index.js）

- **inject**：`['fs', 'sandboxPolicy', 'webServer']`；`llm`/`jobs` 动态 `ctx.get()` 且全守卫。
- **数据模型**：内存 store v4（projects/chapters/volumes/characters/notes/worldEntries），
  JSON 兼容缓存（`.mofei-*.json`）+ **文件优先镜像**（`.mofei/projects/**` Markdown +
  frontmatter，用户可直接编辑、可 git 管理；v0.18 起支持项目级 `rootDir` 任意文件夹）。
  写操作经串行 `queue`；章节 `revision` 冲突保护（`expectedRevision`）。
- **通信**：`/api/mofei` JSON-RPC（+ `/api/openfic` 旧名 alias）+ `/api/mofei/stream/*` SSE
  （ai-assist / ai-summarize / sync）；client 侧 2s 轮询 storeStamp/fileStamp 作兜底同步。
- **服务**：`ctx.provide('mofei', mofeiService)` —— tools.js / subagent-max.js 经此消费。
- **生命周期（v0.24）**：三处 webServer 路由经 `safeRegister` 收集 disposer，
  `ctx.effect` 统一回收（路由 + `gitCommitTimer` + `agentContexts`）；历史残留路由只告警。
- **配置（v0.24）**：`normalizeCoreConfig(config)` 接受 cordis.yml `config`（historyCap /
  entityHistoryMax / gitCommitIntervalMs / rag.*），缺省 = 原硬编码值；rag 调用以插件配置
  为基底、单次 RPC 参数可覆盖。完整 schemastery `Config` schema 为 v0.25 待办。

## 3. Client 半体（lib/client.js）

- 同一 bundle 双模式：DSH client-modules 注册（`apply` + `inject: ['slots']`，挂
  `sidebar.footer.action` 墨扉按钮 + `shell.overlay` MofeiBubble）与 `/mofei` 独立站
  （`mountStandalone`，`web/index.html` 引导）。
- 消费官方客户端服务：`sessions.list.subscribe`、`connection.api.agentPresets`、workspaces。
- 轮询/订阅均带清理（useEffect cleanup + apply 返回 disposer）。
- **已知技术债**：独立站模式的 `body.mf-transform` 按官方组件类名哈希改写官方布局
  （v0.13 起"变形金刚"形态）；类名哈希随 DSH 升级可能失效，P3 待办为去 DOM 篡改。

## 4. 业务子模块（lib/）

| 文件 | 职责 |
| --- | --- |
| `txt.js` | 章节 TXT 导入/导出 |
| `world.js` | 世界书解析/上下文组装 |
| `ai.js` | AI 会话规范化、SSE 事件 |
| `summary.js` | 章节/区间摘要、过期重算 |
| `prompt-chain.js` | 提示词链编译/视图 |
| `roles.js` | 子代理角色定义/persona 编译 |
| `instructions.js` | 17 个写作指令（子代理 persona 注入） |
| `rag.js` | 本地 RAG 索引/检索（纯 JS，无外部依赖） |
| `local-retrieval.js` | fastembed/transformers 本地模型（路径可用 `MOFEI_*` env 覆盖） |

## 5. 构建与验证

```powershell
cd plugin
npm run build     # esbuild 构建 client bundle + tools\verify-client-bundle.mjs 契约检查
npm run check     # node --check 全部 lib/*.js
node ..\tests\verify-p0-lifecycle.mjs   # Host 生命周期回归（mock ctx）
# client 单元测试：
Get-ChildItem src\client\*.test.mjs | ForEach-Object { node $_ }
```

## 6. 已知待办（v0.25+）

- schemastery `Config` schema（校验 + 设置 UI）——需引入 `@deepseek-ai/schemastery` 依赖。
- 同步事件化：SSE 推送 sync 事件替代 2s 轮询（断线保留轮询兜底）。
- UI 去 DOM 篡改：`mf-transform` 类名哈希选择器改官方扩展点/令牌。
- `local-retrieval.js` 的 `@huggingface/transformers` 动态加载路径可再验证。
