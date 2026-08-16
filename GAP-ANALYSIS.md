# 墨扉（Mofei）差距分析 v2（源码级对比）

> 更新：2026-08-15。对比方法：逐文件读了原版 `frontend/src/features/*`（writing/projects/assistant/
> world-info/dashboard/prompt-chains/settings/app-shell）与 `backend/app/api/routers/*`、`memory/`、`background/`。
> 基线：固定插件 mofei-dsh v0.6.0（v4 数据模型 + 23 个 mofei_* 工具 + 17 skills + SSE 流式 + v0.5/v0.6 已交付）。
> 结论：**数据模型与工具面已追上主干；差距主要在「摘要面板/世界书批量」与「AI 协作桥接」，不是数据，是 UI 与工作流。**

## 0. 总体结论

原版是 300+ 文件的 React 单页应用 + FastAPI 后台；我们目前是单个 `plugin/src/client/legacy.js`（~110KB）叠加面板。
所以第一差距不是功能点，而是**工程形态**：必须把 legacy.js 拆成可维护的 client 模块，再用 esbuild 打进同一个 classic bundle（契约不变）。

功能差距按用户感知排序：

| 级别 | 原版有、我们缺的 |
| --- | --- |
| 致命体验差 | 三栏可拖拽调宽 + 布局持久化；章节标题在编辑器内编辑；字数统计；3 秒自动保存正文 |
| 大差距 | 项目页网格/列表/搜索/排序/简介/封面；章节+笔记混开多标签 + 滚动记忆 + 上次章节恢复 |
| 大差距（AI 平台向） | **摘要体系**：章摘要持久化/过期重算、区间（长期）摘要、维护面板、后台任务进度 |
| 中差距 | 世界书条目搜索/全删/批量开关；写作仪表盘日期范围+写作记录（LLM 成本由 DSH 承载） |
| 中差距（AI） | 选中文本/章节/行区间 @提及 直接送进 DSH 对话；子代理实测 |
| 长尾 | 用户可编辑、带版本历史的 prompt chains（宏编译）；角色/笔记/世界书条目级回滚 |

## 0.1 距离量化（按域估算，2026-08-15）

> 口径：以「OpenFic-main 0.9.2 写作平台能力」为 100%；明确不做（模型设置/i18n/PWA/桌面壳/审计/LLM 仪表盘）
> 与「DSH 原生承载」（Agent Loop/会话/计划/工具审批/子代理运行器）不计入差距，但按原版功能清单对比仍单列。

| 域 | 覆盖度 | 还剩什么 |
| --- | --- | --- |
| 数据模型与核心 CRUD（项目/卷/章/角色/笔记/世界书） | **~85%**（v0.8 后） | cover 字段、部分校验；角色/笔记/世界书条目快照回滚已交付 |
| TXT 导入导出 | **~90%** | 仅后台任务/进度事件（我们的预览式同步导入已够用） |
| 编辑器体验（标题/字数/Tab/上限/自动保存/多标签/滚动记忆） | **~70%**（v0.6 后） | 纯文本剪贴板归一化、笔记混开标签、滚动记忆、选中文本 @提及 |
| 布局与项目页（可调宽/网格列表/搜索排序/封面/简介/移动抽屉） | **~60%**（v0.6 后） | 独立全屏项目页/分页、封面裁剪上传、移动端抽屉；三栏可调宽与宽幅页已交付 |
| 摘要体系（章摘要持久化/过期重算/区间摘要/维护面板/进度） | **~85%**（v0.7 后） | 后台任务队列/取消；单章重算与 SSE 进度已交付（维护面板为简化版） |
| 世界书（CRUD/搜索/批量/全删/导入） | **~90%**（v0.7 后） | 名称唯一性已交付；仅剩封面级细节与导入校验增强 |
| 写作仪表盘 | **~75%**（v0.9 后） | 写作时长未记录；日期范围+每日字数明细+统计已交付 |
| Prompt Chains（版本化+宏编译） | **~45%**（v0.9 后） | 简版已交付（项目级 CRUD + 8 宏 + 运行）；缺版本 diff/分类/高级宏 |
| AI 助手（原版 Agent 侧栏口径） | **~70%**（v0.8 后） | @提及桥接已交付；剩真子代理流水线实测（重启后）与选中行区间提及细化 |
| 工程形态（模块化/可维护性） | **~50%**（v0.9 后） | legacy.js 仍为单文件主体（~1200 行），继续按 layout/project-page/.../workspace-utils 模式拆分 |

**综合（按「平台体验优先于 AI」加权）：写作平台体验 ~80%，数据/协议/工具面 ~92%，总体约 82%。**
主要剩余：真子代理流水线实测（重启后）、写作时长记录、prompt chains 版本化、独立全屏项目页/分页、legacy.js 继续拆分。

## 1. 写作编辑器（原版证据：writing/chapter-editor.tsx + lib/editor-config.ts）

| 原版能力 | 原版实现 | 我们现状 | 差距 |
| --- | --- | --- | --- |
| TipTap 纯文本编辑器 | Document/Paragraph/Text/History/CharacterCount + 全角 Tab 缩进 + 纯文本剪贴板归一化 | `<textarea>` | 原生 undo 可用；**缺 Tab 缩进（全角 2em）、纯文本剪贴板归一化** |
| 章节标题内联编辑 | TitleInput 在正文上方，失焦即存 | 侧栏小铅笔重命名 | **编辑器内标题** |
| 字数统计 | words-count（字数，非字符） | 只显示字符数 | **字数** |
| 内容上限 | MAX chars/lines 拒绝保存 + toast | 无 | **上限保护** |
| 自动保存 | 3s interval + working copy + 远端更新时间冲突检测 | 草稿 800ms、正文 3min、revision 冲突 | 保存节奏可调为 3s（保留 revision 保护） |
| 查找/替换 | TipTap SearchAndReplace + Mod-f/Mod-h 双模式 | Ctrl+F 面板 | 基本持平，可加独立替换面板样式 |
| 选中送 AI | 选中文本/整章生成 L 区间 @提及，发给右侧助手 | 仅「改写选中」 | **@提及桥接**（见第 6 节） |
| 标签页 | 章节+笔记混开、滚动位置记忆、关闭全部/空标签 | 仅章节多标签、无记忆 | **笔记混开 + 滚动记忆** |
| 上次章节恢复 | 本地 IndexedDB 记忆最后章节 | 无 | **打开项目恢复最后章节** |
| 聚焦宽度 | 编辑器 max-width 800 居中 | 已有 28px clamp 内边距 | 可选优化 |

## 2. 布局与项目页（projects-page.tsx / writing-page.tsx）

| 原版能力 | 我们现状 | 差距 |
| --- | --- | --- |
| react-resizable-panels：左侧栏 250–400、编辑器自适应、右侧助手 300–600，布局持久化 | 固定 210/250/minmax | **可拖拽调宽 + localStorage 持久化** |
| 项目独立页：网格/列表切换、搜索、排序（更新时间/创建时间/标题）、分页 40、封面裁剪上传、简介 | 项目在 210px 窄栏里纯列表 | **网格卡片/列表页、搜索排序、简介编辑**；封面可先用纯色/emoji 占位 |
| 移动端抽屉式侧栏 | 简单响应式（<760 隐藏一栏） | 可后置 |
| 右侧常驻 AI 助手 | 底部折叠 mini AI 面板 | 不复制原版，改用 DSH 会话桥接（见 6） |

## 3. 摘要体系（summary-panel + memory/chapter + background/jobs）

这是原版最像「专业写作平台」的部分，我们目前只有一次性批量摘要：

| 原版能力 | 我们现状 | 差距 |
| --- | --- | --- |
| 章摘要列表：按卷/全局顺序显示，过期标记、单章重算 | 无持久化 | **持久化章摘要 + 过期机制** |
| 区间/长期摘要：窗口合并、长程记忆 | 无 | **区间摘要**（可先做每 N 章滚动摘要） |
| 维护面板：选中章节生成、范围选择、进度事件 | 无 | **生成队列 + SSE 进度**（SSE 基础已改码） |
| 后台任务系统：导出/摘要任务、取消、事件流 | 无 | 简化版任务状态即可，不必上 ZMQ |

## 4. 世界书（world-info-page/entry-editor）

| 原版能力 | 我们现状 | 差距 |
| --- | --- | --- |
| 条目搜索 popover、全部删除确认、导入对话框、项目选择器 | 有 CRUD/排序/触发词/常驻/ST 导入 | **搜索、全删、批量启用/禁用** |
| 条目名称唯一性校验 | 无 | 可选 |
| 编辑器 token 统计 + 内容上限 | 无 | 可选 |

## 5. 仪表盘（dashboard）

| 原版能力 | 我们现状 | 差距 |
| --- | --- | --- |
| 写作仪表盘：日期范围选择器、写作时长/字数/活动记录明细 | 84 天热力图 + 今日/连续/累计 | **日期范围 + 写作记录**（需记录 activity events） |
| LLM 仪表盘：token/成本/审计记录 | 无 | **不做**，DSH llm 体系承载 |

## 6. AI 协作（assistant/）

原版 AssistantSidebar 是一个完整 Agent 控制台（任务列表、子代理会话、@提及、计划、工具审批、附件、流式消息）。**这块不要重写**——DSH 本身就是 Agent 宿主。我们要做的是「桥梁」而不是「山寨」：

| 桥接能力 | 做法 |
| --- | --- |
| 章节/行区间/选中文本 @提及 | 点击按钮把 `墨扉 chapter mention`（章节 ID + 行区间 + 快照）塞进 DSH 会话输入框/上下文；需要查 DSH client runtime 提供的 append API，查不到就先做「复制为工具调用文本」降级 |
| 让 Agent 写我们的项目 | 18 个 mofei_* 工具已注册 ✅ |
| 写作方法论 | 17 个 runtime skills 已注册 ✅ |
| 子代理实测 | 用 DSH subagent + AGENTS.md 流程跑一轮真实创作任务，验证工具调用与回写 |
| 任务回滚 | 我们只有章节 history；原版有章节/角色/笔记/世界书 revision 快照 | **扩展为全实体快照** |

## 7. Prompt Chains（prompt-chains + macro/）

原版：分类 → 条目版本 → 历史 diff → 重置 → **宏编译**（lexer/parser/evaluator，支持 mem/条件处理）。
DSH 对应物：runtime skills（已是可执行提示词资产）。可选路线：
1. 简版：把 prompt chain 存成项目级 JSON，编译宏（可直接移植 lexer/parser 概念为 JS 小解释器）后作为 skill 动态注册。
2. 更简版：依赖 DSH systemPrompt + 17 skills，暂不做 UI。

## 8. 明确不做（DSH 承载）

模型提供商/API 设置/成本统计 · i18n · PWA · 桌面壳 · 审计/健康检查 · SQLite（JSON 够用）·
Python Agent 运行时/工具审批 UI（DSH agent loop 原生）· LLM 仪表盘。

## 9. 推荐实施顺序（“平台优先，其次 AI”）

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| **v0.5 平台体验** | 编辑器体验五项 + 项目网格 + 摘要后端/工具 | ✅ 已交付并验收 |
| **v0.6 平台体验二** | 三栏可拖拽调宽+持久化 + 项目宽幅页/简介编辑 + 编辑器内容上限 | ✅ 已交付并验收 |
| **v0.7 摘要面板/世界书** | 摘要维护面板（章/区间列表+单章/区间强制重算+SSE 进度）+ 世界书搜索/批量开关/批量删除/唯一性 | ✅ 已交付并验收 |
| **v0.8 AI 缝合** | @提及桥接、子代理写作流水线实测、全实体快照回滚 | ✅ 代码交付（流水线实测待重启） |
| **v0.9 长尾** | 写作记录仪表盘、prompt chains 简版、legacy.js 继续拆分 | ✅ 已交付并验收 |

## 10. 参考源码索引

- 编辑器：`frontend/src/features/writing/components/chapter-editor.tsx`、`lib/editor-config.ts`、`hooks/use-auto-save.ts`
- 布局：`frontend/src/features/writing/pages/writing-page.tsx`（react-resizable-panels）
- 项目页：`frontend/src/features/projects/pages/projects-page.tsx`、`components/projects-toolbar.tsx`
- 摘要：`frontend/src/features/writing/components/summary-panel*.tsx`、`backend/app/memory/chapter/`、`app/background/jobs/definitions/*summary*.py`
- 仪表盘：`frontend/src/features/dashboard/`、`backend/app/api/routers/dashboard.py`
- Prompt chains：`frontend/src/features/prompt-chains/`、`backend/app/macro/`
- 助手：`frontend/src/features/assistant/`、`backend/app/agent_runtime/`
