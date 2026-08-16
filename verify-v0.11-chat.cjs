// v0.11 验收（web 模式改造版）：右侧 Agent 对话面板（缩小版 DSH web）——存在/绑定/发送/流式回复/新建会话/折叠展开。
// 前置：3088 运行（整体=墨扉 web）；发送经底部官方 composer，回复断言在右面板自绘消息流。
// LEASE: win（Windows 侧会话持有，2025-06）
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

  // 0. web 模式：主面板直接可见（无 overlay 叠加）
  await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 20000 })
  const panelCount = await page.locator('.mf-panel').count()
  if (panelCount === 1) ok('唯一主面板（.mf-panel.mf-view），无 overlay 叠层')
  else fail('面板数量异常: ' + panelCount)

  // 1. 对话面板存在且默认打开（宽度正常，防网格列塌缩回归）
  await page.locator('.mf-chat').waitFor({ state: 'visible', timeout: 10000 })
  const chatBox = await page.locator('.mf-chat').boundingBox()
  if (chatBox && chatBox.width > 200) ok('右侧对话面板宽度正常（' + Math.round(chatBox.width) + 'px）')
  else fail('对话面板宽度异常: ' + (chatBox && chatBox.width) + 'px（网格列塌缩回归）')
  const chatHead = await page.locator('.mf-chat-head').innerText()
  if (chatHead.includes('Agent 对话')) ok('右侧对话面板存在：' + chatHead.slice(0, 60))
  else fail('对话面板头部异常: ' + chatHead)
  const actChat = await page.locator('.mf-activity .mf-act', { hasText: '对话' }).count()
  if (actChat >= 1) ok('Activity Bar 含「对话」按钮')
  else fail('Activity Bar 缺少对话按钮')

  // 2. web 模式输入在右气泡内（官方 composer 并入）：输入框可用 = 会话绑定通道就绪
  const innerInput = page.locator('.mf-chat-input textarea')
  await innerInput.waitFor({ state: 'visible', timeout: 15000 })
  ok('右气泡内输入框存在（官方 composer 已并入右气泡）')
  const composerDisabled = await innerInput.isDisabled()
  if (!composerDisabled) ok('输入框可用（会话绑定通道就绪）')
  else fail('输入框不可用')

  // 3. 会话条：默认收起，点方向键弹出列表
  await page.locator('.mf-sess-toggle').waitFor({ state: 'visible', timeout: 5000 })
  ok('「‹ 会话列表」方向键默认显示（会话列表不常驻）')
  await page.locator('.mf-sess-toggle').click()
  await page.locator('.mf-sess-list').waitFor({ state: 'visible', timeout: 5000 })
  ok('点方向键弹出会话列表')
  const sessCount = await page.locator('.mf-sess-item').count()
  if (sessCount >= 1) ok('会话列表含 ' + sessCount + ' 条会话')
  else fail('会话列表为空')
  await page.locator('.mf-sess-item').first().click()
  await page.waitForSelector('.mf-sess-list', { state: 'detached', timeout: 5000 })
  ok('选择会话后列表收起，回到方向键')

  // 4. 发送消息 → 用户气泡 + 助手流式回复（真实 LLM 回合，等流式结束）
  await innerInput.fill('请只回复四个字：你好墨扉')
  await innerInput.press('Enter')
  await page.locator('.mf-chat-msg.user').first().waitFor({ state: 'visible', timeout: 15000 })
  ok('用户消息在面板上屏')
  await page.waitForFunction(() => {
    const body = document.querySelector('.mf-chat-body')
    if (!body) return false
    const msgs = body.querySelectorAll('.mf-chat-msg.assistant')
    const last = msgs[msgs.length - 1]
    return last && !last.textContent.includes('正在输入') && !last.textContent.includes('▌') && last.textContent.trim().length > 0
  }, { timeout: 120000 })
  const assistantTexts = await page.locator('.mf-chat-msg.assistant').allInnerTexts()
  const finalReply = assistantTexts[assistantTexts.length - 1] || ''
  if (finalReply.trim()) ok('助手流式回复完成：' + finalReply.trim().slice(0, 80))
  else fail('助手回复为空')

  // 6. 新建会话按钮存在（不实际创建，避免污染会话列表）
  const newBtn = await page.locator('.mf-chat-head .mf-mini', { hasText: '＋' }).count()
  if (newBtn >= 1) ok('新建会话按钮存在（＋）')
  else fail('新建会话按钮缺失')

  await browser.close()
  console.log(failures === 0 ? '== V0.11 CHAT (WEB) ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
