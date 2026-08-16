// v0.14 验收（工作台线）：变形后工作台全流程——项目行→章节→编辑器/标签/状态栏/风格/命令面板。
// 与旧 v0.10-workbench 对应；web 模式改造：先点 orb 变形，再操作工作台。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ts = String(Date.now()).slice(-6)
const PROJ = 'v14工作台-' + ts
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
async function cleanup(page) {
  const result = await call(page, 'list-projects', {})
  for (const p of (result.value && result.value.projects) || []) if (/^v14/.test(p.title)) await call(page, 'delete-project', { projectId: p.id })
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(6000)
  await cleanup(page)

  const created = await call(page, 'create-project', { title: PROJ })
  const projectId = created.value.project.id
  const ch = await call(page, 'create-chapter', { projectId, title: '第一章' })
  await call(page, 'update-chapter', { projectId, chapterId: ch.value.chapter.id, content: '青城。林轩。剑意。', expectedRevision: 1 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(2500)

  // 变形
  await page.locator('.mf-orb').click()
  await sleep(900)
  await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 10000 })
  ok('点 orb 变形 → 墨扉工作台可见')

  // 1. 项目行 → 章节
  await page.locator('.mf-proj', { hasText: PROJ }).first().waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-proj', { hasText: PROJ }).first().click()
  await page.locator('.mf-item', { hasText: '第一章' }).first().waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-item', { hasText: '第一章' }).first().locator('button.mf-title').click()
  await page.locator('textarea.mf-text').waitFor({ state: 'visible', timeout: 10000 })
  const editorVal = await page.locator('textarea.mf-text').inputValue()
  if (editorVal.includes('青城')) ok('编辑器打开《第一章》')
  else fail('编辑器内容异常: ' + editorVal.slice(0, 30))

  // 2. 标签页与状态栏
  const tabs = await page.locator('.mf-tabs2 .mf-tab2').count()
  if (tabs >= 1) ok('编辑器标签页存在')
  else fail('标签页缺失')
  const foot = await page.locator('.mf-foot').innerText()
  if (foot.includes('字')) ok('状态栏含字数：' + foot.replace(/\n/g, ' ').slice(0, 40))
  else fail('状态栏异常: ' + foot.slice(0, 80))

  // 3. 风格选择器（顶栏）
  const styleOptions = await page.locator('.mf-eh-actions select option').allTextContents()
  if (styleOptions.some((x) => x.includes('白描'))) ok('风格选择器含白描')
  else fail('风格选择器缺失: ' + styleOptions.join(','))

  // 4. 命令面板
  await page.locator('.mf-eh-actions button', { hasText: '命令' }).first().click()
  await page.locator('.mf-palette').waitFor({ state: 'visible', timeout: 5000 })
  await page.locator('.mf-palette input').fill('新建')
  const paletteText = await page.locator('.mf-palette').innerText()
  if (paletteText.includes('新建项目')) ok('命令面板可搜索命令')
  else fail('命令面板异常: ' + paletteText.slice(0, 100))
  await page.keyboard.press('Escape')
  await page.waitForSelector('.mf-palette', { state: 'detached', timeout: 5000 })

  // 5. 还原
  await page.locator('.mf-head button', { hasText: '收起' }).click()
  await sleep(700)
  const transformGone = await page.evaluate(() => !document.body.classList.contains('mf-transform'))
  if (transformGone) ok('「✕ 收起」还原原版 web')
  else fail('还原失败')

  await cleanup(page)
  await browser.close()
  console.log(failures === 0 ? '== V0.14 WORKBENCH ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
