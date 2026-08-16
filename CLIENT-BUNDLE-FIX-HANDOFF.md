# 交接文档：mofei-dsh Client bundle 修复（2026-08-15）

> 这是本轮任务《client 无法加载》的专项交接。主文档：HANDOFF.md / NEXT-SESSION.md。

## 一、现象

- DSH 运行时 report：`client bundle loaded without registering "mofei-dsh"`（client UI 从未加载）。
- 本轮运行又报 `Insufficient Balance`：那是 **LLM 账户余额不足**，属于运行期模型调用失败，
  **不是 client bundle 的问题**，与源码/构建/重启验证无关。`ai-assist / 批量摘要` 需要账号充值后恢复。

## 二、责任清单（根因）

对照 `@deepseek-ai/dsh-client-modules` 契约：

1. **工厂未接收 `require`**：DSH 约定 `factory = (require) => exports`；
   迁移时写成 `factory` 内部 `createClient()` 不接参，导致 `require('react')` 爆炸。
   → 已修复：`createClient(require)`。
2. **构建格式输错**：旧配置 `format:'esm'` + `banner/footer` 的 `import/export`，
   classic `<script>` 加载直接 SyntaxError。
   → 已修复：`format:'cjs'`，删 banner/footer，`external:['react','react-dom','@deepseek-ai/cordis']`。
3. **文档与实现打架**：旧 NEXT-SESSION 写“client 不能用 import/JSX/TS、React=require”，
   但构建却输出 ESM。已改：源码层用 ES 模块 + esbuild 打包，产物满足 classic script 契约。

## 三、修复后的契约校验

```text
plugin/esbuild.config.js          CJS + bundle + external react
plugin/src/client/index.js        window.__ModuleLoader__.load({ id, factory: createClient })
plugin/src/client/legacy.js       export function createClient(require) { ... }
tools/verify-client-bundle.mjs   门禁：无顶层 import/export、存在 load 调用、createClient(require)、require("react")
```

验证命令（已通过）：

```text
node OpenFic-DSH\plugin\esbuild.config.js
node OpenFic-DSH\tools\verify-client-bundle.mjs
CLIENT BUNDLE CONTRACT OK: classic script + ModuleLoader.load + createClient(require) + require("react")
```

## 四、开发约定（防再犯）

- **client 源码在 `plugin/src/client/`，产物在 `plugin/lib/client.js`（勿手改产物）**。
- 改源码后：`node plugin/esbuild.config.js && node tools/verify-client-bundle.mjs`。
- 不要用 `format:'esm'`、不要加 banner/footer 的 import/export。
- `React` 必须走 `factory` 注入的 `require('react')`（esbuild external）。
- 后续新组件可逐步用 JSX/TSX 落 `src/client/`，入口注册形式保持不变。

## 五、待办

1. **用户给 LLM 账户充值/恢复余额**；否则 `ai-assist / ai-summarize-chapters` 会继续 `Insufficient Balance`。
2. **重启 DSH**，让新 bundle 生效；重启后确认客户端能加载（侧栏 OF / 右下角按钮出现）。
3. 跑 `verify-v7.cjs`（Markdown 工具条/热力图/拖拽/AI 面板）。
4. `Tool.listTools` 确认 18 个 `mofei_*`；`/mofei-story-quality` 可见 17 个 skills。
