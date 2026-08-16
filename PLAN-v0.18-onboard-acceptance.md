# PLAN-v0.18：初始向导（小说文件夹）+ 会话入口 + 质感统一 + 整体验收

> 生成：2026-08-16。基线 commit `0248f23`（v0.17.1）。
> 需求来源（用户）：
> 1. 项目开始的**准备阶段**：空白状态引导选择"小说文件夹"，之后一切文件保存在该文件夹；
> 2. Bug A：打开墨菲后无法直接选择对话历史（要退出墨菲去官方 DSH 选会话再回来）；
> 3. Bug B：墨菲界面质感与原版 DSH 有差异；
> 4. 对整体项目做一次评估验收并 git 提交。

---

## 1. 现状（已核实）

### 1.1 存储模型

- 所有项目数据存工作区 `.mofei-*.json`（缓存）+ `.mofei/projects/<id>/**`（文件树镜像，唯一事实源）；
- `mirrorFileTree` / `importFileTree` / `file-tree-status` 均基于 `mofeiFileRoot/projects/<id>`；
- **无项目级自定义目录**——用户无法选择小说存放位置。

### 1.2 Bug A（会话历史入口）

- 官方会话列表在左侧侧栏，变形时被收成 55px 窄条；
- 官方空态 composerHero **没有会话历史列表**；
- 墨菲内唯一的会话入口是顶栏「写作助手」按钮（v0.17 已含"全部会话"），不够显眼；
- 复现确认：变形后右侧为空态，用户必须收起墨菲 → 官方侧栏选会话 → 再进墨菲。

### 1.3 Bug B（质感差异）

- 墨菲工作台大量**硬编码色**（`#0d0e11`/`#101115`/`#111217`/`#141416` 等）；
- 官方组件用 `--dsw-alias-*` 令牌（墨韵皮肤 override 的同一套）→ 两边观感有细微差异，且墨菲不随主题切换。

### 1.4 目录选择能力

- `host.pickDirectory` RPC 可用（payload 空对象 → path | null=取消），native 能力已装配（Windows 原生对话框）。

---

## 2. 方案

### 2.1 初始向导（准备阶段）

**触发**：进入墨菲且 `store.projects` 为空 → 全屏向导覆盖层（`.mf-onboard`）。

**流程**：
1. 欢迎文案（"开始你的第一本小说"）；
2. 「选择小说文件夹」按钮 → `host.pickDirectory`（原生对话框）→ 显示所选路径；
3. 输入小说名（默认"未命名小说"）；
4. 「开始写作」→ `create-project({ title, rootDir })` → 进入工作台。

**Host 支持（项目级 rootDir）**：
- `project.rootDir`（可选绝对路径）；`projectFileBase(project)` = rootDir 或 `mofeiFileRoot/projects/<id>`；
- `mirrorFileTree`：有 rootDir 的项目全部实体文件写 `<rootDir>/`（chapters/characters/notes/world/chains/summaries/project.yml）；
- `importFileTree`：对 store 中 rootDir 非空的项目从 rootDir 导入（复用 per-project 导入逻辑）；
- `file-tree-status`：路径按 projectFileBase 计算；
- `delete-project`：**不删除 rootDir**（用户的小说文件夹不属于墨菲）；
- `create-project` 接受 `rootDir`；`list-skill` 等不受影响；
- 兼容：rootDir 为空 = 现状路径，老项目零影响。

**UI**：`legacy.js` 空白检测 + 向导组件（复用目录选择 + 表单）。

### 2.2 Bug A：会话入口

- 顶栏按钮「写作助手」→「**会话**」（title："选择/切换历史会话或新建写作会话"）；
- 变形后自动弹会话菜单一次：`chatSessionId` 为空 且 存在非 subagent 历史会话 → 500ms 后 `setChatSessionsOpen(true)`（用户可直接点历史会话承接上次对话）；
- 菜单样式不变（全部会话 + 项目写作会话 + 退出当前对话）。

### 2.3 Bug B：质感统一

`plugin/src/client/legacy.js` 硬编码色替换为令牌（墨韵皮肤同一套，随主题联动）：

| 硬编码 | 令牌 |
| --- | --- |
| `.mf-bubble-panel` `#0d0e11` | `var(--dsw-alias-bg-layer-1)` |
| `.mf-panel.mf-view` `#0d0e11` | `var(--dsw-alias-bg-layer-1)` |
| `.mf-panel.mf-view .mf-head` `#111217` | `var(--dsw-alias-bg-layer-2)` |
| `.mf-panel.mf-view .mf-col` `#101115` | `var(--dsw-alias-bg-layer-1)` |
| `.mf-panel.mf-view .mf-editor` `#0d0e11` | `var(--dsw-alias-bg-base)` |
| `scrollBody` `#101115` | `var(--dsw-alias-bg-layer-1)` |
| 会话菜单 `#141416` | `var(--dsw-alias-bg-overlay)` |
| 边框 `rgba(255,255,255,.08)` 类 | `var(--dsw-alias-border-l1)` |

### 2.4 整体评估验收

- 全部回归：`verify-v0.14-{view,chat,writing,isolation,workbench,t5}` + `verify-v0.15-sync` + `verify-v0.16-subagent` + `verify-v0.17-skills-sessions`；
- 单元测试：`plugin/**/*.test.mjs`；
- 静态检查：`node --check` 全部 lib/src；
- 验收报告：`docs/ACCEPTANCE-2026-08.md`（版本线 v0.14→v0.17.1 交付清单 + 本轮验收结果 + 已知遗留）；
- 全部提交。

---

## 3. 实施步骤

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `plugin/lib/index.js` | projectFileBase + mirror/import/file-tree-status 支持 rootDir；create-project 接受 rootDir；delete-project 不删 rootDir；`get-project-root` RPC（向导回显） |
| 2 | `plugin/src/client/legacy.js` | 初始向导覆盖层（空白检测/pickDirectory/表单）；按钮「会话」+ 自动弹菜单；硬编码色→令牌 |
| 3 | `plugin/lib/client.js` | 重建 bundle |
| 4 | `verify-v0.18-onboard.cjs`（新） | 向导端到端：空白→选目录（模拟路径）→创建→文件落盘 rootDir→读回 |
| 5 | 回归全套 + 单元测试 | 见 2.4 |
| 6 | `docs/ACCEPTANCE-2026-08.md` | 验收报告 |
| 7 | git 提交 | 全部 |

## 4. 验证要点

```text
1. 空白状态（新建临时 profile 数据或清空 store 场景）：进入墨菲显示向导
2. 选择目录 → create-project(rootDir) → .mofei/projects/<id> 不建实体文件，
   <rootDir>/chapters/*.md 等落盘
3. 重启后 import 从 rootDir 读回（文件优先）
4. 会话按钮自动弹出菜单（无绑定且有历史时）→ 点击历史会话直接承接
5. 截图 vision 对比：墨菲工作台与官方面板色板一致（无硬编码色残留）
6. 全套回归 + 单元测试 ALL PASS
```

## 5. 风险

- rootDir 指向工作区之外：文件树导入/镜像按绝对路径，需防 rootDir === mofeiFileRoot 或空；
- 向导只在 projects 全空时出现（现有测试项目会被向导影响？——不影响，非空即跳过）；
- pickDirectory 返回 null（用户取消）→ 向导停留，可继续选择；
- 老项目（无 rootDir）路径不变，零迁移。
