# dsh-mofei 开发文档（Developer Guide）

> 面向插件维护者。本文件描述本地构建、运行、测试与常见修改路径。
> 装配与架构见 `docs/ARCHITECTURE.md`，Agent 工具清单见 `docs/TOOL-REFERENCE.md`，
> 协作约定见 `AGENTS.md`。

当前插件版本（以 `plugin/package.json` 为准）：**v0.24.0**。

## 1. 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20（DSH 0.1.0-rc.6 运行于 Node 24 验证） | 运行 DSH 与构建脚本 |
| DSH | ≥ 0.1.0-rc.6 | 已配置可用模型（`llm-deepseek` / `llm-pi-ai`） |
| pnpm | 任意 | `dsh plugin add` 管理 profile 依赖 |
| esbuild | ^0.28.2（devDep） | Client bundle 构建 |
| typescript | ^7.0.2（devDep） | `node --check` 之外无编译步骤 |

运行时依赖仅 `@huggingface/transformers`（本地 RAG 嵌入，动态加载，缺失时优雅降级）。
peerDependencies：`@deepseek-ai/cordis@^4.0.1`、`react@^18.2.0`。

## 2. 仓库结构

```text
dsh-mofei/
  plugin/
    package.json            插件元数据 + dsh.bundle 声明 + 构建脚本
    cordis.patch.yml        插件 bundle patch（dsh plugin add 自动挂载 mofei 条目）
    esbuild.config.js        Client bundle 构建（src/client/index.js → lib/client.js）
    lib/                    Host 半体 + 业务子模块（ESM，Node 直接执行）
      index.js              Host 半体：webServer RPC + SSE + 文件持久化 + ctx.provide('mofei')
      client.js             生成的 Client bundle（src/client/ 构建产物，勿手改）
      tools.js              mofei_* Agent 工具注册（消费 ctx.get('mofei')）
      subagent-max.js       subagent_with_model 子代理工具（角色/模型/effort）
      {ai,summary,prompt-chain,roles,instructions,rag,local-retrieval,txt,world}.js
    src/client/             工作台 React 组件源码（.js，无 TS 编译）
      index.js              Client 入口（__ModuleLoader__.load 注册）
      *.js / *.test.mjs     组件与单元测试
  presets/
    mofei-writer/           写作会话 preset（agent.cordis.yml + preset.yml）
  web/
    index.html              墨扉独立站 /mofei 入口
    vendor/react.js, react-dom.js
  tools/                    契约与验证脚本（*.mjs / *.cjs）
  tests/                    宿主生命周期回归（mock ctx）
  docs/                     开发文档（本目录）
```

## 3. 构建

Client bundle 由 `src/client/` 经 esbuild 打包为 `lib/client.js`，**格式 cjs、platform neutral**，
`react`/`react-dom`/`@deepseek-ai/cordis` 标记为 external（由 DSH shell seed 经 require 注入）。

```powershell
# 进入插件目录
cd plugin

# 1) 构建 client bundle + 契约检查
npm run build
#   等价于：node esbuild.config.js && node ../tools/verify-client-bundle.mjs

# 2) 语法检查全部 lib/*.js
npm run check
```

构建产物 `lib/client.js` 同时服务两个模式：
- DSH client-modules（经 `__ModuleLoader__.load` 注册，`apply` + `inject: ['slots']`）
- `/mofei` 独立站（由 `web/index.html` 引导，加载 `lib/client.js` 作为 `app.js`）

> 修改 `src/client/*.js` 后**必须重建** bundle，否则运行的仍是旧的 `lib/client.js`。

## 4. 本地运行（写作环境）

墨扉设计为独立 profile，避免污染标准 coding 会话：

```powershell
cd <你的仓库目录>
dsh --profile novel --port 3088
```

- 端口 `3088` 是约定写作入口；不要写中间的 `web` 子命令。
- `3080` 是 DSH 默认端口（干净 coding 环境，不加载 dsh-mofei）。

访问 `http://127.0.0.1:3088/`，点侧栏底部「墨扉」进入工作台。

### 首次安装 / 更新

```powershell
$pluginPath = (Resolve-Path .\plugin).Path
dsh plugin --profile novel add $pluginPath          # 自动挂载 mofei 条目（bundle 声明）
# 写作 preset：
Copy-Item .\presets\mofei-writer "$env:USERPROFILE\.dsh\.agent-presets\mofei-writer" -Recurse -Force
```

`dsh plugin add` 后 DSH 依据 `plugin/package.json` 的 `dsh.bundle` 声明自动将 `mofei` 挂入
profile 层栈，无需手写 `cordis.patch.yml` 的 insert 行。

## 5. 测试与验证

### Host 生命周期回归（mock ctx）

```powershell
node ..\tests\verify-p0-lifecycle.mjs
```

### Client 单元测试

```powershell
Get-ChildItem src\client\*.test.mjs | ForEach-Object { node $_ }
```

### 契约 / 集成验证脚本（`tools/`）

| 脚本 | 用途 |
| --- | --- |
| `verify-client-bundle.mjs` | Client bundle 契约检查（构建后自动跑） |
| `verify-writing-pipeline.mjs` | Writer→Reviewer→冲突保护→合并提交 冒烟 |
| `verify-subagent-pipeline.mjs` | 子代理 Writer/Reviewer 闭环实测 |
| `verify-agent-isolation.mjs` | standard 会话零污染校验 |
| `verify-agent-tools.mjs` | mofei_* 工具注册面校验 |
| `verify-agent-surface.mjs` | Agent 工具/技能暴露面快照 |
| `verify-git-history.mjs` | git 适配器工具校验 |
| `verify-retrieve-style.mjs` | 本地检索风格校验 |
| `verify-spec.mjs` | 文件优先规范校验 |

### 提交前建议

```powershell
node --check plugin\lib\index.js
node --check plugin\src\client\legacy.js
node test-host.mjs
node verify-v0.18-onboard.cjs
```

## 6. 常见修改路径

| 想改什么 | 改哪里 | 重建？ |
| --- | --- | --- |
| 新增/修改 Agent 工具 | `plugin/lib/tools.js` 的 `buildTools()` | 否（纯 ESM，DSH 重启加载） |
| 新增/修改 RPC 方法 | `plugin/lib/index.js` 的 `handlers` 对象 | 否 |
| 新增 Host 业务子模块 | `plugin/lib/*.js` + 在 `index.js` import/调用 | 否 |
| 新增/修改写作指令 | `plugin/lib/instructions.js` | 否 |
| 新增/修改子代理角色 | `plugin/lib/roles.js` | 否 |
| 改工作台 UI 组件 | `plugin/src/client/*.js` | **是**（`npm run build`） |
| 改独立站外壳 | `plugin/web/index.html` | 否 |
| 改构建/依赖 | `plugin/package.json` + `esbuild.config.js` | 视情况 |

## 7. 故障自愈（injector）

本环境已装 `dsh-super-injector`（dev_* 工具）。若需把本地插件包运行时注入做热重载：

```powershell
dev_plugin_status        # 看当前装配
dev_build_plugin -dir .\plugin     # 构建 + 打包（若插件形态支持）
dev_inject_plugin -dir .\plugin    # 运行时注入（host+UI 全生效）
dev_reload_package -packageName dsh-mofei   # 热重载
dev_uninject_plugin -match dsh-mofei        # 卸载即净
```

注入器不碰 `cordis.patch.yml` / `package.json`，与 `dsh plugin add` 路径互不冲突。

## 8. 已知技术债（维护者关注）

- **版本号漂移**：`package.json` 为 v0.24.0，但 README/ARCHITECTURE 多处写 v0.26/0.24。
  以 `package.json` 为唯一来源，发版时同步三者。
- **工具数量**：`tools.js` 当前注册 **73 个** `mofei_*` 工具（另有 `openfic_*` 旧名 alias
  在注册时自动翻倍）。新增工具后以 `tools/verify-agent-tools.mjs` 实数为准。
- **配置 schema**：`normalizeCoreConfig` 为手动归一化，完整 schemastery `Config` 校验未落地。
- **UI DOM 篡改**：独立站 `mf-transform` 按官方组件类名哈希改写布局，类名随 DSH 升级可能失效。
- **SSE 兜底**：client 侧 2s 轮询 `storeStamp/fileStamp` 作 sync 兜底，事件化推送为后续待办。
