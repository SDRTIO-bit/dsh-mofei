# 墨扉 Agent 工具参考（mofei_* Tools）

> 面向在 `mofei-writer` 写作会话中调用工具或派生子代理的开发者。
> 这些工具由 `plugin/lib/tools.js` 注册，消费 Host 半体经 `ctx.provide('mofei')` 暴露的服务。
> 每个工具还有 `openfic_*` 旧名 alias（同实现，建议用 `mofei_*`）。

## 总量与机制

- **73 个唯一 `mofei_*` 工具**（另有 `openfic_*` 旧名 alias 在注册时自动生成，建议用 `mofei_*`）。
  `mofei_update-chapter` 与 `mofei_write-chapter`、`mofei_update-note` 与 `mofei_write-note`
  是成对的历史兼容名，指向同一 RPC 方法（`update-chapter` / `update-note`）。
- 全部工具经 `ctx.get('mofei').run(method, { ...args, _source: 'agent' })` 调用 Host RPC。
  `_source: 'agent'` 用于实体/章节 history 审计标记。
- 所有写操作走 Host 串行 `queue`；章节写带 `expectedRevision` 冲突保护。

## 写入约定（红线）

- 写正文（`mofei_write-chapter` / `mofei_edit-chapter` / `mofei_update-chapter`）**必须传
  `expectedRevision`**（来自 `mofei_read-chapter` 的 `revision`）。冲突时返回 `{ conflict: true,
  actualRevision }`，需重新读取再合并。
- 锁定笔记（`list-notes` 返回 `isLocked: true`）不可改：`update-note` / `write-note` 会返回
  `NOTE_LOCKED` 拒绝。
- 高风险操作（删项目/章/卷/角色/笔记/世界书/提示链）工具描述中标注「必须先取得作者明确确认」。

---

## 1. 上下文与项目

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_get-active-context` | `activeAgentContext` | 读取作者当前在工作台打开的项目/章节精装上下文（`bound`/`contextText`） |
| `mofei_list-projects` | `list-projects` | 列出全部项目及章节数 |
| `mofei_list` | `list-entities` | 列实体目录：`kind = chapters\|characters\|notes\|world\|volumes\|projects\|summaries\|chains\|roles` |
| `mofei_create-project` | `create-project` | 新建项目（需作者明确请求） |
| `mofei_update-project` | `update-project` | 改项目名/简介/字数目标 |
| `mofei_delete-project` | `delete-project` | 删除整本（高风险） |

## 2. 章节读写

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_read-chapter` | `read-chapter` | 读全文 + `revision`（写入前必拿） |
| `mofei_write-chapter` | `update-chapter` | 整章写入（带 `expectedRevision`） |
| `mofei_update-chapter`（别名） | `update-chapter` | 同上，历史兼容名 |
| `mofei_edit-chapter` | `edit-chapter` | 按行号局部改写（保留 revision 保护） |
| `mofei_create-chapter` | `create-chapter` | 新建章节（可指定 `volumeId`） |
| `mofei_update-chapter-meta` | `update-chapter-meta` | 改标题，不改正文 |
| `mofei_delete-chapter` | — | 删除章节（高风险） |
| `mofei_move-chapter` | `move-chapter` | 上/下移章节 |
| `mofei_set-chapter-volume` | `set-chapter-volume` | 移入/移出卷 |
| `mofei_reorder-chapters` | `reorder-chapters` | 按 id 列表整体重排 |
| `mofei_search-chapters` | `search-chapters` | 全文搜索（返回命中章节+行号） |
| `mofei_get-chapter-context` | `chapter-context` | 精装上下文：角色/未隐藏笔记/激活世界书/前情/章尾 |

## 3. 卷

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_create-volume` | `create-volume` | 新建卷 |
| `mofei_update-volume` | `update-volume` | 改卷标题/简介 |
| `mofei_delete-volume` | `delete-volume` | 删卷及其中章节（高风险） |
| `mofei_move-volume` | `move-volume` | 上/下移卷 |
| `mofei_reorder-volumes` | `reorder-volumes` | 按 id 列表整体重排 |

## 4. 角色（Character）

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_list-characters` | `list-characters` | 列角色（名/收藏/描述） |
| `mofei_read-character` | `read-character` | 读完整资料 |
| `mofei_write-character` | `create/update-character` | 有 `characterId` 则更新，否则新建 |
| `mofei_delete-character` | `delete-character` | 删除（高风险） |

## 5. 笔记（Note）

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_list-notes` | `list-notes` | 列笔记（隐藏不返回；含 `isLocked`） |
| `mofei_read-note` | `read-note` | 读可见笔记（隐藏拒绝） |
| `mofei_write-note` | `update-note` | 改标题/内容（锁定拒绝） |
| `mofei_update-note`（别名） | `update-note` | 同上，历史兼容名 |
| `mofei_create-note` | `create-note` | 新建（可指定分类） |
| `mofei_delete-note` | `delete-note` | 删除（高风险） |
| `mofei_move-note` | `move-note` | 移入分类 / 移回根 |
| `mofei_create-note-category` | `create-note-category` | 新建分类（可指定父） |
| `mofei_update-note-category` | `rename-note-category` | 重命名分类 |
| `mofei_delete-note-category` | `delete-note-category` | 删分类（笔记回根，高风险） |

## 6. 世界书（World Entry）

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_list-world-entries` | `list-world-entries` | 列条目（名/触发词/内容/开关） |
| `mofei_read-world-entry` | `read-world-entry` | 读完整内容 |
| `mofei_write-world-entry` | `create/update-world-entry` | 有 `entryId` 则更新，否则新建 |
| `mofei_create-world-entry`（别名） | `create-world-entry` | 历史兼容名 |
| `mofei_update-world-entry`（别名） | `update-world-entry` | 历史兼容名 |
| `mofei_delete-world-entry`（别名） | `delete-world-entry` | 历史兼容名 |
| `mofei_update-world-entries` | `update-world-entries` | 批量改启用/常驻状态 |
| `mofei_delete-world-entries` | `delete-world-entries` | 批量删除（高风险） |
| `mofei_move-world-entry` | `move-world-entry` | 上/下移条目 |

## 7. 摘要（Summary）

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_summarize` | `ai-summarize-chapters` | 批量章摘要（只重算过期，可 `maxAgeDays`） |
| `mofei_summarize-chapters`（别名） | `ai-summarize-chapters` | 历史兼容名 |
| `mofei_get-chapter-summary` | `chapter-summary` | 读某章持久化摘要 + 是否过期 |
| `mofei_save-chapter-summary` | `save-chapter-summary` | 写入某章摘要 |
| `mofei_summarize-ranges` | `ai-summarize-ranges` | 批量区间摘要（默认 10 章一组） |
| `mofei_get-range-summaries` | `range-summary-groups` | 列区间摘要分组 |
| `mofei_save-range-summary` | `save-range-summary` | 写某区间摘要 |

## 8. RAG 检索

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_rag-status` | `rag-status` | 读索引状态（是否 fresh） |
| `mofei_build-rag-index` | `rag-build-index` | 建/重建索引 |
| `mofei_search-rag` | `search-rag` | 跨章节语义检索（含角色/笔记/世界书/摘要） |
| `mofei_get-rag-context` | `rag-context` | 把检索结果整理为带来源引用的上下文文本 |
| `mofei_retrieve` | `retrieve` | 轻量本地倒排检索（章节/角色/笔记/世界书/摘要，带行号+score） |

## 9. 历史与回滚

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_history` | `entity-history` | 读实体历史快照 / 项目 git 历史 |
| `mofei_revert` | `rollback-entity` | 回滚实体到指定历史 revision |
| `mofei_project-history` | `git-history` | 读项目 git 提交史（可含 diff；非 git 优雅降级） |
| `mofei_diff-revision` | `git-diff` | 两提交间 unified diff |
| `mofei_revert-project` | `git-revert-project` | 文件树回滚到指定提交并从文件树重载 |

## 10. AI 会话与提示链

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_get-ai-history` | `ai-history` | 读项目 AI 助手会话历史（最近 80 条） |
| `mofei_clear-ai-history` | `ai-clear-history` | 清空 AI 会话历史 |
| `mofei_list-prompt-chains` | `list-prompt-chains` | 列项目提示词链 |
| `mofei_save-prompt-chain` | `save-prompt-chain` | 创建/更新提示链 |
| `mofei_delete-prompt-chain` | `delete-prompt-chain` | 删除提示链（高风险） |
| `mofei_compile-prompt-chain` | `compile-prompt-chain` | 以当前项目/章节编译（8 宏） |

## 11. 子代理角色（Role）

> 角色定义由 `subagent-max` 工具按 `projectId + roleId` 读取并拼接 persona。
> 有效角色 = 4 内置（writer/reviewer/analyzer/polisher）+ 项目覆盖/自建。

| 工具 | RPC | 说明 |
| --- | --- | --- |
| `mofei_list-roles` | `list-roles` | 列实际生效角色（含来源/覆盖状态） |
| `mofei_read-role` | `read-role` | 读角色提示词（content/isEnabled/order/来源） |
| `mofei_write-role` | `save-role` | 建项目角色，或以同 id 覆盖内置角色 |
| `mofei_delete-role` | `delete-role` | 删自建角色；内置只清覆盖（高风险） |

---

## 错误码速查（Host 返回 `{ error: '...' }`）

| 错误 | 含义 |
| --- | --- |
| `PROJECT_NOT_FOUND` | projectId 无效 |
| `CHAPTER_NOT_FOUND` / `CHARACTER_NOT_FOUND` / `NOTE_NOT_FOUND` / `WORLD_ENTRY_NOT_FOUND` | 实体不存在 |
| `NOTE_HIDDEN` | 隐藏笔记不可读 |
| `NOTE_LOCKED` | 锁定笔记不可改 |
| `INVALID_KIND` | `list-entities`/`entity-history` 的 kind 非法 |
| `INVALID_RANGE` / `BOUNDARY` | 行号越界 / 移动越界 |
| `DUPLICATE_WORLD_NAME` | 世界书重名 |
| `INVALID_ORDER` | reorder 的 id 列表不完整或重复 |
| `REVISION_NOT_FOUND` | 回滚目标 revision 不存在 |
| `METHOD_NOT_FOUND:<m>` | RPC 方法未注册（404） |
| `LLM_UNAVAILABLE` / `LLM_FAILED:*` / `LLM_EMPTY` | AI 链路错误 |
| `WORKSPACE_ROOT_REQUIRED` | 该操作需要绑定工作区 |
| `REQUIRED_INSTRUCTION_UNAVAILABLE:<ids>` | 角色引用的指令缺失 |

> 实际方法总数见 `plugin/lib/index.js` 的 `handlers` 对象（当前 114 个 RPC 方法），
> 工具层是其中的 73 个写作子集。新增工具请以 `tools/verify-agent-tools.mjs` 实测注册数为准。
