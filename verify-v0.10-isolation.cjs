// v0.10 隔离验收（web 模式改造版）：3088 整体 = 墨扉 web。
// 断言：唯一主面板 .mf-panel.mf-view 常驻、无 overlay 叠层、无浮动入口、无重复面板。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function state(page) {
  return page.evaluate(() => ({
    mainPanels: document.querySelectorAll('.mf-panel.mf-view').length,
    allPanels: document.querySelectorAll('.mf-panel').length,
    overlays: document.querySelectorAll('.mf-overlay').length,
    floating: document.querySelectorAll('.mf-open,.mf-float').length,
    mininav: document.querySelectorAll('.mf-mininav').length,
    styleInjected: Array.from(document.querySelectorAll('style')).some((el) => (el.textContent || '').includes('.mf-panel')),
  }))
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(7000)

  for (let round = 1; round <= 3; round++) {
    await page.waitForSelector('.mf-panel.mf-view', { state: 'visible', timeout: 20000 })
    const before = await state(page)
    if (before.mainPanels === 1) ok(`round ${round}: 唯一 web 主面板 .mf-panel.mf-view`)
    else fail(`round ${round}: web 主面板数量异常 ${JSON.stringify(before)}`)
    if (before.allPanels === 1) ok(`round ${round}: 无 overlay 叠层（.mf-panel 总数 = 1）`)
    else fail(`round ${round}: 存在面板叠层 ${JSON.stringify(before)}`)
    if (before.overlays === 0) ok(`round ${round}: 无 .mf-overlay`)
    else fail(`round ${round}: 出现 overlay ${JSON.stringify(before)}`)
    if (before.floating === 0) ok(`round ${round}: 无浮动入口`)
    else fail(`round ${round}: 出现浮动入口 ${JSON.stringify(before)}`)
    if (before.mininav >= 1) ok(`round ${round}: 迷你导航存在（活动栏已并入左内栏）`)
    else fail(`round ${round}: 迷你导航缺失`)
    if (before.styleInjected) ok(`round ${round}: web 模式墨扉 CSS 已注入`)
    else fail(`round ${round}: web 模式 CSS 未注入`)

    // 反复验证同一页面不产生第二块面板（回归：旧 overlay 入口点击后双 .mf-panel 崩溃）
    await page.locator('.mf-mininav button').first().click()
    await sleep(400)
    const after = await state(page)
    if (after.allPanels === 1 && after.mainPanels === 1) ok(`round ${round}: 活动栏交互后仍唯一面板`)
    else fail(`round ${round}: 活动栏交互后面板数量异常 ${JSON.stringify(after)}`)
  }

  await browser.close()
  console.log(failures === 0 ? '== V0.10 ISOLATION (WEB) ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
