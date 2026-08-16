// 墨扉（Mofei）摘要持久化纯逻辑（无 DSH 依赖、不调 LLM，可独立单元测试）。
// 数据模型（version 1）：
//   store = {
//     version: 1,
//     chapters: { [chapterId]: { summary, chapterRevision, updatedAt } },
//     ranges:   [ { id, title, chapterIds, summary, updatedAt } ],
//   }
// 本模块只做「纯数据」层：规范化、视图、过期判断、不可变写入、区间分组与批量计划。
// 参考 OpenFic 主干的 summary_service / chapter_summary 思路（Apache-2.0），
// 但这里是 mofei 自带的一个更小的纯逻辑实现，不含任何 openfic 标识。

const DAY_MS = 86400e3
const DEFAULT_MAX_AGE_DAYS = 30

function toFiniteNumber(value) {
  return typeof value === 'number' && isFinite(value) ? value : 0
}

function toTimestamp(value) {
  const number = toFiniteNumber(value)
  if (!number) return 0
  // 传入毫秒时间戳（可能是开箱即用的大数）；异常大/负数一律归 0。
  return number > 0 && number < 9e15 ? Math.floor(number) : 0
}

// 脏数据修复：string 原样返回，number 安全转字符串，其余（对象/数组/bool/null）回落为空串。
function toStringValue(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && isFinite(value)) return String(value)
  return ''
}

// 规范化单个章节摘要条目：只保留合法 id 与字段，summary 强制为 string。
function normalizeChapterEntry(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    summary: toStringValue(source.summary),
    chapterRevision: toFiniteNumber(source.chapterRevision),
    updatedAt: toTimestamp(source.updatedAt),
  }
}

// 规范化单个区间摘要条目：只保留合法 id 与字段，chapterIds 强制为 string 数组。
function normalizeRangeEntry(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const rawIds = Array.isArray(source.chapterIds) ? source.chapterIds : []
  const chapterIds = []
  rawIds.forEach((id) => {
    const value = typeof id === 'string' ? id : ''
    if (value && !chapterIds.includes(value)) chapterIds.push(value)
  })
  return {
    id: toStringValue(source.id),
    title: toStringValue(source.title),
    chapterIds,
    summary: toStringValue(source.summary),
    updatedAt: toTimestamp(source.updatedAt),
  }
}

// 以数据属性写入（而非普通赋值），可安全接收 __proto__/constructor/prototype 等键，
// 不触发原型 setter，也不会把原型链污染带进 chapters 对象。
function defineChapter(chapters, chapterId, entry) {
  if (chapterId === '__proto__' || chapterId === 'constructor' || chapterId === 'prototype') return
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(chapterId)) return
  Object.defineProperty(chapters, chapterId, { value: entry, enumerable: true, writable: true, configurable: true })
}

function emptyChapters() {
  return {}
}

// 输入任意持久化 JSON 或 undefined，输出规范化 store；任意脏数据都不抛异常。
export function normalizeSummaryStore(input) {
  const store = { version: 1, chapters: emptyChapters(), ranges: [] }
  if (!input || typeof input !== 'object') return store

  if (input.chapters && typeof input.chapters === 'object' && !Array.isArray(input.chapters)) {
    Object.keys(input.chapters).forEach((chapterId) => {
      defineChapter(store.chapters, chapterId, normalizeChapterEntry(input.chapters[chapterId]))
    })
  }

  if (Array.isArray(input.ranges)) {
    input.ranges.forEach((raw) => {
      const entry = normalizeRangeEntry(raw)
      if (!entry.id) return
      store.ranges.push(entry)
    })
  }

  return store
}

// 返回某章的摘要条目（浅层读取副本），无则 null。入参 store 未规范化时先规范化。
export function chapterSummaryView(store, chapterId) {
  const normalized = normalizeSummaryStore(store)
  const chapter = normalized.chapters[chapterId]
  if (!chapter) return null
  return { summary: chapter.summary, chapterRevision: chapter.chapterRevision, updatedAt: chapter.updatedAt }
}

// 判断章节摘要是否过期：
//   过期 iff !entry
//        || entry.chapterRevision !== chapter.revision
//        || Date.now() - entry.updatedAt > maxAgeDays * 86400e3
export function isChapterSummaryStale(entry, chapter, options = {}) {
  if (!entry) return true
  const revision = chapter && typeof chapter === 'object' ? chapter.revision : undefined
  if (entry.chapterRevision !== revision) return true
  const maxAgeDays = typeof (options && options.maxAgeDays) === 'number' && isFinite(options.maxAgeDays) ? options.maxAgeDays : DEFAULT_MAX_AGE_DAYS
  const maxAgeMs = maxAgeDays * DAY_MS
  return Date.now() - entry.updatedAt > maxAgeMs
}

// 不可变写入：返回全新 store，原 store 及其嵌套 chapters 对象均不被修改。
export function applyChapterSummary(store, chapterId, chapterRevision, summary) {
  const normalized = normalizeSummaryStore(store)
  const entry = normalizeChapterEntry({ summary, chapterRevision: toFiniteNumber(chapterRevision), updatedAt: Date.now() })
  const chapters = emptyChapters()
  Object.keys(normalized.chapters).forEach((id) => {
    const existing = normalized.chapters[id]
    defineChapter(chapters, id, { summary: existing.summary, chapterRevision: existing.chapterRevision, updatedAt: existing.updatedAt })
  })
  defineChapter(chapters, chapterId, entry)
  return { version: 1, chapters, ranges: normalized.ranges.map((range) => ({ ...range })) }
}

// 将章节按 order 升序分组，每 size 章一组。
//   chapters 缺 order 视为 0 且保持稳定（Array.prototype.sort 在 ES2019+ 为稳定排序）。
//   空数组 -> []；单章 size=10 -> 一组 title `第N-N章`（首尾相同是预期行为）。
export function buildRangeGroups(chapters, size = 10) {
  if (!Array.isArray(chapters) || chapters.length === 0) return []
  const groupSize = typeof size === 'number' && isFinite(size) && size >= 1 ? Math.floor(size) : 10
  const sorted = chapters.map((chapter) => ({
    id: toStringValue(chapter && chapter.id),
    order: toFiniteNumber(chapter && chapter.order),
  })).sort((a, b) => a.order - b.order)
  const groups = []
  for (let start = 0; start < sorted.length; start += groupSize) {
    const slice = sorted.slice(start, start + groupSize)
    if (!slice.length) continue
    const first = slice[0]
    const last = slice[slice.length - 1]
    const chapterIds = slice.map((chapter) => chapter.id)
    groups.push({
      id: 'range-' + first.id + '-' + last.id,
      title: `第${first.order + 1}-${last.order + 1}章`,
      chapterIds,
    })
  }
  return groups
}

// 在 ranges 数组内按 rangeId upsert；返回新 store（原 store 不被修改）。
// 新区间沿用已有 title/chapterIds，已有的按 rangeId 覆盖写入并更新 updatedAt。
export function applyRangeSummary(store, rangeId, chapterIds, summary) {
  const normalized = normalizeSummaryStore(store)
  const source = Array.isArray(chapterIds) ? chapterIds : []
  const cleanIds = []
  source.forEach((id) => {
    const value = typeof id === 'string' ? id : ''
    if (value && !cleanIds.includes(value)) cleanIds.push(value)
  })
  const summaryText = toStringValue(summary)
  let found = false
  const ranges = normalized.ranges.map((range) => {
    if (range.id !== rangeId) return { ...range, chapterIds: range.chapterIds.slice() }
    found = true
    return { ...range, chapterIds: cleanIds, summary: summaryText, updatedAt: Date.now() }
  })
  if (!found) {
    ranges.push({ id: rangeId, title: rangeId, chapterIds: cleanIds, summary: summaryText, updatedAt: Date.now() })
  }
  return { version: 1, chapters: normalized.chapters, ranges }
}

// 拆分需要重算与仍然新鲜的章节；两者均按 order 升序（保持顺序排序）返回。
export function planSummaryBatch(chapters, store, options = {}) {
  const list = Array.isArray(chapters) ? chapters.slice() : []
  const normalized = normalizeSummaryStore(store)
  const sorted = list.sort((a, b) => toFiniteNumber(a && a.order) - toFiniteNumber(b && b.order))
  const stale = []
  const fresh = []
  sorted.forEach((chapter) => {
    const entry = normalized.chapters[chapter.id]
    if (isChapterSummaryStale(entry, chapter, options)) stale.push(chapter)
    else fresh.push(chapter)
  })
  return { stale, fresh, total: sorted.length }
}
