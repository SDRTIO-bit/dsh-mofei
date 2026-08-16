# SUBAGENT-HANDOFF v0.8（@提及桥接 / 实体快照回滚 / 子代理流水线）

> 生成：2026-08-15。基线：v0.7.0 已全绿（test-host 32/32 + verify-v0.7/v0.6/v7/v5-ui 全 PASS）。
> 本批范围：GAP-ANALYSIS v0.8。**子代理只写指定文件，主代理统一集成。**
> Host 改动（工作包 A）需重启 DSH 生效；client 改动即时生效。

## 共享约束

- 工作目录：`F:\game\SillyTavern-1.13.2\OpenFic-DSH`
- 不破坏现有 46 个工具注册、17 skills、既有 RPC 形状与错误码。
- 客户端新文件禁止顶层 `import 'react'`；纯函数 ESM、无 DOM、无第三方依赖。
- 不要运行 esbuild；不要改 legacy.js / 其他 client 模块 / 文档；A 不要改除 lib/index.js 与 test-host.mjs 外的文件。
- 自测全 PASS 后交付：文件清单、导出/RPC 签名、测试数、输出摘要、与规格出入。

## 工作包 A：实体快照与回滚（独占 lib/index.js + test-host.mjs）

目标：角色 / 笔记 / 世界书条目三种实体获得「版本历史 + 回滚」能力，与章节 `chapter-history`/`rollback-chapter` 体验对齐。

### A1. 数据与快照

- 常量 `ENTITY_HISTORY_MAX = 50`（超出丢最旧）。
- 实体 `history` 数组惰性创建，不改数据模型版本（旧数据无 history 视为空）。
- 快照内容（回滚要恢复的字段）：
  - character：`{ name, description, isFavorited }`
  - note：`{ title, content, categoryId, isLocked, isHidden }`
  - world entry：`{ name, keys: normalizeKeys(item.keys), content, isEnabled: item.isEnabled !== false, constant: !!item.constant, order: typeof item.order === 'number' ? item.order : 0 }`
- `pushEntityHistory(entity, kind)`：若 entity 非对象直接返回；把当前值按上面口径存为
  `{ at: Date.now(), revision: (entity.history ? entity.history.length : 0) + 1, snapshot }`，
  追加进 `entity.history`，超过 `ENTITY_HISTORY_MAX` 从头部丢弃。调用方必须在**任何实际修改前**调用。
- 必须接入的修改点（只在这些 handler 真正会改字段时 push；若参数没有可改字段可不 push）：
  - `update-character`（name/description/isFavorited）
  - `update-note`（title/content/isLocked/isHidden）
  - `move-note`（categoryId 变化时）
  - `update-world-entry`（name/keys/content/isEnabled/constant）
  - `move-world-entry`（order 变化时）
  - `update-world-entries`（批量 patch 时，对每个受影响实体先 push 一次再改）
  - 创建 / 删除不需要历史。
- 章节不动（继续用原有 chapter history）。

### A2. RPC

```js
'entity-history': async (args) => {
  // { projectId, kind: 'character'|'note'|'world-entry', entityId }
  // 成功 -> { kind, entityId, history: [ { revision, at, snapshot }, ... ] }
  // 顺序：最新在前（同 chapter-history 的 reverse 口径）
  // 错误：PROJECT_NOT_FOUND / INVALID_KIND / ENTITY_NOT_FOUND
}
'rollback-entity': async (args) => {
  // { projectId, kind, entityId, toRevision }
  // 成功 -> { entity: <对应 view>, historyCount }
  // 语义：先 pushEntityHistory(当前值)（产生一条新历史），再把目标 revision 的 snapshot 写回实体
  // 错误：PROJECT_NOT_FOUND / INVALID_KIND / ENTITY_NOT_FOUND / REVISION_NOT_FOUND
}
```

- 内部 `resolveEntity(project, kind, entityId)` 返回实体或 null；`entityViewFor(project, kind, entity)` 返回 characterView / noteView / worldEntryView。
- 不注册新 Agent 工具；保持 23 个 mofei_* 不变。

### A3. test-host（新增 ≥7 项，既有 32 项全不回归）

用独立项目隔离（创建后删除）：
1. character：两次 update → history 长度/快照正确；rollback 到 revision 1 → 名称/描述恢复、revision2 成为历史。
2. note：update + move-note 产生历史；rollback 恢复 categoryId 与 content。
3. world entry：update + `update-world-entries` 批量开关各自产生快照；rollback 恢复 name/keys/isEnabled。
4. entity-history 最新在前、INVALID_KIND、ENTITY_NOT_FOUND、REVISION_NOT_FOUND。
5. move-world-entry 产生 order 快照且 rollback 恢复 order（可与 3 合并）。
6. 持久化：rollback 后重新加载（第二个 plugin 实例读同一文件）history 仍在。
7. ENTITY_HISTORY_MAX：循环 55 次 update-character，历史长度 ≤50（用 `entity-history` 断言）。

自测：
```text
node --check plugin\lib\index.js
node test-host.mjs
```

## 工作包 B：@提及桥接纯函数（新文件）

新增：`plugin/src/client/agent-bridge.js` + `agent-bridge.test.mjs`。只做文案构建，不 fetch、不发 prompt、无 DOM。

导出：

```js
export const MENTION_MAX_EXCERPT = 4000
export function truncateMention(text, max = MENTION_MAX_EXCERPT)  // String 化/trim/码点截断
export function buildChapterMention(input)     // 整章提及
export function buildSelectionMention(input)   // 选中文本提及
export function buildRangeMention(input)       // 行区间提及
```

- input 形状（全部字段缺失安全）：
  - `{ projectTitle, chapter: { id, title, content }, excerpt? }`
  - `{ projectTitle, chapter: { id, title, content }, selected }`
  - `{ projectTitle, chapter: { id, title }, startLine, endLine, lines: string[] }`
- 输出格式统一为：

```text
【墨扉 · 项目《{projectTitle}》 · 章节《{chapterTitle}》】
projectId / chapterId 由主代理在调用时补？——不：input 内若含 projectId/chapterId 则输出
projectId: {projectId}
chapterId: {chapterId}
范围: 整章 | 选中文本 | L{start}-L{end}
---
{excerpt / selected / 行区间拼接}
---
请用 mofei_read-chapter 读取该章节完整内容后，按上面的上下文继续处理写作任务。
```

精确文案（实现时固定这些行）：
- 整章：
```
【墨扉 · 项目《P》 · 章节《T》】
projectId: PID
chapterId: CID
范围: 整章
---
EXCERPT
---
请用 mofei_read-chapter 读取该章节完整内容后，继续写作任务。
```
- 选中：
```
【墨扉 · 项目《P》 · 章节《T》】
projectId: PID
chapterId: CID
范围: 选中文本
---
SELECTED
---
请针对上面选中文本处理（润色/改写/续写，由任务决定），并用 mofei_read-chapter 核对全文一致性。
```
- 行区间：
```
【墨扉 · 项目《P》 · 章节《T》】
projectId: PID
chapterId: CID
范围: L{start}-L{end}
---
L1: ...
...
---
请针对上面的行区间处理，并用 mofei_read-chapter 核对全文一致性。
```
- 空 projectTitle → 「未命名项目」；空 chapter.title → 「未命名章节」；selected 空 → 空串（但组件层阻止空发送）。
- excerpt 默认取 `chapter.content`，经 `truncateMention` 截断 4000。
- 行区间 `lines` 非数组或越界安全（用 `lines.slice(start-1,end)` 后逐行 `L{n}: {text}`）。

测试 ≥14 项：truncate 空/长/码点/非字符串；三类 mention 完整文案与空字段兜底；projectId/chapterId 缺失不输出该行；range 越界；行拼接；selected 截断。

自测：
```text
node --check plugin\src\client\agent-bridge.js
node plugin\src\client\agent-bridge.test.mjs
```

## 主代理后续（子代理不要做）

- legacy.js：`apply(ctx)` 捕获 `ctx.get('sessions')` 存入模块级 bridge；编辑器头部新增「送章 / 送选中」按钮；
  无当前会话时降级 `navigator.clipboard` 复制；接入 agent-bridge 文案。
- 实体编辑器头部加「历史」按钮 + 回滚 UI（调 entity-history / rollback-entity）。
- esbuild + 全量测试 + `verify-v0.8.cjs`（桥接按钮可见性/文案单测；实体回滚 UI 重启后跑）。
- `tools/verify-writing-pipeline.mjs`：Writer→Reviewer 子代理流水线脚本（重启后执行）。
- 文档/changelog/GAP 更新。
