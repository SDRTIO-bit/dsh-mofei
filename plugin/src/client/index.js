// 墨扉 client 构建入口：esbuild 打包后由 DSH /plugins/<id>/client.js 服务。
// 所有模块（含 React）打进 bundle；factory 只需返回 exports 表层。
import { createClient } from './legacy.js'
window.__ModuleLoader__.load({ id: 'dsh-mofei', factory: createClient })
