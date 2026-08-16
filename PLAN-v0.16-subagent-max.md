# PLAN-v0.16：墨菲子代理辅助——subagent_with_model 增强 + 墨菲集成

> 生成：2026-08-16。基线 commit `43105fe`（v0.15.0 文件同步轮询）。
> 需求来源：用户希望墨菲（mofei-writer 写作会话）派生子代理时，能由墨菲自主指定
> **模型 / 推理强度 / 装配上下文**；同时担心第三方子代理插件与墨菲机制冲突。

---

## 1. 调研结论（已核实）

### 1.1 DSH 底层能力（完整支持，仅工具层未暴露）

- `dsh-subagent` → `dsh-agent` → `dsh-llm` → `llm-deepseek` 全链路支持每子代理覆盖
  `provider / model / maxTokens / reasoningEffort`（`resolveChildAgentOptions` 透传 `requested`；
  `dsh-agent` 的 `AgentOptions.reasoningEffort`；llm-deepseek 将 effort 映射为 wire `reasoning_effort`，
  合法值 `off | high | max`，本机模型 `deepseek-v4-pro` / `deepseek-v4-flash` 均支持）。
- 官方工具 `subagent` / `subagent_fork` 的模型侧 schema **不暴露**这些参数
  （仅 description / prompt / run_in_background）——「AI 调用时自主安排」原生做不到。

### 1.2 生态插件（npm，peerDeps 均 rc.6，与本机 DSH 0.1.0-rc.6 匹配）

| 插件 | 机制 | 冲突风险 | effort | 结论 |
| --- | --- | --- | --- | --- |
| `@aaravarr/dsh-subagent-max` v0.1.1 | 新增 `subagent_with_model` 工具（原生 ctx.subagents 薄壳），per-call model/provider；附带多面板子代理实时查看器 UI | **零冲突**（不碰官方工具） | ❌ 无 | ✅ 采用（增强） |
| `dsh-delegate-router` v0.2.1 | 包装官方 subagent/subagent_fork（作用域重注册 + agent/request 瀑布改写），关键词自动路由 Flash/Pro | **侵入墨菲流水线**（Writer→Reviewer 走官方 subagent） | ❌ 无 | ❌ 不装 |

### 1.3 墨菲隔离机制（零污染保证）

- `mofei-writer` preset 是**显式服务白名单**（isolate realm）：工具只在白名单出现才对写作会话可见；
  standard（coding）会话看不到 → 双向隔离成立。
- 官方 `subagent`/`subagent_fork` 保留原样 → 墨菲现有流水线不动。

---

## 2. 方案

### 2.1 vendor 增强包 `vendor/dsh-subagent-max/`（git 管理，link 挂载，不被 npm 覆盖）

基于官方 v0.1.1 解包，`lib/index.js` 增强：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `model`（原版） | string 必填 | 子代理模型 id（deepseek-v4-pro / deepseek-v4-flash） |
| `provider`（原版） | string 可选 | LLM provider 路由，省略继承父级 |
| `effort`（新增） | string 可选 `off\|high\|max` | 子代理推理强度 → `agentOptions.reasoningEffort` |
| `context`（新增） | string 可选 | 主模型手动装配的上下文，注入子代理 prompt 前置（`【主模型装配的上下文】…【任务】…`） |

### 2.2 profile 挂载（novel，3088）

- `~/.dsh/profiles/novel/package.json` dependencies 加
  `"@aaravarr/dsh-subagent-max": "link:F:/game/SillyTavern-1.13.2/OpenFic-DSH/vendor/dsh-subagent-max"`；
- `~/.dsh/profiles/novel/cordis.patch.yml` 加 entry（host 注册工具 + client 查看器 UI）；
- `pnpm install`（profile 目录）。

### 2.3 墨菲集成（两处 preset 文件同步）

- `presets/mofei-writer/agent.cordis.yml` 与 `~/.dsh/.agent-presets/mofei-writer/agent.cordis.yml`：
  - 白名单加 `tool-subagent-with-model`（name `@aaravarr/dsh-subagent-max`，
    config：`subagentProvider: spawn`、`toolName: subagent_with_model`、`backgroundMode: continuable`、`maxDepth: 3`）；
  - persona 增加「子代理装配」指导段：
    1. 派生子代理前先 `mofei_get-chapter-context` / `mofei_get-active-context` 取精装上下文，放入 `context` 参数；
    2. 按任务轻重指定 `model` 与 `effort`（深度创作/审稿 → pro + high/max；简单检索/摘要 → flash + off/high）；
    3. 继续沿用 Writer→Reviewer 流水线，子代理结果经 `report` 回传。

### 2.4 不动的东西

- 官方 `subagent` / `subagent_fork`（墨菲流水线原样）；
- `delegate-router` 不装；
- standard/coding 会话工具集不变（新工具仅写入写作 preset 白名单可见）。

---

## 3. 实施步骤

| # | 文件/动作 | 内容 |
| --- | --- | --- |
| 1 | `vendor/dsh-subagent-max/`（新增） | 解包官方 v0.1.1 + 增强 lib/index.js（effort/context）+ 增强说明 |
| 2 | `~/.dsh/profiles/novel/package.json` | dependencies 加 link 依赖 |
| 3 | `~/.dsh/profiles/novel/cordis.patch.yml` | 加 `dsh-subagent-max` entry |
| 4 | `~/.dsh/profiles/novel` | `pnpm install` |
| 5 | `presets/mofei-writer/agent.cordis.yml` | 白名单 + persona 子代理装配指导 |
| 6 | `~/.dsh/.agent-presets/mofei-writer/agent.cordis.yml` | 同步同 5 |
| 7 | 重启 3088 | 加载新插件与 preset |
| 8 | 验证 | 见 §4 |
| 9 | 文档 + 提交 | `PLAN-v0.16-subagent-max.md`（本文档）+ `v0.16-changelog.md` + git commit |

## 4. 验证方案

```powershell
# 1) 插件加载：3088 重启无错，dev_plugin_status 可见 dsh-subagent-max（host + client）
# 2) 工具注册：写作会话工具清单含 subagent_with_model（含 model/provider/effort/context 参数）
# 3) 隔离：standard（coding）会话工具清单不含 subagent_with_model（零污染）
# 4) 端到端（真实 LLM 回合）：写作会话下指令「派一个 flash + off 推理强度的子代理列出本项目的章节」→
#    工具帧显示 model=deepseek-v4-flash、effort=off、context 含项目上下文 → 子代理正常回传结果
# 5) 回归：verify-v0.14-view / -workbench 抽查（UI 未动，应全绿）
```

## 5. 风险与回滚

- 第三方包缺陷：功能独立于墨扉核心，卸载 = 移除 profile 依赖 + patch entry + preset 白名单三处，重启即还原；
- effort 值非法：llm-deepseek 会返回 `UNSUPPORTED_REASONING_EFFORT`（工具描述已限定枚举，模型按枚举传）；
- 客户端查看器 UI 依赖 `dsh-client-ui-primitives`（本机已装 rc.6，匹配）。

---

## 6. 实施结果（2026-08-16 已交付）

- 全部实施步骤完成（§3）。过程中发现并解决：link 包的 peer 依赖从 vendor 真实路径解析不到
  （`@deepseek-ai/schemastery` ERR_MODULE_NOT_FOUND）→ 为 vendor 包建 `node_modules` junction 指向
  `~/.dsh/profiles/node_modules`。
- 验证 `verify-v0.16-subagent.cjs` ALL PASS：
  - 写作会话工具清单含 `subagent_with_model`；standard 会话无（隔离成立）；
  - 真实回合工具帧参数 = `model=deepseek-v4-flash` + `effort=off` + `context=测试上下文`，全部正确；
  - 子代理回合完成并回传。
- 提交：commit 见 git log（`feat: v0.16.0 墨菲子代理辅助…`）。
