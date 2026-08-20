// 校验构建出的 lib/client.js 满足 DSH dsh-client-modules 契约。
// 契约来源：@deepseek-ai/dsh-client-modules README + lib/client.js。
// 用法：node tools/verify-client-bundle.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const bundle = path.join(path.dirname(toolsDir), 'plugin', 'lib', 'client.js')
const text = fs.readFileSync(bundle, 'utf8')
const errors = []

// 1. classic <script> 加载：顶层不得出现 import/export 语句（字符串与注释除外，做保守行级检查）
for (const [index, line] of text.split('\n').entries()) {
  const trimmed = line.trim()
  if (/^(import\s|export\s)/.test(trimmed)) errors.push(`line ${index + 1}: top-level ESM syntax: ${trimmed.slice(0, 80)}`)
}

// 2. 必须调用 ModuleLoader 注册，id 与包名一致
if (!/window\.__ModuleLoader__\.load\(\{[\s\S]*?id:\s*["']dsh-mofei["']/.test(text)) {
  errors.push('missing window.__ModuleLoader__.load({ id: "dsh-mofei" }) registration')
}

// 3. factory 必须能接收加载器注入的 require：createClient(require)
if (!/function\s+createClient\(require/.test(text) && !/createClient\s*=\s*\(require/.test(text)) {
  errors.push('createClient does not receive the loader-injected require parameter')
}

// 4. React 必须以 require("react") 形式从工厂参数解析（构建配置 external: react）
if (!/require2?\("react"\)/.test(text)) {
  errors.push('missing require("react") call')
}

// 5. sourceMappingURL 可选，但不能残留顶层 module.exports 的 CJS 包裹
if (/^module\.exports\s*=/m.test(text)) errors.push('top-level module.exports present: bundle is not a plain classic script')

// 6. Workspace 内不得引用未声明的 setXxx setter（回归：v0.5.0 曾丢失 saved/setSaved 声明导致 React 崩溃）
const legacyPath = path.join(path.dirname(toolsDir), 'plugin', 'src', 'client', 'legacy.js')
const legacy = fs.readFileSync(legacyPath, 'utf8')
const workspaceStart = legacy.indexOf('function Workspace(')
if (workspaceStart < 0) {
  errors.push('legacy.js missing function Workspace()')
} else {
  const workspace = legacy.slice(workspaceStart)
  const declared = new Set()
  for (const match of workspace.matchAll(/const\s*\[([^\]]*)\]\s*=\s*React\.useState/g)) {
    const parts = match[1].split(',').map((part) => part.trim())
    if (parts.length === 2) declared.add(parts[1])
  }
  const localFunctions = new Set()
  for (const match of workspace.matchAll(/\bfunction\s+(set[A-Z]\w*)\s*\(/g)) localFunctions.add(match[1])
  const knownExternal = new Set(['setOpen', 'setData', 'setSelectionRange', 'setDate', 'setPointerCapture', 'setInterval', 'setTheme'])
  for (const match of workspace.matchAll(/\b(set[A-Z]\w*)\s*\(/g)) {
    const setter = match[1]
    if (!declared.has(setter) && !localFunctions.has(setter) && !knownExternal.has(setter)) {
      errors.push(`legacy.js Workspace references undeclared setter: ${setter}`)
    }
  }
}

if (errors.length) {
  console.error('CLIENT BUNDLE CONTRACT FAILURES:')
  for (const error of errors) console.error(' - ' + error)
  process.exit(1)
}
console.log('CLIENT BUNDLE CONTRACT OK: classic script + ModuleLoader.load + createClient(require) + require("react")')
