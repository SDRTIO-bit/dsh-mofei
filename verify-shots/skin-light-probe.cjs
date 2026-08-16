// 墨韵皮肤探针 v2：token 注入 body（presenter 实际写入位置）；采样气泡/输入卡 + 对比度 + 双截图
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const OUT_PAPER = path.join(__dirname, 'skin-paper.png')
const OUT_INK = path.join(__dirname, 'skin-ink.png')

const PAPER = {
  '--dsw-specific-bubble': '#e7dfcc',
  '--dsw-specific-input-major': '#efe8d8',
  '--dsw-alias-label-primary': '#3b342a',
  '--dsw-alias-label-secondary': '#5f5647',
  '--dsw-alias-label-tertiary': '#8a8070',
  '--dsw-alias-interactive-bg-hover': 'rgba(60,50,35,0.06)',
  '--dsw-alias-bg-base': '#f4efe4',
  '--dsw-alias-border-l2-darkmode-thin': 'rgba(60,50,35,0.22)',
}

function lumOf(hex) {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a, b) {
  const [l1, l2] = [lumOf(a), lumOf(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.mf-panel.mf-view', { state: 'visible', timeout: 20000 })
  await page.waitForSelector('[data-composer-seat] textarea', { state: 'visible', timeout: 15000 })

  await page.locator('[data-composer-seat] textarea').fill('墨韵皮肤检查：气泡与输入卡颜色。')
  await page.locator('[data-composer-seat] textarea').press('Enter')
  await page.waitForSelector('.mf-chat-msg.user', { state: 'visible', timeout: 15000 })

  const sample = () => page.evaluate(() => {
    const st = (el) => getComputedStyle(el)
    const user = document.querySelector('.mf-chat-msg.user')
    const ass = document.querySelector('.mf-chat-msg.assistant')
    const ta = document.querySelector('[data-composer-seat] textarea')
    let card = ta
    while (card) {
      const bg = st(card).backgroundColor
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg.startsWith('rgb')) break
      card = card.parentElement
    }
    const ratioInfo = (fg, bg) => {
      const toHex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('')
      return { fg, bg, ratio: (() => { try { return ratio_fix(toHex(fg), toHex(bg)) } catch (e) { return null } })() }
    }
    return {
      bodyVars: {
        bubble: st(document.body).getPropertyValue('--dsw-specific-bubble').trim(),
        inputMajor: st(document.body).getPropertyValue('--dsw-specific-input-major').trim(),
        labelPrimary: st(document.body).getPropertyValue('--dsw-alias-label-primary').trim(),
      },
      darkAttr: document.body.hasAttribute('data-ds-dark-theme'),
      user: user ? ratioInfo(st(user).color, st(user).backgroundColor) : null,
      assistant: ass ? ratioInfo(st(ass).color, st(ass).backgroundColor) : null,
      composer: { cardBg: card ? st(card).backgroundColor : null, textColor: ta ? st(ta).color : null },
    }
    function ratio_fix(a, b) { return globalThis.__probeRatio ? globalThis.__probeRatio(a, b) : 0 }
  })

  const dark = await sample()
  console.log('== 墨（当前实际）==')
  console.log(JSON.stringify(dark, null, 2))
  await page.screenshot({ path: OUT_INK })
  console.log('screenshot(ink):', OUT_INK)

  // 在 body 上注入宣纸令牌（presenter 写入位置），并补 dark 属性移除以完整模拟浅色
  await page.evaluate((pairs) => {
    const b = document.body
    for (const [k, v] of Object.entries(pairs)) b.style.setProperty(k, v)
    globalThis.__probeRatio = (a, h) => {
      const lum = (hex) => { const c = hex.replace('#', ''); const [r, g, bl] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * r + 0.7152 * g + 0.0722 * bl }
      const [l1, l2] = [lum(a), lum(h)].sort((x, y) => y - x)
      return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2)
    }
  }, PAPER)
  await page.waitForTimeout(400)

  const paper = await page.evaluate(() => {
    const st = (el) => getComputedStyle(el)
    const user = document.querySelector('.mf-chat-msg.user')
    const ta = document.querySelector('[data-composer-seat] textarea')
    let card = ta
    while (card) {
      const bg = st(card).backgroundColor
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg.startsWith('rgb')) break
      card = card.parentElement
    }
    const toHex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('')
    const calc = (fg, bg) => ({ fg, bg, ratio: globalThis.__probeRatio(toHex(fg), toHex(bg)) })
    return {
      bodyVars: {
        bubble: st(document.body).getPropertyValue('--dsw-specific-bubble').trim(),
        inputMajor: st(document.body).getPropertyValue('--dsw-specific-input-major').trim(),
        labelPrimary: st(document.body).getPropertyValue('--dsw-alias-label-primary').trim(),
      },
      user: user ? calc(st(user).color, st(user).backgroundColor) : null,
      composer: { cardBg: card ? st(card).backgroundColor : null, textColor: ta ? st(ta).color : null },
    }
  })
  console.log('== 宣纸浅色（body 注入模拟）==')
  console.log(JSON.stringify(paper, null, 2))
  await page.screenshot({ path: OUT_PAPER })
  console.log('screenshot(paper):', OUT_PAPER)

  await browser.close()
})().catch((e) => { console.error('PROBE ERROR: ' + (e && e.stack || e)); process.exit(2) })