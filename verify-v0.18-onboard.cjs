// v0.18 验收（初始向导存储链路 + 会话入口）：
// 1. rootDir（小说文件夹）：create-project(rootDir) → 实体文件落盘 rootDir → 文件优先读回 → 删除不删用户目录
// 2. 自动弹会话菜单：变形后未绑定会话且存在历史会话 → 菜单自动弹出（可直接承接上次对话）
// 3. 顶栏会话入口按钮改名「会话」
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ts = String(Date.now()).slice(-6)
const TMP = path.join(os.tmpdir(), 'mofei-onboard-' + ts)
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

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(3000)

  // 清理残留（v18 测试项目）
  const existing = await call(page, 'list-projects', {})
  for (const p of (existing.value && existing.value.projects) || []) if (String(p.title).startsWith('v18向导')) await call(page, 'delete-project', { projectId: p.id })

  // —— 1. rootDir 全链路 ——
  fs.mkdirSync(TMP, { recursive: true })
  const created = await call(page, 'create-project', { title: 'v18向导-' + ts, rootDir: TMP })
  const pid = created.value && created.value.project && created.value.project.id
  if (pid) ok('create-project(rootDir) 创建成功: ' + pid.slice(0, 10) + '…')
  else fail('创建失败: ' + JSON.stringify(created.value || created.error))
  const rootInfo = await call(page, 'get-project-root', { projectId: pid })
  if (rootInfo.value && rootInfo.value.rootDir === TMP) ok('get-project-root 返回所选文件夹: ' + TMP)
  else fail('get-project-root 异常: ' + JSON.stringify(rootInfo.value || rootInfo.error))

  const ch = await call(page, 'create-chapter', { projectId: pid, title: '第一章' })
  const chapterId = ch.value.chapter.id
  await call(page, 'update-chapter', { projectId: pid, chapterId, content: '山间有雾。', expectedRevision: 1 })
  await sleep(500)
  const chapterFile = path.join(TMP, 'chapters', chapterId + '.md')
  if (fs.existsSync(chapterFile) && fs.readFileSync(chapterFile, 'utf8').includes('山间有雾')) ok('章节正文落盘到小说文件夹: ' + chapterFile)
  else fail('章节未落盘 rootDir')
  const workspaceMirror = path.join(__dirname, '.mofei', 'projects', pid)
  const workspaceHasEntities = fs.existsSync(path.join(workspaceMirror, 'chapters'))
  if (!workspaceHasEntities) ok('工作区 .mofei/projects/<id> 不再产生实体镜像')
  else fail('工作区仍有实体镜像（应只写 rootDir）')

  // 文件优先读回
  const imported = await call(page, 'reload-from-files', {})
  const readBack = await call(page, 'read-chapter', { projectId: pid, chapterId })
  if (readBack.value && readBack.value.chapter && readBack.value.chapter.content.includes('山间有雾')) ok('reload-from-files 从小说文件夹读回（文件优先）')
  else fail('读回失败: ' + JSON.stringify(readBack.value || readBack.error))
  const status = await call(page, 'file-tree-status', { projectId: pid })
  const entity = (status.value.entities || []).find((e) => e.kind === 'chapter' && e.id === chapterId)
  if (entity && String(entity.file).startsWith(TMP)) ok('file-tree-status 报告 rootDir 路径')
  else fail('file-tree-status 路径异常: ' + JSON.stringify(entity))

  // 删除项目不删用户文件夹
  await call(page, 'delete-project', { projectId: pid })
  await sleep(300)
  if (fs.existsSync(TMP)) ok('delete-project 不删除小说文件夹（用户数据安全）')
  else fail('小说文件夹被误删！')
  fs.rmSync(TMP, { recursive: true, force: true })

  // —— 2. 会话入口 + 自动弹菜单（UI）——
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(2500)
  const wstateText = await page.locator('.mf-wstate').innerText().catch(() => '')
  if (wstateText.includes('会话')) ok('顶栏入口已改为「会话」')
  else fail('顶栏入口异常: ' + wstateText)
  await page.locator('.mf-orb').click()
  await sleep(900)
  await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForSelector('.mf-writer-session-menu', { state: 'visible', timeout: 10000 }).then(() => ok('变形后自动弹出会话菜单（可直接承接上次对话）')).catch(() => fail('会话菜单未自动弹出'))
  const menuText = await page.locator('.mf-writer-session-menu').innerText().catch(() => '')
  if (menuText.includes('全部会话')) ok('菜单含「全部会话」区')
  else fail('菜单异常: ' + menuText.slice(0, 80))

  await browser.close()
  console.log(failures === 0 ? '== V0.18 ONBOARD ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
