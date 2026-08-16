// 墨韵皮肤检查：composer 占位符/卡片文字 实测色（暗+浅双模）。
// 采样 composer textarea::placeholder 实际颜色 + 输入卡容器文字色 + 用户/助手气泡，
// 并在 body 注入宣纸令牌模拟浅色变体（与 skin-light-probe.cjs 同法）。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const OUT_PAPER = path.join(__dirname, 'skin-placeholder-paper.png')
const OUT_INK = path.join(__dirname, 'skin-placeholder-ink.png')

const PAPER = {
  '--dsw-specific-bubble': '#e7dfcc',
  '--dsw-specific-input-major': '#efe8d8',
  '--dsw-alias-label-primary': '#3b342a',
  '--dsw-alias-label-secondary': '#5f5647',
  '--dsw-alias-label-tertiary': '#8a8070',
  '--dsw-alias-label-caption': '#9a907f',
  '--dsw-alias-label-dimmed': '#b0a691',
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
  return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2)
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
    const st = (el, pseudo) => getComputedStyle(el, pseudo || undefined)
    const toHex = (rgb) => { if (!rgb || !rgb.startsWith('rgb')) return rgb; return '#' + rgb.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('') }
    const ta = document.querySelector('[data-composer-seat] textarea')
    let card = ta
    while (card) {
      const bg = st(card).backgroundColor
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg.startsWith('rgb')) break
      card = card.parentElement
    }
    const user = document.querySelector('.mf-chat-msg.user')
    const ass = document.querySelector('.mf-chat-msg.assistant')
    return {
      bodyVars: {
        bubble: st(document.body).getPropertyValue('--dsw-specific-bubble').trim(),
        inputMajor: st(document.body).getPropertyValue('--dsw-specific-input-major').trim(),
        labelPrimary: st(document.body).getPropertyValue('--dsw-alias-label-primary').trim(),
        labelDimmed: st(document.body).getPropertyValue('--dsw-alias-label-dimmed').trim(),
      },
      darkAttr: document.body.hasAttribute('data-ds-dark-theme'),
      composer: {
        cardBg: card ? st(card).backgroundColor : null,
        cardText: card ? st(card).color : null,
        placeholder: ta ? st(ta, '::placeholder').color : null,
      },
      user: user ? { fg: st(user).color, bg: st(user).backgroundColor } : null,
      assistant: ass ? { fg: st(ass).color, bg: st(ass).backgroundColor } : null,
      toHex,
    }
  })

  const dark = await sample()
  console.log('== 墨（当前实际）==')
  console.log(JSON.stringify(dark, null, 2))
  const d = dark
  console.log('dark placeholder ratio:', d.composer.placeholder, 'on', d.composer.cardBg, '=', d.toHex ? ratio(d.toHex(d.composer.placeholder), d.toHex(d.composer.cardBg)) : 'n/a')
  await page.screenshot({ path: OUT_INK })

  await page.evaluate((pairs) => { for (const [k, v] of Object.entries(pairs)) document.body.style.setProperty(k, v) }, PAPER)
  await page.waitForTimeout(400)
  const paper = await sample()
  console.log('== 宣纸浅色（body 注入模拟）==')
  console.log(JSON.stringify(paper, null, 2))
  const p = paper
  console.log('paper placeholder ratio:', p.composer.placeholder, 'on', p.composer.cardBg, '=', p.toHex ? ratio(p.toHex(p.composer.placeholder), p.toHex(p.composer.cardBg)) : 'n/a')
  if (p.user) console.log('paper user bubble ratio: color', p.user.fg, 'on', p.user.bg, '=', ratio(p.toHex(p.user.fg), p.toHex(p.user.bg)))
  await page.screenshot({ path: OUT_PAPER })

  await browser.close()
})().catch((e) => { console.error('PROBE ERROR: ' + (e && e.stack || e)); process.exit(2) })