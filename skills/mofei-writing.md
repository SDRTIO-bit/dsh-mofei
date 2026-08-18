---
name: mofei-writing
description: 墨扉 小说写作技能——续写、改写、一致性检查与角色把控。配合 mofei_* 工具使用（read-chapter / update-chapter / list-characters / list-notes / search-chapters）。当会话 agent 需要为 墨扉 项目写作、修改正文或检查设定一致性时使用。
---

# 墨扉 写作技能

> 来源：mofei-main skills/*.yaml 的 DSH 化精简版（Apache-2.0，保留署名）。
> v0.24 现状：17 个 mofei-* 写作指令位于 `plugin/lib/instructions.js`，派生子代理时按角色注入
> `request.persona`（不再注册为 DSH runtime skills）；用户自创技能写 `~/.dsh/skills/*.md`。

## 目标

帮助写作型 agent 在 墨扉 项目中产出风格一致、设定不崩的小说正文。

## 工作流

1. **读取上下文**：用 `mofei_list-projects` 定位项目 → `mofei_read-chapter` 读目标章节 → `mofei_list-characters` / `mofei_list-notes` 获取角色与设定笔记。
2. **检查锁定**：`mofei_list-notes` 返回 `isLocked`；锁定笔记是**不可更改的世界观**，只能作为参考，禁止修改。隐藏笔记不参与。
3. **写作**：保持原文视角（第一/第三人称）、时态、叙事节奏与用词习惯；中文写作遵循「直接输出正文，不要解释」。
4. **写入**：用 `mofei_update-chapter` 提交，**必须携带读取时获得的 `expectedRevision`**；收到冲突结果时重新读取再合并。
5. **一致性自检**：写完用 `mofei_search-chapters` 搜索关键设定词，确认无前后矛盾。

## 质量红线

- 角色名、称呼、关系与 `list-characters` 描述一致。
- 不擅自引入与设定笔记冲突的世界观元素。
- 不在正文里输出 Markdown 标题、加粗或列表符号。
- 每章只做一次整体写入（或明确的小段追加），避免并发覆盖。

## 提示词片段（可复用于子代理）

```
你是 墨扉 的写作助手。项目背景、角色与设定笔记已通过工具读取。
锁定笔记（isLocked: true）是不可更改的世界观，仅作参考。
请续写/改写并输出纯正文。用 mofei_update-chapter 保存，expectedRevision 用读取到的修订号。
```

## 署名

本技能参考 OpenFic（Apache-2.0，https://github.com/OpenFic/OpenFic）的写作技能体系整理。
