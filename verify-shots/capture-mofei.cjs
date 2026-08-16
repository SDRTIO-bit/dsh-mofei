// 当前 3088 墨扉三态截图（v0.14 变形金刚形态）：
// mofei-01-default.png     默认态 = 原版 DSH web（官方侧栏/官方对话/官方 composer + 右下角 orb）
// mofei-02-transformed.png 变形后 = 官方窄条 + 墨扉工作台 + 右侧 430px 官方对话/输入
// mofei-03-workspace.png   变形后打开项目/章节（编辑器）
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const path = require('path')
const OUT = __dirname
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.mf-orb', { state: 'visible', timeout: 30000 })
  await sleep(2000)
  await page.screenshot({ path: path.join(OUT, 'mofei-01-default.png') })
  console.log('saved mofei-01-default.png')

  await page.locator('.mf-orb').click()
  await sleep(1000)
  await page.screenshot({ path: path.join(OUT, 'mofei-02-transformed.png') })
  console.log('saved mofei-02-transformed.png')

  const proj = page.locator('.mf-proj').first()
  if (await proj.count()) {
    await proj.click()
    await sleep(700)
    const chap = page.locator('.mf-item .mf-title').first()
    if (await chap.count()) { await chap.click(); await sleep(700) }
    await page.screenshot({ path: path.join(OUT, 'mofei-03-workspace.png') })
    console.log('saved mofei-03-workspace.png')
  }
  await browser.close()
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
