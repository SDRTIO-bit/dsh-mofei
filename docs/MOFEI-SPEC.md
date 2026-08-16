# MOFEI-SPEC v1

墨扉写作项目文件规范。原则：**文件优先、可读、可 git、可被任意 DSH 工具直接操作。**

## 1. 区间标记

```text
.mofei/zone.yml
```

存在该文件表示 workspace 进入墨扉区间。内容：

```yaml
active: true
version: 1
```

## 2. 目录结构

```text
.mofei/
  zone.yml
  styles/*.md
  projects/<project-id>/
    project.yml
    chapters/<volume-id>/<chapter-id>.md
    chapters/<chapter-id>.md
    characters/<character-id>.md
    notes/<note-id>.md
    world/<entry-id>.md
    summaries/chapters/<chapter-id>.md
    summaries/ranges/<range-id>.md
    chains/<chain-id>.md
    drafts/<chapter-id>.md
```

## 3. 正式实体

| 实体 | 文件 | 关键 frontmatter |
| --- | --- | --- |
| Project | project.yml | id, title, description, goal, currentStyle |
| Chapter | chapters/**/*.md | id, title, order, revision, volumeId |
| Character | characters/*.md | id, name, isFavorited |
| Note | notes/*.md | id, title, categoryId, isLocked, isHidden |
| WorldEntry | world/*.md | id, name, keys, isEnabled, constant, order |
| Summary | summaries/**/*.md | chapterId 或 id/chapterIds |
| PromptChain | chains/*.md | id, name |
| Style | styles/*.md | id, name, description, tags |

正文一律放在 frontmatter 之后的 Markdown 正文。

## 4. 修订规则

- 每次章节写操作 revision +1；
- 正文变更以 `expectedRevision` 做乐观并发保护；
- 实体级历史保留最近 50 条；项目级历史交给 git。

## 5. 写作风格

- `project.yml.currentStyle` 指向 `styles/<id>.md`；
- `mofei_get-chapter-context` / `mofei_context` 注入当前风格；
- 风格只进入写作上下文，不进入 coding 会话。

## 6. 兼容

- `.mofei-projects.json` 仍是运行缓存/旧版兼容层；
- 文件树是用户可编辑、可 git 管理的正式形态；
- 每次保存自动镜像文件树；删除项目同步删除目录。
