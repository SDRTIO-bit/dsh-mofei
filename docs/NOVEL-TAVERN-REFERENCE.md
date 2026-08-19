# dsh-novel-tavern 参考手册（给墨扉的借鉴清单）

> 日期：2026-08-20。来源：`F:\game\SillyTavern-1.13.2\dsh-novel-tavern-main\dsh-novel-tavern-main`
> （DeepSeek Harness fork，作者另有其人，本手册把它当**参考实现**拆解，供墨扉借鉴，不合并代码）。
> 每个可借鉴点都给出「fork 源码位置 → 机制 → 墨扉现状 → 借鉴方案 → 优先级」，可直接按条目落地。
> 总览与能力对照见 `docs/NOVEL-TAVERN-FORK-NOTES.md`。

## 0. 总体印象

它是「SQLite 权威存储 + 纯函数工具面」路线：一个 `ctx.novel` 服务持有一整套小说域数据
（世界引擎 / 情节誓言 / 创作决策 / 章节知识控制 / 情节树 / lore 知识分层 / 手稿账本），
24 个只读/写模型工具全部消费这个服务契约，酒馆（SillyTavern）格式经 `ctx.tavern` 服务导入和注入。
墨扉是「文件优先 + 工作台 + 73 工具」路线。**路线不必换**，但 fork 里的十几个机制，
尤其是**故事时间线、伏笔账本、中文文风 lint、PNG 角色卡解析、会话事件绑定**，墨扉可以直接借鉴。

## 1. 故事时间线 StoryTime（可直接照搬）

- **fork 位置**：`packages/novel/novel/src/story-time.ts`
- **机制**：故事内部时间轴，与墙钟无关。序列化为定宽可排序的 `YYYYYY.MM.DD`（年做 offset 编码
  `year + 10^5`，正负年都能按文本序=时间序）；对人展示 `±YYYY.MM.DD`；日历不校验
  （2 月 31 日合法）。`validate / serialize / parse / compare / display` 五个纯函数。
- **墨扉现状**：章节只有顺序号，没有故事内时间轴。
- **借鉴方案**：整个文件单元级可移植（无外部依赖）。先给章节/世界书事件加可选 `storyTime`
  字段，渲染进 `chapter-context`，后续做时间线视图和「某时间点的世界状态」查询。
- **优先级**：P2（底层基础，先铺时间线再谈时间线折叠）。

## 2. 世界引擎 world engine（时间折叠）

- **fork 位置**：`packages/novel/novel/src/schema.ts`（subjects/world_events/world_changes 三表）
  + `novel/src/index.ts` 的 `createSubject/recordWorldEvent/worldState/worldStateAt`
- **机制**：主体（character/location/faction/object）只有基线 summary；`world_event` 携带字段级
  `changes`（`field` 如 `alive`/`location`/`relationship:<id>`），按事件时间线做 **last-write-wins
  折叠**。`worldStateAt(storyTime)` 能回答「故事进行到某天时，谁在哪、活着吗」。
- **墨扉现状**：世界书/角色是静态条目，没有演化。
- **借鉴方案**：不整库照搬，只借「字段覆盖 + 折叠」模型：给世界书条目加
  `{at, field, value}` 变更记录，`get-chapter-context` 在折叠点渲染当前状态。
- **优先级**：P3（依赖 §1 时间线）。

## 3. 情节誓言账本 vow ledger（伏笔/回收）⭐

- **fork 位置**：`packages/novel/novel/src/schema.ts`（vows/vow_transitions）
  + tools `vow_plant / vow_advance / vow_payoff / vow_abandon / vow_list`
- **机制**：誓言 = 对读者的承诺（promise + plantedAt + payoffTarget + note），生命周期
  plant → advance → payoff / abandon，每次动作都记 transition（含故事时间与明细）。
  `plot_list` 给未兑现且晚于种植时间的场景打 **`overdue` 提示**。
  `manuscript_scan` 用中文正则（`伏笔|线索|预言|承诺|总有一天|秘密|真相` …）在草稿里
  找「新誓言的候选」、找「本章该推进的誓言」（标题命中或 payoffTarget=本章）。
- **墨扉现状**：没有显式伏笔/回收账本；v0.25 才在 Reviewer 人设里加了「关键兑现前建立可回看因果线索」。
- **借鉴方案**：这是把提示词里的要求变成**可查询数据**的关键一步。在墨扉加 `vows` 存储
  （`.mofei-vows.json` 或并入项目文件），工具 `mofei_vow-plant/advance/payoff/abandon/list`；
  Writer 派单与 Reviewer 审稿都带上「待回收伏笔」清单。`manuscript_scan` 的中文正则可直接移植。
- **优先级**：P1（写作质量提升最快、与 v0.25 角色体系强相关）。

## 4. 情节树 plot tree（story → thread → scene）

- **fork 位置**：`packages/novel/novel/src/schema.ts`（stories/threads/scenes）+ `plot_list`
- **机制**：顶级 story（因果脊柱）→ thread（因果线）→ scene（最小故事单元）。
  scene 可挂 `at`（故事时间锚点，折叠世界状态）、`location`、`subjectIds`（出场者）、
  `vowIds`（本章推进的誓言）、`status`（planned/writing/written）。
- **墨扉现状**：卷→章节两级，章节无「计划/写作中/已写」状态与出场者/地点元数据。
- **借鉴方案**：墨扉的卷≈story、章节≈scene，缺的是**每个章节的元数据字段**
  （出场者、地点、待推进伏笔、写作状态）。可先给章节实体加这些字段，UI 和工具都受益。
- **优先级**：P2（与 §3 一起做最划算）。

## 5. 章节知识控制 chapter_info ⭐

- **fork 位置**：`packages/novel/novel/src/types.ts`（ChapterInfo）+ `chapter_info` 工具
- **机制**：每章四个字段：`readerKnows`（读者这章知道了什么）/ `protagonistKnows`（主角知道了什么）/
  `mustConceal`（本章必须瞒住的）/ `mayHint`（本章可以暗示而不揭穿的）。upsert 时省略字段保留旧值。
- **墨扉现状**：`get-chapter-context` 给模型「角色+笔记+世界书+前情」，但没有「知识增量/隐瞒约束」。
- **借鉴方案**：四个字段写进章节实体，`chapter-context` 与 Writer/Reviewer/RAG 上下文都带；
  这对连载一致性（主角不知道的事不能写进视角）帮助极大。
- **优先级**：P1（纯数据加字段，收益直接）。

## 6. lore 知识分层（omniscient / scoped）

- **fork 位置**：`packages/novel/novel/src/types.ts`（LoreEntry/LoreContext）+ `lore_register/list/context`
- **机制**：canon 设定分两档：`omniscient`（全知 canon，任何人不得矛盾）与 character-scoped
  （只有某个 subject 知道）。`lore_context(subjectId)` 返回「该主体知识层」= 全知 + 该主体私有。
- **墨扉现状**：世界书 + 锁定笔记（isLocked 不可改），但没有「谁知道」维度。
- **借鉴方案**：给世界书条目加 `omniscient/subjectId` 可选字段；`chapter-context` 按当前视角角色
  过滤 scoped 条目。这解决「主角视角里不能出现他不知道的设定」的连载难题。
- **优先级**：P2。

## 7. 写作工具模式（读→写→查→同步）⭐

- **fork 位置**：`packages/novel/novel-tools/src/writing.ts`
  （chapter_context / manuscript_check / manuscript_scan / chapter_workflow）
- **机制**：四个工具把「开写一章」做成流程：
  1. `chapter_context` 一次性取全：知识控制 + 折叠世界 + canon lore + 待回收伏笔 + 前后章草稿；
  2. `manuscript_write` 写草稿；3. `novel_lint` 文风检查；4. `manuscript_check` 一致性核对
  （返回草稿 + 出现的已知角色名 + 世界/lore/伏笔，让模型自证）；5. `manuscript_scan` 同步伏笔账本；
  `chapter_workflow` 把 1–5 打包成带步骤清单的写作简报。
- **墨扉现状**：`get-chapter-context` 类似 chapter_context，但没有对应的「写后自查/同步」工具闭环。
- **借鉴方案**：给 `mofei-writer` 加 `mofei_chapter-check`（一致性核查材料）与
  `mofei_chapter-scan`（伏笔扫草稿）两个工具，和现有 Writer→Reviewer 流水线衔接，
  让 Reviewer 不再完全靠提示词盲审。
- **优先级**：P1（纯工具，配合 §3）。

## 8. novel_lint 中文文风规则（可直接移植）⭐

- **fork 位置**：`packages/novel/novel-tools/src/lint.ts`（`zh/*` 规则 10 条 + `en/*`）
- **机制**：纯正则、按行确定性检测：
  - `zh/banned-adverbs` 忌用瞬间副词（突然|忽然|猛然|骤然|瞬间|顿时|立刻|马上|随即）
  - `zh/explanatory-phrases` 解说词（总而言之|值得一提的是|这说明了|换句话说|老实说|说实话|不出所料）
  - `zh/vague-time` 空洞时间（一段时间后|过了很久|很久以后|就在这时|不知不觉）
  - `zh/exclamation-run` 惊叹号连用 ／ `zh/ellipsis-run` 省略号堆叠（error 级）
  - `zh/tag-run` 对话标签密集（说|道|问，一行 ≥3）
  - `zh/comma-run` 流水句（一行 ≥5 逗号）／ `zh/echoing-word` 词语复读（相邻重复）
  - `zh/not-but` 公式化「不是…而是…」 ／ `zh/binary-contrast` 二元对比排比（一半…一半…|一边…一边…）
- **墨扉现状**：v0.25 Polisher/Reviewer 人设只靠提示词枚举，无机械检测。
- **借鉴方案**：整文件移植（纯函数零依赖），注册 `mofei_lint` 工具；Polisher 交稿前必跑、
  Reviewer 复核时带命中清单。这些规则与墨扉提示词里的「删去空泛评价、模板化排比」完全同源。
- **优先级**：P0（纯文本、零风险、立刻可用，还适配中文网文）。

## 9. 酒馆角色卡 PNG 解析（可直接移植）⭐

- **fork 位置**：`packages/novel/tavern/src/png.ts`
- **机制**：手写 PNG chunk 流读取（不依赖图片库），从 `tEXt`/`iTXt`/`zTXt` chunk 解出
  `chara`（V2）/`ccv3`（V3）文本 JSON；UTF-8 优先、Latin-1 兜底（兼容 CJK 单字节截断导出）；
  处理 zlib 压缩（iTXt flag=1、zTXt method=0）与 CRC-32。
- **墨扉现状**：只能导入 `import-world-info-json`（ST Lorebook JSON 文本），不支持 PNG 角色卡。
- **借鉴方案**：整体移植 `png.ts`（约 160 行，零依赖），加 `import-character-card` 入口，
  解析出 name/description/personality/scenario/firstMes/systemPrompt 等字段映射到墨扉角色实体。
- **优先级**：P1（网文圈角色卡多是 PNG，导入即用，价值直观）。

## 10. 酒馆 lorebook 导入 + 关键词激活窗口 + stage 分阶

- **fork 位置**：`packages/novel/tavern/src/lorebook.ts` + `section.ts`
- **机制**：世界书条目保留 ST 完整语义（keys/secondaryKeys/constant/selective/insertionOrder/
  caseSensitive/stage）；激活 = 在「最近 N 字符窗口」里做关键词匹配（`recentText` 从会话日志
  拼接末尾窗口），constant 常驻；`stage` 与绑定 `stage` 对应分阶激活。
- **墨扉现状**：世界书只做统一启用/禁用与名称搜索；`get-chapter-context` 全部注入。
- **借鉴方案**：给世界书条目加 keys/constant/selective 字段，`chapter-context` 先按当前章节文本
  做关键词激活，避免一次性全量注入（省 token、聚焦设定）。
- **优先级**：P2（与 RAG 分工：激活窗口管「本章相关」，RAG 管「跨章检索」）。

## 11. 提示段注入 + 会话事件绑定（tavern/binding）⭐

- **fork 位置**：`packages/novel/tavern/src/section.ts` + `tavern/src/index.ts`
- **机制**：会话绑定（mode/worldbookIds/characterId/stage/disabledEntryNames/mvuVariables/presetId）
  写成 `tavern/binding` **会话事件**，重启/冷读时从 session log 折叠恢复（纯回放量）；
  提示段是折叠输入 + 持久化 store 的纯函数，所有模型可见材料都能从日志重建。
- **墨扉现状**：绑定在 Host 内存 + 2s 轮询兜底，重连可能丢状态。
- **借鉴方案**：墨扉的「当前项目/章节绑定」同样应当走会话事件（如 `mofei/binding`），
  从 session log 恢复 `projectId/chapterId`，去掉内存状态依赖。
- **优先级**：P2（一致性收益，但需要触碰 DSH 会话事件层，改动面中等）。

## 12. prompt preset 导入 + marker 解析

- **fork 位置**：`packages/novel/tavern/src/preset.ts` + `section.ts` 的 `renderPresetSection`
- **机制**：导入 SillyTavern「Chat Completion Preset」的有序段落，`marker` 条目（worldInfoBefore /
  charDescription / charPersonality / scenario / dialogueExamples…）按绑定资源解析，
  普通段落做 `{{char}}`/`{{user}}` 宏替换；作者定义的顺序优先于内置区块排布。
- **墨扉现状**：无 prompt 模板导入。
- **借鉴方案**：墨扉有「提示词链」，可加一个「从 ST preset 导入生成提示词链」的入口。
- **优先级**：P3（工具向用户少，需求不急）。

## 13. lean 模式降 token + MVU 状态注入

- **fork 位置**：`tavern/src/section.ts`（`lean`）/ `types.ts`（mvuVariables）
- **机制**：`lean` 模式角色块裁剪为 名称+描述+开场白，并关闭自动标题生成；
  MVU（SillyTavern 卡变量）以 `## 角色状态` 注入，会话变量可覆盖卡初始值。
- **墨扉**：对应「子代理默认装配」的 token 控制诉求。
- **借鉴方案**：墨扉 `subagent-max` 的 `childPreset: minimal` 已降过一轮；可在角色人设里
  标配 lean 式「只带必要字段」。MVU 状态与墨扉「角色卡状态」概念相通，P3 考虑。
- **优先级**：P3。

## 14. 神经书（neuro-book）互操作

- **fork 位置**：`packages/novel/novel/src/nb/*`
  （calendar/project-sqlite/import/export，工具 `nb_import`/`nb_export`）
- **机制**：读写神经书项目的 `lorebook/*.md`（→ omniscient lore）与 `.nbook/project.sqlite`
  的 `WorldSubject/WorldSlice/WorldPatch` 三表（JSON-Pointer patch：`/hp`、`/equipment/weapon`，
  op = replace/increment/remove/append）。导入幂等性差（重复导入会重复条目），导出去重失败即 loud。
- **墨扉现状**：有 `.txt` 导入**导出**、`import-world-info-json`，无对外世界引擎格式互操作。
- **借鉴方案**：**先不学**——神经书是另一个生态，墨扉的互操作优先级应是「酒馆」而非神经书；
  仅把「JSON-Pointer patch 表达世界状态变化」的模型记下，可复用到墨扉的世界演化（§2）。
- **优先级**：P4（观察）。

## 15. 确定性 Markdown 导出

- **fork 位置**：`packages/novel/novel/src/markdown.ts`（renderSubjects/Events/State/Vows/Decisions/Chapters/Manuscript）
- **机制**：导出全部是领域数据的**纯函数**，无 I/O、无墙钟 → 同一 store 永远导出一模一样的文件。
- **墨扉现状**：`.mofei/projects/**` 镜像 Markdown 已存在，但导出确定性未专门化。
- **借鉴方案**：墨扉各实体 frontmatter + Markdown 已满足「文件即平台」；可加
  `mofei_export-overview`（把世界/角色/笔记/摘要导成一份总览 md）作为共享素材。
- **优先级**：P3。

## 16. SQLite STRICT + WAL + user_version 拒绝式版本

- **fork 位置**：`packages/novel/novel/src/schema.ts`
- **机制**：`STRICT` 表（强类型）、`journal_mode=WAL`、`PRAGMA user_version` 版本号，
  非当前版本**拒绝打开**而非就地迁移（未发布格式无迁移承诺）。
- **墨扉现状**：JSON 文件 schema version 兼容读取（v3/v4 缺字段补默认）。
- **借鉴方案**：墨扉保持 JSON（文件优先是其卖点），但可吸收「版本拒绝」的严格性：
  对不识别的大版本直接 loud 提示迁迁移，不静默猜。
- **优先级**：P3。

## 17. IntegrityReport 完整性审计

- **fork 位置**：`novel/src/index.ts` 的 `checkIntegrity()`（孤儿行 / 不可解析故事时间 /
  无 payoff 转变的 paid_off 誓言）
- **机制**：运行时审计，把易静默脏掉的关系（外键孤儿、状态与日志不一致）暴露出来。
- **墨扉现状**：有 `verify-*.mjs` 脚本但无运行时审计入口。
- **借鉴方案**：加 `mofei_check-integrity`（章节 revision 与历史、草稿引用、摘要修订号、角色引用），
  作为定期自检与验收前置。
- **优先级**：P3。

## 18. 服务契约 + 模型工具分层（架构对齐）

- **fork 位置**：`ctx.novel`（服务，持 store 契约）← `novel-tools`（模型面向）← `novel-api`（只读投影）
- **机制**：服务层只暴露数据操作；工具层把模型视角翻译成工具；投影层只读。
- **墨扉现状**：`ctx.provide('mofei')` 服务 + `tools.js` 73 工具，已基本同构；
  `/api/openfic` 只读 alias 承担部分投影。
- **借鉴方案**：**无需改变**，只按此对照补一个正式的只读投影面（如 `mofei_list-*` 只读工具组），
  供非写作会话安全读取。
- **优先级**：P3。

## 19. 对照总表

| # | 可借鉴机制 | fork 位置 | 墨扉借鉴方案 | 优先级 |
| --- | --- | --- | --- | --- |
| 8 | 中文文风 lint | lint.ts | 移植为 `mofei_lint`，接入 Polisher | P0 |
| 3 | 伏笔账本 | schema.ts + vow_* | `.mofei-vows.json` + 4 个工具 | P1 |
| 5 | 章节知识控制 | types.ts ChapterInfo | 章节加 4 字段，进 context/角色 | P1 |
| 7 | 写后自查/扫草稿 | writing.ts | `mofei_chapter-check/scan` | P1 |
| 9 | PNG 角色卡 | tavern/png.ts | 移植 `import-character-card` | P1 |
| 1 | 故事时间线 | story-time.ts | 移植模块，实体加 storyTime | P2 |
| 4 | 情节树元数据 | schema.ts scenes | 章节加 出场者/地点/状态/伏笔 | P2 |
| 6 | lore 知识分层 | types.ts LoreEntry | 世界书加 omniscient/subjectId | P2 |
| 10 | lorebook 激活窗口 | tavern/lorebook.ts | 世界书加 keys/constant/selective | P2 |
| 11 | 会话事件绑定 | tavern/section.ts | `mofei/binding` 事件化 | P2 |
| 2 | 世界时间折叠 | schema.ts world_* | 世界书加变更记录（依赖 §1/§6） | P3 |
| 12 | prompt preset 导入 | tavern/preset.ts | 生成提示词链入口 | P3 |
| 13 | lean 模式 / MVU | tavern/section.ts | 子代理人设瘦身 / 角色卡状态 | P3 |
| 15/16/17 | 导出确定性/STRICT/审计 | markdown/schema/index | 导出工具 / 版本拒绝 / 完整性工具 | P3 |
| 14 | 神经书互操作 | nb/* | 暂不学（生态不同） | P4 |

## 20. 建议落地路线

1. **P0 本批（纯移植，零风险）**：移植 `lint.ts` → `mofei_lint`；给 Polisher/Reviewer 提示词挂上。
2. **P1 第一批（数据+工具）**：章节知识控制 4 字段 → 伏笔账本 → `chapter-check/scan` 工具 →
   接 Writer→Reviewer 流水线。
3. **P1 第二批（酒馆互通）**：移植 `png.ts` 角色卡导入（PNG/JSON V2/V3）。
4. **P2（时间线/设定）**：故事时间线 → 世界书变更与折叠 → 知识分层 → 激活窗口；
   绑定事件化。
5. 之后每项按上表优先级排；神经书互操作搁置。

> 搬运约定：所有移植标注来源（本手册 §N + fork 路径），保持零依赖纯函数形态，不引入外部库。
