import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// 构建 client (浏览器端)
// DSH client-modules 契约：bundle 以 classic <script> 加载，必须无 import/export 语法；
// 通过 window.__ModuleLoader__.load({ id, factory }) 注册，factory = (require) => exports，
// require 由加载器注入（react/react-dom 来自 shell seed，故标记 external 保持 require 调用）。
await esbuild.build({
  entryPoints: [path.join(root, 'src/client/index.js')],
  bundle: true,
  outfile: path.join(root, 'lib/client.js'),
  format: 'cjs',
  platform: 'neutral',
  external: ['react', 'react-dom', '@deepseek-ai/cordis'],
  sourcemap: true,
  target: ['es2020'],
});

console.log('Build complete!');
