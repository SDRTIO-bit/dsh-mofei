// v0.14.1 验收（写作状态线）：让 AI 会话进入写作状态（mofei-writer 预设）。
// ① 官方 API：空白会话 agentPreset.select 原地切换（与墨扉按钮同一条服务端路径）
// ② 官方 API：session.create({agentPreset:'mofei-writer'}) 直接建写作会话
// ③ UI：工作台顶栏写作会话入口仅显示/切换 mofei-writer 会话。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(2000)

  const api = (method, payload) => page.evaluate(async ({ method, payload }) => {
    const r = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'mofei-test-' + String(Date.now()) + '-' + String(Math.random()).slice(2, 8), method, payload }) })
    const text = await r.text()
    try { return JSON.parse(text) } catch (e) { return { raw: text.slice(0, 80), status: r.status } }
  }, { method, payload })

  // ① 空白会话原地切换（服务端路径 = 写作会话 selector 的 select 分支）
  const created = await api('session.create', {})
  const cval = (created && created.result && created.result.value) || (created && created.value) || created
  if (cval && cval.sessionId) ok('官方 API 创建空白会话（' + cval.sessionId.slice(0, 10) + '…）')
  else fail('创建空白会话失败: ' + JSON.stringify(created).slice(0, 120))
  const selected = await api('agentPreset.select', { sessionId: cval.sessionId, agentPreset: 'mofei-writer' })
  const sval = (selected && selected.result && selected.result.value) || (selected && selected.value) || selected
  if (sval && sval.agentPreset === 'mofei-writer') ok('空白会话原地切换为 mofei-writer 成功')
  else fail('select 失败: ' + JSON.stringify(selected).slice(0, 160))

  // ② session.create 直接带 agentPreset 建写作会话（墨扉「新建写作会话」的服务端路径）
  const direct = await api('session.create', { agentPreset: 'mofei-writer' })
  const dval = (direct && direct.result && direct.result.value) || (direct && direct.value) || direct
  if (dval && dval.agentPreset === 'mofei-writer') ok('session.create 直接建写作会话（agentPreset=mofei-writer）')
  else fail('direct create 失败: ' + JSON.stringify(direct).slice(0, 160))

// ③ UI：写作会话入口。项目专属会话的完整隔离由 verify-v0.15-project-sessions.cjs 覆盖。
  await page.locator('.mf-orb').click()
  await sleep(900)
  const badge = await page.evaluate(() => {
    const el = document.querySelector('.mf-wstate')
    return { badge: el ? el.textContent.trim() : null, btn: el ? el.textContent.trim() : null }
  })
  if (badge.badge === '会话') ok('顶栏显示单一「会话」入口（全部会话 + 项目写作会话）')
  else fail('写作会话入口异常: ' + JSON.stringify(badge))
  if (badge.btn && badge.btn.includes('会话')) ok('会话入口按钮存在')
  else fail('按钮缺失: ' + JSON.stringify(badge))
  // v0.18: 菜单可能已被自动弹出（变形后未绑定会话时自动打开），点击前先确认状态
  if (await page.locator('.mf-writer-session-menu').count() === 0) {
    await page.locator('.mf-wstate').click()
    await sleep(150)
  }
  const writerMenu = await page.locator('.mf-writer-session-menu').count()
  const writerRows = await page.locator('.mf-writer-session-item').count()
  if (writerMenu === 1 && writerRows >= 1) ok('会话菜单列出项目写作会话与全局会话（' + writerRows + ' 行）')
  else fail('写作会话菜单异常: menu=' + writerMenu + ' rows=' + writerRows)
  if (await page.locator('.mf-writer-session-menu').count() > 0) {
    await page.locator('.mf-wstate').click()
    await sleep(100)
  }
  // 还原
  await page.locator('.mf-head button[title="收起墨扉，返回原版 web"]').click()
  await sleep(700)
  const restored = await page.evaluate(() => !document.body.classList.contains('mf-transform'))
  if (restored) ok('收起图标还原原版 web')
  else fail('还原失败')

  await browser.close()
  console.log(failures === 0 ? '== V0.14.1 WRITING ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
