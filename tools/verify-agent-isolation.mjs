// 墨扉隔离验收：同一 3088 上分别创建 standard 与 mofei-writer 会话，
// 让 agent 统计自身可见的 mofei_* / openfic_* 工具数。
// 用法：node tools\verify-agent-isolation.mjs
import crypto from 'node:crypto'

const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const CWD = process.cwd()
const TIMEOUT_MS = Number(process.env.MOFEI_AGENT_TIMEOUT || 240000)
let failures = 0
const fail = (message) => { failures += 1; console.error('FAIL: ' + message) }
const ok = (message) => console.log('PASS: ' + message)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function rpc(method, payload = {}) {
  const message = { type: 'client-request', rpcId: crypto.randomUUID(), method, payload }
  const response = await fetch(`${BASE}/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message),
  })
  const envelope = await response.json()
  if (envelope.type !== 'server-response') throw new Error(`${method}: bad envelope`)
  if (!envelope.result.ok) throw new Error(`${method}: ${JSON.stringify(envelope.result.error)}`)
  return envelope.result.value
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.map((part) => part && part.type === 'text' ? part.text : '').filter(Boolean).join('\n')
}

async function countForPreset(preset) {
  const sessionId = `mofei-isolation-${preset}-${Date.now()}`
  await rpc('session.create', { cwd: CWD, sessionId, agentPreset: preset })
  const before = await rpc('session.history', { sessionId })
  const beforeSeq = before.events.length ? before.events[before.events.length - 1].event.seq : 0
  const prompt = [
    '请根据你当前可用的工具列表统计：名字以 mofei_ 开头的工具数、以 openfic_ 开头的工具数。',
    '不要调用任何工具，只输出一行 JSON：{"mofei":<数量>,"openfic":<数量>}。',
  ].join('\n')
  await rpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: prompt }] })
  const startedAt = Date.now()
  let done = false
  let events = []
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await sleep(4000)
    const history = await rpc('session.history', { sessionId })
    events = history.events
    const after = events.filter((entry) => entry.event.seq > beforeSeq)
    if (after.some((entry) => entry.event.type === 'turn/end')) { done = true; break }
  }
  if (!done) throw new Error(`${preset}: turn timeout`)
  const messages = events.filter((entry) => entry.event.seq > beforeSeq && entry.event.type === 'assistant/message')
    .map((entry) => textOf(entry.event.data.content || (entry.event.data.message && entry.event.data.message.content))).join('\n')
  for (const line of messages.split('\n').reverse()) {
    const start = line.indexOf('{')
    const end = line.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return JSON.parse(line.slice(start, end + 1)) } catch (error) { /* next */ }
    }
  }
  throw new Error(`${preset}: no count JSON in: ${messages.slice(0, 500)}`)
}

try {
  const standard = await countForPreset('standard')
  console.log(`INFO: standard -> ${JSON.stringify(standard)}`)
  if (standard.mofei === 0 && standard.openfic === 0) ok('standard 会话零墨扉工具')
  else fail(`standard 会话不应有墨扉工具：${JSON.stringify(standard)}`)

  const writer = await countForPreset('mofei-writer')
  console.log(`INFO: mofei-writer -> ${JSON.stringify(writer)}`)
  if (writer.mofei === 36 && writer.openfic === 36) ok('mofei-writer 会话 36+36 工具')
  else fail(`mofei-writer 工具数异常：${JSON.stringify(writer)}`)

  const skills = await rpc('skill.list', { sessionId: 'x' }).catch(() => null)
  if (skills) ok('skill.list API 可调用')
} catch (error) {
  fail(error && error.stack || error)
}

console.log(failures === 0 ? '== AGENT ISOLATION ALL PASS ==' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
