// 墨扉 DSH Agent 面验收：通过 /api 协议创建临时 session，核对 Host 注册的写作 skills。
// 用法（在 OpenFic-DSH 目录）：
//   $env:MOFEI_BASE='http://127.0.0.1:3088'; node tools\verify-agent-surface.mjs
import crypto from 'node:crypto'

const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const CWD = process.cwd()
const SESSION_ID = `mofei-surface-${Date.now()}`
let failures = 0
const fail = (message) => { failures += 1; console.error('FAIL: ' + message) }
const ok = (message) => console.log('PASS: ' + message)

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

try {
  const host = await rpc('host.describe', {})
  ok(`host.describe 可用：cwd=${host.cwd || host.workspaceRoot || 'n/a'}`)

  const created = await rpc('session.create', { cwd: CWD, sessionId: SESSION_ID, agentPreset: 'mofei-writer' })
  ok(`session.create 可用：${created.sessionId}`)

  const { skills } = await rpc('skill.list', { sessionId: created.sessionId })
  const mofei = skills.filter((skill) => skill.name.startsWith('mofei-'))
  const openfic = skills.filter((skill) => skill.name.startsWith('openfic-'))
  const modelInvocable = skills.filter((skill) => skill.modelInvocable === true).length
  console.log(`INFO: total=${skills.length} mofei=${mofei.length} openfic=${openfic.length} modelInvocable=${modelInvocable}`)
  if (mofei.length === 17) ok('mofei-* 写作技能 = 17')
  else fail(`mofei-* 写作技能应为 17，实际 ${mofei.length}`)
  if (openfic.length === 17) ok('openfic-* 兼容技能 = 17')
  else fail(`openfic-* 兼容技能应为 17，实际 ${openfic.length}`)
  if (skills.length >= 34) ok(`skills 总数 >= 34（实际 ${skills.length}，含 DSH 内置技能）`)
  else fail(`skills 总数应至少 34（墨扉新名+别名），实际 ${skills.length}`)
  if (modelInvocable === skills.length) ok('全部 skills modelInvocable=true')
  else fail(`modelInvocable 应为 ${skills.length}，实际 ${modelInvocable}`)
  const required = ['mofei-writing', 'mofei-story-quality', 'mofei-character-design', 'openfic-writing']
  for (const name of required) {
    if (skills.some((skill) => skill.name === name)) ok(`存在 ${name}`)
    else fail(`缺少 ${name}`)
  }
} catch (error) {
  fail(error && error.stack || error)
}

console.log(failures === 0 ? '== AGENT SKILLS ALL PASS ==' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
