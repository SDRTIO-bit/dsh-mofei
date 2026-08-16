// v0.10 工作台验收（web 模式改造版）：活动栏、三栏、编辑器标签、状态栏、风格选择器、命令面板。
// 前置：3088 已运行，打开后整体 = 墨扉 web；不要点击旧 mf-side overlay 入口。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ts = String(Date.now()).slice(-6)
const PROJ = 'v10工作台-' + ts
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
  for (const p of (result.value && result.value.projects) || []) if (/^v10/.test(p.title)) await call(page, 'delete-project', { projectId: p.id })
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(7000)
  await cleanup(page)

  const created = await call(page, 'create-project', { title: PROJ })
  const projectId = created.value.project.id
  const ch = await call(page, 'create-chapter', { projectId, title: '第一章' })
  await call(page, 'update-chapter', { projectId, chapterId: ch.value.chapter.id, content: '青城。林轩。剑意。', expectedRevision: 1 })

  // RPC 种子数据写入后刷新页面，让 UI bootstrap 重新拉取（UI 只在自身操作后 reload）
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(7000)

  // 0. web 模式：唯一主面板直接可见，无需点击任何入口
  await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 20000 })
  const panelCount = await page.locator('.mf-panel').count()
  if (panelCount === 1) ok('唯一 web 主面板，无 overlay 叠层')
  else fail('面板数量异常: ' + panelCount)
  if ((await page.locator('.mf-activity').count()) >= 1) ok('Activity Bar 存在')
  else fail('Activity Bar 缺失')

  // 1. 打开项目与章节
  await page.locator('.mf-proj', { hasText: PROJ }).first().waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-proj', { hasText: PROJ }).first().click()
  await page.locator('.mf-item', { hasText: '第一章' }).first().waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-item', { hasText: '第一章' }).first().locator('button.mf-title').click()
  await page.locator('textarea.mf-text').waitFor({ state: 'visible', timeout: 10000 })
  ok('编辑器可见')

  // 2. 标签页与状态栏
  const tabs = await page.locator('.mf-tabs2 .mf-tab2').count()
  if (tabs >= 1) ok('编辑器标签页存在')
  else fail('编辑器标签页缺失')
  await page.locator('.mf-foot').waitFor({ state: 'visible', timeout: 5000 })
  const foot = await page.locator('.mf-foot').innerText()
  if (foot.includes('字')) ok('状态栏含字数')
  else fail('状态栏异常: ' + foot.slice(0, 80))

  // 3. 风格选择器
  await page.locator('.mf-eh-actions select').first().waitFor({ state: 'visible', timeout: 5000 })
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

  await cleanup(page)
  await browser.close()
  console.log(failures === 0 ? '== V0.10 WORKBENCH (WEB) ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
