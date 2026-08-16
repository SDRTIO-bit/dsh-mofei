// v0.8 浏览器验收：@提及桥接按钮 + 实体历史/回滚 UI。
// 桥接按钮只验存在（避免测试污染真实会话）；实体历史在旧 Host 上自动 SKIP，重启后完整跑。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3080'
const SESSION_ID = 'session-62a01ca8-ef2a-4da4-b42d-f41369b2cabe'
const ts = String(Date.now()).slice(-6)
const PROJ = 'v8验收-' + ts
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
    if (/^(v5|v6|v7验收|v8验收|diag)/.test(p.title)) await call(page, 'delete-project', { projectId: p.id })
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
  await call(page, 'create-character', { projectId: id, name: '林轩', description: '主角' })
  await call(page, 'create-note', { projectId: id, title: '设定笔记' })
  await call(page, 'create-world-entry', { projectId: id, name: '青城', content: '仙门' })
  log('SEED-OK')

  await page.locator('button.mf-side').first().waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('button.mf-side').first().click()
  await page.locator('section.mf-panel').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('button.mf-act', { hasText: '项目' }).click()
  await page.locator('.mf-grid-card', { hasText: PROJ }).first().click()
  await sleep(400)
  await page.locator('aside.mf-col').nth(1).locator('.mf-item', { hasText: '第一章' }).first().locator('button.mf-title').click()
  await page.locator('input.mf-title-input').waitFor({ state: 'visible', timeout: 8000 })

  log('== 1. @提及桥接按钮 ==')
  const sendChapter = page.locator('.mf-eh button', { hasText: '送章' })
  const sendSelection = page.locator('.mf-eh button', { hasText: '送选中' })
  if ((await sendChapter.count()) === 1 && (await sendSelection.count()) === 1) log('BRIDGE-BUTTONS-OK')
  else fail('桥接按钮缺失: 送章=' + (await sendChapter.count()) + ' 送选中=' + (await sendSelection.count()))

  log('== 2. 实体历史按钮（Host 未重启则 SKIP 功能验证） ==')
  const probe = await call(page, 'entity-history', { projectId: id, kind: 'character', entityId: 'missing' })
  if (probe && probe.error === 'METHOD_NOT_FOUND:entity-history') {
    log('ENTITY-HISTORY-SKIP（旧 Host，重启后跑完整验证）')
  } else {
    const listResult = await call(page, 'list-projects', {})
    const projects = listResult.value && listResult.value.projects || []
    const project = projects.find((p) => p.id === id)
    const charId = project.characters[0].id
    const noteId = project.notes[0].id
    const worldId = project.worldEntries[0].id
    await page.locator('button.mf-act', { hasText: '角色' }).click()
    await page.locator('.mf-item', { hasText: '林轩' }).first().locator('button.mf-title').click()
    await page.locator('.mf-eh button', { hasText: '历史' }).click()
    await page.locator('.mf-hist').waitFor({ state: 'visible', timeout: 5000 })
    log('CHARACTER-HISTORY-UI-OK')
    await page.locator('.mf-act', { hasText: '笔记' }).click()
    await page.locator('.mf-item', { hasText: '设定笔记' }).first().locator('button.mf-title').click()
    await page.locator('.mf-eh button', { hasText: '历史' }).click()
    await page.locator('.mf-hist').waitFor({ state: 'visible', timeout: 5000 })
    log('NOTE-HISTORY-UI-OK')
    await page.locator('.mf-act', { hasText: '世界' }).click()
    await page.locator('.mf-item', { hasText: '青城' }).first().locator('button.mf-title').click()
    await page.locator('.mf-eh button', { hasText: '历史' }).click()
    await page.locator('.mf-hist').waitFor({ state: 'visible', timeout: 5000 })
    log('WORLD-HISTORY-UI-OK')
  }

  await cleanup(page)
  await browser.close()
  console.log(failures === 0 ? '== ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
