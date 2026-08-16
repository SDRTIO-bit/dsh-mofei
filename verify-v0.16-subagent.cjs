// v0.16 验收（墨菲子代理辅助）：subagent_with_model 只在 mofei-writer 写作会话可见（隔离），
// 且真实回合中墨菲可用它指定模型/推理强度/装配上下文（工具帧断言）。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function dshCall(page, method, payload) {
  return page.evaluate(async ({ method, payload }) => {
    const rpcId = 'verify-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const r = await fetch('/api/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: payload || {} }),
    })
    const body = await r.json()
    const result = body && body.result
    if (!r.ok || !result || result.ok !== true) throw new Error((result && result.error) || 'RPC_FAILED:' + method)
    return result.value
  }, { method, payload })
}

function normalizeEvents(history) {
  const raw = (history && (history.events || history.items)) || []
  return raw.map((item) => (item && item.event ? item.event : item))
}

function assistantText(events) {
  const out = []
  for (const event of events) {
    const type = String(event && event.type || '')
    if (!/assistant/.test(type)) continue
    const data = (event && event.data) || {}
    if (typeof data.text === 'string' && data.text.length > 0) out.push(data.text)
    const content = (data.message && data.message.content) || data.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) out.push(block.text)
      }
    }
  }
  return out.join('\n')
}

function turnEnded(events) {
  return events.some((e) => /turn\/end/.test(String(e.type)))
}

async function askAndCollect(page, sessionId, text, timeoutMs) {
  await dshCall(page, 'session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text }] })
  return collectFinal(page, sessionId, timeoutMs)
}

async function collectFinal(page, sessionId, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    await sleep(4000)
    const history = await dshCall(page, 'session.history', { sessionId, maxMessages: 40 }).catch(() => null)
    if (!history) continue
    const events = normalizeEvents(history)
    const textValue = assistantText(events)
    if (textValue) last = textValue
    if (last && turnEnded(events)) return last
  }
  return last
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(3000)

  // —— 1. mofei-writer 会话：工具清单应含 subagent_with_model ——
  const writer = await dshCall(page, 'session.create', { agentPreset: 'mofei-writer' })
  const writerId = writer.sessionId
  ok('mofei-writer 会话创建成功: ' + writerId.slice(0, 12) + '…')
  const writerReply = await askAndCollect(page, writerId, '请只列出你当前可用的全部工具名，每行一个，不要执行任何工具，不要解释。', 240000)
  if (writerReply.includes('subagent_with_model')) ok('写作会话工具清单含 subagent_with_model（墨菲可用）')
  else fail('写作会话工具清单未见 subagent_with_model。回复片段: ' + writerReply.slice(0, 300))

  // —— 2. standard 会话：隔离（不得出现 subagent_with_model）——
  const standard = await dshCall(page, 'session.create', {})
  const standardId = standard.sessionId
  ok('standard 会话创建成功: ' + standardId.slice(0, 12) + '…')
  const standardReply = await askAndCollect(page, standardId, '请只列出你当前可用的全部工具名，每行一个，不要执行任何工具，不要解释。', 240000)
  if (standardReply.includes('subagent_with_model')) fail('隔离失败：standard 会话看到了 subagent_with_model')
  else ok('standard 会话无 subagent_with_model（隔离成立）')

  // —— 3. 真实回合：墨菲按调用指定模型/推理强度/装配上下文 ——
  const pick = await dshCall(page, 'session.prompt', {
    sessionId: writerId,
    mode: 'queue',
    content: [{ type: 'text', text: '你必须使用 subagent_with_model 工具派一个子代理（不要用 subagent 或其它工具）：model 必须为 deepseek-v4-flash，effort 必须为 off，context 放“测试上下文”四个字，任务让它只回答“收到”。' }],
  })
  ok('已下达子代理指定指令（accepted: ' + pick.accepted + '）')
  const deadline = Date.now() + 300000
  let toolFrameSeen = false
  while (Date.now() < deadline) {
    await sleep(4000)
    const history = await dshCall(page, 'session.history', { sessionId: writerId, maxMessages: 40 }).catch(() => null)
    if (!history) continue
    const events = normalizeEvents(history)
    for (const event of events) {
      const type = String(event && event.type || '')
      if (!/tool/.test(type)) continue
      const data = (event && event.data) || {}
      const dumped = JSON.stringify(data)
      if (dumped.includes('subagent_with_model')) {
        toolFrameSeen = true
        let args = {}
        try { args = JSON.parse(typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments || {})) } catch (parseError) { args = { raw: data.arguments } }
        if (args.model === 'deepseek-v4-flash' && args.effort === 'off' && String(args.context || '').includes('测试上下文')) {
          ok('工具帧：subagent_with_model(model=deepseek-v4-flash, effort=off, context=测试上下文)')
        } else {
          fail('工具帧参数异常: ' + JSON.stringify(args).slice(0, 500))
        }
        break
      }
    }
    if (toolFrameSeen) break
  }
  if (!toolFrameSeen) fail('300s 内未见 subagent_with_model 工具帧（墨菲未按要求调用）')
  // 3b. 等子代理回合完成，墨菲应把子代理结果回传（最终回复非空）
  const finalText = await collectFinal(page, writerId, 90000)
  if (finalText && finalText.length > 0) ok('子代理回合完成，墨菲回传最终回复: ' + finalText.slice(0, 80).replace(/\n/g, ' '))
  else fail('子代理回合后未见墨菲最终回复')

  await browser.close()
  console.log(failures === 0 ? '== V0.16 SUBAGENT-MAX ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
