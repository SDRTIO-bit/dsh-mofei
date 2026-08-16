// v0.14 验收（对话线）：官方对话/官方 composer 完整保留 + 变形后仍可用 + 墨扉写作联动按钮。
// 前置：3088 运行。官方 composer 就是官方组件——断言存在/可用/变形后挤右仍可用；不真发消息（避免污染会话）。
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
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(1500)

  // 1. 默认态官方 composer 输入框（:visible 过滤空态 hero 里的隐藏输入区）
  const ta = page.locator('[class*="composerSeat"] textarea:visible').first()
  await ta.waitFor({ state: 'visible', timeout: 15000 })
  ok('默认态：官方 composer 输入框可见')
  const disabledDefault = await ta.isDisabled()
  if (!disabledDefault) ok('默认态：官方输入框可用')
  else fail('默认态官方输入框不可用')
  const placeholder = await ta.getAttribute('placeholder')
  if (placeholder && placeholder !== '输入写作指令：续写 / 审稿 / 查设定…') ok('默认态保留原版 DSH composer 占位符')
  else fail('默认态不应被写作占位符污染: ' + placeholder)

  // 2. 变形后官方 composer 仍在右侧窄条且可用
  await page.locator('.mf-orb').click()
  await sleep(900)
  const box = await ta.boundingBox()
  if (box && box.width < 520 && box.x > 1000) ok('变形后：官方 composer 挤到右侧窄条（' + Math.round(box.width) + 'px）')
  else fail('变形后 composer 位置异常: ' + JSON.stringify(box))
  const disabledTransformed = await ta.isDisabled()
  if (!disabledTransformed) ok('变形后：官方输入框仍可用（官方对话全程可用）')
  else fail('变形后官方输入框不可用')
  const writingPlaceholder = await ta.getAttribute('placeholder')
  if (writingPlaceholder === '输入写作指令：续写 / 审稿 / 查设定…') ok('变形后：官方 composer 切换为写作导向占位符')
  else fail('变形后 composer 占位符异常: ' + writingPlaceholder)

  // 3. 打开章节后的正文区保持纯粹：上下文改由后台绑定，不再靠显性“送章/送选中”按钮。
  await page.locator('.mf-proj').first().click()
  await sleep(500)
  const chap = page.locator('.mf-item .mf-title').first()
  if (await chap.count()) { await chap.click(); await sleep(600) }
  const noisyEditorControls = await page.locator('.mf-editor .mf-eh, .mf-editor .mf-mdtoolbar').count()
  if (noisyEditorControls === 0) ok('编辑器无送章、送选中、历史/技能/摘要/链或 Markdown 工具栏')
  else fail('编辑器仍有显性控制: ' + noisyEditorControls)

  // 4. 官方侧栏会话列表仍可用（折叠窄条图标在）
  const sidebarIcons = await page.evaluate(() => {
    const root = document.querySelector('[class*="hHd-Xa_root"]')
    return root ? root.querySelectorAll('button, [role="button"]').length : 0
  })
  if (sidebarIcons >= 3) ok('变形后官方窄条保留 ' + sidebarIcons + ' 个可点图标（新会话/会话列表/设置）')
  else fail('官方窄条图标缺失: ' + sidebarIcons)

  // 还原
  await page.locator('.mf-head button[title="收起墨扉，返回原版 web"]').click()
  await sleep(700)
  const boxBack = await ta.boundingBox()
  // 空态时官方输入是居中引导卡（~778px），有会话时才是全宽卡；还原后应回到中心区域而非右侧窄条
  if (boxBack && boxBack.x > 300 && boxBack.x < 900 && boxBack.width > 400) ok('还原后：官方输入回到中心区域（x' + Math.round(boxBack.x) + ' w' + Math.round(boxBack.width) + '）')
  else fail('还原后 composer 异常: ' + JSON.stringify(boxBack))

  await browser.close()
  console.log(failures === 0 ? '== V0.14 CHAT ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
