// 墨韵皮肤视觉快照：发一条消息，截图右面板气泡 + 底部 composer（供人工/视觉检查令牌是否生效）
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const OUT = path.join(__dirname, 'verify-shots', 'skin.png')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.mf-panel.mf-view', { state: 'visible', timeout: 20000 })
  await page.waitForSelector('[data-composer-seat] textarea', { state: 'visible', timeout: 15000 })
  await page.locator('[data-composer-seat] textarea').fill('墨韵皮肤检查：气泡与输入卡颜色。')
  await page.locator('[data-composer-seat] textarea').press('Enter')
  await page.waitForSelector('.mf-chat-msg.user', { state: 'visible', timeout: 15000 })
  await page.waitForFunction(() => {
    const body = document.querySelector('.mf-chat-body')
    if (!body) return false
    const msgs = body.querySelectorAll('.mf-chat-msg.assistant')
    const last = msgs[msgs.length - 1]
    return last && !last.textContent.includes('正在输入') && !last.textContent.includes('▌') && last.textContent.trim().length > 0
  }, { timeout: 120000 })
  // 采样实际生效的令牌值
  const sampled = await page.evaluate(() => {
    const s = getComputedStyle(document.body)
    const pick = (name) => s.getPropertyValue(name).trim()
    return {
      bubble: pick('--dsw-specific-bubble'),
      inputMajor: pick('--dsw-specific-input-major'),
      sidebar: pick('--dsw-specific-sidebar-fill'),
      bgBase: pick('--dsw-alias-bg-base'),
      labelPrimary: pick('--dsw-alias-label-primary'),
      brand: pick('--dsw-alias-brand-primary'),
      darkAttr: document.body.hasAttribute('data-ds-dark-theme'),
    }
  })
  console.log('tokens:', JSON.stringify(sampled, null, 2))
  await page.screenshot({ path: OUT, fullPage: false })
  console.log('screenshot:', OUT)
  await browser.close()
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
