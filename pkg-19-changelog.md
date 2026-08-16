# pkg-19 变更说明（墨扉 写作平台版）

> 状态：**已挂载运行**（2026-08-14，以 ofic-1/pkg-4/run-5 运行，源码 = pkg-22-createchapter-fix.*）；
> 浏览器端全流程验证 ALL PASS（verify-pkg3.cjs）。
> 挂载前修复了 3 个原始版问题：① CSS 变量在 DSH 下不存在（透明背景）→ 追加 --dsw-alias-* 别名映射；
> ② `timer.timeout` 未定义 → 改 `ctx.timeout`；③ createChapter 漏 setProjects（章节创建后列表/编辑器不刷新）→ 补上。

## 与 pkg-18 的关系

- pkg-19 是 pkg-18 的**超集**：全部原有 RPC 协议与客户端流程（草稿 800ms / 正文 3 分钟自动保存、revision 冲突保护）保持不变。
- 数据模型升级到 v3（`.mofei-projects.json` 增加 version: 3 与章节 history），自动兼容读取 v2 文件。
- 新增持久化文件 `.mofei-stats.json`（按日写作统计）。

## Host 新增/变更的 RPC

| method | 入参 | 说明 |
| --- | --- | --- |
| 墨扉.update-project | { projectId, title?, description?, goal? } | 重命名/改目标字数 |
| 墨扉.delete-project | { projectId } | 删除项目（连带其草稿） |
| 墨扉.update-chapter-meta | { projectId, chapterId, title } | 章节重命名 |
| 墨扉.delete-chapter | { projectId, chapterId } | 删除章节（连带其草稿，重新排序号） |
| 墨扉.move-chapter | { projectId, chapterId, direction: 'up'\|'down' } | 章节排序 |
| 墨扉.chapter-history | { projectId, chapterId } | 历史版本列表（新→旧，含 revision/时间/字数，不含正文） |
| 墨扉.rollback-chapter | { projectId, chapterId, toRevision } | 回滚到指定历史版本（产生新 revision，当前内容入历史） |
| 墨扉.stats | {} | 今日字数 / 累计 / 连续写作天数 / 写作天数 |
| 墨扉.update-chapter | （不变） | 现在额外返回 stats 字段；每次成功保存前把旧内容快照进 history（上限 20 条） |
| 墨扉.bootstrap | {} | 现在额外返回 stats 字段 |

## Client 新增功能

1. 项目行：重命名（✎ 内联输入）、删除（× 两次点击确认，4 秒自动解除）
2. 章节行：上移/下移、重命名、删除（同样两击确认）
3. 项目目标字数：项目列底部「目标 N 字 ✎」内联设置，进度显示在按钮与页脚
4. 章节历史面板：编辑器头部「历史」按钮，列出 r1..rN + 时间 + 字数，单条「回滚」（两击确认）
5. 专注模式：编辑器头部「专注」按钮，隐藏左右栏（`.mf-focus`）
6. Ctrl+S（或 Cmd+S）：textarea 内直接保存正文
7. 页脚写作统计：今日 +N 字 · 连续 N 天 · 累计 N 字（保存正文后实时刷新）

## 挂载后验证清单（在创造模式会话执行）

1. cordis_define(kind: new, idPrefix: ofic) → code.host / code.client 分别填 host/client 文件 → cordis_run(mode: run) → 允许授权 → 刷新页面。
2. 打开 墨扉 → 新建项目「测试」→ 新建章节 → 输入正文 → 等待 1s（草稿落盘）→ 关闭重开确认草稿恢复。
3. 保存正文 → 页脚「今日 +N 字」出现、章节显示 r2；再改再存 → r3。
4. 打开「历史」→ 应看到 r1/r2 等条目（新→旧）→ 回滚到 r1 → 正文变回旧内容且 revision+1。
5. 冲突保护：另一处（或手动改文件）让 revision 前进后，用旧 revision 保存 → 应显示冲突且不覆盖。
6. 章节 ↑↓ 排序、重命名、删除（两击）→ 列表与顺序正确。
7. 项目重命名、设目标字数 → 页脚进度条数字变化。
8. Ctrl+S 直接保存。专注模式隐藏两栏。
9. 检查 `F:\game\SillyTavern-1.13.2\.mofei-projects.json`（version 3、含 history）与 `.mofei-stats.json` 已生成。
10. 全部通过后，把新 pluginId/packageId 回写 README.md 与 HANDOFF.md。

## 已知边界

- 历史快照上限 20 条/章（超出丢最旧）。
- 回滚不记入当日写作统计（只有正向保存计入）。
- 统计按「保存成功时净增字符数」累计，删除字符不会扣减。
- 客户端无 window/document：所有确认交互为两击式按钮，无系统弹窗；Ctrl+S 仅在 textarea 聚焦时生效。
- 冒烟测试文件：tests/pkg-19-host-smoke.mjs（node 直接运行，无需 DSH）。
