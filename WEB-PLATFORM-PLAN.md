# 墨扉 独立 Web 平台方案（/mofei 专属站点）

> 目标：官方 DSH Web 一行不改；插件自己挂一个专属写作平台页面。
> 证据：`@deepseek-ai/dsh-host-webserver` 采用 exact/prefix 路由表 + 唯一 fallback，
> longest-prefix-wins。官方前端（dsh-host-frontend-static）只占 fallback。
> 因此插件 `ctx.webServer.register({ kind: 'prefix', path: '/mofei', handler })` 即拥有
> `http://127.0.0.1:3080/mofei/*`，与官方 `/` 完全隔离。
> **2026-08-15 更新：墨扉已迁到 novel profile（端口 3088）；本文件的 3080 是历史规划值，现统一走 3088。**

## 1. 最终形态

```text
默认 coding：dsh web                                      → http://127.0.0.1:3080（纯 coding）
写作环境：  dsh --profile novel web --port 3088
  http://127.0.0.1:3088/          → DSH Web（写作专用）
  http://127.0.0.1:3088/mofei/    → 墨扉 专属写作平台（插件自供 SPA）
  http://127.0.0.1:3088/api/mofei → 数据/业务 RPC
```

官方 Web 上的插件注入只保留一个「打开 墨扉 平台」入口按钮（跳转新标签），
不叠加 overlay、不改官方 DOM/路由/打包。

## 2. 三种复用旧前端代码的路线

### 路线 A：新写 SPA（快，但等于重做 UI）
用 esbuild + React 18 打一个新站点，把现有 Workspace 全屏化。缺点：又造一套 UI，违背「用旧 web 代码」。

### 路线 B：原版前端整体移植（高保真，工作量大）
原版 `frontend/`（React 19 + Vite + Radix/TipTap/TanStack Query，40+ 依赖）:
1. `pnpm install` 后以 `base:'/mofei/'` 构建。
2. 新建 DSH 入口 `main.dsh.tsx`，跳过 health/settings/tiktoken/socket 初始化。
3. Host 注册 `/mofei/api/v1` 兼容层，把原版 REST 转成我们已有 handlers。
4. AssistantSidebar 换成 DSH 会话桥（先占位）。
风险：依赖安装/构建耗时；兼容层约 40+ 端点（但业务逻辑我们已实现，主要是 REST↔JSON 映射）。

### 路线 C：混合渐进（推荐）
- **第一步**：插件注册 `/mofei` 前缀，先放一个可用的全屏平台壳（复用现有 Workspace 逻辑，
  直接加载 React 18 UMD，不装依赖），证明路由/持久化/SSE 全链路独立可用。
- **第二步**：按页面逐步把原版前端搬进来（projects → writing → world-info → dashboard），
  每个页面用一个「RPC adapter」替换原版 `lib/api-client.ts`，UI 组件原样用旧代码。
- **第三步**：摘要体系、prompt-chains、AI 桥接按 GAP-ANALYSIS v2 继续。

好处：每步都有可运行产物；旧代码高保真复用；官方 Web 始终不动。

## 3. 关键实现细节（路线 C）

1. `plugin/web/` 放站点静态资源；Host 用 fs 读取并 serve（HTML/JS/CSS/MIME）。
2. `/mofei` SPA fallback：无匹配资源时返回 index.html（仿 frontend-static 语义）。
3. React 18 UMD 从本地 npm 缓存提取进 `plugin/web/vendor/`，esbuild 把 `src/web/` 打成 IIFE
   `lib/web.js`（classic script，不复用 DSH client-modules 契约，因为是独立页面）。
4. 页面数据全部走现有 `/api/mofei` JSON RPC；SSE 走 `/api/mofei/stream/ai-assist`。
5. 原版前端移植时：Vite `base:'/mofei/'`，API base 设为同源 `/mofei/api/v1`；
   Host 注册 `/mofei/api/v1` 前缀做 REST 映射。
6. 原版 socket/agent 初始化在 DSH 入口禁用；右栏助手后续接 DSH 会话（先显示
   「在官方 Web 对话」链接 + 当前项目上下文复制按钮）。

## 4. 分阶段验收

| 阶段 | 验收 |
| --- | --- |
| P0 独立壳 | ✅ 源码已实现（v0.5.0，待重启）：`/mofei/` 全屏平台 + vendor React UMD + app.js；重启后验证 |
| P1 原版 projects | 网格/列表/搜索/排序/新建导入，全部数据落 `.mofei-projects.json` |
| P2 原版 writing | TipTap 编辑器、三栏可调宽、多标签、查找替换、自动保存 |
| P3 world/dashboard | 世界书搜索/批量、写作仪表盘 |
| P4 AI 桥 | 选中文本 @提及 → DSH 会话；SSE 流式；子代理实测 |

## 5. 明确不做

- 不 fork/修改官方 Web 源码与 dist。
- 不把原版 Python agent_runtime/socket.io 后端搬进 DSH（由 DSH agent 体系替代）。
- 不在 `/mofei` 里重新实现模型设置/成本面板/i18n/PWA。
