// 墨扉 DSH Agent 工具面真实验收：让会话 agent 调用 Host inspect 的 Tool.listTools，
// 核对 23 个 mofei_* + 23 个 openfic_* + 关键工具可调用。
// 用法（在 dsh-mofei 目录）：
//   $env:MOFEI_BASE='http://127.0.0.1:3088'; node tools\verify-agent-tools.mjs
import crypto from 'node:crypto'

const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const CWD = process.cwd()
const SESSION_ID = `mofei-tools-${Date.now()}`
const TIMEOUT_MS = Number(process.env.MOFEI_AGENT_TIMEOUT || 300000)
let failures = 0
const fail = (message) => { failures += 1; console.error('FAIL: ' + message) }
const ok = (message) => console.log('PASS: ' + message)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function rpc(method, payload = {}) {
  const message = {
    type: 'client-request',
    rpcId: crypto.randomUUID(),
    method,
    payload,
  }
  const response = await fetch(`${BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  })
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`)
  const envelope = await response.json()
  if (envelope.type !== 'server-response') throw new Error(`${method}: unexpected envelope ${envelope.type}`)
  if (envelope.rpcId !== message.rpcId) throw new Error(`${method}: rpcId mismatch`)
  if (!envelope.result.ok) throw new Error(`${method}: ${JSON.stringify(envelope.result.error)}`)
  return envelope.result.value
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.map((part) => part && part.type === 'text' ? part.text : '').filter(Boolean).join('\n')
}

function eventLog(events) {
  const lines = []
  for (const entry of events || []) {
    const event = entry.event
    const data = event.data || {}
    if (event.type === 'assistant/chunk') continue
    if (event.type === 'tool/call') lines.push(`  tool/call: ${data.name || '?'}`)
    else if (event.type === 'tool/result') lines.push(`  tool/result: ${textOf(data.message && data.message.content).slice(0, 120)}`)
    else if (event.type === 'assistant/message') lines.push(`  assistant/message: ${textOf(data.message && data.message.content).slice(0, 200)}`)
    else if (event.type === 'turn/start' || event.type === 'turn/end' || event.type === 'step/start' || event.type === 'step/end') lines.push(`  ${event.type}: ${JSON.stringify(data).slice(0, 160)}`)
    else lines.push(`  ${event.type}`)
  }
  return lines.join('\n')
}

try {
  const created = await rpc('session.create', { cwd: CWD, sessionId: SESSION_ID, agentPreset: 'mofei-writer' })
  const sessionId = created.sessionId
  ok(`session.create 可用：${sessionId}`)

  const before = await rpc('session.history', { sessionId })
  const beforeSeq = before.events.length ? before.events[before.events.length - 1].event.seq : 0

  const promptText = [
    '请根据你当前可用的工具列表（functions/tools）统计：名字以 mofei_ 开头的工具数、以 openfic_ 开头的工具数、以及这两类工具的总数。',
    '不要调用任何工具，不要做其他操作，只输出一行 JSON：{"total":<mofei 与 openfic 总数>,"mofei":<mofei_ 数量>,"openfic":<openfic_ 数量>}。',
  ].join('\n')
  const accepted = await rpc('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: promptText }],
  })
  if (accepted && accepted.accepted === true) ok('session.prompt 已入队')
  else fail('session.prompt 未接受: ' + JSON.stringify(accepted))

  const startedAt = Date.now()
  let events = []
  let done = false
  let lastLog = ''
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await sleep(4000)
    const history = await rpc('session.history', { sessionId })
    events = history.events
    const after = events.filter((entry) => entry.event.seq > beforeSeq)
    const turnEnds = after.filter((entry) => entry.event.type === 'turn/end')
    if (turnEnds.length > 0) { done = true; break }
    const current = eventLog(after)
    if (current !== lastLog) {
      console.log('INFO: agent activity so far:\n' + current)
      lastLog = current
    }
  }
  if (!done) fail(`agent 在 ${TIMEOUT_MS}ms 内未结束 turn`)

  const after = events.filter((entry) => entry.event.seq > beforeSeq)
  console.log('INFO: final events:\n' + eventLog(after))
  const messages = after.filter((entry) => entry.event.type === 'assistant/message').map((entry) => {
    const data = entry.event.data || {}
    return textOf(data.content || (data.message && data.message.content))
  }).join('\n')
  console.log('INFO: assistant 最终消息:\n' + messages.slice(0, 3000))
  let parsed = null
  for (const message of messages.split('\n').reverse()) {
    const start = message.indexOf('{')
    const end = message.lastIndexOf('}')
    if (start < 0 || end <= start) continue
    try {
      parsed = JSON.parse(message.slice(start, end + 1))
      break
    } catch (error) {
      // 继续找下一行 JSON
    }
  }
  if (!parsed) {
    fail('assistant 未输出可解析的计数 JSON')
  } else {
    const total = Number(parsed.total)
    const mofei = Number(parsed.mofei)
    const openfic = Number(parsed.openfic)
    console.log(`INFO: agent 报告 total=${total} mofei=${mofei} openfic=${openfic}`)
    if ( total === 146) ok('agent 可见墨扉工具总数 = 146')
    else fail(`agent 可见墨扉工具总数应为 146，实际 ${total}`)
    if (mofei === 73) ok('mofei_* = 73')
    else fail(`mofei_* 应为 73，实际 ${mofei}`)
    if (openfic === 73) ok('openfic_* = 73')
    else fail(`openfic_* 应为 73，实际 ${openfic}`)
    if (mofei + openfic === total) ok('mofei + openfic 与 total 一致')
    else fail('mofei + openfic 与 total 不一致')
  }
} catch (error) {
  fail(error && error.stack || error)
}

console.log(failures === 0 ? '== AGENT TOOLS ALL PASS ==' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
