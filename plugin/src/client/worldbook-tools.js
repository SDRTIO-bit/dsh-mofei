// 墨扉世界书工具纯函数（无 DOM、无第三方依赖、纯 ESM）
// 供世界书搜索 / 选择 / 批量操作 UI 使用；所有函数不修改入参。

// 从条目或原始 id 字符串中提取字符串 id。
function idOf(item) {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string') return item.id
  return null
}

// 将「条目数组 / 原始 id 字符串数组 / Set」规整为去重保序的 id 字符串数组。
// 非法输入返回 []。
function toIdList(input) {
  if (input instanceof Set) return Array.from(input).map(idOf).filter((id) => typeof id === 'string' && id)
  if (!Array.isArray(input)) return []
  const list = []
  const seen = new Set()
  input.forEach((item) => {
    const id = idOf(item)
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id)
      list.push(id)
    }
  })
  return list
}

// 建立 id -> 原始条目 的索引；非数组或脏元素安全跳过。
function indexEntries(entries) {
  const byId = new Map()
  if (Array.isArray(entries)) {
    entries.forEach((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.id === 'string' && entry.id) {
        byId.set(entry.id, entry)
      }
    })
  }
  return byId
}

/**
 * 按 query 过滤世界书条目：大小写不敏感，命中 name 或 keys 中任一 key。
 * 空 query 返回副本；entries 非数组返回 []。保持原顺序。
 */
export function filterWorldEntries(entries, query) {
  if (!Array.isArray(entries)) return []
  const q = typeof query === 'string' ? query.trim().toLowerCase() : ''
  return entries.filter((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    if (!q) return true
    if (typeof entry.name === 'string' && entry.name.toLowerCase().includes(q)) return true
    if (Array.isArray(entry.keys)) {
      return entry.keys.some((key) => typeof key === 'string' && key.toLowerCase().includes(q))
    }
    return false
  })
}

/**
 * 与 Host DUPLICATE_WORLD_NAME 同口径：trim + toLowerCase 比较名称。
 * 命中返回冲突条目，未命中（含空名 / 脏输入）返回 null；excludeId 用于更新时跳过自身。
 */
export function worldNameConflict(entries, name, excludeId) {
  if (!Array.isArray(entries)) return null
  const target = typeof name === 'string' ? name.trim().toLowerCase() : ''
  if (!target) return null
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    if (typeof excludeId === 'string' && excludeId && entry.id === excludeId) continue
    const candidate = typeof entry.name === 'string' ? entry.name.trim().toLowerCase() : ''
    if (candidate && candidate === target) return entry
  }
  return null
}

/**
 * 全选/反选：全部可见 id 均已选中 → 返回 []；否则返回并集（可见 id ∪ 已选 id），
 * 按 entries 顺序去重保序，剩余已选 id 追加其后。始终返回新数组。
 */
export function toggleAllSelection(entries, selected, visible) {
  const entryIds = Array.isArray(entries)
    ? entries.map(idOf).filter((id) => typeof id === 'string' && id)
    : []
  const selectedSet = new Set(toIdList(selected))
  const entryIdSet = new Set(entryIds)
  const visibleIds = toIdList(visible).filter((id) => entryIdSet.has(id))

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))
  if (allSelected) return []

  const visibleSet = new Set(visibleIds)
  const union = []
  const seen = new Set()
  entryIds.forEach((id) => {
    if ((selectedSet.has(id) || visibleSet.has(id)) && !seen.has(id)) {
      seen.add(id)
      union.push(id)
    }
  })
  selectedSet.forEach((id) => {
    if (!seen.has(id)) {
      seen.add(id)
      union.push(id)
    }
  })
  return union
}

/**
 * 生成批量开关计划：只包含「当前开关状态与目标不同」且存在的条目。
 * 返回 { entryIds, changed }；脏输入安全返回 { entryIds: [], changed: 0 }。
 */
export function buildBulkTogglePlan(entries, selectedIds, isEnabled) {
  if (!Array.isArray(entries)) return { entryIds: [], changed: 0 }
  const byId = indexEntries(entries)
  const ids = toIdList(selectedIds).filter((id) => byId.has(id))
  const target = isEnabled === true
  const entryIds = []
  ids.forEach((id) => {
    const entry = byId.get(id)
    const current = entry.isEnabled !== false
    if (current !== target) entryIds.push(id)
  })
  return { entryIds, changed: entryIds.length }
}

/**
 * 生成批量删除计划：只包含存在的条目 id，去重保序。
 * 返回 { entryIds, count }；脏输入安全返回 { entryIds: [], count: 0 }。
 */
export function buildBulkDeletePlan(entries, selectedIds) {
  if (!Array.isArray(entries)) return { entryIds: [], count: 0 }
  const byId = indexEntries(entries)
  const entryIds = toIdList(selectedIds).filter((id) => byId.has(id))
  return { entryIds, count: entryIds.length }
}
