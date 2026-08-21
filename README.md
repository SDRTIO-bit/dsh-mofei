# 墨扉（Mofei）DSH

墨扉是运行在 DeepSeek Harness（DSH）中的小说写作工作台插件。它把项目、卷章、角色、世界书、笔记、摘要和提示词链放在同一套写作数据模型里，并将 `mofei-writer` 写作会话与 DSH 原生工作区连接起来。

当前固定插件版本：`dsh-mofei v0.24.0`（以 `plugin/package.json` 为准）。

## 能做什么

- 项目与章节：章节编辑、自动保存、修订号冲突保护、卷章排序和全文检索。
- 写作设定：角色、笔记、世界书、摘要、写作技能和项目级提示词链。
- 文件优先：项目根目录中的 `project.yml`、`chapters/`、`styles/` 等 Markdown 资产可直接被 Git 管理。
- DSH 工作区联动：新项目默认使用当前 DSH 会话的 `cwd`，也可以在初始向导中选择专用小说文件夹。
- Agent 协作：`mofei-writer` 会话使用同一工作区，可通过 `mofei_*` 工具读写章节和设定；
  子代理角色 = 四个内置角色（Writer/Reviewer/Analyzer/Polisher）+ 项目覆盖/自建，
  由 `subagent_with_model` 按角色装配 persona 与模型。
- 快捷操作：顶栏三点打开可搜索的写作操作面板；支持关闭按钮、再次点击、`Escape` 和点击外部收起，不暴露内部命令名。
- 原生界面共存：墨扉工作台从左侧展开，官方 DSH 对话和 Composer 保留在右侧；官方会话侧栏展开时，工作台会自动收紧，不遮挡输入区。

## 使用场景

- **长篇小说日更/连载**：分卷管理章节，修订号冲突保护保证 Agent 与手动编辑不互相覆盖，全文检索快速定位设定词，区间摘要维持长文记忆。
- **人设与世界观管理**：角色、笔记、世界书（world entries）全部文件优先存为 Markdown，可直接进 Git 做版本管理，写作时通过 `mofei_*` 工具或工作台即时查阅。
- **Agent 协作写作流水线**：`mofei-writer` 会话内可用 `subagent` 拉起 Writer/Reviewer/Analyzer/Polisher 四个内置角色，实现「写草稿 → 审稿 → 修订」闭环；子代理通过 `mofei_read-chapter` / `mofei_update-chapter`（带 `expectedRevision`）读写章节。
- **RAG 辅助检索**：内置 RAG 索引支持跨章节语义检索，长书设定检索不用翻正文。
- **多项目隔离**：每个项目独立目录（`project.yml` + `chapters/` + `characters/` 等），项目之间数据互不干扰，可同时管理多本书。

## 安装

墨扉需要已安装、且已配置可用模型的 DSH（≥0.1.0-rc.6）。子代理使用 DSH 随附的 `minimal` preset；不依赖本机私有的 `minimal-v3` 或其他作者自定义 preset。

以下以 Windows PowerShell 为例。下载仓库后，在仓库根目录执行：

```powershell
# 将插件加入独立的 novel profile（推荐独立 profile，避免污染 coding 环境）。
$pluginPath = (Resolve-Path .\plugin).Path
dsh plugin --profile novel add $pluginPath

# 首次安装写作 preset。已有同名 preset 时先备份或使用下方的更新命令。
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\.agent-presets" | Out-Null
Copy-Item .\presets\mofei-writer "$env:USERPROFILE\.dsh\.agent-presets\mofei-writer" -Recurse
```

> 插件自带 `dsh.bundle` 声明（`plugin/package.json` + `plugin/cordis.patch.yml`），
> `dsh plugin add` 后 **DSH 会自动将 `dsh-mofei` 挂载到 profile 层栈**，无需手写
> `cordis.patch.yml` 的 insert 行；`mofei` 一行已由插件 bundle 自动提供。

更新仓库后的 preset 时，确认没有本地自定义后再执行：

```powershell
Copy-Item .\presets\mofei-writer "$env:USERPROFILE\.dsh\.agent-presets\mofei-writer" -Recurse -Force
```

安装后重启 DSH。`mofei-writer` 是主会话 preset；Writer、Reviewer 等子代理由墨扉创建为 DSH 内置 `minimal` preset，再在各自会话内注入墨扉工具和角色规则，因此不会继承或污染主会话。

## 配置要求

| 依赖 | 说明 |
| --- | --- |
| Node.js | ≥ 20（DSH 0.1.0-rc.6 运行于 Node 24 验证） |
| DSH | ≥ 0.1.0-rc.6，已配置可用模型（`llm-deepseek` 或 `llm-pi-ai` 任一路由） |
| DEEPSEEK_API_KEY | 使用 DeepSeek 官方路由（含 web 搜索）时需要；其他路由按 DSH 配置提供凭据 |
| pnpm | `dsh plugin` 依赖 pnpm 管理 profile 依赖 |
| 端口 3088 | 墨扉写作入口约定端口（`dsh --profile novel --port 3088`） |

可选行为参数（写在 profile 或 bundle 的 `config:` 中，不配则用内置默认）：

```yaml
# 默认值示例
config:
  historyCap: 20              # 章节历史快照上限
  entityHistoryMax: 50        # 角色/笔记/世界书条目快照上限
  gitCommitIntervalMs: 10000  # git 自动提交节流（毫秒）
  rag:
    chunkSize: 800
    chunkOverlap: 100
    candidateLimit: 40
    resultLimit: 5
    confidenceThreshold: 0.005
```

## 快速开始

在 Windows PowerShell 中启动写作环境：

```powershell
cd F:\game\SillyTavern-1.13.2\dsh-mofei
dsh --profile novel --port 3088
```

`3088` 是本项目约定的墨扉写作入口，不是 DSH 的全局默认端口。请始终以
`dsh --profile novel --port 3088` 启动墨扉，不要写中间的 `web` 子命令
（`dsh --profile novel web ...` 是错误写法）；3081 是 WSL DSH 专用端口，勿占用。

打开 `http://127.0.0.1:3088/`，点击 DSH 侧栏底部的「墨扉」进入工作台。新建项目时，默认保存到当前 DSH 工作区；项目栏右侧的「同步」按钮可立即扫描工作区中的墨扉项目。

工作台顶栏的「⋯」是快捷操作入口，可搜索新建章节、摘要、写作风格、版本历史和 Writer/Reviewer 等动作；打开后点击右上角「×」、再次点击「⋯」、按 `Escape` 或点击面板外部即可关闭。

普通 `dsh web` 未指定端口时会使用 DSH 的 `3080` 默认端口。该地址是干净的标准
DSH/browser 测试环境，不是墨扉入口，也不应加载 `dsh-mofei` 写作插件；需要写作时请访问
`http://127.0.0.1:3088/`。

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
  package.json                  插件元数据、DSH bundle/client 声明和构建脚本
  cordis.patch.yml              插件 bundle patch（dsh.bundle 自动挂载入口）
  lib/index.js                  Host 半体：webServer RPC、SSE、文件同步和持久化
  lib/client.js                 生成的 Client bundle（由 src/client/ 构建）
  lib/tools.js                  73 个 mofei_* 工具注册（消费 ctx.get('mofei') 服务；详见 docs/TOOL-REFERENCE.md）
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
v0.26-changelog.md              最新变更说明
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

- [v0.26 变更说明](v0.26-changelog.md)
- [架构说明](docs/ARCHITECTURE.md)
- [开发文档](docs/DEVELOPMENT.md)（构建/运行/测试/常见修改路径）
- [Agent 工具参考](docs/TOOL-REFERENCE.md)（`mofei_*` 工具全表 + 错误码）
- [整体验收报告](docs/ACCEPTANCE-2026-08.md)
- [Agent 协作约定](AGENTS.md)
- [dsh-novel-tavern fork 调研](docs/NOVEL-TAVERN-FORK-NOTES.md)（小说存储/酒馆格式对照）
- [dsh-novel-tavern 参考手册](docs/NOVEL-TAVERN-REFERENCE.md)（逐条借鉴清单与优先级）
- 历史交接与规划文档已归档至 `docs/archive/`

## 许可与来源

本项目插件代码使用 Apache-2.0。墨扉参考 OpenFic 的写作平台思路与技能体系，但在 DSH 中作为独立插件运行；标准 DSH 会话不加载墨扉工具、技能或工作区数据。