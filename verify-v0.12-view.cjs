// v0.12.1 验收：3088 整体 = 墨扉 web（conversation.session 单槽整体替换，plan C）。
// 打开官方 web → 主区直接是墨扉 Studio（无标签环、无 overlay）→ 右面板自绘对话（官方样式）→ 页面底部官方 composer → 发送消息 → 面板出现官方流程消息。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(7000)

  // 1. 主区直接是墨扉 Studio（无标签环、无 overlay）
  await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 20000 })
  ok('主区直接渲染墨扉 Studio（conversation.session 整体替换，blank 会话也显示）')
  const tabCount = await page.locator('header [role="tablist"] button[role="tab"]').count()
  if (tabCount === 0) ok('无视图标签环')
  else fail('仍有标签环: ' + tabCount)
  const overlayCount = await page.locator('.mf-overlay').count()
  if (overlayCount === 0) ok('无 overlay 包裹')
  else fail('存在 overlay')

  // 2. 左内栏（导航）+ 中间编辑器 + 右气泡对话
  await page.locator('.mf-col:not(.mf-mid)').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-mininav').waitFor({ state: 'visible', timeout: 5000 })
  ok('左内栏可见（迷你导航 + 项目/章节列表）')
  await page.locator('.mf-chat').waitFor({ state: 'visible', timeout: 10000 })
  const chatWidth = (await page.locator('.mf-chat').boundingBox()).width
  if (chatWidth > 200) ok('右侧对话面板可见且宽度正常（' + Math.round(chatWidth) + 'px）')
  else fail('对话面板宽度异常: ' + chatWidth + 'px（网格列塌缩回归）')

  // 3. 官方 composer 已并入右气泡（底部通栏隐藏）
  const seatCount = await page.locator('[data-composer-seat]').count()
  const seatHidden = seatCount === 0 || !(await page.locator('[data-composer-seat]').first().isVisible().catch(() => false))
  if (seatHidden) ok('底部官方 composer 已隐藏（输入并入右气泡）')
  else fail('底部官方 composer 仍可见')
  await page.locator('.mf-chat-input textarea').waitFor({ state: 'visible', timeout: 10000 })
  ok('右气泡内输入框可见（缩小版 dsh web 输入）')

  // 4. 通过右气泡输入框发送消息 → 面板出现用户气泡与助手回复（自绘渲染，官方样式）
  const composerInput = page.locator('.mf-chat-input textarea').first()
  await composerInput.fill('请只回复两个字：墨扉')
  await composerInput.press('Enter')
  await page.locator('.mf-chat-msg.user').first().waitFor({ state: 'visible', timeout: 15000 })
  ok('用户消息在面板上屏')
  await page.waitForFunction(() => {
    const panel = document.querySelector('.mf-chat-body')
    if (!panel) return false
    const msgs = panel.querySelectorAll('.mf-chat-msg.assistant')
    const last = msgs[msgs.length - 1]
    return last && !last.textContent.includes('正在输入') && !last.textContent.includes('▌') && last.textContent.trim().length > 0
  }, { timeout: 120000 })
  const texts = await page.locator('.mf-chat-msg.assistant').allInnerTexts()
  const reply = texts[texts.length - 1] || ''
  if (reply.trim()) ok('助手流式回复完成：' + reply.trim().slice(0, 60))
  else fail('助手回复为空')

  await browser.close()
  console.log(failures === 0 ? '== V0.12.1 WEB ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
