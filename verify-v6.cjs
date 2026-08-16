// OpenFic v0.3.0 新功能回归：TXT GB18030 编码检测、世界书页签、ST Lorebook JSON 导入、chapter-context RPC
// 前置：DSH 已重启加载 openfic-dsh v0.3.0
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const fs = require('fs')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3080'
const OUT = path.join(__dirname, 'verify-shots')
const SESSION_ID = 'session-62a01ca8-ef2a-4da4-b42d-f41369b2cabe'
const ts = String(Date.now()).slice(-6)
const PROJ = 'v6验证-' + ts
let failures = 0
const log = (m) => console.log(m)
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  // GB18030 编码样例：第 D2BB 一 章 D5C2 + 测 B2E2 试 CAD4；换行 + 正文
  const gbkSample = Buffer.from([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20, 0xb2, 0xe2, 0xca, 0xd4, 0x0a, 0xd5, 0xfd, 0xce, 0xc4, 0x0a])
  const gbkPath = path.join(OUT, 'gb18030-sample-' + ts + '.txt')
  fs.writeFileSync(gbkPath, gbkSample)
  const stJson = JSON.stringify({ entries: { 0: { comment: '青城设定', keys: ['青城'], secondary_keys: ['仙门'], content: '青城为天下第一仙门。', constant: false, disable: false, order: 1 }, 1: { comment: '王朝设定', content: '大夏王朝。', constant: true, disable: false, order: 0 } } })
  const stPath = path.join(OUT, 'worldbook-' + ts + '.json')
  fs.writeFileSync(stPath, stJson, 'utf8')

  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((sid) => {
    try { localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: sid })) } catch (e) {}
  }, SESSION_ID)
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(9000)
  await page.locator('button.of8-open.of8-float').first().waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('button.of8-open.of8-float').first().click()
  await page.locator('section.of8-panel').waitFor({ state: 'visible', timeout: 10000 })
  await sleep(800)

  log('== 1. GB18030 TXT 编码检测 ==')
  await page.locator('header.of8-head button', { hasText: '导入 TXT' }).click()
  await page.locator('div.of8-import-card input[type=file]').setInputFiles(gbkPath)
  await sleep(1500)
  const importText = await page.locator('div.of8-import-card').innerText()
  if (importText.includes('检测编码：GB18030')) log('GB18030-DETECT-OK')
  else fail('GB18030 检测异常: ' + importText.slice(0, 140))
  await page.locator('div.of8-import-card input.of8-input').fill(PROJ)
  await page.locator('div.of8-import-card button', { hasText: '确认导入' }).click()
  await page.locator('div.of8-import-card').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  await sleep(1800)
  if (await page.locator('.of8-item', { hasText: '第一章 测试' }).count() > 0) log('GB18030-DECODE-OK')
  else fail('GB18030 解码异常：章节标题未出现')
  await page.screenshot({ path: path.join(OUT, 'v6-01-gbk-import.png') })

  log('== 2. 世界书页签与条目 CRUD ==')
  const leftCol = page.locator('aside.of8-col').first()
  await leftCol.locator('.of8-item', { hasText: PROJ }).first().locator('button.of8-title').click()
  await sleep(1200)
  const worldTab = page.locator('.of8-tab', { hasText: '世界' })
  await worldTab.waitFor({ state: 'visible', timeout: 8000 })
  await worldTab.click()
  await page.locator('.of8-sh button[title="新建条目"]').waitFor({ state: 'visible', timeout: 8000 })
  await page.locator('.of8-sh button[title="新建条目"]').click()
  const worldNameInput = page.locator('input[placeholder*="条目名称"]')
  await worldNameInput.waitFor({ state: 'visible', timeout: 8000 })
  await worldNameInput.fill('林轩')
  await page.locator('.of8-list .of8-form button', { hasText: '创建' }).click()
  await sleep(1200)
  if (await page.locator('.of8-item', { hasText: '林轩' }).count() > 0) log('WORLD-CREATE-OK')
  else fail('世界书条目未创建')
  await page.locator('.of8-item', { hasText: '林轩' }).first().locator('button.of8-title').click()
  await sleep(400)
  const worldInputs = page.locator('main.of8-editor .of8-form input')
  await worldInputs.nth(0).fill('林轩')
  await worldInputs.nth(1).fill('林轩，小轩')
  await page.locator('main.of8-editor textarea.of8-text').fill('青城修士，主角。')
  await page.locator('main.of8-editor button', { hasText: '保存条目' }).click()
  await sleep(1000)
  const savedEntry = await page.locator('main.of8-editor textarea.of8-text').inputValue()
  if (savedEntry.includes('青城修士')) log('WORLD-SAVE-OK')
  else fail('世界书条目保存失败')
  await page.screenshot({ path: path.join(OUT, 'v6-02-world-entry.png') })

  log('== 3. ST Lorebook JSON 导入 ==')
  await page.locator('.of8-sh button[title*="导入 SillyTavern"]').click()
  await page.locator('div.of8-import-card input[type=file]').setInputFiles(stPath)
  await sleep(1500)
  const worldImportText = await page.locator('div.of8-import-card').innerText()
  if (worldImportText.includes('已导入 2 条')) log('WORLD-IMPORT-OK')
  else fail('ST 世界书导入异常: ' + worldImportText.slice(0, 140))
  await page.locator('div.of8-import-card button', { hasText: '完成' }).click()
  await sleep(800)
  const entryCount = await page.locator('.of8-col .of8-item', { hasText: /青城设定|王朝设定|林轩/ }).count()
  if (entryCount >= 3) log('WORLD-LIST-OK (' + entryCount + ')')
  else fail('世界书列表条目数异常: ' + entryCount)
  await page.screenshot({ path: path.join(OUT, 'v6-03-world-import.png') })

  log('== 4. chapter-context RPC（世界书激活） ==')
  const rpc = await page.evaluate(async (projName) => {
    const call = async (method, args) => {
      const response = await fetch('/api/openfic', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args: args || {} }) })
      return response.json()
    }
    const boot = await call('list-projects', {})
    const project = boot.value.projects.find((p) => p.title === projName)
    if (!project || !project.chapters.length) return { error: 'PROJECT_OR_CHAPTER_MISSING' }
    const chapter = project.chapters[0]
    const context = await call('chapter-context', { projectId: project.id, chapterId: chapter.id })
    const deleteResult = await call('delete-project', { projectId: project.id })
    return { context: context.value, worldCount: context.value ? context.value.worldEntries.length : -1, deleted: deleteResult.ok }
  }, PROJ)
  if (rpc.error) fail('chapter-context 失败: ' + rpc.error)
  else if (rpc.worldCount >= 1 && rpc.context.contextText.includes('王朝设定')) log('CHAPTER-CONTEXT-OK (' + rpc.worldCount + ' entries)')
  else fail('chapter-context 世界书激活异常: ' + JSON.stringify(rpc).slice(0, 200))
  if (rpc.deleted) log('CLEANUP-OK')

  await browser.close()
  console.log(failures === 0 ? '== ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
