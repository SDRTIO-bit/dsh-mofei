// 墨扉角色定义纯逻辑（无 DSH 依赖、无 DOM，可独立单元测试）。
// 数据模型（version 1）：
//   store = {
//     version: 1,
//     byProject: {
//       [projectId]: [
//         {
//           id: "writer",
//           name: "正文写作者",
//           entries: [
//             { name: "角色定义", content: "...", order: 0, isEnabled: true },
//             { name: "格式要求", content: "...", order: 1, isEnabled: true },
//             ...
//           ],
//           defaultInstructions: [{ instructionId: "mofei-writing", order: 100, isEnabled: true }],
//           updatedAt: 1234567890
//         }
//       ]
//     }
//   }
// 角色可人工修改、组装（开关 entry、排序、增删 entry），使用时按 order 拼 enabled entries → persona 字符串。
// 本模块只做纯数据层：store 规范化、entry 规范化、persona 拼接、角色视图。

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

function toOrder(value) {
  const number = typeof value === 'number' && isFinite(value) ? value : 0
  return Math.floor(number)
}

// 规范化单个 entry：只保留合法字段，content 强制 string，isEnabled 默认 true。
function normalizeEntry(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    name: toText(source.name),
    content: toText(source.content),
    order: toOrder(source.order),
    isEnabled: source.isEnabled !== false,
  }
}

// 规范化模板绑定：只保存指令 ID、顺序和启用状态，不复制指令正文。
function normalizeInstructionBindings(value) {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    return {
      instructionId: toId(source.instructionId),
      order: toOrder(source.order),
      isEnabled: source.isEnabled !== false,
    }
  }).filter((item) => item.instructionId)
}

// 规范化单个角色：只保留合法字段，entries 强制数组。
function normalizeRole(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const entries = Array.isArray(source.entries) ? source.entries.map(normalizeEntry) : []
  return {
    id: toId(source.id),
    name: toText(source.name),
    entries,
    defaultInstructions: normalizeInstructionBindings(source.defaultInstructions),
    updatedAt: toTimestamp(source.updatedAt),
  }
}

// 输入任意持久化 JSON 或 undefined，输出规范化 store；任意脏数据都不抛异常。
export function normalizeRoleStore(input) {
  const store = { version: 1, byProject: {} }
  if (!input || typeof input !== 'object') return store
  const byProject = input.byProject && typeof input.byProject === 'object' && !Array.isArray(input.byProject) ? input.byProject : {}
  Object.keys(byProject).forEach((projectId) => {
    if (projectId === '__proto__' || projectId === 'constructor' || projectId === 'prototype') return
    const rawList = byProject[projectId]
    if (!Array.isArray(rawList)) return
    const list = []
    rawList.forEach((raw) => {
      const role = normalizeRole(raw)
      if (!role.id) return
      list.push(role)
    })
    Object.defineProperty(store.byProject, projectId, { value: list, enumerable: true, writable: true, configurable: true })
  })
  return store
}

// 拼接角色 persona：取 enabled entries，按 order 排序，content 用双换行拼接。
// 返回字符串（可能为空串）；调用方按需判断。
export function compileRolePersona(role) {
  const normalized = normalizeRole(role)
  const enabled = normalized.entries.filter((entry) => entry.isEnabled)
  enabled.sort((a, b) => a.order - b.order)
  return enabled.map((entry) => entry.content).filter((content) => content.length > 0).join('\n\n')
}

// 角色视图：只暴露 { id, name, entries, updatedAt }，entries 含 name/order/isEnabled（不含 content，供列表用）。
export function roleSummaryView(role) {
  const normalized = normalizeRole(role)
  return {
    id: normalized.id,
    name: normalized.name,
    entryCount: normalized.entries.length,
    enabledCount: normalized.entries.filter((entry) => entry.isEnabled).length,
    instructionCount: normalized.defaultInstructions.length,
    enabledInstructionCount: normalized.defaultInstructions.filter((item) => item.isEnabled).length,
    defaultInstructions: normalized.defaultInstructions,
    updatedAt: normalized.updatedAt,
  }
}

// 角色完整视图：含 entries 全部字段（含 content），供读取详情用。
export function roleDetailView(role) {
  const normalized = normalizeRole(role)
  return {
    id: normalized.id,
    name: normalized.name,
    entries: normalized.entries,
    defaultInstructions: normalized.defaultInstructions,
    updatedAt: normalized.updatedAt,
  }
}
