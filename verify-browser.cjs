// OpenFic 浏览器端交互验证（草稿写入/恢复/保存/冲突）
// 由 cordis 会话按 RECOVERY.md 第 4 步驱动。用法: node verify-browser.cjs
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3080'
const OUT = path.join(__dirname, 'verify-shots')
const DATA = 'F:/game/SillyTavern-1.13.2'
const ts = String(Date.now()).slice(-6)
const projTitle = '验证项目-' + ts
const chapTitle = '验证章节-' + ts
const results = []
let failures = 0
function log(msg) { console.log(msg); results.push(msg) }
function fail(msg) { failures += 1; log('FAIL: ' + msg) }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openConversation(page) {
  const btns = page.locator('aside button, [class*="sidebar"] button, nav button')
  const n = await btns.count()
  const texts = []
  for (let i = 0; i < n; i++) { const t = ((await btns.nth(i).textContent()) || '').trim(); if (t) texts.push(i + ':' + t) }
  log('sidebar buttons: ' + JSON.stringify(texts.slice(0, 30)))
  for (let i = 0; i < n; i++) {
    const t = ((await btns.nth(i).textContent()) || '').trim()
    if (!t || /设置|Settings|OpenFic|新建|搜索|搜索会话|折叠|展开/.test(t)) continue
    await btns.nth(i).click().catch(() => {})
    await sleep(2500)
    try { if (await page.locator('.of8-card').first().isVisible()) { log('conversation opened via button #' + i + ' (' + t + ')'); return true } } catch (e) {}
  }
  return false
}

// 把 ofic-1 的 Client 半体装载进本页：左下角 Cordis 面板 → 行内「运行」按钮（client-pending 状态）
async function ensureClientLoaded(page) {
  if (await page.locator('button.of8-open.of8-float').first().isVisible().catch(() => false)) return true
  log('Client 未装载，打开左下角 Cordis 面板…')
  const badge = page.locator('button', { hasText: 'Cordis Plugin' }).first()
  try { await badge.waitFor({ state: 'visible', timeout: 15000 }) } catch (e) { log('Cordis 面板触发器未找到: ' + e.message); return false }
  await badge.click()
  await sleep(1800)
  const runBtn = page.locator('button[data-cordis-switch="run"]').first()
  try { await runBtn.waitFor({ state: 'visible', timeout: 10000 }) } catch (e) { log('面板行运行按钮未找到: ' + e.message); return false }
  log('点击行内「运行」装载 Client 到本页…')
  await runBtn.click()
  await sleep(6000)
  const ok = await page.locator('button.of8-open.of8-float').first().isVisible().catch(() => false)
  log(ok ? 'Client 已装载到本页' : 'Client 装载后仍未检测到浮动按钮')
  return ok
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  let browser
  if (process.env.OFIC_CDP) {
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + process.env.OFIC_CDP, { timeout: 15000 })
    log('connected to CDP endpoint')
  } else {
    const attempts = [
      () => chromium.launch({ channel: 'msedge' }),
      () => chromium.launch({ executablePath: 'C:/Users/zhao/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' }),
      () => chromium.launch(),
    ]
    for (const attempt of attempts) {
      try { browser = await attempt(); log('browser launched'); break }
      catch (e) { log('launch attempt failed: ' + String(e.message).split('\n')[0]) }
    }
    if (!browser) throw new Error('all launch attempts failed')
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // 绑定本会话（OpenFic 动态 Client 半体按会话投影；全新浏览器默认落在空会话上导致不激活）
  await context.addInitScript((sid) => {
    try { localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: sid })) } catch (e) {}
  }, 'session-62a01ca8-ef2a-4da4-b42d-f41369b2cabe')
  const errors = []
  const pageA = await context.newPage()
  pageA.on('pageerror', (e) => errors.push('pageA: ' + e.message))
  pageA.on('console', (m) => { if (m.type() === 'error') errors.push('pageA console: ' + m.text()) })

  log('== STEP 1: 三个入口 ==')
  await pageA.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(10000)
  const floatBtn = pageA.locator('button.of8-open.of8-float')
  if (!(await floatBtn.first().isVisible().catch(() => false))) {
    await ensureClientLoaded(pageA)
  }
  try {
    await floatBtn.first().waitFor({ state: 'visible', timeout: 30000 })
    log('ENTRY1 右下角浮动按钮: ' + (await floatBtn.first().textContent()).trim())
  } catch (e) { fail('浮动按钮不可见: ' + e.message) }
  const sideBtn = pageA.locator('button.of8-side')
  try {
    await sideBtn.first().waitFor({ state: 'visible', timeout: 10000 })
    log('ENTRY2 侧栏 footer 动作: title=' + (await sideBtn.first().getAttribute('title')) + ' mark=' + (await sideBtn.first().locator('.of8-mark').textContent()))
  } catch (e) { fail('侧栏入口不可见: ' + e.message) }
  let runCardSeen = false
  try {
    await pageA.locator('.of8-card').first().waitFor({ state: 'visible', timeout: 8000 })
    runCardSeen = true
  } catch (e) {
    log('运行卡片未直接可见，尝试打开会话…')
    if (await openConversation(pageA)) {
      try { await pageA.locator('.of8-card').first().waitFor({ state: 'visible', timeout: 15000 }); runCardSeen = true } catch (e2) {}
    }
  }
  if (runCardSeen) {
    const cardText = ((await pageA.locator('.of8-card').first().textContent()) || '').trim().replace(/\s+/g, ' ')
    log('ENTRY3 运行卡片: ' + cardText)
  } else { fail('运行卡片未找到（Slot 注册已确认 active，可能仅会话视图未打开）') }

  log('== STEP 2: 打开工作区 → 创建项目 → 创建章节 → 输入正文 → 草稿写入 ==')
  await floatBtn.first().click()
  const panel = pageA.locator('section.of8-panel')
  try { await panel.waitFor({ state: 'visible', timeout: 10000 }) } catch (e) { fail('工作区面板未打开: ' + e.message) }
  const projCol = pageA.locator('aside.of8-col').nth(0)
  const chapCol = pageA.locator('aside.of8-col').nth(1)
  await projCol.locator('button', { hasText: '+ 新建' }).click()
  await projCol.locator('input.of8-input').fill(projTitle)
  await projCol.locator('button', { hasText: '创建' }).click()
  await sleep(1200)
  if (await projCol.locator('button.of8-item', { hasText: projTitle }).count() === 0) fail('项目未创建成功')
  await chapCol.locator('button', { hasText: '+ 新建' }).click()
  await chapCol.locator('input.of8-input').fill(chapTitle)
  await chapCol.locator('button', { hasText: '创建' }).click()
  await sleep(1200)
  const editor = pageA.locator('textarea.of8-text')
  try { await editor.waitFor({ state: 'visible', timeout: 8000 }) } catch (e) { fail('编辑器未出现: ' + e.message) }
  const draftText = '草稿恢复测试内容-' + ts
  await editor.fill(draftText)
  await sleep(1600) // 800ms debounce + 余量
  let drafts = readJson(path.join(DATA, '.openfic-drafts.json'))
  log('drafts.json items: ' + JSON.stringify(drafts && drafts.items))
  if (drafts && drafts.items.some((i) => i.content === draftText)) log('DRAFT-OK 草稿已持久化到 .openfic-drafts.json')
  else fail('草稿未写入数据文件')
  await pageA.screenshot({ path: path.join(OUT, '01-draft-typed.png') })

  log('== STEP 3: 关闭 → 刷新页面 → 重开 → 草稿恢复 ==')
  await pageA.locator('button.of8-close').click()
  await sleep(600)
  await pageA.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(6000)
  const float2 = pageA.locator('button.of8-open.of8-float')
  if (!(await float2.first().isVisible().catch(() => false))) {
    await ensureClientLoaded(pageA)
  }
  try { await float2.first().waitFor({ state: 'visible', timeout: 30000 }) } catch (e) { fail('刷新后浮动按钮不可见: ' + e.message) }
  await float2.first().click()
  try { await panel.waitFor({ state: 'visible', timeout: 10000 }) } catch (e) { fail('刷新后工作区未打开: ' + e.message) }
  await pageA.locator('button.of8-item', { hasText: projTitle }).first().click()
  await sleep(800)
  await pageA.locator('button.of8-item', { hasText: chapTitle }).first().click()
  await sleep(800)
  const recovered = await editor.inputValue()
  log('恢复的草稿文本: ' + recovered)
  if (recovered === draftText) log('RECOVER-OK 刷新后草稿恢复成功')
  else fail('草稿恢复失败: 期望 ' + draftText + ' 实际 ' + recovered)
  await pageA.screenshot({ path: path.join(OUT, '02-draft-recovered.png') })

  log('== STEP 4: 手动保存 → revision+1 且草稿清除 ==')
  await pageA.locator('button', { hasText: '保存正文' }).click()
  await sleep(1800)
  const status = ((await pageA.locator('.of8-status').textContent()) || '').trim()
  log('保存后状态: ' + status)
  const chapSmall = chapCol.locator('button.of8-item', { hasText: chapTitle }).locator('small')
  const chapLabel = ((await chapSmall.textContent()) || '').trim()
  log('章节标签: ' + chapLabel)
  let projects = readJson(path.join(DATA, '.openfic-projects.json'))
  const pj = projects && projects.projects.find((p) => p.title === projTitle)
  const ch = pj && pj.chapters.find((c) => c.title === chapTitle)
  log('保存后 chapter: revision=' + (ch && ch.revision) + ' content=' + (ch && ch.content))
  drafts = readJson(path.join(DATA, '.openfic-drafts.json'))
  const draftLeft = drafts && drafts.items.filter((i) => i.chapterId === (ch && ch.id)).length
  log('保存后该章节残留草稿数: ' + draftLeft)
  if (ch && ch.revision === 2 && ch.content === draftText) log('SAVE-OK 正文已保存且 revision=2')
  else fail('保存结果异常: revision=' + (ch && ch.revision) + ' content=' + (ch && ch.content))
  if (draftLeft === 0) log('DRAFT-CLEAR-OK 保存后草稿已清除')
  else fail('保存后草稿未清除')
  await pageA.screenshot({ path: path.join(OUT, '03-saved.png') })

  log('== STEP 5: 冲突（旧 revision 再保存）==')
  const localText = '本地冲突草稿-' + ts
  await editor.fill(localText)
  await sleep(1600) // 草稿以 baseRevision=2 落盘
  const pageB = await context.newPage()
  pageB.on('pageerror', (e) => errors.push('pageB: ' + e.message))
  await pageB.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(6000)
  const floatB = pageB.locator('button.of8-open.of8-float')
  if (!(await floatB.first().isVisible().catch(() => false))) {
    await ensureClientLoaded(pageB)
  }
  try { await floatB.first().waitFor({ state: 'visible', timeout: 30000 }) } catch (e) { fail('页面B浮动按钮不可见: ' + e.message) }
  await floatB.first().click()
  try { await pageB.locator('section.of8-panel').waitFor({ state: 'visible', timeout: 10000 }) } catch (e) { fail('页面B工作区未打开: ' + e.message) }
  await pageB.locator('button.of8-item', { hasText: projTitle }).first().click()
  await sleep(800)
  await pageB.locator('button.of8-item', { hasText: chapTitle }).first().click()
  await sleep(800)
  const remoteText = '远端修改内容-' + ts
  await pageB.locator('textarea.of8-text').fill(remoteText)
  await sleep(400)
  await pageB.locator('button', { hasText: '保存正文' }).click()
  await sleep(1800)
  log('页面B保存后状态: ' + ((await pageB.locator('.of8-status').textContent()) || '').trim())
  // 页面A 以旧 revision(2) 保存 → 期望 conflict
  await pageA.locator('button', { hasText: '保存正文' }).click()
  await sleep(1800)
  const alert = pageA.locator('.of8-alert')
  let alertText = ''
  try { alertText = ((await alert.textContent()) || '').trim().replace(/\s+/g, ' ') } catch (e) {}
  log('页面A冲突提示: ' + alertText)
  projects = readJson(path.join(DATA, '.openfic-projects.json'))
  const pj3 = projects.projects.find((p) => p.title === projTitle)
  const ch3 = pj3.chapters.find((c) => c.title === chapTitle)
  log('冲突后 chapter: revision=' + ch3.revision + ' content=' + ch3.content)
  if (alertText.indexOf('远端正文已更新') >= 0) log('CONFLICT-OK 冲突提示已显示')
  else fail('未显示冲突提示')
  if (ch3.content === remoteText && ch3.revision === 3) log('NO-OVERWRITE-OK 正文未被旧草稿覆盖，revision 仍为 3')
  else fail('正文被覆盖或 revision 异常: revision=' + ch3.revision + ' content=' + ch3.content)
  await pageA.screenshot({ path: path.join(OUT, '04-conflict.png') })
  // 解决冲突：使用远端正文
  await pageA.locator('button', { hasText: '使用远端正文' }).click()
  await sleep(1000)
  const finalVal = await editor.inputValue()
  log('采纳远端正文后 value=' + finalVal + ' status=' + ((await pageA.locator('.of8-status').textContent()) || '').trim())
  if (finalVal === remoteText) log('RESOLVE-OK 冲突已解决')
  else fail('冲突解决失败')

  await browser.close()
  log('== 汇总 ==')
  log('页面错误: ' + (errors.length ? JSON.stringify(errors.slice(0, 10)) : '无'))
  log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
