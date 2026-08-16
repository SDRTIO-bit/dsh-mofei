// v0.14 验收：原版 DSH web 完整保留 + 右下角 orb 按钮 + 变形金刚式墨扉工作台。
// 默认态：官方侧栏 280 / 官方对话区 / 官方 composer 全可见，墨扉面板屏幕外。
// 点 orb → 平滑变形：墨扉工作台从左侧滑入、官方对话+composer 收至约 500px、
// 官方侧栏原生折叠成位于助手右侧的 55px 窄轨。点「✕」→ 还原原版 web。
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

  const geom = () => page.evaluate(() => {
    const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
    const sidebar = document.querySelector('[class*="hHd-Xa_root"]')
    const composer = document.querySelector('[class*="composerSeat"]')
    const panel = document.querySelector('.mf-bubble-panel')
    return { sidebar: rect(sidebar), collapsed: sidebar ? String(sidebar.className).includes('collapsed') : null, composer: rect(composer), panel: rect(panel), transform: document.body.classList.contains('mf-transform') }
  })

  // ===== 1. 默认态：原版 web 完整 =====
  let g = await geom()
  if (g.sidebar && g.sidebar.w > 250 && !g.collapsed) ok('默认态：官方侧栏展开（' + g.sidebar.w + 'px）')
  else fail('官方侧栏异常: ' + JSON.stringify(g.sidebar))
  if (g.composer && g.composer.w > 800) ok('默认态：官方 composer 全宽可见（' + g.composer.w + 'px）')
  else fail('官方 composer 异常: ' + JSON.stringify(g.composer))
  if (g.panel && g.panel.x < -100) ok('默认态：墨扉面板收起在屏幕外')
  else fail('墨扉面板默认应隐藏: ' + JSON.stringify(g.panel))
  const orbText = (await page.locator('.mf-orb').innerText()).trim()
  if (orbText === '墨') ok('默认态：右下角「墨」orb 按钮')
  else fail('orb 文案异常: ' + orbText)
  const overlayCount = await page.locator('.mf-overlay').count()
  if (overlayCount === 0) ok('无全屏遮罩（不盖原版 web）')
  else fail('存在全屏遮罩: ' + overlayCount)

  // ===== 2. 点 orb → 变形 =====
  await page.locator('.mf-orb').click()
  await sleep(900)
  g = await geom()
  if (g.sidebar && g.collapsed && g.sidebar.w < 100 && g.sidebar.x > 1450) ok('变形后：官方侧栏在助手右侧折叠成窄轨（' + g.sidebar.w + 'px @ x' + g.sidebar.x + '）')
  else fail('侧栏折叠异常: ' + JSON.stringify(g.sidebar))
  if (g.composer && g.composer.w > 380 && g.composer.w < 520 && g.composer.x > 1000) ok('变形后：官方 composer 挤到右侧窄条（' + g.composer.w + 'px @ x' + g.composer.x + '）')
  else fail('composer 挤右异常: ' + JSON.stringify(g.composer))
  if (g.panel && g.panel.x === 0 && g.panel.w > 800) ok('变形后：墨扉工作台从左缘滑入（w' + g.panel.w + '）')
  else fail('墨扉面板滑入异常: ' + JSON.stringify(g.panel))
  if (g.transform) ok('body.mf-transform 类生效')
  else fail('body 类缺失')
  await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 10000 })
  const projCount = await page.locator('.mf-proj').count()
  if (projCount > 0) ok('工作台左内栏项目行可见（' + projCount + ' 个）')
  else fail('项目行为空')
  const miniNav = await page.locator('.mf-mininav button').count()
  if (miniNav === 6) ok('左内栏底部迷你导航含写作技能入口（6 个 tab）')
  else fail('迷你导航异常: ' + miniNav)

  // 变形后 orb 退场、顶栏提供带语义 title 的收起图标。
  const orbOpacity = await page.evaluate(() => { const el = document.querySelector('.mf-orb'); return el ? Number(getComputedStyle(el).opacity) : 1 })
  const collapseBtn = await page.locator('.mf-head button[title="收起墨扉，返回原版 web"]').count()
  if (orbOpacity === 0 && collapseBtn === 1) ok('变形后 orb 退场，顶栏提供收起图标')
  else fail('orb/收起按钮状态异常: orbOpacity=' + orbOpacity + ' collapseBtn=' + collapseBtn)

  // ===== 3. 用户点官方侧栏展开 → 先退出墨扉，再展开 DSH =====
  const nativeSidebarToggle = page.locator('[class*="hHd-Xa_toggle"]')
  if (await nativeSidebarToggle.count()) {
    await nativeSidebarToggle.click()
    await sleep(850)
    g = await geom()
    if (!g.transform && g.sidebar && !g.collapsed && g.sidebar.w > 250) ok('点官方侧栏展开时：平滑退出墨扉并还原 DSH')
    else fail('官方侧栏展开与墨扉退出未协调: ' + JSON.stringify(g))
    await page.locator('.mf-orb').click()
    await sleep(900)
    g = await geom()
    if (g.transform && g.sidebar && g.collapsed) ok('从原版 DSH 可再次进入墨扉')
    else fail('再次进入墨扉失败: ' + JSON.stringify(g))
  } else {
    fail('未找到官方侧栏展开按钮')
  }

  // ===== 4. 工作台打开项目/章节 =====
  await page.locator('.mf-proj').first().click()
  await sleep(500)
  const backBtn = await page.locator('.mf-back').count()
  if (backBtn > 0) ok('点项目进入章节视图（← 返回可见）')
  else fail('章节视图未出现')
  await page.locator('.mf-back').click()
  await sleep(500)

  // ===== 5. 点「✕ 收起」→ 还原 =====
  await page.locator('.mf-head button[title="收起墨扉，返回原版 web"]').click()
  await sleep(900)
  g = await geom()
  if (g.sidebar && g.sidebar.w > 250 && !g.collapsed) ok('还原后：官方侧栏展开')
  else fail('侧栏还原异常: ' + JSON.stringify(g.sidebar))
  if (g.composer && g.composer.w > 800) ok('还原后：官方 composer 恢复全宽')
  else fail('composer 还原异常: ' + JSON.stringify(g.composer))
  if (g.panel && g.panel.x < -100) ok('还原后：墨扉面板收起')
  else fail('面板未收起: ' + JSON.stringify(g.panel))
  if (!g.transform) ok('body 类已移除')
  else fail('body 类残留')

  // ===== 6. 官方侧栏入口「墨扉」也能变形 =====
  const sideAction = page.locator('.mf-side', { hasText: '墨扉' }).first()
  const sideCount = await page.locator('.mf-side').count()
  if (sideCount >= 1) {
    await sideAction.click()
    await sleep(900)
    g = await geom()
    if (g.transform && g.panel && g.panel.x >= 0) ok('官方侧栏「墨扉」入口同样触发变形')
    else fail('侧栏入口变形失败: ' + JSON.stringify(g))
    await page.locator('.mf-head button[title="收起墨扉，返回原版 web"]').click()
    await sleep(700)
  } else {
    ok('侧栏「墨扉」入口未渲染（可接受）')
  }

  await browser.close()
  console.log(failures === 0 ? '== V0.14 VIEW ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
