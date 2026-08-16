// v0.6 浏览器验收：三栏拖拽调宽+持久化 / 项目宽幅页+简介编辑 / 编辑器内容上限
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3080'
const OUT = path.join(__dirname, 'verify-shots')
const SESSION_ID = 'session-62a01ca8-ef2a-4da4-b42d-f41369b2cabe'
const ts = String(Date.now()).slice(-6)
const PROJ = 'v6验证-' + ts
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
    if (/^(v5|v6|v7验证|diag)/.test(p.title)) await call(page, 'delete-project', { projectId: p.id })
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
  const chId = ch.value.chapter.id
  log('SEED-OK ' + id + ' / ' + chId)

  log('== 1. 项目宽幅页 + 简介编辑 ==')
  await page.locator('button.mf-side').first().waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('button.mf-side').first().click()
  await page.locator('section.mf-panel').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('button.mf-act', { hasText: '项目' }).click()
  const wideBtn = page.locator('.mf-sh button', { hasText: '宽幅' })
  await wideBtn.waitFor({ state: 'visible', timeout: 5000 })
  await wideBtn.click()
  await page.locator('.mf-pp').waitFor({ state: 'visible', timeout: 5000 })
  log('WIDE-PAGE-OPEN-OK')
  const card = page.locator('.mf-pp .mf-grid-card', { hasText: PROJ })
  await card.waitFor({ state: 'visible', timeout: 5000 })
  await card.click()
  await page.locator('.mf-pp-detail').waitFor({ state: 'visible', timeout: 5000 })
  await page.locator('textarea.mf-pp-desc').fill('这是 v6 测试项目简介，用于宽幅页编辑与网格搜索。')
  await page.locator('.mf-pp button', { hasText: '保存简介' }).click()
  await sleep(800)
  const listed = await call(page, 'list-projects', {})
  const projDesc = listed.value.projects.find((p) => p.id === id)
  if (projDesc && projDesc.description.includes('v6 测试项目简介')) log('WIDE-DESC-SAVE-OK')
  else fail('简介未保存: ' + JSON.stringify(projDesc && projDesc.description))
  await page.screenshot({ path: path.join(OUT, 'v6-01-wide.png') })
  await page.locator('.mf-pp button', { hasText: '收起' }).click()
  await sleep(300)
  if ((await page.locator('.mf-pp').count()) === 0) log('WIDE-CLOSE-OK')
  else fail('宽幅页未收起')

  log('== 2. 三栏拖拽调宽 + 持久化 ==')
  const firstAside = page.locator('aside.mf-col').first()
  const before = await firstAside.boundingBox()
  const gutterL = page.locator('.mf-gutter[data-axis="left"]').first()
  await gutterL.waitFor({ state: 'visible', timeout: 5000 })
  const gbox = await gutterL.boundingBox()
  await page.mouse.move(gbox.x + gbox.width / 2, gbox.y + 10)
  await page.mouse.down()
  await page.mouse.move(gbox.x + gbox.width / 2 + 70, gbox.y + 10, { steps: 6 })
  await page.mouse.up()
  await sleep(400)
  const after = await firstAside.boundingBox()
  const delta = after.width - before.width
  if (Math.abs(delta - 70) <= 4) log('GUTTER-DRAG-OK delta=' + delta.toFixed(1))
  else fail('拖拽宽度异常: ' + delta)

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(9000)
  await page.locator('button.mf-side').first().click()
  await page.locator('section.mf-panel').waitFor({ state: 'visible', timeout: 10000 })
  await sleep(600)
  const persisted = await page.locator('aside.mf-col').first().boundingBox()
  if (Math.abs(persisted.width - after.width) <= 2) log('GUTTER-PERSIST-OK ' + persisted.width.toFixed(1))
  else fail('宽度未持久化: before=' + after.width + ' afterReload=' + persisted.width)
  await page.locator('.mf-gutter[data-axis="left"]').first().dblclick()
  await sleep(400)
  const reset = await page.locator('aside.mf-col').first().boundingBox()
  if (Math.abs(reset.width - 210) <= 2) log('GUTTER-RESET-OK ' + reset.width.toFixed(1))
  else fail('双击复位异常: ' + reset.width)
  await page.screenshot({ path: path.join(OUT, 'v6-02-layout.png') })

  log('== 3. 编辑器内容上限 ==')
  await page.locator('button.mf-act', { hasText: '项目' }).click()
  await page.locator('aside.mf-col').nth(1).locator('.mf-item', { hasText: '第一章' }).first().locator('button.mf-title').click()
  const textarea = page.locator('textarea.mf-text')
  await textarea.waitFor({ state: 'visible', timeout: 8000 })
  await textarea.fill('a'.repeat(100001))
  await textarea.press('Control+s')
  await page.locator('.mf-alert').waitFor({ state: 'visible', timeout: 5000 })
  const alertText = await page.locator('.mf-alert').innerText()
  if (alertText.includes('超出上限')) log('LIMIT-ERROR-OK')
  else fail('上限提示异常: ' + alertText.slice(0, 80))
  const afterLimit = await call(page, 'list-projects', {})
  const chapterAfterLimit = afterLimit.value.projects.find((p) => p.id === id).chapters.find((c) => c.id === chId)
  if (chapterAfterLimit.revision === ch.value.chapter.revision && chapterAfterLimit.content === '') log('LIMIT-NO-WRITE-OK')
  else fail('超限仍写入: revision=' + chapterAfterLimit.revision + ' len=' + chapterAfterLimit.content.length)
  await page.screenshot({ path: path.join(OUT, 'v6-03-limit.png') })

  await textarea.fill('合规正文')
  await page.waitForFunction(() => {
    const el = document.querySelector('.mf-eh .mf-status')
    return el && el.textContent.includes('已保存')
  }, null, { timeout: 8000 })
  log('LIMIT-RECOVER-AUTOSAVE-OK')

  await cleanup(page)
  await browser.close()
  console.log(failures === 0 ? '== ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
