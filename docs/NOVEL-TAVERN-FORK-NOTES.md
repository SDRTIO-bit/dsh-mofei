# dsh-novel-tavern 源码调研（2026-08-20）

> 调研对象：`dsh-novel-tavern-main`（DeepSeek Harness fork，含 `packages/novel` 小说扩展族）。
> 本文记录该 fork 的结构、能力与 墨扉（dsh-mofei）的对应关系。
> **可执行的逐条借鉴清单见 [`NOVEL-TAVERN-REFERENCE.md`](NOVEL-TAVERN-REFERENCE.md)（含源码位置→墨扉方案→优先级）。**
> ⚠️ 该目录为压缩包解出的源码快照，**无 `.git`**；以 zip `dsh-novel-tavern-main.zip` 为原始分发物。

## 1. 这是什么

- 上游：DeepSeek Harness（`@deepseek-ai/dsh-root` v0.1.0-rc.5，pnpm workspace 单仓），
  全套继承 `docs/`、`scripts/` 门禁、`.agents/notes`、`vendor/`（vendored Cordis）。
- 本机已装的正式 DSH 为 v0.1.0-rc.6，说明 fork 底版略旧于当前安装。
- 新增核心：`packages/novel/` 一个多包组 = 长篇小说写作能力族 + SillyTavern（酒馆）格式集成。
- 命名 `novel-tavern`：小说存储 + 酒馆角色/世界书互操作，与 墨扉 的定位高度重叠，值得对照。

## 2. packages/novel 包组结构

| 包 | ctx key / 装配 | 角色 |
| --- | --- | --- |
| `novel/novel` | `ctx.novel`（NovelService） | 小说连续性存储服务：world engine（主体状态随时间线折叠）、plot vow ledger（情节誓言/回收账本）、creative decisions（创作决策记录）、chapter knowledge control（章节知识控制）、SQLite 持久化 + 确定性 Markdown 导出 |
| `novel/novel-tools` | 注册于 `ctx.tools` | 24 个模型面向工具（覆盖 `ctx.novel` 全部操作） |
| `novel/novel-api` | `ctx.novelWorkspace` | Web 可视化的只读 Remote 投影 |
| `novel/novel-bundle` | `dsh --profile` bundle | `cordis.patch.yml` 一次插入三行：novel 服务 + novel-tools + tavern 服务；经 `dsh.profile.bundles` 列表装配 |
| `novel/tavern` | `ctx.tavern`（TavernService） | SillyTavern 兼容角色扮演存储：导入 lorebook（worldbook）JSON 导出与角色卡（JSON 或含 `chara`/`ccv3` 文本块的 PNG），提示段落注入 + 关键词窗口激活 |

数据模型要点（摘自 `docs/subsystems/novel.md`）：

- `StoryTime`：`YYYYYY.MM.DD` 固定宽度可排序序列化（offset 编码年），故事内部时间轴，与墙钟无关。
- World engine：`Subject`（实体）+ `WorldEvent`（事件，携带字段级 changes），折叠成 `WorldState`。
- Vow ledger：`plant / advance / payoff / abandon` 四类转变 + `VowLedger` 全历史。
- Decision：ADR 式的创作决策记录（context / options / chosen / rationale / open|decided）。
- ChapterInfo：每章 `readerKnows / protagonistKnows / mustConceal / mayHint` 知识控制。
- 一致性：`IntegrityReport` 运行时审计（孤儿行、无法解析的 story time、无 payoff 转变的 paid_off 誓言）。

tavern 注入形态（`packages/novel/tavern/README.md`）：

- 一个提示段 `tavern:context`：角色扮演设定（性格/背景/人物介绍/对话示例/行为准则/MVU 状态）
  + 开场白 + 激活的世界书设定；`{{char}}`/`{{user}}` 宏替换。
- `lean` 模式：角色块裁剪为名称/描述/开场白 + 关闭自动会话标题请求，显著降 token。
- 绑定经 `tavern/binding` 会话事件持久化 → 重启/冷读时可从 session log 恢复（纯回放量）。
- 已知限制：多角色只注入名称+描述；stage 仅整数显式推进；MVU 只读；导入忽略未知字段。

## 3. 与墨扉（dsh-mofei）的对应关系

| 能力 | dsh-novel-tavern（fork） | 墨扉（dsh-mofei） | 差异与借鉴 |
| --- | --- | --- | --- |
| 小说存储 | SQLite + Markdown 导出，`ctx.novel` 服务 | 文件优先 `.mofei/projects/**` + JSON 索引缓存 | 墨扉文件即平台，fork 以 SQLite 为权威；两者都导出/镜像 Markdown |
| 世界/设定 | world engine（主体+事件折叠）+ 世界书导入 | 世界书（world.js）+ 角色 + 笔记 | fork 的时间线折叠是墨扉没有的：可借来给章节打 story time |
| 情节连续性 | plot vow ledger（plant→payoff 追踪） | 章节事实 + revision 冲突保护 | fork 的誓言账本可补墨扉的伏笔/回收追踪（当前只有大纲链） |
| 章节知识控制 | readerKnows/protagonistKnows/mustConceal/mayHint | chapter-context（角色+笔记+世界书+前情） | 墨扉上下文是「喂给模型的材料」，fork 是「章级知识约束」，两者可合并 |
| 角色扮演 | tavern 角色卡 + lorebook 导入（JSON/PNG ccv3） | 角色实体 + `import-world-info-json`（ST Lorebook） | fork 支持**角色卡 PNG**（酒馆卡片格式），墨扉可借鉴导入路径 |
| 提示注入 | 统一提示段 + 关键词激活窗口 + lean 模式 | 每会话 persona + 上下文拼装 | lean 模式降 token 的思路值得移植到 subagent 默认装配 |
| 装配 | novel-bundle（cordis.patch.yml 插入三行） | 固定插件 + novel profile patch | 墨扉已是同一模式（`- id: mofei; name: dsh-mofei`）——bundle 化可作发布形态参考 |
| 会话绑定 | `tavern/binding` 会话事件（回放量） | 绑定在 Host 内存 + 轮询 | fork 的「绑定即回放量」设计更干净，可改善墨扉重连状态恢复 |
| Web 投影 | novel-api 只读 Remote + Web 可视化 | MOFEI-STUDIO 全屏工作台 | 墨扉 UI 远超 fork；fork 的只读投影适合做「只读分享/打印」 |

## 4. 结论与后续建议

1. **不合并、可借鉴**：fork 与墨扉是「同一问题域的不同实现」，墨扉的产品面（文件优先、
   工作台、73 工具、revision 冲突保护、区间隔离）已自成体系；无必要替换为 fork 的 SQLite 服务。
2. **优先借鉴**（P2 候选）：① 情节誓言账本（伏笔/回收）；② tavern 角色卡 PNG 导入；
   ③ `tavern/binding` 会话事件绑定模式；④ lean 模式 token 削减；⑤ IntegrityReport 式审计。
3. **对齐参考**：fork 的 24 个 novel 工具与墨扉 73 个 `mofei_*` 工具可按 `ctx.novel` 服务契约
   做一份工具对照表，缺的口径（如 `subjectStateAt` 时间线折叠）留作墨扉 v0.26+ 的规划输入。
4. **快照管理**：该目录无 `.git`，如要继续演进应先 `git init` 留底（保留 `dsh-novel-tavern-main.zip` 原始物）。