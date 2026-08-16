# DSH 动态 Cordis 插件 API 契约笔记（实际 Inspect 结果）

> 来源：本会话中 `cordis_inspect_list` / `cordis_inspect_query` 的真实输出。
> 重建插件时以此为准，不要猜 API。

## 1. 动态代码执行环境

Host / Client 都是 **plain JavaScript 函数体**（`return { ... }`），没有 TS/JSX/import/require/bundler。

### Host Builtin（Host 半区可用符号）

```text
ctx       ctx.get(name) / ctx.on(name, fn) / ctx.provide(name, value) / ctx.effect(fn, label?)
harness   harness.handle(method, handler) / harness.defineTool(def) / harness.registerTool(ctx, def)
console   console.log / console.error（带 Package 标签）
btoa / atob
TextEncoder / TextDecoder
```

### Client Builtin（浏览器半区可用符号）

```text
ctx       ctx.get(name) / ctx.on(name, fn) / ctx.provide(name, value) / ctx.effect(fn, label?)
React     React.createElement(type, props, ...children) / useState / useEffect
host      host.call(method, args) -> Promise<JsonValue>   （调用本 Package Host 的 harness.handle）
styles    styles.insert(css) -> disposer
console   console.log / console.error
```

Client 没有 `window` / `document` / `fetch` / `setTimeout` 全局；定时器必须用 `timer` Service。

## 2. timer Service（Host/Client 相同接口）

```text
timer.timeout(callback, delay) -> disposer
timer.timeout(delay) -> Promise<void>
timer.interval(callback, delay) -> disposer
timer.interval(delay) -> AsyncIterableIterator
timer.throttle(cb, delay, noTrailing?) -> fn & { dispose }
timer.debounce(cb, delay) -> fn & { dispose }
```

用法（自动保存/草稿防抖，本插件已用）：

```js
// 声明硬依赖
inject: ['timer'],
apply(ctx) {
  // 草稿防抖：输入后 800ms 落盘
  const task = ctx.debounce(() => persist(), 800)
  task()
  // 清理
  task.dispose()
}
```

## 3. Host Service 关键契约

### fs

```text
fs.resolve(path, { cwd, signal }) -> FsTarget
fs.stat(target, signal) -> FsInfo | undefined
fs.readText(target, signal) -> string
fs.writeText(target, content, expected?, signal?, sandboxPolicy?) -> FsWriteOutcome
fs.editText(target, edit, expected?, signal?, sandboxPolicy?) -> FsEditOutcome
```

- 相对路径默认相对 `sandboxPolicy.workspaceRoot`。
- `expected` 用于原子写意图/版本保护；省略则无条件覆盖。
- 写入必须传解析后的 `policy = sandboxPolicy.resolve()`。

### sandboxPolicy

```text
sandboxPolicy.workspaceRoot   -> string（当前工作区根）
sandboxPolicy.defaultMode     -> SandboxMode
sandboxPolicy.resolve(request?) -> SandboxExecutionPolicy
```

### webServer（独立页面路由；Inspect 未展开 handler 类型，实际 d.ts 如下）

```ts
export type WebRouteKind = 'exact' | 'prefix'
export interface WebRoute {
  kind: WebRouteKind
  path: string                                   // 绝对路径，不带尾斜杠
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
webServer.register(route: WebRoute) -> () => void   // 重复 (kind, path) 会 throw
webServer.registerUpgrade(...)
webServer.registerFallback(handler) -> () => void   // 只有一个 fallback
webServer.tapIndex(transform) -> () => void
webServer.applyIndexTaps(html) -> string
```

来源：`node_modules/@deepseek-ai/dsh-host-webserver/lib/types/index.d.ts`（本机 DSH 检查路径）。

## 4. Client Service 关键契约

```text
slots    slots.inject(key, cb) / slots.register({ name, id/key, order, label }, Component)
timer    见上
theme    theme.overrideTokens(source, tokens) -> disposer
layout   toggleSidebar / openDetails / closeDetails
sessions open / search / fork / scope / binding
workspaces connectWorkspace / startSession / create / listDirectory / ...
locale   getLocale / setLocale / register / bind / subscribe
```

## 5. Client Slot 树（本会话确认）

```text
sidebar.footer.action       list  注册 { id, order, label }，ownerProps: { wide: boolean }
shell.overlay               list  注册 { id, order, label }，点击穿透，occupant 需 pointer-events:auto
tool.view.cordis            keyed 注册 { key: 'self' }，Guard 绑定 pluginId.packageId
sidebar.workspaces / sidebar.settings / settings.section / settings.general.item
conversation.session / conversation.view / conversation.chat.node / conversation.chat.turnTail
conversation.composer / conversation.composer.bar / conversation.composer.dock
conversation.input.dock / conversation.input.left / conversation.input.right
conversation.session.header / conversation.session.header.actions / conversation.session.header.utilities
details / conversation.details.tool
```

## 6. Client Event（可 ctx.on 监听）

```text
connection/reset
locale/change
slots/changed
theme/change
```

没有 `beforeunload` / `visibilitychange` 之类的页面生命周期事件；离开保护只能靠卸载 effect + debounce 落盘。

## 7. 已知失败模式（本会话实测）

1. **重复注册 Service**：
   `service "墨扉Domain" has been registered at <cordis-dynamic>` → Host apply 失败。
   原因：残留/旧 Plugin 已注册同名 Service。**不要提供公共 Service**，改用 `harness.handle` 私有 RPC。
2. **动态 Plugin 重启丢失**：Plugin/Package 只存在于当前 Host 进程，重启后 `cordis_inspect_self` 返回
   `no dynamic plugin "ofic-4" in this process`。重启后必须重新 `cordis_define`，得到新 pluginId。
3. **授权按 Plugin 身份绑定**：新 pluginId 需要重新接受 Package 授权；`awaiting-approval` 不是失败，
   是等待用户在 UI 允许。
4. **Client Slot occupant active 但页面不显示**：`Slots.listSubTree` 显示 active 并不保证浏览器投影；
   若侧栏/overlay/运行卡片都不可见，先怀疑 DSH Web 动态 Client 投影，再怀疑插件代码。
5. `cordis_run` 返回 `awaiting-approval` 后，用户允许时 Host 先启动；若 Host 失败，状态为
   `host-half-failed`，读取 `cordis_inspect_self(pluginId, packageId)` 的 `runtime.host.error`。
