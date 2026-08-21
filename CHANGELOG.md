# dsh-mofei 变更总目录

本文件汇总历代版本的发布说明。完整内容已归档到 docs/archive/changelogs/，下方按版本号排序索引。

> 维护约定：根目录只保留本索引；新版本发布时在此追加一行 git mv 到 docs/archive/changelogs/。

| 版本 | 简介 |
| --- | --- |
| v0.3.0 | 待重启验证 — [详细](docs/archive/changelogs/v0.3.0-changelog.md) |
| v0.3.1 | 改码完成，待下次重启验证 — [详细](docs/archive/changelogs/v0.3.1-changelog.md) |
| v0.4.0 | 改码完成，待重启验证 — [详细](docs/archive/changelogs/v0.4.0-changelog.md) |
| v0.5.0 | 平台体验批，已重启验证通过；含验证修复 — [详细](docs/archive/changelogs/v0.5.0-changelog.md) |
| v0.6.0 | 三栏调宽 / 项目宽幅页 / 编辑器内容上限 — [详细](docs/archive/changelogs/v0.6.0-changelog.md) |
| v0.7.0 | 摘要维护面板 / 世界书搜索与批量 — [详细](docs/archive/changelogs/v0.7.0-changelog.md) |
| v0.8.0 | @提及桥接 / 实体快照回滚 / 流水线冒烟 — [详细](docs/archive/changelogs/v0.8.0-changelog.md) |
| v0.9.0 | 写作记录仪表盘 / prompt chains 简版 / 继续模块化 — [详细](docs/archive/changelogs/v0.9.0-changelog.md) |
| v0.9.1 | novel 首次启动验收修复 — [详细](docs/archive/changelogs/v0.9.1-changelog.md) |
| v0.10.0 | 写作内容平台重构 — [详细](docs/archive/changelogs/v0.10.0-changelog.md) |
| v0.10.1 | 文件优先闭环 + 结构化检索 + 风格补全 + Studio VSCode 化 — [详细](docs/archive/changelogs/v0.10.1-changelog.md) |
| v0.10.2 | Git 适配器 + OpenFic 借鉴改进 + DSH Jobs 长任务 — [详细](docs/archive/changelogs/v0.10.2-changelog.md) |
| v0.10.3 | 收官打磨轮 — [详细](docs/archive/changelogs/v0.10.3-changelog.md) |
| v0.11 | DSH 对话交集：Studio 内嵌缩小版 DSH web — [详细](docs/archive/changelogs/v0.11-changelog.md) |
| v0.12 | 路线 B：墨扉成为官方 web 一等视图标签 + 质感修复 — [详细](docs/archive/changelogs/v0.12-changelog.md) |
| v0.12.1 | 3088 整体 = 墨扉 web：conversation.session 整体替换 — [详细](docs/archive/changelogs/v0.12.1-changelog.md) |
| v0.13.0 | 布局定稿：中=文字区，右=缩小版 dsh web — [详细](docs/archive/changelogs/v0.13.0-changelog.md) |
| v0.13.1 | Bug 修复 + 实现向预览 v5 对齐 — [详细](docs/archive/changelogs/v0.13.1-changelog.md) |
| v0.14.0 | 变形金刚形态：原版 web + 墨扉气泡 — [详细](docs/archive/changelogs/v0.14.0-changelog.md) |
| v0.14.1 | 写作状态：让 AI 会话进入 mofei-writer — [详细](docs/archive/changelogs/v0.14.1-changelog.md) |
| v0.15 | 文件同步轮询：AI 写入 → 墨扉自动可见 — [详细](docs/archive/changelogs/v0.15-changelog.md) |
| v0.16 | 墨菲子代理辅助：subagent_with_model — [详细](docs/archive/changelogs/v0.16-changelog.md) |
| v0.17 | 技能开关/自创技能入口 + 会话导航改进 — [详细](docs/archive/changelogs/v0.17-changelog.md) |
| v0.17.1 | 浏览器操控测试视觉修复 — [详细](docs/archive/changelogs/v0.17.1-changelog.md) |
| v0.18 | 初始向导/小说文件夹 + 会话入口 + 质感统一 — [详细](docs/archive/changelogs/v0.18-changelog.md) |
| v0.19 | DSH 工作区联动 + 官方会话侧栏 — [详细](docs/archive/changelogs/v0.19-changelog.md) |
| v0.24 | Host 生命周期修复 + 行为参数可配 — [详细](docs/archive/changelogs/v0.24-changelog.md) |
| v0.25 | 内置角色体系 + 子代理装配重构 + 提示词研究落地 — [详细](docs/archive/changelogs/v0.25-changelog.md) |
| v0.26 | 删除镜像修复 + 文件优先彻底落地 — [详细](docs/archive/changelogs/v0.26-changelog.md) |
| v0.27 | 实体历史落文件树 + 回收站 — [详细](docs/archive/changelogs/v0.27-changelog.md) |
| v0.28 | RAG 索引正文直读文件树 — [详细](docs/archive/changelogs/v0.28-changelog.md) |
| v0.29 | 回收站 UI：列出 / 恢复 / 清空 — [详细](docs/archive/changelogs/v0.29-changelog.md) |

## 维护说明

- 归档目录：docs/archive/changelogs/（与 docs/archive/ 其他历史文档同位）
- 单文件结构：H1 标题 + 基线说明 + 新增 / 改动 / 验证 / 回退 / 待办
- 新增版本流程：1) git mv vN.N.N-changelog.md docs/archive/changelogs/；2) 在本表追加一行；3) 提交。

