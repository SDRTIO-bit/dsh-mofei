// v0.9 浏览器验收：写作记录仪表盘 + prompt chains 面板入口。
// prompt chains 在旧 Host 上显示「需重启」提示（预期 SKIP）；重启后同脚本走真实链列表路径。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const SESSION_ID = 'session-62a01ca8-ef2a-4da4-b42d-f41369b2cabe'
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3080'
const ts = String(Date.now()).slice(-6)
const PROJ = 'v9验收-' + ts
let failures = 0
const log = (m) => console.log(m)
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(page, method, args) {
  return page.evaluate(async ({ method, args }) => {
    const response = await fetch('/api/mofei', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args: args || {} }) })
    return response.json()
  }, { method, args })
}

async function cleanup(page) {
  const result = await call(page, 'list-projects', {})
  const projects = result && result.value && result.value.projects || []
  for (const p of projects) {
    if (/^(v5|v6|v7验收|v8验收|v9验收|diag|流水线)/.test(p.title)) await call(page, 'delete-project', { projectId: p.id })
  }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((sid) => { try { localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: sid })) } catch (e) {} }, SESSION_ID)
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 300)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(7000)
  await cleanup(page)

  log('== 0. 数据准备 ==')
  const created = await call(page, 'create-project', { title: PROJ })
  const id = created.value.project.id
  const ch = await call(page, 'create-chapter', { projectId: id, title: '第一章' })
  await call(page, 'update-chapter', { projectId: id, chapterId: ch.value.chapter.id, content: '今日写作内容'.repeat(5), expectedRevision: 1 })
  log('SEED-OK')

  await page.locator('button.mf-side').first().waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('button.mf-side').first().click()
  await page.locator('section.mf-panel').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('button.mf-act', { hasText: '项目' }).click()
  await page.locator('.mf-grid-card', { hasText: PROJ }).first().click()
  await sleep(400)
  await page.locator('aside.mf-col').nth(1).locator('.mf-item', { hasText: '第一章' }).first().locator('button.mf-title').click()
  await page.locator('input.mf-title-input').waitFor({ state: 'visible', timeout: 8000 })

  log('== 1. 写作记录仪表盘 ==')
  await page.locator('.mf-foot button', { hasText: '写作记录' }).click()
  await page.locator('.mf-dash-card').waitFor({ state: 'visible', timeout: 8000 })
  log('DASHBOARD-OPEN-OK')
  const dashText = await page.locator('.mf-dash-card').innerText()
  if (dashText.includes('字')) log('DASHBOARD-CONTENT-OK')
  else fail('仪表盘内容异常: ' + dashText.slice(0, 100))
  await page.locator('button.mf-dash-close').click()
  await sleep(300)
  if ((await page.locator('.mf-dash-card').count()) === 0) log('DASHBOARD-CLOSE-OK')
  else fail('仪表盘未关闭')

  log('== 2. Prompt Chains 面板入口 ==')
  await page.locator('.mf-eh button', { hasText: '链' }).first().click()
  await page.locator('.mf-ch').waitFor({ state: 'visible', timeout: 8000 })
  log('CHAINS-OPEN-OK')
  await sleep(500)
  const chText = await page.locator('.mf-ch').innerText()
  if (chText.includes('需重启 DSH 后可用')) log('CHAINS-OLD-HOST-SKIP（重启后走真实链列表）')
  else if (chText.includes('暂无链') || chText.includes('未命名链')) log('CHAINS-LIST-OK')
  else fail('链面板状态异常: ' + chText.slice(0, 120))
  await page.locator('.mf-ch button', { hasText: '关闭' }).first().click()

  await cleanup(page)
  await browser.close()
  console.log(failures === 0 ? '== ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
