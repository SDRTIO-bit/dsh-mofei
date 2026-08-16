// 布局几何检查（v0.14 变形工作态）：默认 = 原版 web 完整；变形 = 墨扉工作台 + DSH 助手 + 右侧 DSH 窄轨
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  await page.goto('http://127.0.0.1:3088', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.mf-orb', { state: 'visible', timeout: 30000 })
  await sleep(1800)
  const read = async () => page.evaluate(() => {
    const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
    const frame = document.querySelector('[class*="_frame"]')
    const sidebar = document.querySelector('[class*="hHd-Xa_root"]')
    return {
      viewport: { w: innerWidth, h: innerHeight },
      frame: rect(frame),
      frameGrid: frame ? getComputedStyle(frame).gridTemplateColumns : null,
      sidebar: rect(sidebar),
      sidebarCollapsed: sidebar ? String(sidebar.className).includes('collapsed') : null,
      composer: rect(document.querySelector('[class*="composerSeat"]')),
      panel: rect(document.querySelector('.mf-bubble-panel')),
      bodyClass: document.body.className,
    }
  })
  console.log('=== 默认态（原版 web）===')
  console.log(JSON.stringify(await read(), null, 2))
  await page.locator('.mf-orb').click()
  await sleep(1000)
  console.log('=== 变形后（墨扉工作台）===')
  console.log(JSON.stringify(await read(), null, 2))
  await browser.close()
})().catch((e) => { console.error(e); process.exit(2) })
