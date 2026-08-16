# 墨扉 说明（固定插件版，2026-08-14 起）

> **墨扉 已从动态 Cordis 插件迁移为 DSH 固定插件（npm 包 mofei-dsh）**：
> 重启后自动加载，**不再需要任何恢复步骤**。本文件前半部分描述现状；
> 后半部分保留动态版恢复流程仅作应急回退参考。

## 现状：固定插件，无需恢复

```text
源码:     F:\game\SillyTavern-1.13.2\OpenFic-DSH\plugin\（mofei-dsh 包）
装配:     ~/.dsh\profiles\web\cordis.patch.yml 一行 + pnpm link
加载:     DSH 重启自动加载（Host /api/mofei + Client 前端 bundle）
入口:     侧栏底部「墨 / 墨扉」、右下角「打开 墨扉」浮动按钮
数据:     E:\Users\zhao\Desktop\.mofei-*.json（v4，兼容 v3/v2）
管理:     dsh plugin --profile web remove mofei-dsh（卸载，同时删 patch 行）
```

若刷新页面看不到入口：先硬刷新（Ctrl+F5）再确认；仍无则检查
`dsh --profile web --dump-config` 是否含 墨扉 行、`node_modules\mofei-dsh` 链接是否存在。

## 动态版恢复流程（仅应急回退，日常不需要）

### 0. 前提
- 本会话必须运行在「创造模式」（agent preset id: cordis）上——唯一带 cordis_* 工具的 preset。

### 1-3. define + run（源码用最后可用动态版）
- 读取 `source\pkg-22-createchapter-fix.host.js` / `.client.js`（完整 `return {...}` 函数体）
- `cordis_define(plugin.kind: "new", idPrefix: "ofic", name/purpose 自定, code.host/code.client 原样传入)`
- `cordis_run(mode: "run", pluginId, packageId)`；awaiting-approval 时在 Web 批准
- 刷新页面；若无入口，左下角「Cordis Plugin」面板 → 该行「运行」（装回本页）

### 4. 验证（动态版）
- 三入口（侧栏/浮动按钮/运行卡片）→ 建项目/章节 → 草稿 800ms 落盘 → 保存 revision+1 → 旧 revision 冲突
- 数据文件：`<sandboxPolicy.workspaceRoot>`（实测 E:\Users\zhao\Desktop\，用 /api/host.describe 的 cwd 确认）

### 5. 已知坑（动态版源码）
- CSS 变量：pkg-18/19 用 `--primary` 等在 DSH 不存在 → 面板透明；用 pkg-20+（含 --dsw-alias-* 映射）
- `timer.timeout` 未定义：pkg-19 原始版有此 bug，用 pkg-21+（ctx.timeout）
- createChapter 不刷新列表：pkg-19 原始版 bug，用 pkg-22+（setProjects concat）

## 版本历史

```text
动态版: ofic-1 pkg-1..pkg-4（2026-08-14 当天，随 DSH 重启而终）
固定版: mofei-dsh v0.1.x（当前，重启不丢）
```
