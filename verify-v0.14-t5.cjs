// v0.14 T5 联动冒烟：变形后工作台「送章」→ 官方对话出现章节提及 → 助手回复完成后
// 编辑器头部「⌄ 插入回复」把回复插进正文。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ts = String(Date.now()).slice(-6)
const PROJ = 'T5联动-' + ts
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(page, method, args) {
  return page.evaluate(async ({ method, args }) => {
    const r = await fetch('/api/mofei', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args: args || {} }) })
    return r.json()
  }, { method, args })
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })

  const created = await call(page, 'create-project', { title: PROJ })
  const pid = created.value.project.id
  const ch = await call(page, 'create-chapter', { projectId: pid, title: '第一章' })
  await call(page, 'update-chapter', { projectId: pid, chapterId: ch.value.chapter.id, content: '青城。林轩。剑意。', expectedRevision: 1 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(2500)

  // 变形 + 打开章节
  await page.locator('.mf-orb').click()
  await sleep(900)
  await page.locator('.mf-proj', { hasText: PROJ }).first().click()
  await page.locator('.mf-item', { hasText: '第一章' }).first().locator('button.mf-title').click()
  await page.locator('textarea.mf-text').waitFor({ state: 'visible', timeout: 10000 })

  // 1. 点「送章」→ 官方对话区出现提及消息
  await page.locator('.mf-eh button', { hasText: '送章' }).click()
  await page.waitForFunction((projId) => {
    const root = document.querySelector('[class*="centerCol"]')
    return root && root.textContent.includes(projId)
  }, pid, { timeout: 15000 })
  ok('送章后官方对话区出现章节提及（projectId: ' + pid.slice(0, 8) + '…）')

  // 2. 等助手回复完成 → 「⌄ 插入回复」按钮出现
  await page.locator('.mf-eh button', { hasText: '插入回复' }).waitFor({ state: 'visible', timeout: 180000 })
  ok('助手回复完成，「⌄ 插入回复」按钮出现')

  // 3. 点「⌄ 插入回复」→ 正文插入回复文本
  const before = (await page.locator('textarea.mf-text').inputValue()).length
  await page.locator('.mf-eh button', { hasText: '插入回复' }).click()
  await sleep(600)
  const after = await page.locator('textarea.mf-text').inputValue()
  if (after.length > before + 4 && after.includes('青城')) ok('回复已插入正文（+' + (after.length - before) + ' 字）')
  else fail('插入失败: before=' + before + ' after=' + after.length)

  // 清理
  await call(page, 'delete-project', { projectId: pid })
  await browser.close()
  console.log(failures === 0 ? '== V0.14 T5 LINKAGE ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
