// v0.15 验收（文件同步轮询）：AI/外部写入后，工作台在数秒内自动可见（无需手动刷新/会话绑定），草稿不被覆盖。
// 场景 A：模拟 AI 用 mofei_update-chapter 写入（仅走 RPC，不产生聊天工具事件）→ 编辑器自动更新；
// 场景 B：外部编辑器直接改 .mofei/projects/**/*.md（revision+1）→ 文件优先自动回读；
// 场景 C：作者本地有未保存草稿时 AI 再写入 → 草稿不被覆盖且出现冲突提示。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const fs = require('node:fs')
const path = require('node:path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ROOT = __dirname
const ts = String(Date.now()).slice(-6)
const PROJ = 'v15同步-' + ts
let failures = 0
const fail = (m) => { failures += 1; console.log('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(page, method, args) {
  return page.evaluate(async ({ method, args }) => {
    const r = await fetch('/api/mofei', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args: args || {} }) })
    return r.json()
  }, { method, args })
}
async function cleanup(page) {
  const result = await call(page, 'list-projects', {})
  for (const p of (result.value && result.value.projects) || []) if (/^v15/.test(p.title)) await call(page, 'delete-project', { projectId: p.id })
}
async function waitForEditor(page, expectPart, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const val = await page.locator('textarea.mf-text').inputValue().catch(() => '')
    if (val.includes(expectPart)) return true
    await sleep(400)
  }
  return false
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(6000)
  await cleanup(page)

  const created = await call(page, 'create-project', { title: PROJ })
  const projectId = created.value.project.id
  const ch = await call(page, 'create-chapter', { projectId, title: '第一章' })
  const chapterId = ch.value.chapter.id
  await call(page, 'update-chapter', { projectId, chapterId, content: '青城山巅。基线正文。', expectedRevision: 1 })

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(2500)
  await page.locator('.mf-orb').click()
  await sleep(900)
  await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-proj', { hasText: PROJ }).first().waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-proj', { hasText: PROJ }).first().click()
  await page.locator('.mf-item', { hasText: '第一章' }).first().waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-item', { hasText: '第一章' }).first().locator('button.mf-title').click()
  await page.locator('textarea.mf-text').waitFor({ state: 'visible', timeout: 10000 })
  if (await waitForEditor(page, '基线正文', 5000)) ok('编辑器打开《第一章》基线正文')
  else fail('编辑器基线内容未出现')

  // —— 场景 A：AI 工具写入（纯 RPC，不产生聊天工具事件；只有轮询能发现）——
  // 基线写入后 revision=2，故 AI 写入须用 expectedRevision:2，冲突即代表写入失败。
  const aiWrite = await call(page, 'update-chapter', { projectId, chapterId, content: '青城山巅。基线正文。\n\n【AI 续写段落】剑光破晓。', expectedRevision: 2 })
  if (aiWrite.value && !aiWrite.value.conflict && aiWrite.value.chapter && aiWrite.value.chapter.revision === 3) ok('模拟 AI 写入成功（revision 2 → 3）')
  else fail('模拟 AI 写入失败: ' + JSON.stringify(aiWrite.value || aiWrite.error))
  if (await waitForEditor(page, 'AI 续写段落', 10000)) ok('场景A：AI 工具写入 ≤10s 内编辑器自动可见（轮询生效）')
  else fail('场景A：AI 写入后编辑器未自动更新')

  // —— 场景 B：外部编辑器直接改文件（文件优先自动回读）——
  const status = await call(page, 'file-tree-status', { projectId })
  const chapterEntity = (status.value.entities || []).find((e) => e.kind === 'chapter' && e.id === chapterId)
  if (!chapterEntity || !chapterEntity.file) fail('file-tree-status 未返回章节文件路径')
  else {
    const filePath = path.join(ROOT, '.mofei', chapterEntity.file.replace(/\//g, path.sep))
    const raw = fs.readFileSync(filePath, 'utf8')
    const bumped = raw.replace(/^revision: .*$/m, 'revision: 4') + '\n【外部编辑器改写】山风猎猎。\n'
    fs.writeFileSync(filePath, bumped, 'utf8')
    ok('外部改写章节文件: ' + chapterEntity.file + '（revision → 4）')
    if (await waitForEditor(page, '外部编辑器改写', 10000)) ok('场景B：外部文件编辑 ≤10s 内自动回读（文件优先导入）')
    else fail('场景B：外部编辑后未自动回读')
  }

  // —— 场景 C：本地未保存草稿 + AI 再写入 → 草稿不被覆盖，出现冲突提示 ——
  const editor = page.locator('textarea.mf-text')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('【本地草稿未保存！】')
  const draftBefore = await editor.inputValue()
  if (draftBefore.includes('本地草稿未保存')) ok('作者已输入未保存草稿')
  else fail('草稿输入失败')
  const aiWrite3 = await call(page, 'update-chapter', { projectId, chapterId, content: '青城山巅。基线正文。\n\n【AI 续写段落】剑光破晓。\n\n【AI 再次覆盖】风雷激荡。', expectedRevision: 4 })
  if (aiWrite3.value && !aiWrite3.value.conflict && aiWrite3.value.chapter && aiWrite3.value.chapter.revision === 5) ok('模拟 AI 再写入成功（revision 4 → 5）')
  else fail('模拟 AI 再写入失败: ' + JSON.stringify(aiWrite3.value || aiWrite3.error))
  await sleep(4500)
  const draftAfter = await editor.inputValue()
  const bodyText = await page.locator('body').innerText()
  if (draftAfter.includes('本地草稿未保存')) ok('场景C：AI 写入后本地草稿未被覆盖')
  else fail('场景C：草稿被覆盖: ' + draftAfter.slice(0, 60))
  if (bodyText.includes('远端正文已更新') || bodyText.includes('已更新远端正文')) ok('场景C：冲突提示可见（' + (bodyText.match(/[^。\n]*已更新远端正文[^。\n]*。/) || [''])[0] + '）')
  else fail('场景C：未出现冲突提示')

  await cleanup(page)
  await browser.close()
  console.log(failures === 0 ? '== V0.15 SYNC ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
