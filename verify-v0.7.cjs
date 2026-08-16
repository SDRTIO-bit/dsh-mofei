// v0.7 浏览器验收：摘要维护面板（章/区间/生成+进度）+ 世界书搜索/批量开关/批量删除
// ⚠️ 依赖 lib/index.js v0.7 新 RPC/SSE：DSH 重启加载新 Host 代码后运行。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3080'
const OUT = path.join(__dirname, 'verify-shots')
const SESSION_ID = 'session-62a01ca8-ef2a-4da4-b42d-f41369b2cabe'
const ts = String(Date.now()).slice(-6)
const PROJ = 'v7验收-' + ts
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
    if (/^(v5|v6|v7验收|diag)/.test(p.title)) await call(page, 'delete-project', { projectId: p.id })
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
  const c1 = await call(page, 'create-chapter', { projectId: id, title: '摘要章一' })
  const c2 = await call(page, 'create-chapter', { projectId: id, title: '摘要章二' })
  const ch1 = c1.value.chapter.id
  const ch2 = c2.value.chapter.id
  await call(page, 'update-chapter', { projectId: id, chapterId: ch1, content: '摘要章一正文。'.repeat(10), expectedRevision: 1 })
  await call(page, 'save-chapter-summary', { projectId: id, chapterId: ch2, summary: '预置的第二章摘要' })
  await call(page, 'update-chapter', { projectId: id, chapterId: ch2, content: '摘要章二正文。'.repeat(10), expectedRevision: 1 })
  for (const name of ['青城', '灵根', '王朝']) await call(page, 'create-world-entry', { projectId: id, name, content: name + '设定' })
  log('SEED-OK')

  log('== 1. 摘要面板：列表/过期/单章重算 ==')
  await page.locator('button.mf-side').first().waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('button.mf-side').first().click()
  await page.locator('section.mf-panel').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('button.mf-act', { hasText: '项目' }).click()
  await page.locator('.mf-grid-card', { hasText: PROJ }).first().click()
  await sleep(500)
  await page.locator('aside.mf-col').nth(1).locator('.mf-item', { hasText: '摘要章一' }).first().locator('button.mf-title').click()
  await page.locator('input.mf-title-input').waitFor({ state: 'visible', timeout: 8000 })
  await page.locator('.mf-eh button', { hasText: '摘要' }).first().click()
  await page.locator('.mf-sum').waitFor({ state: 'visible', timeout: 8000 })
  log('SUMMARY-PANEL-OPEN-OK')
  const rows = page.locator('.mf-sum-row')
  await rows.first().waitFor({ state: 'visible', timeout: 8000 })
  if ((await rows.count()) === 2) log('SUMMARY-ROWS-OK')
  else fail('章节摘要行数异常: ' + (await rows.count()))
  const rowTexts = await page.locator('.mf-sum-row').allInnerTexts()
  if (rowTexts.some((t) => t.includes('摘要章二') && t.includes('预置的第二章摘要'))) log('SUMMARY-PREVIEW-OK')
  else fail('摘要预览缺失: ' + JSON.stringify(rowTexts))
  const staleRow = page.locator('.mf-sum-row', { hasText: '摘要章二' })
  await staleRow.locator('button', { hasText: '重算' }).click()
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('.mf-sum-row')].find((row) => row.textContent.includes('摘要章二'))
    return el && !el.textContent.includes('预置的第二章摘要')
  }, null, { timeout: 120000 })
  log('SUMMARY-REGEN-OK')
  await page.screenshot({ path: path.join(OUT, 'v7-01-summary.png') })

  log('== 2. 摘要面板：区间生成 ==')
  await page.locator('.mf-sum-tab', { hasText: '区间' }).click()
  await sleep(400)
  await page.locator('.mf-sum-tab', { hasText: '生成' }).click()
  await sleep(400)
  await page.locator('.mf-sum button', { hasText: '生成全部过期区间摘要' }).click()
  await page.waitForFunction(() => {
    const el = document.querySelector('.mf-sum-result')
    return el && el.textContent.includes('生成')
  }, null, { timeout: 120000 })
  log('SUMMARY-RANGE-BATCH-OK')
  await page.locator('.mf-sum-tab', { hasText: '区间' }).click()
  await sleep(500)
  const rangeRows = await page.locator('.mf-sum-row').count()
  if (rangeRows >= 1) log('SUMMARY-RANGE-ROWS-OK')
  else fail('区间摘要行数异常: ' + rangeRows)
  await page.locator('.mf-sum button', { hasText: '关闭' }).click()
  await sleep(300)

  log('== 3. 世界书：搜索/批量开关/批量删除 ==')
  await page.locator('button.mf-act', { hasText: '世界' }).click()
  const search = page.locator('.mf-world-search')
  await search.waitFor({ state: 'visible', timeout: 5000 })
  await search.fill('灵根')
  await sleep(300)
  if ((await page.locator('.mf-item .mf-wcheck').count()) === 1) log('WORLD-SEARCH-OK')
  else fail('世界书搜索过滤异常')
  await search.fill('')
  await sleep(300)
  await page.locator('.mf-wselect-all').check()
  await sleep(300)
  if ((await page.locator('.mf-item .mf-wcheck:checked').count()) === 3) log('WORLD-SELECT-ALL-OK')
  else fail('世界书全选异常')
  await page.locator('.mf-world-batch button', { hasText: '禁用' }).click()
  await sleep(800)
  const disabledList = await call(page, 'list-projects', {})
  const entriesAfterDisable = disabledList.value.projects.find((p) => p.id === id).worldEntries
  if (entriesAfterDisable.every((e) => e.isEnabled === false)) log('WORLD-BATCH-DISABLE-OK')
  else fail('批量禁用失败: ' + JSON.stringify(entriesAfterDisable.map((e) => e.isEnabled)))
  await page.locator('.mf-world-batch button', { hasText: '启用' }).click()
  await sleep(800)
  const delBtn = page.locator('.mf-world-batch button', { hasText: '删除' })
  await delBtn.click()
  await sleep(200)
  if ((await delBtn.innerText()).includes('确认')) log('WORLD-DELETE-ARM-OK')
  else fail('批量删除未进入确认态')
  await delBtn.click()
  await sleep(1000)
  const afterDelete = await call(page, 'list-projects', {})
  const entriesAfterDelete = afterDelete.value.projects.find((p) => p.id === id).worldEntries
  if (entriesAfterDelete.length === 0) log('WORLD-DELETE-ALL-OK')
  else fail('批量删除失败: ' + entriesAfterDelete.length)
  await page.screenshot({ path: path.join(OUT, 'v7-02-world.png') })

  await cleanup(page)
  await browser.close()
  console.log(failures === 0 ? '== ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
