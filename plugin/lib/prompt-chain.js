// 墨扉 prompt chains 纯逻辑（无 DSH 依赖、不调 LLM、无 DOM，可独立单元测试）。
// 数据模型（version 1）：
//   store = {
//     version: 1,
//     byProject: { [projectId]: [ { id, name, content, updatedAt }, ... ] },
//   }
// 本模块只做纯数据层：store 规范化、模板宏替换、链视图。
// 宏替换按固定顺序执行且支持同一宏多次出现；未提供变量的宏替换为空串。

const MACROS = [
  'project',
  'chapter',
  'chapterText',
  'selected',
  'characters',
  'world',
  'notes',
  'instruction',
  'style',
]

// 脏数据安全：string 原样返回，非字符串一律空串。
function toText(value) {
  return typeof value === 'string' ? value : ''
}

function toTimestamp(value) {
  const number = typeof value === 'number' && isFinite(value) ? value : 0
  if (!number) return 0
  return number > 0 && number < 9e15 ? Math.floor(number) : 0
}

function toId(value) {
  return typeof value === 'string' && value ? value : ''
}

// 规范化单个链条目：只保留合法字段，content 强制 string。
function normalizeChainEntry(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    id: toId(source.id),
    name: toText(source.name),
    content: toText(source.content),
    updatedAt: toTimestamp(source.updatedAt),
  }
}

// 输入任意持久化 JSON 或 undefined，输出规范化 store；任意脏数据都不抛异常。
// byProject 以数据属性写入（而非普通赋值），避免 __proto__ 等键污染原型。
export function normalizeChainStore(input) {
  const store = { version: 1, byProject: {} }
  if (!input || typeof input !== 'object') return store
  const byProject = input.byProject && typeof input.byProject === 'object' && !Array.isArray(input.byProject) ? input.byProject : {}
  Object.keys(byProject).forEach((projectId) => {
    if (projectId === '__proto__' || projectId === 'constructor' || projectId === 'prototype') return
    const rawList = byProject[projectId]
    if (!Array.isArray(rawList)) return
    const list = []
    rawList.forEach((raw) => {
      const entry = normalizeChainEntry(raw)
      if (!entry.id) return
      list.push(entry)
    })
    Object.defineProperty(store.byProject, projectId, { value: list, enumerable: true, writable: true, configurable: true })
  })
  return store
}

// 模板宏替换：context 字段缺失时用空串；替换顺序固定、重复出现全部替换。
export function compilePromptChain(template, context) {
  const source = toText(template)
  const values = context && typeof context === 'object' ? context : {}
  let output = source
  MACROS.forEach((macro) => {
    const value = values[macro]
    const replacement = typeof value === 'string' ? value : ''
    output = output.split('{{' + macro + '}}').join(replacement)
  })
  return output
}

// 链条目视图：只暴露 { id, name, content, updatedAt }。
export function promptChainView(chain) {
  const entry = normalizeChainEntry(chain)
  return { id: entry.id, name: entry.name, content: entry.content, updatedAt: entry.updatedAt }
}
