# 墨扉 × DSH Agent 协作指南

> 目标：让会话 agent（或子代理）通过 `mofei_*` 工具直接读写 墨扉 项目，
> 实现「人写草稿 → Agent 润色 → Reviewer 把关」的写作流水线。
> 前置：在「写作环境」中使用——`dsh --profile novel --port 3088`（注意：不要写中间的 `web` 子命令；
> 3081 是 WSL DSH，勿占用。默认 web profile 为纯 coding，不加载 dsh-mofei）；
> 工具注册成功（`Tool.listTools` 中可见 `mofei_*` 即注册成功）。

## 工具清单（Host 注册）

| 工具 | 用途 | 注意 |
| --- | --- | --- |
| `mofei_list-projects` | 列出项目与章节数 | — |
| `mofei_read-chapter` | 读章节全文 + `revision` | 写入前必须拿到 revision |
| `mofei_search-chapters` | 全文搜索（行号） | 一致性自检用 |
| `mofei_list-characters` | 角色（名称/收藏/描述） | 写作前必读 |
| `mofei_list-notes` | 笔记（标题/分类/`isLocked`） | 隐藏笔记不可见；锁定笔记不可改 |
| `mofei_list-world-entries` | 世界书条目（触发词/内容/开关） | 设定一致性用 |
| `mofei_get-chapter-context` | 精装上下文（角色/笔记/世界书/前情/章节尾） | 写作/摘要前优先用 |
| `mofei_update-chapter` | 写正文（冲突保护） | 传 `expectedRevision`，冲突会返回 `{conflict}` |
| `mofei_create-chapter` | 新建章节 | 可指定 volumeId |
| `mofei_update-note` | 改笔记 | 锁定笔记拒绝（NOTE_LOCKED） |
| `mofei_get-ai-history` | 读项目 AI 会话历史 | v0.3.1 |
| `mofei_clear-ai-history` | 清空项目 AI 会话历史 | v0.3.1 |
| `mofei_summarize-chapters` | 批量章节摘要（≤30 章，只重算过期章并持久化） | v0.5.0 起支持 `maxAgeDays` |
| `mofei_get-chapter-summary` | 读某章持久化摘要 + 是否过期 | v0.5.0 |
| `mofei_save-chapter-summary` | 写入某章摘要（记录修订号） | v0.5.0 |
| `mofei_get-range-summaries` | 列出区间摘要分组（默认 10 章一组） | v0.5.0 |
| `mofei_save-range-summary` | 写入某个区间摘要 | v0.5.0 |
| `mofei_summarize-ranges` | 批量区间摘要（只重算过期区间） | v0.5.0 |

> 全表共 73 个 `mofei_*` 工具（另带 `openfic_*` 旧名兼容别名），完整清单以
> `plugin/lib/tools.js` 的 `buildTools` 为准。上表未列的高频工具：
> `mofei_get-active-context`（当前绑定项目/章节上下文，写作会话首调）、
> `mofei_write-chapter` / `mofei_edit-chapter` / `mofei_update-chapter-meta` /
> `mofei_delete-chapter` / `mofei_move-chapter` / `mofei_set-chapter-volume` /
> `mofei_reorder-chapters`、`mofei_read-character` / `mofei_write-character` /
> `mofei_delete-character`、`mofei_read-note` / `mofei_write-note` /
> `mofei_create-note` / `mofei_update-note-category`、`mofei_read-world-entry` /
> `mofei_write-world-entry` / `mofei_create-world-entry` / `mofei_update-world-entries` /
> `mofei_delete-world-entries`、`mofei_rag-status` / `mofei_build-rag-index` /
> `mofei_search-rag` / `mofei_get-rag-context`、`mofei_history` / `mofei_revert` /
> `mofei_diff-revision` / `mofei_project-history` / `mofei_revert-project`、
> `mofei_summarize`、`mofei_retrieve`、`mofei_list`、
> `mofei_list-prompt-chains` / `mofei_save-prompt-chain` / `mofei_delete-prompt-chain` /
> `mofei_compile-prompt-chain`、`mofei_list-roles` / `mofei_read-role` /
> `mofei_write-role` / `mofei_delete-role`、卷管理 `mofei_create-volume` /
> `mofei_update-volume` / `mofei_move-volume` / `mofei_delete-volume` /
> `mofei_reorder-volumes`、项目管理 `mofei_create-project` / `mofei_update-project` /
> `mofei_delete-project`。

## 写作流水线（子代理协作）

### Writer（初稿/续写）
提示词模板：

```
你是 Writer。项目 id 是 {projectId}。
1) mofei_list-characters + mofei_list-notes 读设定；
2) mofei_read-chapter 读 {chapterId}；
3) 续写/改写正文，遵守 mofei-writing 技能红线；
4) mofei_update-chapter 提交（expectedRevision = 读取到的 revision）。
```

### Reviewer（审稿）
提示词模板：

```
你是 Reviewer。用 mofei_read-chapter 读 {chapterId}，用 mofei_search-chapters
检查以下设定词是否一致：{关键设定词列表}。输出：问题清单（严重度 + 位置 + 建议），
不直接改正文。若无问题输出「PASS」。
```

### 主会话编排

1. 主 agent 用 `subagent` 启动 Writer（背景运行），拿到写入结果。
2. 启动 Reviewer 复核。
3. Reviewer 发现问题 → 主 agent 把问题清单发给 Writer 修（`send_message` 延续同一子代理）。
4. 循环至 PASS 或达到轮次上限。

## 与 UI 的并发安全

- 所有写操作走 Host 串行队列，UI 与 Agent 同时写入不会互相覆盖。
- Agent 提交用 `expectedRevision`；若用户同时在 UI 保存，Agent 会收到冲突，
  应重新 `read-chapter` 后合并再提交。
- 数据文件唯一，不要绕过插件直接改 `.mofei-projects.json`。

## 写作指令与技能（v0.24 现状）

- 「17 个 mofei-* 写作指令」**不再注册为 DSH runtime skills**：它们是
  `plugin/lib/instructions.js` 里的私有指令，派生子代理（`subagent_with_model`）时
  按角色注入 `request.persona`；写作或审稿前按需使用，至少遵循 `mofei-writing` 红线。
- 用户自创技能写在 `~/.dsh/skills/*.md`，由 DSH skill-filesystem 发现（墨扉工作台
  的技能库面板可开关/自建）；禁用名单存于 `.mofei-skill-settings.json`。
- 完整写作技能内容见仓库 `skills/`（如 `skills/mofei-writing.md`）。

## @提及桥接（v0.8）

- 编辑器「送章 / 送选中」会把结构化提及直接注入当前 DSH 会话
  （文案含 projectId/chapterId + `mofei_read-chapter` 指引）。
- 无当前会话时自动降级为复制到剪贴板，编辑区会显示蓝色提示。
- 流水线冒烟：`node tools\verify-writing-pipeline.mjs`（Writer→Reviewer→冲突保护→合并提交）。

## Prompt Chains（v0.9）

- 编辑器「链」按钮管理项目级提示词链：8 宏编译（{{project}} {{chapter}} {{chapterText}}
  {{selected}} {{characters}} {{world}} {{notes}} {{instruction}}）+ 一键运行（结果写入 AI 会话历史）。
- 需 DSH 重启后可用（新 RPC：list/save/delete/compile/run-prompt-chain）。

## 下一步（未实现）

- ~~真实子代理 Writer→Reviewer 流水线实测~~ ✅ v0.9.1 已在 3088 novel 实测通过
  （`node tools\verify-subagent-pipeline.mjs`，Writer done/revision 3 + Reviewer PASS）。
- 写作时长记录、prompt chains 版本 diff、独立全屏项目页/分页、legacy.js 继续拆分。
- 实体回滚目前是 UI/RPC 能力；Agent 操作审计尚未接入实体 history。
