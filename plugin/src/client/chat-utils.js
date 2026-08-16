/**
 * 对话面板纯逻辑（v0.11）：把 DSH 会话快照（ConversationSnapshot）折叠为可渲染消息项。
 * 无 DSH 依赖、无 DOM，可独立单元测试。
 */

/** ContentBlock[]（user/steering/context 消息）→ 文本。 */
export function chatTextOf(blocks) {
  const out = []
  ;(Array.isArray(blocks) ? blocks : []).forEach((block) => {
    if (block && block.type === 'text' && typeof block.text === 'string') out.push(block.text)
  })
  return out.join('\n')
}

/** AssistantBlock[]（assistant 消息/流式 partial）→ 文本。 */
export function chatTextOfBlocks(blocks) {
  const out = []
  ;(Array.isArray(blocks) ? blocks : []).forEach((block) => {
    if (block && block.kind === 'text' && typeof block.text === 'string') out.push(block.text)
  })
  return out.join('\n')
}

/** AssistantBlock[] → 工具调用帧 [{ name, args }]。 */
export function chatToolsOf(blocks) {
  return (Array.isArray(blocks) ? blocks : []).filter((block) => block && block.kind === 'tool-call').map((block) => ({ name: block.name, args: block.argsRaw }))
}

/**
 * ConversationSnapshot → 渲染项数组。
 * 项：{ key, kind: 'user'|'assistant'|'tool'|'meta', text?, tools?, streaming?, ok?, running?, name? }
 * 未知节点类型安全跳过（kind 判别式，未来事件扩展不崩）。
 */
export function normalizeChatItems(snap) {
  const items = []
  if (!snap || typeof snap !== 'object') return items
  ;(Array.isArray(snap.nodes) ? snap.nodes : []).forEach((node) => {
    if (!node || typeof node !== 'object') return
    if (node.kind === 'user' || node.kind === 'steering') {
      items.push({ key: 'n' + node.seq + node.kind, kind: 'user', text: chatTextOf(node.content) || '（空消息）' })
    } else if (node.kind === 'assistant') {
      items.push({ key: 'n' + node.seq, kind: 'assistant', text: chatTextOfBlocks(node.blocks), tools: chatToolsOf(node.blocks) })
    } else if (node.kind === 'tool-result') {
      items.push({ key: 'n' + node.seq, kind: 'tool', name: node.call ? node.call.name : node.callId, ok: !node.isError, text: chatTextOf(node.content).slice(0, 200) })
    } else if (node.kind === 'command') {
      items.push({ key: 'n' + node.seq, kind: 'meta', text: '命令 /' + (node.name || '?') + (node.outcome ? (node.outcome.kind === 'success' ? ' 完成' : ' 出错') : ' 执行中') })
    } else if (node.kind === 'turn-error') {
      items.push({ key: 'n' + node.seq, kind: 'meta', text: '⚠ 回合出错' })
    } else if (node.kind === 'turn-max-tokens') {
      items.push({ key: 'n' + node.seq, kind: 'meta', text: '⚠ 达到 token 上限' })
    } else if (node.kind === 'compaction') {
      items.push({ key: 'n' + node.seq, kind: 'meta', text: '✂ 上下文压缩' + (node.summary ? '：' + String(node.summary).slice(0, 80) : '') })
    }
  })
  if (snap.partial && typeof snap.partial === 'object') {
    items.push({ key: 'partial', kind: 'assistant', text: chatTextOfBlocks(snap.partial.blocks), streaming: true })
  }
  ;(Array.isArray(snap.runningCalls) ? snap.runningCalls : []).forEach((call) => {
    items.push({ key: 'call' + call.callId, kind: 'tool', name: call.name, ok: null, running: true, text: '' })
  })
  return items
}
