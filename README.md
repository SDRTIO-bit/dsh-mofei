# 墨扉（Mofei）DSH 插件

墨扉 是运行在 DeepSeek Harness（DSH）里的写作内容平台插件。**固定插件（mofei-dsh v0.10.0）**：MOFEI-SPEC 文件优先 + mofei-writer 写作 preset + MOFEI-STUDIO 全屏工作台。
品牌说明：本项目参考 OpenFic（Apache-2.0）的写作平台思路与技能体系，产品名称为「墨扉 / Mofei」。

## 快速使用

```text
coding（默认）:  dsh web                                  # 纯 coding，不含墨扉
写作环境:        cd F:\game\SillyTavern-1.13.2\OpenFic-DSH
                 dsh --profile novel --port 3088          # 3081 是 WSL DSH，勿占用
写作会话:        Agent preset 选择「墨扉写作 / mofei-writer」
入口:    普通 Web 侧栏底部只有一个「墨扉」入口；点击打开全屏 MOFEI-STUDIO
API:     POST /api/mofei（旧 /api/openfic 兼容保留）
数据:    .mofei/projects/**/*.md 文件优先；.mofei-*.json 兼容缓存
管理:    dsh plugin --profile novel remove mofei-dsh（卸载）
```

## 文件

```text
plugin/                         当前固定插件源码（npm 包 mofei-dsh）
  package.json                  dsh.client 声明 + exports
  lib/index.js                  Host 半体（/api/mofei RPC + SSE + fs 持久化 + 工具/技能）
  lib/summary.js                摘要体系纯逻辑（章节/区间摘要、过期判断、批量计划）
  lib/client.js                 Client 半体（全部 UI，ModuleLoader 格式）
  src/client/                   client 源码（legacy.js UI + project-grid/project-page/layout/editor-limits/summary-panel/worldbook-tools/agent-bridge/writing-dashboard/prompt-chains/workspace-utils 模块）
HANDOFF.md                      权威交接文档（固定插件时代）
NEXT-SESSION.md                 下一会话交接（最新状态）
RECOVERY.md                     现状说明 + 动态版应急回退流程
GAP-ANALYSIS.md                 与 OpenFic-main 的差距分析与开发路线
WEB-PLATFORM-PLAN.md            /mofei 独立站点方案
runtime-state.md                运行状态快照
api-notes.md                    DSH API 契约笔记（历史）
source/pkg-15..22.*.js          动态插件历史源码（归档，应急回退用）
verify-*.cjs                    历史验证脚本
verify-shots/                   验证截图
```

## 开发

- 改 client 源码 `plugin/src/client/*.js` → `node plugin\esbuild.config.js` 重建 bundle。
- 改 `plugin/lib/*.js` → `node --check` → 重启 DSH 生效（符号链接，无需重装）。
- 单测：`test-txt.mjs` / `test-world.mjs` / `test-ai.mjs` / `test-summary.mjs` / `test-host.mjs`；组件纯函数 `plugin/src/client/*.test.mjs`；契约门禁 `tools/verify-client-bundle.mjs`。
- 浏览器回归：`verify-v0.6.cjs` / `verify-v7.cjs` / `verify-v5-ui.cjs`（Playwright + msedge）。

## 历史

动态插件时代（ofic-1 pkg-1..pkg-4）已于 2026-08-14 被固定插件取代：
主题透明修复、createChapter 修复、v4 数据模型（卷/角色/笔记/搜索）均已并入固定版。
