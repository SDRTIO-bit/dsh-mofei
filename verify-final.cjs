// OpenFic 最终验证：正确数据路径 E:\Users\zhao\Desktop\ + 完整流程 + 冲突解决
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const fs = require('fs')
const path = require('path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3080'
const OUT = path.join(__dirname, 'verify-shots')
const DATA_DIR = 'E:/Users/zhao/Desktop'
const SESSION_ID = 'session-62a01ca8-ef2a-4da4-b42d-f41369b2cabe'
const PROJ = '验证项目-649354'
const CHAP = '验证章节-649354'
let failures = 0
function log(m) { console.log(m) }
function fail(m) { failures += 1; console.log('FAIL: ' + m) }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ensureClientLoaded(page) {
  if (await page.locator('button.of8-open.of8-float').first().isVisible().catch(() => false)) return true
  const badge = page.locator('button', { hasText: 'Cordis Plugin' }).first()
  await badge.waitFor({ state: 'visible', timeout: 15000 })
  await badge.click()
  await sleep(1800)
  const runBtn = page.locator('button[data-cordis-switch="run"]').first()
  await runBtn.waitFor({ state: 'visible', timeout: 10000 })
  await runBtn.click()
  await sleep(6000)
  return page.locator('button.of8-open.of8-float').first().isVisible().catch(() => false)
}

async function openWorkspace(page) {
  await page.locator('button.of8-open.of8-float').first().click()
  await page.locator('section.of8-panel').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('button.of8-item', { hasText: PROJ }).first().click()
  await sleep(800)
  await page.locator('button.of8-item', { hasText: CHAP }).first().click()
  await sleep(800)
  return page.locator('textarea.of8-text')
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((sid) => {
    try { localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: sid })) } catch (e) {}
  }, SESSION_ID)
  const pageA = await context.newPage()
  await pageA.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(9000)
  if (!(await ensureClientLoaded(pageA))) { fail('Client 未装载'); process.exit(1) }
  log('== A: 已有数据可见性 + 草稿写入（正确路径断言） ==')
  const editor = await openWorkspace(pageA)
  const remoteVal = await editor.inputValue()
  log('打开既有章节，正文: ' + remoteVal)
  if (remoteVal === '远端修改内容-649354') log('DATA-VISIBLE-OK 上次运行的远端正文正确呈现')
  else fail('正文与预期不符: ' + remoteVal)
  await pageA.screenshot({ path: path.join(OUT, 'f1-existing.png') })
  const draftText = '最终验证-草稿-' + Date.now().toString().slice(-6)
  await editor.fill(draftText)
  await sleep(1600)
  let drafts = readJson(path.join(DATA_DIR, '.openfic-drafts.json'))
  log('drafts.json: ' + JSON.stringify(drafts && drafts.items))
  if (drafts && drafts.items.some((i) => i.content === draftText)) log('DRAFT-FILE-OK 草稿已真实写入 ' + path.join(DATA_DIR, '.openfic-drafts.json'))
  else fail('草稿未写入数据文件')
  log('== B: 关闭重开草稿恢复 ==')
  await pageA.locator('button.of8-close').click()
  await sleep(600)
  await pageA.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(7000)
  if (!(await ensureClientLoaded(pageA))) { fail('刷新后 Client 未装载'); process.exit(1) }
  const editor2 = await openWorkspace(pageA)
  const recovered = await editor2.inputValue()
  log('刷新后恢复的草稿: ' + recovered)
  if (recovered === draftText) log('RECOVER-OK 草稿恢复成功')
  else fail('草稿恢复失败: ' + recovered)
  await pageA.screenshot({ path: path.join(OUT, 'f2-recovered.png') })
  log('== C: 手动保存 → revision+1、草稿清除 ==')
  await pageA.locator('button', { hasText: '保存正文' }).click()
  await sleep(1800)
  let projects = readJson(path.join(DATA_DIR, '.openfic-projects.json'))
  const pj = projects.projects.find((p) => p.title === PROJ)
  const ch = pj.chapters.find((c) => c.title === CHAP)
  drafts = readJson(path.join(DATA_DIR, '.openfic-drafts.json'))
  const left = drafts.items.filter((i) => i.chapterId === ch.id).length
  log('保存后: revision=' + ch.revision + ' content=' + ch.content + ' 残留草稿=' + left)
  if (ch.revision === 4 && ch.content === draftText) log('SAVE-OK revision=4 且正文已保存')
  else fail('保存异常: revision=' + ch.revision)
  if (left === 0) log('DRAFT-CLEAR-OK 草稿已清除')
  else fail('草稿未清除')
  log('== D: 冲突（页面B以新版本保存，页面A以旧 revision 保存） ==')
  const localText = '冲突验证-本地草稿-' + Date.now().toString().slice(-6)
  await editor2.fill(localText)
  await sleep(1600)
  const pageB = await context.newPage()
  await pageB.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(8000)
  if (!(await ensureClientLoaded(pageB))) { fail('页面B Client 未装载'); process.exit(1) }
  const editorB = await openWorkspace(pageB)
  const remoteText = '冲突验证-远端保存-' + Date.now().toString().slice(-6)
  await editorB.fill(remoteText)
  await sleep(400)
  await pageB.locator('button', { hasText: '保存正文' }).click()
  await sleep(1800)
  log('页面B保存后状态: ' + ((await pageB.locator('.of8-status').textContent()) || '').trim())
  await pageA.locator('button', { hasText: '保存正文' }).click()
  await sleep(1800)
  const alertText = ((await pageA.locator('.of8-alert').textContent()) || '').trim().replace(/\s+/g, ' ')
  log('页面A冲突提示: ' + alertText)
  projects = readJson(path.join(DATA_DIR, '.openfic-projects.json'))
  const ch3 = projects.projects.find((p) => p.title === PROJ).chapters.find((c) => c.title === CHAP)
  log('冲突后文件: revision=' + ch3.revision + ' content=' + ch3.content)
  if (alertText.includes('远端正文已更新')) log('CONFLICT-OK 冲突提示已显示')
  else fail('冲突提示缺失')
  if (ch3.content === remoteText && ch3.revision === 5) log('NO-OVERWRITE-OK 旧草稿未覆盖远端正文')
  else fail('正文被覆盖: revision=' + ch3.revision + ' content=' + ch3.content)
  await pageA.screenshot({ path: path.join(OUT, 'f3-conflict.png') })
  log('== E: 解决冲突（使用远端正文） ==')
  await pageA.locator('button', { hasText: '使用远端正文' }).click()
  await sleep(1200)
  const finalVal = await editor2.inputValue()
  const finalStatus = ((await pageA.locator('.of8-status').textContent()) || '').trim()
  log('解决后: value=' + finalVal + ' status=' + finalStatus)
  if (finalVal === remoteText && finalStatus === '已保存') log('RESOLVE-OK 冲突已解决，采用远端正文')
  else fail('冲突解决失败: ' + finalVal)
  await pageA.screenshot({ path: path.join(OUT, 'f4-resolved.png') })
  await browser.close()
  console.log(failures === 0 ? '== ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
