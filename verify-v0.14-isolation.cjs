// v0.14.2 写作隔离验证：mofei-writer 预设 = 纯写作助手（无 coding 工具、写作 persona）。
// 流程：session.create({agentPreset:'mofei-writer'}) → session.prompt 问身份 → 轮询 history 断言回复是写作助手。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const fs = require('fs')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const WRITER_PRESET = path.join(process.env.USERPROFILE || 'C:\\Users\\zhao', '.dsh', '.agent-presets', 'mofei-writer', 'agent.cordis.yml')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)

;(async () => {
  // Verify the preset DSH actually loads, rather than inferring tool isolation from a reply.
  const preset = fs.readFileSync(WRITER_PRESET, 'utf8')
  const serviceIds = [...preset.matchAll(/^- id: ([A-Za-z0-9_-]+)/gm)].map((match) => match[1])
  const codingServices = ['tool-bash', 'tool-pwsh', 'tool-fs', 'tool-fs-search', 'tool-jobs', 'tool-goal', 'tool-workflow', 'tool-ralph', 'tool-plan-mode']
  const presentCodingServices = codingServices.filter((id) => serviceIds.includes(id))
  if (presentCodingServices.length === 0) ok('运行时写作预设未注册 coding 工具')
  else fail('运行时预设仍注册 coding 工具: ' + presentCodingServices.join(', '))

  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(2000)

  const api = (method, payload) => page.evaluate(async ({ method, payload }) => {
    const r = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'mofei-wtest-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), method, payload }) })
    const t = await r.text()
    try { return JSON.parse(t) } catch (e) { return { raw: t.slice(0, 80) } }
  }, { method, payload })
  const val = (j) => (j && j.result && j.result.value) || (j && j.value) || j
  const mofei = (method, args) => page.evaluate(async ({ method, args }) => {
    const r = await fetch('/api/mofei', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args: args || {} }) })
    const t = await r.text()
    try { return JSON.parse(t) } catch (e) { return { raw: t.slice(0, 80) } }
  }, { method, args })

  // 1. 预设可挂载：create 直接带 agentPreset
  const created = val(await api('session.create', { agentPreset: 'mofei-writer' }))
  if (created && created.sessionId && created.agentPreset === 'mofei-writer') ok('写作预设挂载成功（session.create → agentPreset=mofei-writer）')
  else fail('预设挂载失败: ' + JSON.stringify(created).slice(0, 160))
  const sid = created.sessionId

  // 2. 写作工作台绑定的是实际 DSH session；Agent 不接收可见的“送章”消息。
  const stamp = String(Date.now()).slice(-6)
  const projectTitle = '自动联动验证-' + stamp
  const chapterTitle = '当前章节-' + stamp
  const projectResult = val(await mofei('create-project', { title: projectTitle }))
  const project = projectResult && projectResult.project
  const chapterResult = project && val(await mofei('create-chapter', { projectId: project.id, title: chapterTitle }))
  const chapter = chapterResult && chapterResult.chapter
  const bound = project && chapter && val(await mofei('bind-agent-context', { sessionId: sid, projectId: project.id, chapterId: chapter.id }))
  if (bound && bound.bound && bound.project && bound.project.id === project.id && bound.chapter && bound.chapter.id === chapter.id) ok('当前项目/章节已后台绑定到 mofei-writer 会话')
  else fail('上下文绑定失败: ' + JSON.stringify(bound).slice(0, 180))

  // 3. 发消息验证 persona 与绑定上下文。唯一名称无法由模型猜出，必须通过专用工具读取。
  const promptRes = val(await api('session.prompt', { sessionId: sid, mode: 'queue', content: [{ type: 'text', text: '请先使用 mofei_get-active-context，然后只回答一句话：你是谁，以及当前打开的项目和章节名称。' }] }))
  if (promptRes && promptRes.accepted) ok('prompt 已入队')
  else fail('prompt 失败: ' + JSON.stringify(promptRes).slice(0, 120))

  // 4. 轮询 history 等回复（最多 150s）
  let reply = ''
  for (let i = 0; i < 30; i++) {
    await sleep(5000)
    const hist = val(await api('session.history', { sessionId: sid, maxMessages: 8 }))
    const events = (hist && hist.events) || []
    const texts = []
    for (const entry of events) {
      // DSH wraps persisted records as { event: { type, data, ... } }.
      const ev = entry && entry.event ? entry.event : entry
      const type = String(ev && ev.type || '')
      if (type !== 'assistant/message') continue
      const d = ev && ev.data || {}
      const blocks = d.message && d.message.content || []
      // DSH 会把模型内部 reasoning 与最终回复都放在带 text 字段的块中；只验最终 text 块。
      if (Array.isArray(blocks)) blocks.forEach((b) => { if (b && b.type === 'text' && b.text) texts.push(String(b.text)) })
    }
    reply = texts.join(' ').trim()
    if (reply) break
  }
  if (!reply) fail('未收到助手回复')
  else {
    console.log('助手回复: ' + reply.slice(0, 200))
    const isWriter = /写作|墨扉|小说|作者|写手/.test(reply)
    const isCoding = /(?:我是|I am).{0,24}(?:coding|编程|代码).{0,24}(?:agent|助手)/i.test(reply)
    if (isWriter && !isCoding) ok('回复 persona = 写作助手（隔离生效）')
    else fail('persona 异常: writer=' + isWriter + ' coding=' + isCoding)
    if (reply.includes(projectTitle) && reply.includes(chapterTitle)) ok('写作助手通过 mofei_get-active-context 取得当前项目与章节')
    else fail('写作助手未返回已绑定上下文: ' + reply.slice(0, 260))
  }

  // 5. 工具目录隔离（通过模型自述工具清单验证成本高，这里用会话完成状态 + 不触发 coding 工具作为旁证）
  const listRes = val(await api('session.list', {}))
  const row = ((listRes && listRes.items) || []).find((s) => s.sessionId === sid)
  if (row && row.agentPreset === 'mofei-writer') ok('会话列表中该会话标记 mofei-writer')
  else fail('会话标记异常: ' + JSON.stringify(row).slice(0, 120))

  if (project && project.id) await mofei('delete-project', { projectId: project.id })
  await browser.close()
  console.log(failures === 0 ? '== V0.14.2 WRITING-ISOLATION ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
