const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  await page.goto('http://127.0.0.1:3088', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.mf-orb', { state: 'visible', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2000))
  await page.screenshot({ path: 'verify-shots/mofei-01-default.png' })
  await page.locator('.mf-orb').click()
  await new Promise((r) => setTimeout(r, 1000))
  await page.screenshot({ path: 'verify-shots/mofei-02-transformed.png' })
  // 变形态打开项目+章节再看一眼
  const proj = page.locator('.mf-proj').first()
  if (await proj.count()) {
    await proj.click()
    await new Promise((r) => setTimeout(r, 700))
    const chap = page.locator('.mf-item .mf-title').first()
    if (await chap.count()) { await chap.click(); await new Promise((r) => setTimeout(r, 700)) }
    await page.screenshot({ path: 'verify-shots/mofei-03-workspace.png' })
  }
  await browser.close()
})().catch((e) => { console.error(e); process.exit(2) })
