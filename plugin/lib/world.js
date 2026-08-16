// 墨扉世界书/章节上下文纯逻辑（无 DSH 依赖，可独立单元测试）
// 兼容 SillyTavern Lorebook 的 entries 结构：keys / secondary_keys / constant / selective / disable / order / comment。
export function cleanText(value, fallback) {
  const result = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  return result ? result.slice(0, 200) : fallback
}

export function normalizeKeys(value) {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、\n]/) : []
  const result = []
  source.forEach((item) => {
    const key = typeof item === 'string' ? item.trim().replace(/\s+/g, ' ') : ''
    if (key && !result.includes(key)) result.push(key)
    if (result.length >= 20) return
  })
  return result
}

export function worldEntryView(item, index) {
  const order = typeof item.order === 'number' ? item.order : typeof index === 'number' ? index : 0
  return { id: item.id, name: cleanText(item.name, '未命名条目'), keys: normalizeKeys(item.keys), content: typeof item.content === 'string' ? item.content : '', isEnabled: item.isEnabled !== false, constant: !!item.constant, order }
}

export function normalizeWorldEntry(input, fallbackId, order) {
  const name = cleanText(input && input.name, '未命名条目')
  const keys = normalizeKeys(input && input.keys)
  return { id: input && typeof input.id === 'string' && input.id ? input.id : fallbackId, name, keys, content: typeof (input && input.content) === 'string' ? input.content : '', isEnabled: input && typeof input.isEnabled === 'boolean' ? input.isEnabled : true, constant: !!(input && input.constant), order: input && typeof input.order === 'number' ? input.order : (typeof order === 'number' ? order : 0) }
}

export function parseWorldInfoJson(content) {
  if (typeof content !== 'string' || !content.trim()) return { error: 'EMPTY_TEXT' }
  let payload
  try { payload = JSON.parse(content) } catch (error) { return { error: 'JSON_PARSE_ERROR' } }
  let rows = []
  if (payload && !Array.isArray(payload) && typeof payload === 'object' && payload.entries && !Array.isArray(payload.entries) && typeof payload.entries === 'object') {
    rows = Object.keys(payload.entries).map((key) => payload.entries[key])
  } else if (Array.isArray(payload)) rows = payload
  else if (payload && !Array.isArray(payload) && typeof payload === 'object' && Array.isArray(payload.entries)) rows = payload.entries
  else return { error: 'INVALID_WORLD_INFO' }
  const entries = []
  rows.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
    const keys = normalizeKeys(raw.keys).concat(normalizeKeys(raw.secondary_keys)).filter((key, position, list) => list.indexOf(key) === position)
    const name = cleanText(raw.comment, '') || cleanText(raw.name, '') || keys[0] || '条目 ' + String(index + 1)
    entries.push(normalizeWorldEntry({ name, keys, content: raw.content, isEnabled: !raw.disable, constant: raw.constant, order: raw.order }, null, typeof raw.order === 'number' ? raw.order : index))
  })
  if (!entries.length) return { error: 'EMPTY_ENTRIES' }
  entries.sort((a, b) => a.order - b.order)
  return { entries }
}

function clamp(value, fallback, min, max) {
  const number = typeof value === 'number' && !isNaN(value) ? Math.floor(value) : fallback
  return Math.min(max, Math.max(min, number))
}

export function selectWorldEntries(entries, content, options) {
  const list = Array.isArray(entries) ? entries : []
  const source = typeof content === 'string' ? content : ''
  const textLower = source.toLowerCase()
  const maxEntries = clamp(options && options.maxEntries, 30, 1, 80)
  const maxChars = clamp(options && options.maxChars, 8000, 200, 40000)
  const maxEntryChars = clamp(options && options.maxEntryChars, 1500, 100, 6000)
  const result = []
  let used = 0
  const sorted = list.slice().sort((a, b) => (typeof a.order === 'number' ? a.order : 0) - (typeof b.order === 'number' ? b.order : 0))
  sorted.forEach((item) => {
    if (result.length >= maxEntries || used >= maxChars) return
    if (item.isEnabled === false) return
    const keys = normalizeKeys(item.keys)
    let active = !!item.constant
    if (!active && keys.length) active = keys.some((key) => key && textLower.includes(key.toLowerCase()))
    else if (!active && !keys.length) active = item.name ? textLower.includes(String(item.name).toLowerCase()) : true
    if (!active) return
    const body = (typeof item.content === 'string' ? item.content : '').slice(0, maxEntryChars)
    if (!body) return
    const matchedKeys = keys.filter((key) => key && textLower.includes(key.toLowerCase()))
    result.push({ id: item.id, name: cleanText(item.name, '未命名条目'), keys: keys, matchedKeys, content: body, isEnabled: item.isEnabled !== false, constant: !!item.constant, order: typeof item.order === 'number' ? item.order : 0 })
    used += body.length
  })
  return result
}

export function buildChapterContext(project, chapter, options, summaries) {
  const sourceProject = project && typeof project === 'object' ? project : {}
  const sourceChapter = chapter && typeof chapter === 'object' ? chapter : null
  const sourceSummaries = summaries && typeof summaries === 'object' ? summaries : null
  const tailChars = clamp(options && options.tailChars, 6000, 200, 24000)
  const fullContent = !!(options && options.fullContent)
  const content = sourceChapter && typeof sourceChapter.content === 'string' ? sourceChapter.content : ''
  const chapterText = fullContent ? content.slice(-24000) : content.slice(-tailChars)
  const characters = (Array.isArray(sourceProject.characters) ? sourceProject.characters : []).slice(0, 30).map((item) => ({ id: item.id, name: cleanText(item.name, '未命名角色'), description: typeof item.description === 'string' ? item.description.slice(0, 600) : '', isFavorited: !!item.isFavorited }))
  const notes = (Array.isArray(sourceProject.notes) ? sourceProject.notes : []).filter((item) => !item.isHidden).slice(0, 30).map((item) => ({ id: item.id, title: cleanText(item.title, '未命名笔记'), content: typeof item.content === 'string' ? item.content.slice(0, 800) : '', isLocked: !!item.isLocked }))
  const worldEntries = selectWorldEntries(sourceProject.worldEntries, content, options)
  const previousChapters = (Array.isArray(sourceProject.chapters) ? sourceProject.chapters : []).filter((item) => item !== sourceChapter).slice().sort((a, b) => (typeof a.order === 'number' ? a.order : 0) - (typeof b.order === 'number' ? b.order : 0)).filter((item) => !sourceChapter || (typeof item.order === 'number' && item.order < sourceChapter.order)).slice(-5).map((item) => ({ id: item.id, title: cleanText(item.title, '未命名章节'), order: typeof item.order === 'number' ? item.order : 0 }))
  const lines = []
  if (sourceProject.title) lines.push('项目：' + sourceProject.title)
  if (sourceProject.description) lines.push('项目简介：' + String(sourceProject.description).slice(0, 600))
  if (characters.length) lines.push('角色设定：\n' + characters.map((item) => item.name + '：' + item.description).join('\n'))
  if (worldEntries.length) lines.push('世界书（当前章节激活条目）：\n' + worldEntries.map((item) => '【' + item.name + (item.keys.length ? '｜触发词：' + item.keys.join('、') : '') + '】' + item.content).join('\n'))
  if (notes.length) lines.push('笔记（' + notes.filter((item) => item.isLocked).length + ' 条锁定）：\n' + notes.map((item) => '【' + item.title + '】' + item.content).join('\n'))
  if (previousChapters.length) lines.push('前情章节：' + previousChapters.map((item) => item.title).join(' → '))
  // v0.10.2: 分级注入（OpenFic 借鉴）——mid = 前情章节摘要，far = 覆盖前情的区间摘要。
  if (sourceSummaries && typeof sourceSummaries.chapter === 'function') {
    const mids = previousChapters.map((item) => {
      const entry = sourceSummaries.chapter(item.id)
      return entry && entry.summary ? '《' + item.title + '》：' + String(entry.summary).slice(0, 300) : null
    }).filter(Boolean)
    if (mids.length) lines.push('前情摘要（mid）：\n' + mids.join('\n'))
  }
  if (sourceSummaries && typeof sourceSummaries.range === 'function') {
    const farTarget = previousChapters.length ? previousChapters[previousChapters.length - 1].id : (sourceChapter ? sourceChapter.id : null)
    if (farTarget) {
      const range = sourceSummaries.range(farTarget)
      if (range && range.summary) lines.push('区间摘要（far）：' + String(range.summary).slice(0, 800))
    }
  }
  if (chapterText) lines.push('当前章节内容：\n' + chapterText)
  return { project: { id: sourceProject.id || '', title: sourceProject.title || '', description: sourceProject.description || '', goal: typeof sourceProject.goal === 'number' ? sourceProject.goal : 0 }, chapter: sourceChapter ? { id: sourceChapter.id, title: sourceChapter.title, revision: typeof sourceChapter.revision === 'number' ? sourceChapter.revision : 0, volumeId: sourceChapter.volumeId || null, contentLength: content.length, content: chapterText, fullContent: fullContent ? chapterText : null } : null, characters, notes, worldEntries, previousChapters, contextText: lines.join('\n') }
}
