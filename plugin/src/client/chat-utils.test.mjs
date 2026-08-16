// chat-utils.js 纯 node 单元测试（v0.11 对话面板）。
// 运行：node plugin/src/client/chat-utils.test.mjs
import assert from 'node:assert/strict'
import { chatTextOf, chatTextOfBlocks, chatToolsOf, normalizeChatItems } from './chat-utils.js'

let passed = 0
const test = (name, fn) => { fn(); passed += 1; console.log('ok - ' + name) }

test('chatTextOf：提取 ContentBlock text 块（多块换行连接）', () => {
  assert.equal(chatTextOf([{ type: 'text', text: '你好' }, { type: 'text', text: '世界' }, { type: 'image', attachment: {} }]), '你好\n世界')
  assert.equal(chatTextOf(null), '')
  assert.equal(chatTextOf([{ type: 'tool-call' }]), '')
})

test('chatTextOfBlocks：提取 AssistantBlock text 块', () => {
  assert.equal(chatTextOfBlocks([{ kind: 'text', text: '续写：' }, { kind: 'reasoning', text: '思考' }, { kind: 'tool-call', name: 'x', callId: 'c', argsRaw: '{}' }]), '续写：')
  assert.equal(chatTextOfBlocks(undefined), '')
})

test('chatToolsOf：提取工具调用帧', () => {
  const tools = chatToolsOf([{ kind: 'tool-call', name: 'mofei_update-chapter', callId: 'c1', argsRaw: '{"projectId":"p"}' }, { kind: 'text', text: 'x' }])
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'mofei_update-chapter')
  assert.deepEqual(tools[0].args, '{"projectId":"p"}')
})

test('normalizeChatItems：用户/助手/工具/元信息节点折叠', () => {
  const items = normalizeChatItems({
    nodes: [
      { kind: 'user', seq: 1, time: 0, content: [{ type: 'text', text: '续写' }] },
      { kind: 'assistant', seq: 2, time: 0, turn: 1, step: 1, blocks: [{ kind: 'text', text: '好的' }, { kind: 'tool-call', name: 'mofei_read-chapter', callId: 'c', argsRaw: '{}' }] },
      { kind: 'tool-result', seq: 3, time: 0, callId: 'c', call: { name: 'mofei_read-chapter', argsRaw: '{}' }, content: [{ type: 'text', text: '正文…' }], isError: false },
      { kind: 'command', seq: 4, time: 0, commandId: 'cmd', name: 'mofei:writer', args: null, outcome: { kind: 'success' } },
      { kind: 'turn-error', seq: 5, time: 0 },
      { kind: 'compaction', seq: 6, time: 0, summary: '前面压缩了', summaryEventSeq: null, shadowedItemCount: 1, shadowedTokenCount: 1 },
      { kind: 'unknown', seq: 7, time: 0, type: 'future/event', data: {} },
    ],
    partial: null,
    runningCalls: [],
  })
  assert.equal(items.length, 6) // user/assistant/tool-result/command/turn-error/compaction（unknown 跳过）
  assert.equal(items[0].kind, 'user')
  assert.equal(items[0].text, '续写')
  assert.equal(items[1].kind, 'assistant')
  assert.equal(items[1].text, '好的')
  assert.equal(items[1].tools.length, 1)
  assert.equal(items[2].kind, 'tool')
  assert.equal(items[2].ok, true)
  assert.equal(items[2].name, 'mofei_read-chapter')
  assert.ok(items[3].text.includes('/mofei:writer'))
  assert.ok(items[5].text.includes('压缩'))
})

test('normalizeChatItems：流式 partial 与运行中工具帧', () => {
  const items = normalizeChatItems({
    nodes: [],
    partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: '正在写' }] },
    runningCalls: [{ callId: 'r1', name: 'mofei_update-chapter', argsRaw: '{}', turn: 1, step: 1, time: 0, callView: null, subCalls: [] }],
  })
  assert.equal(items.length, 2)
  assert.equal(items[0].kind, 'assistant')
  assert.equal(items[0].streaming, true)
  assert.equal(items[1].kind, 'tool')
  assert.equal(items[1].running, true)
})

test('normalizeChatItems：null / 未知快照安全', () => {
  assert.deepEqual(normalizeChatItems(null), [])
  assert.deepEqual(normalizeChatItems({}), [])
})

console.log(`\n${passed} 项测试全部 PASS`)
