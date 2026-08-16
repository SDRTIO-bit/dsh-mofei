# 墨扉 v0.10 计划（重写版）：文件优先写作内容平台

> 状态：已实施并验收（见 v0.10.0-changelog.md）。
> 基线：mofei-dsh v0.9.1。
> 核心定义：
> **墨扉 = MOFEI-SPEC（写作文件规范） + MOFEI-AGENT（写作 Agent 层） + MOFEI-STUDIO（写作内容工作台）。**
> Agent 平台属于 DSH；写作内容平台属于墨扉。

---

## 0. 目标与硬约束

```text
T1  文件优先：章节/角色/世界/笔记/摘要/链/提示词都是可读文件，git 可管理
T2  区间隔离：standard coding 会话零墨扉，只有进入墨扉区间才加载
T3  写作提示词入口：用户可选文笔/文风，选定后提示词与 skill 注入写作会话
T4  工具极简：主体就是 read / write / edit，外加检索/RAG/摘要等特殊领域工具
T5  MOFEI-STUDIO 长期存在：用户直接看和改正文、角色、世界书、笔记
T6  DSH 变强，墨扉自然受益；墨扉不重复造 Agent 能力
```

硬约束：

```text
R1  standard 会话：0 mofei 工具、0 mofei 技能、0 mf-* DOM/CSS
R2  普通 DSH Web：只有「墨扉」一个入口，其余为正 DSH
R3  进入墨扉：切换到 mofei-writer preset + 打开 Studio
R4  退出墨扉：DOM/CSS/事件/临时状态完全清理
R5  数据可移植：拔掉墨扉插件，文件和 git 历史仍在，标准 DSH 仍可读写
R6  不修改官方 DSH 源码与 dist
R7  墨扉不建立私有扩展生态，复用 DSH 的 services/events/slots/commands
R8  依赖方向单向：未来 DSH 插件可读墨扉文件与契约；墨扉不反向依赖具体插件
```

---

## 1. 架构

```text
┌──────────────────────────────────────────────────────┐
│                    DSH 0.1+（会持续进化）               │
│  Agent Loop · Session · Subagent · Presets           │
│  Tools · Skills · Commands · Slots · Jobs            │
│  未来：更强检索/UI/上下文/git/生态插件                  │
└───────────────────────┬──────────────────────────────┘
                        │ 只在「墨扉区间」叠加
                        ▼
┌──────────────────────────────────────────────────────┐
│                       墨扉                             │
│                                                       │
│  MOFEI-SPEC     文件优先规范、正式实体、revision、zone   │
│  MOFEI-AGENT    mofei-writer preset、写作提示词/skills、 │
│                 薄工具 + 特殊领域工具                    │
│  MOFEI-STUDIO   VSCode 式写作工作台（长期产品面）        │
└──────────────────────────────────────────────────────┘
```

### 三个 Plane

```text
Host Plane（novel profile 常驻，模型不可见）
  mofei-dsh core    文件仓库、索引缓存、/api/mofei RPC、/mofei 资源
  mofei-dsh/entry   client 侧仅注册一个「墨扉」入口

Agent Plane（只挂 mofei-writer preset）
  mofei-dsh/tools   read/write/edit + 检索/RAG/摘要等工具
  mofei-dsh/skills  写作技能 + 用户写作提示词（风格）技能
  mofei-dsh/context 上下文装配（正文/角色/世界/摘要/风格）

Client Plane（进入 Studio 才挂载）
  mofei-studio      工作台壳、实体编辑器、风格选择器、Agent 桥
```

---

## 2. MOFEI-SPEC：文件优先规范

### 目录结构

```text
.mofei/zone.yml                          # 区间标记
projects/
  <project-id>/
    project.yml                          # 标题/简介/目标/当前写作风格
    chapters/
      <volume-id>/
        <chapter-id>.md                  # frontmatter: order/revision/volumeId
    characters/
      <character-id>.md                  # frontmatter: name/isFavorited
    notes/
      <note-id>.md                       # frontmatter: title/category/isLocked/isHidden
    world/
      <entry-id>.md                      # frontmatter: name/keys/isEnabled/constant
    summaries/
      chapters/<chapter-id>.md
      ranges/<range-id>.md
    chains/
      <chain-id>.md
    drafts/
      <chapter-id>.md
```

### 正式实体

```text
Project      project.yml
Chapter      chapters/**/*.md
Character    characters/*.md
Note         notes/*.md
WorldEntry   world/*.md
Summary      summaries/**/*.md
PromptChain  chains/*.md
Style        styles/*.md（全局或项目级）
Draft        drafts/*.md
```

正式实体的共同规则：

```text
1. 正文/描述/摘要/链/提示词都在 Markdown 正文
2. 排序、revision、id、开关、分类等元数据放 YAML frontmatter
3. 文件名稳定，id 可读（如 chapter-001.md，不用随机串做唯一事实）
4. 每次修改至少写一次 revision；git commit 是项目级历史
5. 旧 .mofei-projects.json 一次性导入文件树，保留迁移记录
```

### 区间标记

```text
.mofei/zone.yml 存在 → workspace 为墨扉区间
普通 coding workspace 没有该文件，墨扉 RPC 返回 ZONE_INACTIVE
Studio 可提示用户「初始化墨扉工作区」
```

---

## 3. MOFEI-AGENT：写作提示词 + 薄工具

### 3.1 写作提示词入口（核心设计）

```text
styles/
  default.md        默认中文小说文风
  plain.md          白描
  classical.md      古风
  light-novel.md    轻小说
  <用户自定义>.md
```

每个 style 文件结构：

```markdown
---
id: plain
name: 白描
description: 短句、克制、少形容词
tags: [简洁, 画面感]
---

# 写作风格：白描

- 句子短，避免长定语
- 少用比喻，动作优先
- 对话干净，不堆情绪词
```

注入机制：

```text
1. Studio 风格选择器修改 project.yml 的 currentStyle
2. mofei-writer preset 的基础系统提示引用「当前风格」槽位
3. mofei/context 装配时读取 style 文件，注入写作请求上下文
4. Writer/续写/改写/审稿快捷指令都会携带当前风格
5. 用户切换风格后，下一次写作自动生效，不污染 coding 会话
```

写作 skill 与 style 的关系：

```text
mofei-writing      固定红线：不换皮、信息差、一致性、冲突保护
style 文件         可变文笔：白描/古风/轻小说……
```

### 3.2 工具设计：read / write / edit + 特殊工具

主体就是三件套：

```text
mofei_read   读取正式实体文件（自动解析 frontmatter + revision）
mofei_write  整文件写入（revision 冲突保护）
mofei_edit   局部编辑（行/选区替换，同样走 revision）
```

按实体提供命名别名，只是套皮，不让模型记随机 ID：

```text
mofei_read-chapter
mofei_write-chapter
mofei_edit-chapter
mofei_read-character / write-character / edit-character
mofei_read-note / write-note / edit-note
mofei_read-world-entry / write-world-entry / edit-world-entry
```

特殊领域工具：

```text
mofei_list           列出项目/实体目录
mofei_search         全文与行号检索（当前能力）
mofei_context        装配 latest/near/mid/far + 当前风格
mofei_summarize      章摘要 / 区间摘要
mofei_retrieve       RAG 检索（接口先留，v0.10 先落 FTS，后接 DSH/生态 RAG）
mofei_history        实体历史 / 项目 git 历史
mofei_revert         回滚实体或项目文件
```

目标：模型不需要理解 23 个“平台工具”，只需要理解“读、写、改、找、摘要、检索、回滚”。

### 3.3 mofei-writer preset

```text
~/.dsh/.agent-presets/mofei-writer/agent.cordis.yml
  = standard 基础能力
  + mofei-dsh/tools
  + mofei-dsh/skills
  + mofei-dsh/context
```

standard 会话保持纯净；进入墨扉才创建/切换 mofei-writer 会话。

---

## 4. MOFEI-STUDIO：长期写作工作台

### 4.1 形态

全屏三栏工作台，VSCode 体验，作为墨扉的长期产品面：

```text
┌──────────────────────────────────────────────────────────────┐
│ 墨扉 · 项目名 · 当前风格：白描        [风格] [命令] [退出]      │
├────┬───────────────────────────────────────┬─────────────────┤
│ 活  │ 资源管理器：                            │ Agent 面板        │
│ 动  │  项目 / 章 / 角色 / 世界 / 笔记          │  · mofei-writer  │
│ 栏  │  / 摘要 / 链 / 风格 / 仪表盘             │  · 子代理状态     │
│    │                                        │  · @提及发送区    │
├────┼───────────────────────────────────────┤  · 快捷指令       │
│ 底  │ 编辑器：章节/角色卡/世界书/笔记/风格       │                  │
│ 栏  │  多标签 · 自动保存 · revision            │                  │
├────┴───────────────────────────────────────┴─────────────────┤
│ 状态栏：字数 · revision · 风格 · zone · 自动保存 · git 分支      │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 核心视图

```text
ChapterEditor      正文编辑、标题、自动保存、revision、查找替换
CharacterEditor    角色卡：名称/描述/收藏
WorldEditor        世界书条目：触发词/内容/开关/常驻
NoteEditor         笔记：标题/分类/锁定/隐藏
SummaryPanel       章摘要、区间摘要、生成进度
ChainPanel         Prompt Chain 编辑/运行
StylePanel         写作提示词（文笔文风）选择、编辑、预览
Dashboard          写作记录
AgentBridge        送章/送选中/送区间、子代理状态、快捷指令
```

### 4.3 复用 DSH 标准能力

```text
命令面板      ctx.commands：/mofei:open-project、/mofei:writer ...
Slots         标准 DSH Slots，不建私有 slot 体系
Jobs          摘要/检索等长任务接入 DSH Jobs
会话/子代理    复用 DSH Conversation / Subagent，Studio 只做桥
```

---

## 5. 实施阶段

### Phase 0：MOFEI-SPEC 定稿

```text
新增 docs/MOFEI-SPEC.md      目录、实体、frontmatter、revision、zone
新增 styles/*.md             首批 4-6 个写作风格
新增 tools/migrate-to-files.mjs
测试：纯规范校验器（schema/命名/frontmatter）
```

### Phase 1：隔离与 preset

```text
新增 plugin/lib/tools.js
新增 plugin/lib/skills-plugin.js
新增 plugin/lib/context.js
改造 plugin/lib/index.js  → 只保留 core + 文件仓库 + /api/mofei
修改 plugin/package.json  → exports ./tools ./skills ./context
新增 ~/.dsh/.agent-presets/mofei-writer/*
修改 novel cordis.patch.yml → 只挂 core
```

验收：

```text
standard 会话：0 mofei 工具 / 0 mofei 技能
mofei-writer 会话：read/write/edit + 特殊工具 + 写作技能
```

### Phase 2：数据迁移到文件优先

```text
migrate-to-files.mjs：
  .mofei-projects.json → projects/<id>/**/*.md
  保留旧 JSON 作回退，记录 migration manifest
core 读写改为文件优先，内存仅作索引缓存
```

验收：

```text
迁移后所有实体文件可被普通 DSH read/write/edit 直接操作
git init 后历史可 diff/回滚
旧 v0.9 浏览器回归仍通过（通过兼容 API 层）
```

### Phase 3：写作提示词与工具

```text
风格注册与注入：project.yml currentStyle → context/style 注入
工具重构：read/write/edit 三件套 + 实体别名
特殊工具：search/context/summarize/retrieve(FTS)/history/revert
```

验收：

```text
切换 style 后 Writer 输出文风变化
mofei_edit-chapter 局部修改不破坏 revision
test-host 重写并通过
```

### Phase 4：MOFEI-STUDIO

```text
新增 workbench-shell / activity-bar / sidebar / editor-tabs /
       command-palette（消费 ctx.commands）/ status-bar
新增实体编辑器：章节/角色/世界/笔记/风格/摘要/链
新增 agent-bridge-panel
迁移现有功能，删除旧小面板与全局浮动按钮
```

验收：

```text
普通 Web 仅一个入口；进入后全屏工作台
三栏可调、标签页、命令、状态栏、风格选择器可用
退出后 DOM/CSS 归零
```

---

## 6. 验收脚本

```text
tools/verify-agent-isolation.mjs
  standard session → 0 mofei
  mofei-writer session → 预期工具集 + 技能

tools/verify-spec.mjs
  校验文件树、frontmatter、revision、zone

tools/verify-writing-style.mjs
  创建标准项目 → 切换风格 → 检查注入提示词是否进入写作上下文

verify-v0.10-isolation.cjs
  普通 DSH 无墨扉污染；入口→Studio→退出循环 3 次

verify-v0.10-workbench.cjs
  三栏 / 标签页 / 命令面板 / 风格选择器 / 状态栏 / 退出清理
```

---

## 7. 迁移与回滚

```text
1. 迁移前备份 .mofei-*.json
2. 文件树写入后做双向校验（JSON 与文件树内容一致）
3. 兼容 API 层保留旧 RPC 形状，v0.6-v0.9 回归通过后再移除
4. 若 preset scope 失败：回退 v0.9.1 全局注册 + 文档标记
5. 若 exports 子路径不可用：拆真实多包（mofei-core/mofei-tools/mofei-skills）
```

---

## 8. 风险

| 风险 | 应对 |
| --- | --- |
| 文件树迁移破坏现有数据 | 双向校验 + 备份 + 兼容 API |
| 写作风格注入影响 model 行为 | style 只进写作上下文，不进 coding |
| read/write/edit 泛化后模型调用退化 | 保留实体别名工具 + 清晰 schema |
| Studio 全屏 overlay 吞 DSH 快捷键 | 明确快捷键作用域，Esc 退出 |
| DSH preset 版本演进 | 预设文件独立，随 DSH 升级重写 agent.cordis |
| RAG 依赖生态 | v0.10 只做 FTS + 接口预留，等 DSH 检索生态成熟 |

---

## 9. 明确不做

```text
不重写 DSH 聊天/会话/子代理 UI
不移植 OpenFic LangGraph/Python 后端
不实现私有插件生态/私有 Slot 系统
不做模型设置/i18n/PWA/审计
v0.10 不实现完整向量 RAG（先 FTS + 接口）
```

---

## 10. 完成定义

```text
[x] MOFEI-SPEC 定稿并有校验器
[x] 文件优先数据迁移完成，旧数据可回退
[x] standard 会话零墨扉，mofei-writer 会话按预期加载
[x] 写作提示词入口可用，切换风格后注入生效
[x] read/write/edit + 特殊工具可用
[x] MOFEI-STUDIO 长期工作台可用，退出无残留
[x] 旧六项浏览器回归 + 新增隔离/工作台/规范/风格回归全绿
[x] v0.10 changelog 与交接文档更新
```
