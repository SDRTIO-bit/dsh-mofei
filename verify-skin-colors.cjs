// 墨韵皮肤检查：气泡 + 输入卡颜色实测。
// 采样点 A：body 上实际生效的令牌（--dsw-specific-bubble / --dsw-specific-input-major 等）
// 采样点 B：右面板自绘气泡 .mf-chat-msg.user/.assistant 的实际渲染色
// 采样点 C：底部官方 composer（输入卡）实际渲染色
// 产物：verify-shots/skin-colors.png + 控制台 JSON
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const OUT = path.join(__dirname, 'verify-shots', 'skin-colors.png')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.mf-panel.mf-view', { state: 'visible', timeout: 20000 })
  await page.waitForSelector('[data-composer-seat] textarea', { state: 'visible', timeout: 15000 })

  // —— 采样点 A：令牌 ——
  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.body)
    const pick = (name) => s.getPropertyValue(name).trim()
    return {
      themeApplied: pick('--dsw-specific-bubble') !== '' ? 'YES' : 'NO (官方默认主题)',
      bubble: pick('--dsw-specific-bubble'),
      bubbleHighlight: pick('--dsw-specific-bubble-highlight'),
      inputMajor: pick('--dsw-specific-input-major'),
      sidebarFill: pick('--dsw-specific-sidebar-fill'),
      bgBase: pick('--dsw-alias-bg-base'),
      bgElevated: pick('--dsw-alias-bg-elevated'),
      labelPrimary: pick('--dsw-alias-label-primary'),
      labelSecondary: pick('--dsw-alias-label-secondary'),
      brand: pick('--dsw-alias-brand-primary'),
      businessPrimary: pick('--dsw-alias-state-business-primary'),
      borderL1: pick('--dsw-alias-border-l1'),
      darkAttr: document.body.hasAttribute('data-ds-dark-theme'),
    }
  })

  // —— 采样点 C（先于发消息）：composer 输入卡 ——
  const composerBefore = await page.evaluate(() => {
    const seat = document.querySelector('[data-composer-seat]')
    const ta = seat && seat.querySelector('textarea')
    const cs = (el) => { if (!el) return null; const s = getComputedStyle(el); return { bg: s.backgroundColor, border: s.borderColor, color: s.color, radius: s.borderRadius } }
    // 输入卡的"卡片容器"：向上找第一个有背景的祖先（排除透明）
    let card = ta
    while (card && card !== document.body) {
      const bg = getComputedStyle(card).backgroundColor
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break
      card = card.parentElement
    }
    return { textarea: cs(ta), card: cs(card === ta ? null : card), seat: cs(seat) }
  })

  // —— 发消息，渲染气泡 ——
  await page.locator('[data-composer-seat] textarea').fill('墨韵皮肤检查：气泡与输入卡颜色。')
  await page.locator('[data-composer-seat] textarea').press('Enter')
  await page.waitForSelector('.mf-chat-msg.user', { state: 'visible', timeout: 15000 })

  // 等待助手回复（最长 90s；不来也不判失败，仅采样已有气泡）
  try {
    await page.waitForFunction(() => {
      const body = document.querySelector('.mf-chat-body')
      if (!body) return false
      const msgs = body.querySelectorAll('.mf-chat-msg.assistant')
      const last = msgs[msgs.length - 1]
      return last && !last.textContent.includes('正在输入') && !last.textContent.includes('▌') && last.textContent.trim().length > 0
    }, { timeout: 90000 })
  } catch (e) { /* assistant 未在时限内回复，继续 */ }

  // —— 采样点 B：气泡实际渲染色 ——
  const bubbles = await page.evaluate(() => {
    const body = document.querySelector('.mf-chat-body')
    const out = { user: null, assistant: null }
    for (const cls of ['user', 'assistant']) {
      const el = body && body.querySelector('.mf-chat-msg.' + cls)
      if (!el) continue
      const s = getComputedStyle(el)
      out[cls] = { bg: s.backgroundColor, color: s.color, radius: s.borderRadius, align: s.alignSelf }
    }
    return out
  })

  // —— 采样点 C（发消息后）：composer 输入卡 ——
  const composerAfter = await page.evaluate(() => {
    const seat = document.querySelector('[data-composer-seat]')
    const ta = seat && seat.querySelector('textarea')
    const cs = (el) => { if (!el) return null; const s = getComputedStyle(el); return { bg: s.backgroundColor, border: s.borderColor, color: s.color, radius: s.borderRadius } }
    let card = ta
    while (card && card !== document.body) {
      const bg = getComputedStyle(card).backgroundColor
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break
      card = card.parentElement
    }
    return { textarea: cs(ta), card: cs(card === ta ? null : card), seat: cs(seat) }
  })

  console.log('TOKENS(实际生效):', JSON.stringify(tokens, null, 2))
  console.log('COMPOSER(发消息前):', JSON.stringify(composerBefore, null, 2))
  console.log('BUBBLES(实际渲染):', JSON.stringify(bubbles, null, 2))
  console.log('COMPOSER(发消息后):', JSON.stringify(composerAfter, null, 2))
  await page.screenshot({ path: OUT, fullPage: false })
  console.log('screenshot:', OUT)
  await browser.close()
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
