# 墨扉（Mofei）× DSH 运行状态快照

> 更新：2026-08-15（源码 v0.10.0：MOFEI-SPEC + mofei-writer 隔离 + MOFEI-STUDIO 已交付）。
> 写作环境：`dsh --profile novel --port 3088`（3081 为 WSL DSH，勿占用）；默认 `dsh web`（3080）为纯 coding。

## 插件身份

```text
形态:         固定插件（npm 包 mofei-dsh v0.10.0）
源码:         F:\game\SillyTavern-1.13.2\OpenFic-DSH\plugin\
装配:         C:\Users\zhao\.dsh\profiles\novel\cordis.patch.yml + profile package.json link（默认 web = 纯 coding）
Host:         /api/mofei RPC + SSE 流式 + /mofei 独立站点（P0）+ mofei_* Agent 工具（33 个，另有 33 个 openfic_* alias，仅 mofei-writer）
Client:       ModuleLoader 自动装配（右下角/侧栏「墨扉」按钮 + 工作区 UI + 项目网格页 + AI 流式生成）
兼容:         /api/openfic 旧路由、openfic_* 工具、openfic-* skills 过渡保留
```

## RPC（/api/mofei）

bootstrap / list-projects / stats（含 calendar）/ create|update|delete-project /
create|update-meta|delete|move-chapter / reorder-chapters / update-chapter / chapter-history / rollback-chapter /
search-chapters / create|update|delete|move-volume / reorder-volumes / set-chapter-volume /
create|update|delete-character / toggle-character-favorite /
create-note-category / rename|delete-note-category / create|update|delete|move-note /
save-draft / clear-draft /
import-txt-preview / import-txt-confirm / export-project-txt / ai-assist /
create|update|delete|move-world-entry / import-world-info-json / chapter-context /
ai-history / ai-clear-history / ai-summarize-chapters（只重算过期章并持久化）/
chapter-summary / save-chapter-summary / summary-plan /
range-summary-groups / save-range-summary / ai-summarize-ranges
SSE: POST /api/mofei/stream/ai-assist（delta → done/error，自动持久化会话历史）

## Agent 工具

- 新名 33 个：`mofei_*`（v0.10 工具极简化 + 兼容旧名；list-projects / read-chapter / search-chapters / list-characters /
  list-notes / update-chapter / create-chapter / reorder-chapters / reorder-volumes / update-note /
  list-world-entries / get-chapter-context / create-world-entry / update-world-entry /
  delete-world-entry / get-ai-history / clear-ai-history / summarize-chapters /
  get-chapter-summary / save-chapter-summary / get-range-summaries / save-range-summary / summarize-ranges）
- 旧名 alias 33 个：`openfic_*`（描述标注「旧名兼容」）
- v0.9.1 修复：`read-chapter.volumeId` / `get-chapter-summary.entry` 可空字段用 `oneOf`；
  所有工具 render 为 `render(args, value)`，模型可看到真实业务返回。
- v0.10.0：工具/技能移入 `mofei-writer` preset；普通 standard 会话完全隔离。

## 写作技能

- 新名 17 个：`mofei-*`（character-design / character-relationship / deslop-lexicon / deslop-writing /
  dialogue-design / emotional-arc / opening-design / prose-format / reader-contract / reversal-design /
  short-submission / story-deconstruction / story-hooks / story-quality / story-state-tracking /
  villain-reveal / writing）
- 旧名 alias 17 个：`openfic-*`
- 实测 `skill.list` 中 mofei 17 + openfic 17；总表另含 DSH 内置技能。

## 数据文件（sandboxPolicy.workspaceRoot；部署变化用 /api/host.describe 确认）

```text
.mofei-projects.json      v4：projects[].{ chapters[], volumes[], characters[], notes[], noteCategories[], worldEntries[] }
.mofei-drafts.json        v1
.mofei-stats.json         v1（stats RPC 返回 calendar 视图）
.mofei-ai-sessions.json   v1：sessions[projectId].messages[]，上限 80 条
.mofei-summaries.json     v1：chapters[chapterId]{summary,chapterRevision,updatedAt} + ranges[]
旧 .openfic-*.json        首次 load 自动迁移为 .mofei-*.json（旧文件保留）
```

## 验收状态（2026-08-15，3088 新 Host，全绿）

- 启动日志无 tool register failed。
- HTTP：/api/mofei、/api/openfic bootstrap OK；client.js 200；/mofei/ 200。
- 单测：test-txt / world / ai / summary / prompt-chain 全过；client 各模块全过；test-host 46/46。
- 流水线冒烟：tools/verify-writing-pipeline.mjs ALL PASS。
- 浏览器：verify-v0.6 / v0.7 / v0.8 / v0.9 / v7 / v5-ui 全部 ALL PASS（新 Host 路径不再 SKIP）。
- Agent 面：agent 可见 66 tools（33 mofei_* + 33 openfic_*）；skills 17+17。
- **真子代理流水线：Writer → done/revision 3；Reviewer → PASS；章节回读 revision=3、325 字；临时项目已删除。**
- 新增验收脚本：tools/verify-agent-surface.mjs / verify-agent-tools.mjs / verify-subagent-pipeline.mjs。

## 启动与回归命令

```powershell
# 首次安装链接依赖
dsh plugin --profile novel install

# 启动（注意不要写中间的 web）
dsh --profile novel --port 3088

# 回归
$env:MOFEI_BASE = 'http://127.0.0.1:3088'
node tools\verify-agent-surface.mjs
node tools\verify-agent-tools.mjs
node tools\verify-subagent-pipeline.mjs
```
