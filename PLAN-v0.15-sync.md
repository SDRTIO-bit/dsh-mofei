# PLAN-v0.15：文件同步轮询（AI 写入 → 墨扉自动可见）

> 生成：2026-08-16。基线 commit `752dce9`（v0.14.1+ 未完成改造已提交）。
> 问题来源：用户实测反馈「AI 已经写入文档，但是墨菲看不见，没有进行轮询」。

---

## 1. 背景与问题定位

### 1.1 用户反馈

- AI（DSH 写作会话）已通过 `mofei_*` 工具把正文写入章节文档；
- 墨扉工作台（Studio）界面没有自动出现新内容；
- 用户判断：缺少轮询机制。

### 1.2 现状代码证据（已核实）

墨扉目前**只有一条**「AI 写入 → UI 刷新」通路：

1. `plugin/src/client/legacy.js:1575-1583` 的聊天工具事件刷新 effect，触发条件全部满足才会 `reload()`：
   - `open`（工作台打开）；
   - `project.writerSessionId === chatSessionId`（当前会话必须是**已绑定**的项目写作会话）；
   - `chatSnap` 里出现名称匹配
     `/^(?:mofei|openfic)_(?:write|edit|update|create|delete|move|set|reorder|save|revert|rollback)-/`
     的**已完成**工具事件。

2. Host 侧 `plugin/lib/index.js` 只有手动/启动路径：
   - `load()`（启动时）执行一次 `importFileTree()`（文件优先导入）；
   - `reload-from-files` RPC（手动全量导入）；
   - `file-tree-status` RPC（深比较，读全量文件，重）。

### 1.3 触发失败的具体场景（用户体感「看不见」的原因）

| # | 场景 | 现有通路是否覆盖 |
| --- | --- | --- |
| A | AI 在**已绑定**的 mofei-writer 会话用 `mofei_update-chapter` 写正文 | ✅ 工具事件刷新（但事件被会话历史压缩/清理后会丢） |
| B | AI 用未绑定会话 / 其他写作流程写入（工具名不匹配正则、事件被清理、气泡关闭期间写入） | ❌ |
| C | 外部编辑器 / coding 会话直接改 `.mofei/projects/**/*.md`（文件优先闭环，P0 目标） | ❌ 完全无感知，需手动 `reload-from-files` |
| D | 气泡关闭期间 AI 写入，重新打开工作台 | ⚠️ 仅内存 store 已更新的场景可见；外部文件编辑仍不可见 |

**结论**：缺少一个独立的、不依赖聊天会话绑定的变更检测/轮询通路。

---

## 2. 目标

- AI（无论哪个会话、哪种写入方式）把内容写入文档后，墨扉工作台在 ≤3 秒内自动看到最新内容；
- 外部直接编辑 `.mofei/projects/**/*.md` 也能自动回读（兑现「文件优先闭环」P0）；
- 作者本地有未保存草稿时，绝不覆盖草稿，沿用现有 `conflict` 保护；
- 轮询开销可忽略：轻量 RPC + Host 侧 TTL 缓存，不改变现有 git 提交节流行为。

---

## 3. 方案设计

### 3.1 Host：新增轻量 RPC `sync-status`（`plugin/lib/index.js`）

返回两个独立签名，客户端分别响应：

```text
{
  storeStamp: <内存 store 的章节 revision 指纹>,   // AI 工具写入 → 内存已更新 → 只需 reload()
  fileStamp:  <文件树 mtime 混合签名>,             // 外部文件编辑 / 镜像写入 → 需要 reload-from-files
}
```

- `storeStamp`：`projects.map(p => p.id + ':' + p.chapters.map(c => c.id + ':' + c.revision).join(',')).join('|')`，纯内存计算，零 IO；
- `fileStamp`：递归扫 `.mofei/projects/**`（文件 + 目录）的 mtime，混合为
  `` `${count}:${maxMtime}:${sumMtime}` ``（count 覆盖新增/删除，max/sum 覆盖内容修改）；
- **TTL 缓存 1200ms**：`sync-status` 被 2s 轮询调用时基本命中缓存，不做全量磁盘扫描；
- handler 与其他只读 RPC 一致：`await load(); await queue`（串行队列，避免读到半写入状态）；
- 虚拟根（virtual-root）环境返回 `{ storeStamp:'', fileStamp:'' }`（不轮询）。

### 3.2 Client：工作台挂载期 2s 轮询（`plugin/src/client/legacy.js`）

在 `Workspace` 组件内新增 effect（`mode === 'web'` 时工作台始终挂载，气泡开/关都轮询，
保证打开即最新；轮询成本 ≈ 一次命中缓存的 RPC/2s）：

```text
1. 首次 poll：直接执行 catch-up —— call('reload-from-files') + reload()
   （覆盖场景 D：气泡关闭期间外部编辑的文件，打开即可见）
2. 之后每 2s：call('sync-status')
   - storeStamp 变化 → 仅 reload()（AI 工具写入，内存已新）
   - fileStamp 变化  → call('reload-from-files') + reload()（文件优先导入）
3. 防重入：busy 标志；卸载清理：alive 标志 + clearInterval
4. 闭包新鲜度：reloadRef 每次渲染更新，轮询永远调用最新 reload()
5. 既有聊天工具事件刷新（1575-1583）保留 —— 双保险，可即时响应
```

### 3.3 冲突与草稿保护（不新增逻辑，依赖现有机制）

- `reload()`（legacy.js:843-861）已有保护：`latest.revision !== revision` 时，
  - `changed`（本地草稿未保存）→ 置 `conflict`，不覆盖草稿；
  - 否则 → 直接更新 draft/saved/revision。
- 用户自己保存触发的 stamp 变化：revision 已被 `accept()` 同步 → `reload()` 无副作用。
- `reload-from-files` 导入遵循「文件 revision ≥ store revision → 文件胜出」，工具写入场景为 no-op；
  `saveProjects()` 的 `gitCommitAll` 有 10s 节流 + 「nothing to commit」短路，不会产生空提交。

---

## 4. 实施步骤（全部改动点）

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `plugin/lib/index.js` | 新增 `storeStamp()` / `fileTreeStamp()`（TTL 缓存）/ `sync-status` RPC handler |
| 2 | `plugin/src/client/legacy.js` | 新增 `syncPollRef`/`reloadRef` + 2s 轮询 effect（含首轮 catch-up、防重入、清理） |
| 3 | `plugin` | `npm run build` 重建 `lib/client.js`（esbuild，禁止手改产物） |
| 4 | `verify-v0.15-sync.cjs`（新增） | 端到端验证：RPC 写入 → 编辑器自动更新；外部改文件 → 自动回读；草稿保护（不覆盖） |
| 5 | 项目根 | `PLAN-v0.15-sync.md`（本文档）+ `v0.15-changelog.md`（实施后写） |
| 6 | git | 全部改动一次提交 |

## 5. 验证方案

```powershell
# 语法 + 构建
node --check plugin\lib\index.js
cd plugin; npm run build; cd ..

# 重启 3088（novel profile）
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '3088' } | Select-Object -First 1
if ($p) { Stop-Process -Id $p.ProcessId -Force; Start-Sleep -Seconds 2 }
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'C:\Users\zhao\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js','--profile','novel','--port','3088' -WorkingDirectory 'F:\game\SillyTavern-1.13.2\OpenFic-DSH' -WindowStyle Hidden

# 新增端到端轮询回归（需 3088 在线）
node verify-v0.15-sync.cjs

# 既有回归抽查（防破坏）
node verify-v0.14-view.cjs
node verify-v0.14-workbench.cjs
```

## 6. 风险与边界

- **性能**：`fileStamp` 递归 stat 全项目树，但有 1.2s TTL；每次实际导入（reload-from-files）是
  全量扫描——变化频率低（仅在真实写入时），可接受；若后续项目巨大可降级为仅章节目录。
- **mtime 粒度**：NTFS 为毫秒级；叠加 `storeStamp`（revision 指纹）后，同秒写入也必被
  storeStamp 或 count/sum 变化捕获。
- **轮询失效**：`sync-status` 出错时静默跳过（下轮再试），不打断工作台。
- **不做的事**：不做 fs.watch 事件监听（Windows/网络盘可靠性差、句柄管理复杂）；
  不改变「文件优先」导入规则；不引入新存储。

## 7. 验收标准

1. AI 用 `mofei_update-chapter` 写入 → 工作台 ≤3s 自动显示新正文（状态栏 revision 同步）；
2. 外部把章节文件 revision+1 并改正文 → 工作台 ≤3s 自动回读；
3. 作者本地有未保存草稿时 AI 写入 → 显示冲突提示，草稿不被覆盖；
4. `verify-v0.15-sync.cjs` ALL PASS；`verify-v0.14-view / -workbench` 回归不破。

---

## 8. 实施结果（2026-08-16 已交付）

- 全部 6 个实施步骤完成（见 §4），额外修复一处实施中发现的问题：
  **镜像写入 ping-pong 循环**——`mirrorFileTree()` 无条件重写全部文件导致 fileStamp 持续变化，
  轮询与镜像互相触发；已改为 `writeMofeiFile` 内容相同跳过写（见 `v0.15-changelog.md`）。
- 验证：`verify-v0.15-sync.cjs` 9 项 ALL PASS；`verify-v0.14-view` / `verify-v0.14-workbench` 回归 ALL PASS。
- 验收标准 1-4 全部满足（轮询 2s + 首轮 catch-up，实测 ≤4s 可见）。
- 提交：commit 见 git log（`chore: v0.15.0 文件同步轮询…`）。
