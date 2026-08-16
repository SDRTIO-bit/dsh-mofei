# 墨扉（Mofei）子代理并行计划

> **执行版见 `SUBAGENT-HANDOFF.md`**——那是给子代理会话的自包含完整交接；本文件是主代理的拆包/纪律说明。

> 目的：在用户其他项目运行、暂时不能重启 DSH 期间，用 DSH 子代理并行推进 v0.5 平台体验批。
> 适用预设：当前 agent preset（deepseek v4）。子代理从 DSH 官方 Web 创建，工作区必须同为
> `F:\game\SillyTavern-1.13.2`，且拥有文件读写/执行工具权限。

## 0. 为什么这样拆

- 不能重启 DSH：所以子代理只做**源码/测试级改动**，不做任何运行时验证。
- 避免写冲突：**共享文件（lib/index.js、package.json、profile 配置）只允许主代理改**，
  子代理各自拥有独立文件或独立新模块。
- 每个子代理交付：源码 + 独立单测 + 一句「我改了哪些文件」。主代理统一 review、build、集成。

## 1. 工作包 A：编辑器体验（client 侧）

```text
负责文件: plugin/src/client/legacy.js（仅此文件）
目标:
  1. 编辑器内联章节标题（正文上方 input，失焦保存 update-chapter-meta）
  2. 字数统计（中文字数≈去除空白后的字符数；显示在页脚）
  3. Tab 键插入两个全角空格「　　」
  4. 正文自动保存：3s debounce（保留 revision 冲突保护逻辑）
  5. 打开项目时恢复最后章节（localStorage: mofei.lastChapter.<projectId>）
验收: node OpenFic-DSH\plugin\esbuild.config.js 构建成功 + node OpenFic-DSH\tools\verify-client-bundle.mjs OK
禁止: 改 lib/index.js、package.json、任何 Host 协议
```

## 2. 工作包 B：摘要体系纯逻辑 + 单测（Host 侧新模块）

```text
负责文件: plugin/lib/summary.js（新建）+ test-summary.mjs（新建）
目标（先做纯逻辑，不接 lib/index.js）:
  1. 章摘要持久化结构: { version:1, summaries: { [chapterId]: { summary, chapterRevision, updatedAt } } }
  2. 过期判断: chapter.revision !== chapterRevision 或 updatedAt 超过 N 天
  3. 区间摘要分组: 按章节 order 每 N 章（默认 10）生成一个区间窗口
  4. 维护队列: 待生成章节列表 → 顺序/可取消的批量进度结构（纯数据，不接 LLM）
验收: node test-summary.mjs 全过；不 import lib/index.js
禁止: 改 lib/index.js；不要实际调用 LLM
```

## 3. 工作包 C：项目网格页（client 侧新模块）

```text
负责文件: plugin/src/client/project-grid.js（新建，暂不接入 bundle）
目标:
  1. React 组件 ProjectGrid(props: { projects, onPick, onRename, onDelete })
  2. 网格/列表两种视图，切换按钮
  3. 标题/章节数/目标字数进度卡片；颜色用现有 mf-* CSS 变量
  4. 搜索框（标题模糊过滤）+ 排序（最近使用/创建/标题）
  5. 封面先用 emoji/首字占位（不上传）
验收: 文件语法 node --check；提供 30 行内 README 注释说明如何接入 legacy.js
禁止: 修改 legacy.js / lib/index.js
```

## 4. 主代理（我）保留的独占区

```text
lib/index.js            Host 协议/路由/工具/集成（只有我改）
package.json / profile  装配
esbuild 入口切换        子代理模块就绪后由我接入
lib/client.js 构建产物   由我统一 build + verify-client-bundle
```

## 5. 并行纪律

1. 子代理**只准写自己负责文件**，发现需要跨文件改动就写 TODO 并停手。
2. 交付后主代理先 `node --check` + 相关单测，再考虑合入。
3. 任何人都不许重启 DSH、不许改 `~/.dsh`。
4. 合入顺序建议：C → A → B（C/A 无宿主依赖；B 的 handler 接入最后做）。

## 6. 效果预估

- 三个包并行可省 40–60% 的等待时间；瓶颈会回到主代理集成与 review。
- 完成后预计「写作平台体验」覆盖率从 ~45% 提升到 ~65%，项目页从 ~25% 到 ~55%，摘要体系从 ~20% 到 ~45%。
