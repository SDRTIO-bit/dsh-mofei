# dsh-mofei 插件包

墨扉写作平台（DSH 插件版）。包内结构：

```text
package.json             元数据：exports 四入口、dsh.client 声明、peerDeps（cordis/react）
esbuild.config.js        client bundle 构建（src/client → lib/client.js，CJS classic）
lib/index.js             Host 半体（core）：数据模型/持久化/RPC/SSE/ctx.provide('mofei')
lib/client.js            构建产物（勿手改；改 src/client/ 后 npm run build）
lib/tools.js             mofei_* 工具（消费 ctx.get('mofei')）
lib/subagent-max.js      subagent_with_model 子代理工具
lib/{ai,summary,prompt-chain,roles,instructions,rag,local-retrieval,txt,world}.js  业务子模块
src/client/*.js          client 源码（工作台/项目网格/编辑器/摘要/技能库等 + *.test.mjs）
web/index.html           /mofei 独立站入口
```

## 命令

```powershell
npm run build    # 构建 client bundle + 契约检查
npm run check    # node --check 全部 lib/*.js
```

## 装配（不在此包内）

- novel profile 装配与配置样例：`~/.dsh/profiles/novel/cordis.patch.yml`
- 写作 preset：`~/.dsh/.agent-presets/mofei-writer/agent.cordis.yml`（仓库副本 `presets/mofei-writer/`）
- 子代理基础：使用 DSH 随附的 `minimal` preset；`subagent-max` 在子代理作用域追加墨扉工具和角色 persona，安装者无需复制 `minimal-v3`。

## 配置

core 行为参数经 cordis.yml `config` 传入（`historyCap` / `entityHistoryMax` /
`gitCommitIntervalMs` / `rag.*`），缺省见 `lib/index.js` 的 `DEFAULT_CORE_CONFIG`；
本地检索路径可用 env 覆盖（`MOFEI_PYTHON_PATH` / `MOFEI_EMBED_CACHE_DIR` /
`MOFEI_EMBED_MODEL` / `MOFEI_EMBED_DIMENSIONS` / `MOFEI_RERANK_MODEL` /
`MOFEI_RERANK_MODEL_PATH`，见 `lib/local-retrieval.js`）。
