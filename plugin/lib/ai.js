// 墨扉AI 会话/批量摘要纯逻辑（无 DSH 依赖，可独立单元测试）
export function truncate(value, max) {
  const text = typeof value === 'string' ? value : ''
  return text.length > max ? text.slice(0, max) : text
}

export function normalizeAiSession(input) {
  const messages = input && Array.isArray(input.messages) ? input.messages : []
  return { messages: messages.filter((item) => item && typeof item.content === 'string').slice(-80).map((item, index) => ({ id: typeof item.id === 'string' ? item.id : 'm-' + String(index), role: item.role === 'assistant' ? 'assistant' : 'user', content: truncate(item.content, 16000), mode: typeof item.mode === 'string' ? item.mode : null, at: typeof item.at === 'number' ? item.at : Date.now() })) }
}

export function aiSessionView(session) { return { messages: normalizeAiSession(session).messages } }

export function appendAiMessage(session, message) {
  const normalized = normalizeAiSession(session)
  const item = { id: 'm-' + String(Date.now()) + '-' + String(Math.random().toString(36).slice(2, 7)), role: message && message.role === 'assistant' ? 'assistant' : 'user', content: truncate(message && message.content, 16000), mode: message && typeof message.mode === 'string' ? message.mode : null, at: Date.now() }
  normalized.messages.push(item)
  if (normalized.messages.length > 80) normalized.messages.splice(0, normalized.messages.length - 80)
  return { session: normalized, item }
}

export function buildAiMessages(session, userContent, options) {
  const normalized = normalizeAiSession(session)
  const maxHistory = Math.min(24, Math.max(0, options && typeof options.maxHistory === 'number' ? Math.floor(options.maxHistory) : 8))
  const historyChars = Math.min(8000, Math.max(200, options && typeof options.historyChars === 'number' ? Math.floor(options.historyChars) : 2000))
  const history = normalized.messages.slice(-maxHistory)
  const source = { kind: 'plugin', plugin: 'dsh-mofei' }
  const messages = history.map((item) => ({ id: 'mofei-hist-' + item.id, role: item.role, content: [{ type: 'text', text: truncate(item.content, historyChars) }], source }))
  messages.push({ id: 'mofei-user-' + String(Date.now()), role: 'user', content: [{ type: 'text', text: truncate(userContent, 24000) }], source })
  return messages
}

export function chapterSelection(chapters, chapterIds) {
  const list = Array.isArray(chapters) ? chapters : []
  const wanted = Array.isArray(chapterIds) && chapterIds.length ? chapterIds : null
  return list.slice().sort((a, b) => (typeof a.order === 'number' ? a.order : 0) - (typeof b.order === 'number' ? b.order : 0)).filter((item) => !wanted || wanted.includes(item.id)).slice(0, 30)
}

export function sseEvent(event, data) {
  const name = typeof event === 'string' && event.trim() ? event.trim() : 'message'
  const payload = typeof data === 'string' ? JSON.stringify(data) : JSON.stringify(data === undefined ? null : data)
  return 'event: ' + name + '\ndata: ' + payload + '\n\n'
}

export function summaryRequest(chapter, options) {
  const content = chapter && typeof chapter.content === 'string' ? chapter.content : ''
  const maxChars = Math.min(12000, Math.max(500, options && typeof options.maxChars === 'number' ? Math.floor(options.maxChars) : 8000))
  const body = content.length > maxChars ? content.slice(0, maxChars / 2) + '\n\n……\n\n' + content.slice(-maxChars / 2) : content
  const targetChars = Math.max(50, Math.min(500, Math.floor((options && typeof options.targetChars === 'number' && Number.isFinite(options.targetChars)) ? options.targetChars : 150)))
  const title = truncate(chapter && chapter.title || '未命名章节', 120)
  return [
    '请为小说章节《' + title + '》生成 ' + targetChars + ' 字以内的章节摘要。',
    '',
    '要求：',
    '1. 只输出摘要正文，不要解释、不要评价、不要使用 Markdown 标记。',
    '2. 摘要必须覆盖：本章主要事件与因果链、出场人物的关键变化、新揭示的信息或伏笔、章节结尾的状态或悬念。',
    '3. 用简洁的叙述语言概括，不要逐句复述原文。',
    '',
    '章节原文：',
    body,
  ].join('\n')
}
