# 墨扉（Mofei）DSH

墨扉是运行在 DeepSeek Harness（DSH）中的小说写作工作台插件。它把项目、卷章、角色、世界书、笔记、摘要和提示词链放在同一套写作数据模型里，并将 `mofei-writer` 写作会话与 DSH 原生工作区连接起来。

当前固定插件版本：`mofei-dsh v0.24.0`。

## 能做什么

- 项目与章节：章节编辑、自动保存、修订号冲突保护、卷章排序和全文检索。
- 写作设定：角色、笔记、世界书、摘要、写作技能和项目级提示词链。
- 文件优先：项目根目录中的 `project.yml`、`chapters/`、`styles/` 等 Markdown 资产可直接被 Git 管理。
- DSH 工作区联动：新项目默认使用当前 DSH 会话的 `cwd`，也可以在初始向导中选择专用小说文件夹。
- Agent 协作：`mofei-writer` 会话使用同一工作区，可通过 `mofei_*` 工具读写章节和设定。
- 快捷操作：顶栏三点打开可搜索的写作操作面板；支持关闭按钮、再次点击、`Escape` 和点击外部收起，不暴露内部命令名。
- 原生界面共存：墨扉工作台从左侧展开，官方 DSH 对话和 Composer 保留在右侧；官方会话侧栏展开时，工作台会自动收紧，不遮挡输入区。

## 快速开始

在 Windows PowerShell 中启动写作环境：

```powershell
cd F:\game\SillyTavern-1.13.2\OpenFic-DSH
dsh --profile novel --port 3088
```

> 注意：不要写中间的 `web` 子命令（`dsh --profile novel web ...` 是错误写法）；
> 3081 是 WSL DSH 专用端口，勿占用。

打开 `http://127.0.0.1:3088/`，点击 DSH 侧栏底部的「墨扉」进入工作台。新建项目时，默认保存到当前 DSH 工作区；项目栏右侧的「同步」按钮可立即扫描工作区中的墨扉项目。

工作台顶栏的「⋯」是快捷操作入口，可搜索新建章节、摘要、写作风格、版本历史和 Writer/Reviewer 等动作；打开后点击右上角「×」、再次点击「⋯」、按 `Escape` 或点击面板外部即可关闭。

标准 DSH 环境可以继续使用 `dsh web`；它不会加载 `mofei-dsh` 写作插件。

## 工作区文件

当项目绑定到 DSH 工作区时，推荐的目录结构如下：

```text
<workspace>/
  project.yml
  chapters/*.md
  characters/*.md
  notes/*.md
  world/*.md
  styles/*.md
```

没有选择工作区时，插件会继续使用兼容缓存 `.mofei-*.json` 和默认的 `.mofei/projects/` 存储。运行时缓存、日志和浏览器截图不会进入 Git；稳定的验证脚本仍保存在 `verify-shots/`。

> **数据与 Git**：`.mofei/` 文件树（章节/角色/世界书等小说数据）**默认随本仓库 Git 版本化**——
> 插件每次保存会自动 `git add .mofei` 并提交（`墨扉 项目保存`），这是刻意的版本管理设计
> （v0.10.1 文件优先）。如果你希望小说数据与代码分仓，请把项目 `rootDir` 指向独立 Git 仓库，
> 或调整 `.gitignore` 并停用自动提交。

## 项目结构

```text
plugin/
  package.json                  插件元数据、DSH client 声明和构建脚本
  lib/index.js                  Host 半体：webServer RPC、SSE、文件同步和持久化
  lib/client.js                 生成的 Client bundle（由 src/client/ 构建）
  lib/tools.js                  73 个 mofei_* 工具注册（消费 ctx.get('mofei') 服务）
  lib/subagent-max.js           subagent_with_model 子代理工具（角色/模型/推理强度）
  lib/{ai,summary,prompt-chain,roles,instructions,rag,local-retrieval,txt,world}.js
                                业务子模块
  src/client/*.js               工作台、项目网格、编辑器、摘要、技能库等组件源码
  web/index.html                墨扉独立站入口（/mofei）
tools/                          Client 契约和辅助验证
tests/verify-p0-lifecycle.mjs   Host 生命周期回归（mock ctx）
docs/ARCHITECTURE.md            架构说明（Host/Client 两半体与装配）
docs/ACCEPTANCE-2026-08.md      整体验收报告
AGENTS.md                       Agent 协作约定（mofei_* 工具与写作流水线）
v0.24-changelog.md              最新变更说明
```

## 开发与验收

修改 Client 源码后重建 bundle：

```powershell
node plugin\esbuild.config.js
node tools\verify-client-bundle.mjs
```

提交前建议运行：

```powershell
node --check plugin\src\client\legacy.js
node --check plugin\lib\index.js
node test-host.mjs
node verify-v0.18-onboard.cjs
```

当前回归覆盖 Host RPC、文件优先同步、工作区发现、官方会话树、Composer 与墨扉面板边界、500px 窄屏工作台和客户端 bundle 契约。

## 文档导航

- [v0.24 变更说明](v0.24-changelog.md)
- [架构说明](docs/ARCHITECTURE.md)
- [整体验收报告](docs/ACCEPTANCE-2026-08.md)
- [Agent 协作约定](AGENTS.md)
- 历史交接与规划文档已归档至 `docs/archive/`

## 许可与来源

本项目插件代码使用 Apache-2.0。墨扉参考 OpenFic 的写作平台思路与技能体系，但在 DSH 中作为独立插件运行；标准 DSH 会话不加载墨扉工具、技能或工作区数据。
