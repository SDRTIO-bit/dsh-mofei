# PLAN-v0.17：技能开关/自创技能入口 + 会话导航改进

> 生成：2026-08-16。基线 commit `14fbb77`（v0.16.1）。
> 需求来源（用户反馈）：
> 1. 墨菲技能槽 17 个技能不知有何用、怎么用；想要 OpenFic 式技能开关 + 自创技能入口；
> 2. 墨菲内找不到退出当前对话的入口，也找不到历史会话记录（必须先退出墨菲去官方 DSH 选会话）。

---

## 1. 现状（已核实）

### 1.1 技能

- 17 个 `mofei-*` 写作技能由 `plugin/lib/skills-plugin.js` **全量注册**进写作 preset（isolate realm）；
- DSH 技能是**按需加载**：AI 用 `skill` 工具按名加载内容进上下文；
- `skills-library.js` 面板只是**展示目录**（名称/描述/内容预览），无开关、无自创入口；
- DSH 的 `dsh-skill-filesystem` 原生扫描 `~/.dsh/skills/` 与项目 `.dsh/skills/` 的 markdown 技能
  （frontmatter：name / description / whenToUse + 正文内容）→ **自创技能零改 DSH**。

### 1.2 会话导航

- 墨菲顶栏「写作助手」菜单（`mf-writer-session-menu`）**只显示当前项目的专属写作会话**（打开/新建）；
- 无完整历史会话列表、无「退出当前对话」；
- 命令面板的 `close-workbench`（退出墨菲）在 web 模式下被过滤（`mode==='web'` 隐藏）。

---

## 2. 方案

### 2.1 技能开关 + 自创技能入口

| 层 | 改动 |
| --- | --- |
| Host `plugin/lib/index.js` | 新增 `.mofei-skill-settings.json`（`{ version:1, disabledSkills: [] }`）；RPC：`list-skill-settings`（17 技能 + 启用态 + `~/.dsh/skills` 自创列表）、`set-skill-enabled`、`create-custom-skill`（写 `~/.dsh/skills/<slug>.md`，frontmatter 对齐 skill-filesystem）、`delete-custom-skill`；`mofeiService` 暴露 `listSkillSettings` |
| `plugin/lib/skills-plugin.js` | 注入加 `mofei`，注册时按 `disabledSkills` 过滤（关闭的技能 AI 不可见） |
| Client `skills-library.js` | 面板加：每个技能启用开关 + 「新建技能」表单（名称/描述/触发场景/正文）+ 自创技能列表（删除） |
| Client `legacy.js` | `openWritingSkills` 改异步拉取 settings 并传入面板 |

### 2.2 会话导航改进（纯 Client，`legacy.js`）

- 会话菜单升级为两区：
  - **当前项目写作会话**（原样保留：打开/新建）；
  - **全部会话**：`sessions.list` 快照（已订阅 `chatSessionList`），逐条显示标题 + 预设徽标
    （`✍ mofei-writer` / `· standard`）+ 最后活跃时间；点击 → `sessions.open(id)` + 切换右侧面板；
- 新增「退出当前对话」按钮：清空 `chatSessionId` 绑定，右侧面板回到会话选择态；
- 命令面板新增：`/mofei:sessions`（打开会话菜单）、`退出当前对话`。

## 3. 实施步骤

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `plugin/lib/index.js` | skill settings 存储 + 4 个 RPC + mofeiService 方法 |
| 2 | `plugin/lib/skills-plugin.js` | 按 disabledSkills 过滤注册 |
| 3 | `plugin/src/client/skills-library.js` | 开关 + 新建/删除自创技能 UI |
| 4 | `plugin/src/client/legacy.js` | 接线 skills 面板 + 会话菜单升级 + 命令面板 |
| 5 | `plugin` | `npm run build` 重建 client bundle |
| 6 | 重启 3088 + 验证 | `verify-v0.17-skills-sessions.cjs`（新）：开关生效（AI 工具清单变化）、自创技能文件落盘、会话菜单含全部会话、退出当前对话可用 |
| 7 | 文档 + 提交 | `PLAN-v0.17-skills-sessions.md`（本文档）+ `v0.17-changelog.md` + git commit |

## 4. 验证要点

```text
1. 面板关闭某技能 → 写作会话 skill 工具不再加载该技能（工具清单对比）
2. 新建自创技能 → ~/.dsh/skills/<slug>.md 落盘 → 会话 skill 工具可加载
3. 会话菜单列出全部 DSH 会话（mofei-writer/standard 徽标区分）→ 点击切换成功
4. 退出当前对话 → 右侧面板解除绑定，再打开可重新选择
5. 回归：verify-v0.16-subagent / v0.15-sync / v0.14-view 抽查
```

## 5. 风险

- 技能注册发生在 preset isolate realm：开关配置改动后需**重新创建写作会话**才完全生效（会话已锁定预设）；
  提示文案注明「下次新建写作会话生效」；
- 自创技能 md 格式不符会被 skill-filesystem 忽略——create RPC 按规范生成 frontmatter；
- 会话菜单数据来自 `sessions.list` 快照订阅，删除/归档会话由官方管理，墨菲只做展示与切换。

---

## 6. 实施结果（2026-08-16 已交付）

- 全部实施步骤完成（§3）：Host 4 个 RPC + skill settings 存储；skills-plugin 按开关过滤注册；
  面板开关/新建表单；会话菜单升级（全部会话/徽标/切换）+ 退出当前对话 + 命令面板；
  client bundle 重建，3088 重启。
- 验证：`verify-v0.17-skills-sessions.cjs` 10 项 ALL PASS；
  `verify-v0.14-view.cjs` 回归 ALL PASS。
- 提交：commit 见 git log（`feat: v0.17.0 技能开关/自创技能 + 会话导航改进`）。
