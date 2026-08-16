// 诊断：.mf-view-root 的父链与官方 frame 子元素
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  await page.goto('http://127.0.0.1:3088', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.mf-panel.mf-view', { state: 'visible', timeout: 20000 })
  await new Promise((r) => setTimeout(r, 1500))
  const info = await page.evaluate(() => {
    const root = document.querySelector('.mf-view-root')
    const chain = []
    let el = root
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      const b = el.getBoundingClientRect()
      chain.push({
        cls: (el.className || el.tagName).toString().slice(0, 60),
        tag: el.tagName,
        x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
        display: getComputedStyle(el).display,
        flex: getComputedStyle(el).flex,
        gridCol: getComputedStyle(el).gridColumn,
      })
    }
    const frame = document.querySelector('[class*="_frame"]')
    const frameKids = frame ? [...frame.children].map((c) => {
      const b = c.getBoundingClientRect()
      return { cls: (c.className || c.tagName).toString().slice(0, 50), w: Math.round(b.width), x: Math.round(b.x) }
    }) : []
    return { chain, frameKids, frameGrid: frame ? getComputedStyle(frame).gridTemplateColumns : null }
  })
  console.log(JSON.stringify(info, null, 2))
  await browser.close()
})().catch((e) => { console.error(e); process.exit(2) })
