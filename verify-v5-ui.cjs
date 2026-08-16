// v0.5.0 浏览器验收：项目网格 + 编辑器体验（对应 NEXT-SESSION.md 4.3）
// 会创建两个临时项目（v5前缀），结束时全部清理。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3080'
const OUT = path.join(__dirname, 'verify-shots')
const SESSION_ID = 'session-62a01ca8-ef2a-4da4-b42d-f41369b2cabe'
const ts = String(Date.now()).slice(-6)
const PROJ_A = 'v5验收甲' + ts
const PROJ_B = 'v5验收乙' + ts
let failures = 0
const log = (m) => console.log(m)
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(page, method, args) {
  return page.evaluate(async ({ method, args }) => {
    const response = await fetch('/api/mofei', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args: args || {} }) })
    return response.json()
  }, { method, args })
}

async function cleanup(page) {
  const result = await call(page, 'list-projects', {})
  const projects = result && result.value && result.value.projects || []
  for (const p of projects) {
    if (/^(v5|v7验证|diag)/.test(p.title)) await call(page, 'delete-project', { projectId: p.id })
  }
}

async function getChapter(page, projectId, chapterId) {
  const result = await call(page, 'list-projects', {})
  const project = result && result.value && result.value.projects.find((p) => p.id === projectId)
  return project && project.chapters.find((c) => c.id === chapterId)
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((sid) => { try { localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: sid })) } catch (e) {} }, SESSION_ID)
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 300)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(7000)

  await cleanup(page)
  log('== 0. 数据准备（API 种子） ==')
  const pa = await call(page, 'create-project', { title: PROJ_A })
  const pb = await call(page, 'create-project', { title: PROJ_B })
  const idA = pa.value.project.id
  const idB = pb.value.project.id
  await call(page, 'update-project', { projectId: idB, description: '乙项目简介' })
  const ch1 = await call(page, 'create-chapter', { projectId: idA, title: '第一章' })
  await call(page, 'create-chapter', { projectId: idA, title: '第二章' })
  const ch1Id = ch1.value.chapter.id
  await call(page, 'update-chapter', { projectId: idA, chapterId: ch1Id, content: '你好世界', expectedRevision: ch1.value.chapter.revision })
  log('SEED-OK: ' + idA + ' / ' + idB)

  log('== 1. 项目网格：默认网格 + 列表切换 + 搜索 + 排序 ==')
  await page.locator('button.mf-side').first().waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('button.mf-side').first().click()
  await page.locator('section.mf-panel').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('button.mf-act', { hasText: '项目' }).click()
  await page.locator('.mf-grid-grid').waitFor({ state: 'visible', timeout: 10000 })
  log('GRID-DEFAULT-OK')
  const cardTitles = await page.locator('.mf-grid-card .mf-grid-card-title').allInnerTexts()
  if (cardTitles.some((t) => t.includes('验收甲')) && cardTitles.some((t) => t.includes('验收乙'))) log('GRID-CARDS-OK')
  else fail('网格卡片缺失: ' + JSON.stringify(cardTitles))

  await page.locator('.mf-grid-toggle button', { hasText: '列表' }).click()
  await page.locator('.mf-grid-list').waitFor({ state: 'visible', timeout: 5000 })
  log('LIST-TOGGLE-OK')
  await page.locator('.mf-grid-toggle button', { hasText: '网格' }).click()
  await page.locator('.mf-grid-grid').waitFor({ state: 'visible', timeout: 5000 })

  const search = page.locator('.mf-grid-search')
  await search.fill('甲')
  await sleep(400)
  let titles = await page.locator('.mf-grid-card .mf-grid-card-title').allInnerTexts()
  if (titles.length === 1 && titles[0].includes('验收甲')) log('SEARCH-TITLE-OK')
  else fail('标题搜索异常: ' + JSON.stringify(titles))
  await search.fill('乙项目简介')
  await sleep(400)
  titles = await page.locator('.mf-grid-card .mf-grid-card-title').allInnerTexts()
  if (titles.length === 1 && titles[0].includes('验收乙')) log('SEARCH-DESC-OK')
  else fail('简介搜索异常: ' + JSON.stringify(titles))
  await search.fill('')
  await sleep(300)

  await page.locator('.mf-grid-select').selectOption('title')
  await sleep(400)
  titles = await page.locator('.mf-grid-card .mf-grid-card-title').allInnerTexts()
  const sortIdxA = titles.findIndex((t) => t.includes('验收甲'))
  const sortIdxB = titles.findIndex((t) => t.includes('验收乙'))
  if (titles.length >= 2 && sortIdxA >= 0 && sortIdxB >= 0 && sortIdxA < sortIdxB) log('SORT-TITLE-OK')
  else fail('按标题排序异常: ' + JSON.stringify(titles))

  log('== 2. 项目网格：重命名 ==')
  const cardA = page.locator('.mf-grid-card', { hasText: PROJ_A })
  await cardA.locator('.mf-grid-btn', { hasText: '重命名' }).click()
  await page.locator('input.mf-rename').waitFor({ state: 'visible', timeout: 5000 })
  const renameA = PROJ_A + '改'
  await page.locator('input.mf-rename').fill(renameA)
  await page.locator('input.mf-rename').press('Enter')
  await page.waitForFunction((name) => [...document.querySelectorAll('.mf-grid-card .mf-grid-card-title')].some((n) => n.textContent.includes(name)), renameA, { timeout: 5000 })
  log('GRID-RENAME-OK')

  log('== 3. 编辑器：打开章节 + 字数 + Tab 全角缩进 ==')
  await page.locator('.mf-grid-card', { hasText: renameA }).click()
  await page.locator('aside.mf-col').nth(1).locator('.mf-item', { hasText: '第一章' }).first().locator('button.mf-title').click()
  const titleInput = page.locator('input.mf-title-input')
  await titleInput.waitFor({ state: 'visible', timeout: 8000 })
  const textarea = page.locator('textarea.mf-text')
  await textarea.waitFor({ state: 'visible', timeout: 8000 })
  let value = await textarea.inputValue()
  if (value === '你好世界') log('CHAPTER-OPEN-OK')
  else fail('章节正文加载异常: ' + value)
  const statText = await page.locator('.mf-foot .mf-stat').innerText()
  if (statText.startsWith('4 字')) log('WORDCOUNT-OK: ' + statText.slice(0, 20))
  else fail('字数统计异常: ' + statText.slice(0, 20))

  await textarea.focus()
  await textarea.press('End')
  await textarea.press('Tab')
  value = await textarea.inputValue()
  if (value === '你好世界\u3000\u3000') log('TAB-INDENT-OK')
  else fail('Tab 缩进异常: ' + JSON.stringify(value))

  log('== 4. 编辑器：3 秒自动保存 ==')
  await textarea.type('自动保存内容')
  value = await textarea.inputValue()
  await page.waitForFunction(() => {
    const el = document.querySelector('.mf-eh .mf-status')
    return el && el.textContent.includes('已保存')
  }, null, { timeout: 8000 })
  const savedStatus = await page.locator('.mf-eh .mf-status').innerText()
  if (savedStatus.includes('已保存')) log('AUTOSAVE-STATUS-OK')
  else fail('自动保存状态异常: ' + savedStatus)
  const readBack = await getChapter(page, idA, ch1Id)
  const backContent = readBack ? readBack.content : null
  if (backContent === value) log('AUTOSAVE-CONTENT-OK')
  else fail('自动保存正文不一致: ' + JSON.stringify(backContent))

  log('== 5. 编辑器：内联标题 Enter 同步（成功 + 失败路径） ==')
  await titleInput.fill('第一章改')
  await titleInput.press('Enter')
  await sleep(600)
  const sideTitles = await page.locator('aside.mf-col').nth(1).locator('.mf-item .mf-title').allInnerTexts()
  const tabTitles = await page.locator('.mf-tab2').allInnerTexts()
  if (sideTitles.some((t) => t.includes('第一章改'))) log('TITLE-SIDEBAR-OK')
  else fail('侧栏标题未同步: ' + JSON.stringify(sideTitles))
  if (tabTitles.some((t) => t.includes('第一章改'))) log('TITLE-TAB-OK')
  else fail('标签页标题未同步: ' + JSON.stringify(tabTitles))

  let abortTitle = true
  await page.route('**/api/mofei', (route) => {
    if (abortTitle && route.request().postData() && route.request().postData().includes('update-chapter-meta')) {
      abortTitle = false
      return route.abort()
    }
    return route.continue()
  })
  const bodyBeforeFail = await textarea.inputValue()
  await titleInput.fill('不应生效')
  await titleInput.press('Enter')
  await sleep(800)
  const bodyAfterFail = await textarea.inputValue()
  const titleAfterFail = await titleInput.inputValue()
  if (bodyBeforeFail === bodyAfterFail) log('TITLE-FAIL-BODY-OK')
  else fail('标题失败路径影响正文: ' + JSON.stringify({ bodyBeforeFail, bodyAfterFail }))
  if (titleAfterFail === '不应生效') log('TITLE-FAIL-LOCAL-KEEP-OK（本地保留待重试）')
  else fail('标题失败路径输入被清空: ' + titleAfterFail)
  const metaRead = await getChapter(page, idA, ch1Id)
  if (metaRead && metaRead.title === '第一章改') log('TITLE-FAIL-NO-WRITE-OK')
  else fail('标题失败路径仍写了远端: ' + (metaRead && metaRead.title))
  await page.unroute('**/api/mofei')
  await titleInput.fill('第一章改')
  await titleInput.press('Enter')
  await sleep(500)

  log('== 6. 刷新页面恢复上次章节 ==')
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(9000)
  await page.locator('button.mf-side').first().click()
  await page.locator('section.mf-panel').waitFor({ state: 'visible', timeout: 10000 })
  let restoredTitle = 0
  try {
    await page.locator('input.mf-title-input').first().waitFor({ state: 'visible', timeout: 6000 })
    restoredTitle = await page.locator('input.mf-title-input').count()
  } catch (restoreError) { restoredTitle = 0 }
  if (restoredTitle > 0) {
    const t = await page.locator('input.mf-title-input').inputValue()
    const c = await page.locator('textarea.mf-text').inputValue()
    if (t === '第一章改' && c === bodyAfterFail) log('RELOAD-RESTORE-OK')
    else fail('恢复内容不一致: title=' + JSON.stringify(t) + ' body=' + JSON.stringify(c))
  } else {
    fail('刷新后未自动恢复章节（无 mf-title-input）')
  }
  await page.screenshot({ path: path.join(OUT, 'v5-06-restore.png') })

  log('== 7. 项目网格：两击删除 + 3 秒超时 ==')
  await page.locator('button.mf-act', { hasText: '项目' }).click()
  await page.locator('.mf-grid-grid').waitFor({ state: 'visible', timeout: 5000 })
  const cardB = page.locator('.mf-grid-card', { hasText: PROJ_B })
  const delB = cardB.locator('.mf-grid-del')
  await delB.click()
  await sleep(300)
  let delText = await delB.innerText()
  if (delText.includes('确认删除') && (await delB.getAttribute('class')).includes('armed')) log('DELETE-ARM-OK')
  else fail('删除未武装: ' + delText)
  await sleep(3300)
  delText = await delB.innerText()
  if (delText === '删除' && !(await delB.getAttribute('class')).includes('armed')) log('DELETE-3S-TIMEOUT-OK')
  else fail('删除 3 秒超时未解除: ' + delText)
  await delB.click()
  await sleep(250)
  await delB.click()
  await sleep(1200)
  const bGone = (await page.locator('.mf-grid-card', { hasText: PROJ_B }).count()) === 0
  const apiList = await call(page, 'list-projects', {})
  const bStill = apiList.value.projects.some((p) => p.id === idB)
  if (bGone && !bStill) log('DELETE-TWO-CLICK-OK')
  else fail('两击删除失败: uiGone=' + !bGone + ' apiStill=' + bStill)

  await cleanup(page)
  await page.screenshot({ path: path.join(OUT, 'v5-07-grid.png') })
  await browser.close()
  console.log(failures === 0 ? '== ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
