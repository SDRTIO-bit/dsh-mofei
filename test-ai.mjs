import assert from 'node:assert/strict'
import { truncate, normalizeAiSession, aiSessionView, appendAiMessage, buildAiMessages, chapterSelection, summaryRequest, sseEvent } from './plugin/lib/ai.js'

const tests = []
function test(name, fn) { tests.push([name, fn]) }

test('truncate 截断', () => {
  assert.equal(truncate('abcdef', 3), 'abc')
  assert.equal(truncate('', 3), '')
  assert.equal(truncate(null, 3), '')
})

test('normalizeAiSession 过滤非法消息并限制 80 条', () => {
  const raw = { messages: [{ id: 'a', role: 'assistant', content: 'ok', mode: 'summary', at: 1 }, { id: 'b', role: 'user', content: 'hi' }, { id: 'c', role: 'assistant', content: 123 }] }
  const session = normalizeAiSession(raw)
  assert.equal(session.messages.length, 2)
  assert.equal(session.messages[0].role, 'assistant')
  assert.equal(session.messages[1].mode, null)
})

test('appendAiMessage 追加并裁到 80 条', () => {
  let session = { messages: [] }
  for (let i = 0; i < 90; i++) {
    const result = appendAiMessage(session, { role: i % 2 ? 'assistant' : 'user', content: 'm' + i, mode: 'continue' })
    session = result.session
  }
  assert.equal(session.messages.length, 80)
  assert.equal(session.messages[79].content, 'm89')
})

test('buildAiMessages 历史 + 新用户消息为 content block', () => {
  const session = normalizeAiSession({ messages: [{ id: '1', role: 'user', content: '第一章' }, { id: '2', role: 'assistant', content: '第二章' }] })
  const messages = buildAiMessages(session, '继续写', { maxHistory: 1 })
  assert.equal(messages.length, 2)
  assert.deepEqual(messages[0].content, [{ type: 'text', text: '第二章' }])
  assert.equal(messages[1].role, 'user')
  assert.deepEqual(messages[1].content, [{ type: 'text', text: '继续写' }])
})

test('chapterSelection 支持全部/按 ids/排序/上限 30', () => {
  const chapters = [{ id: 'c1', order: 2 }, { id: 'c2', order: 0 }, { id: 'c3', order: 1 }]
  assert.deepEqual(chapterSelection(chapters, null).map((c) => c.id), ['c2', 'c3', 'c1'])
  assert.deepEqual(chapterSelection(chapters, ['c3', 'c1']).map((c) => c.id), ['c3', 'c1'])
})

test('sseEvent 生成 SSE 帧并转义多行文本', () => {
  assert.equal(sseEvent('delta', '你好'), 'event: delta\ndata: "你好"\n\n')
  const frame = sseEvent('done', { text: '第一行\n第二行', count: 1 })
  assert.ok(frame.startsWith('event: done\ndata: '))
  assert.ok(frame.endsWith('\n\n'))
  const dataLines = frame.split('\n').filter((line) => line.startsWith('data:'))
  assert.equal(dataLines.length, 1)
  assert.match(dataLines[0], /\\n/)
})

test('summaryRequest 生成章节摘要提示词', () => {
  const request = summaryRequest({ id: 'c1', title: '初雪', content: 'a'.repeat(20000) }, { maxChars: 1000 })
  assert.match(request, /初雪/)
  assert.match(request, /150 字以内/)
  assert.ok(request.length <= 1000 + 200)
})

let failed = 0
for (const [name, fn] of tests) {
  try { fn(); console.log('PASS ' + name) } catch (error) { failed += 1; console.error('FAIL ' + name); console.error(error) }
}
console.log(failed === 0 ? '== ALL ' + tests.length + ' PASS ==' : '== ' + failed + ' FAILURES ==')
process.exitCode = failed === 0 ? 0 : 1
