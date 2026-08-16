// 验证 pkg-2 主题修复：读取 OpenFic UI 计算样式，确认背景不透明
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const path = require('path')
const fs = require('fs')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3080'
const OUT = path.join(__dirname, 'verify-shots')
const SESSION_ID = 'session-62a01ca8-ef2a-4da4-b42d-f41369b2cabe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((sid) => {
    try { localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: sid })) } catch (e) {}
  }, SESSION_ID)
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(9000)
  // 装载 Client（若未自动装载）
  if (!(await page.locator('button.of8-open.of8-float').first().isVisible().catch(() => false))) {
    const badge = page.locator('button', { hasText: 'Cordis Plugin' }).first()
    await badge.waitFor({ state: 'visible', timeout: 15000 })
    await badge.click()
    await sleep(1800)
    await page.locator('button[data-cordis-switch="run"]').first().click()
    await sleep(6000)
  }
  await page.locator('button.of8-open.of8-float').first().waitFor({ state: 'visible', timeout: 30000 })
  console.log('float button visible')
  // 打开工作区
  await page.locator('button.of8-open.of8-float').first().click()
  await page.locator('section.of8-panel').waitFor({ state: 'visible', timeout: 10000 })
  await sleep(1200)
  const styles = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return { bg: cs.backgroundColor, color: cs.color, border: cs.borderColor }
    }
    return {
      floatBtn: pick('.of8-open.of8-float'),
      panel: pick('.of8-panel'),
      body: pick('.of8-body'),
      head: pick('.of8-head'),
      btn: pick('.of8-btn'),
      primaryBtn: pick('.of8-btn.of8-primary'),
      text: pick('.of8-text'),
      status: pick('.of8-status'),
      item: pick('.of8-item'),
      input: pick('.of8-input'),
      card: pick('.of8-card'),
    }
  })
  console.log('computed styles:', JSON.stringify(styles, null, 1))
  await page.screenshot({ path: path.join(OUT, 'theme-fix-workspace.png') })
  const transparent = []
  for (const [k, v] of Object.entries(styles)) {
    if (v && v.bg && (v.bg === 'rgba(0, 0, 0, 0)' || v.bg === 'transparent')) transparent.push(k)
  }
  console.log(transparent.length ? 'STILL TRANSPARENT: ' + transparent.join(', ') : 'NO TRANSPARENT BACKGROUNDS (ok)')
  await browser.close()
  process.exit(0)
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
