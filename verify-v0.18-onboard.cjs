// v0.19 验收（工作区存储链路 + 官方会话侧栏）：
// 1. rootDir（小说文件夹）：create-project(rootDir) → 实体文件落盘 rootDir → 文件优先读回 → 删除不删用户目录
// 2. 变形后仍可展开右侧官方 DSH 侧栏并使用其历史会话树
// 3. Web 模式不再渲染墨扉的重复会话选择菜单
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

  // —— 2. 官方会话侧栏（UI）——
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(2500)
  await page.locator('.mf-orb').click()
  await sleep(900)
  await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 10000 })
  // —— 2a. 快捷操作面板 ——
  const paletteTrigger = page.locator('[data-mf-palette-trigger]')
  await paletteTrigger.click()
  await page.locator('.mf-palette').waitFor({ state: 'visible', timeout: 5000 })
  const paletteText = await page.locator('.mf-palette').innerText()
  if (paletteText.includes('快捷操作') && !paletteText.includes('/mofei:')) ok('快捷操作面板使用作者可理解的操作名称')
  else fail('快捷操作面板仍暴露内部命令名: ' + paletteText.slice(0, 180))
  await page.locator('.mf-palette-close').click()
  if (await page.locator('.mf-palette').count() === 0) ok('快捷操作面板可通过关闭按钮收起')
  else fail('关闭按钮未收起快捷操作面板')
  await paletteTrigger.click()
  await page.keyboard.press('Escape')
  await sleep(150)
  if (await page.locator('.mf-palette').count() === 0) ok('快捷操作面板支持 Escape 关闭')
  else fail('Escape 未收起快捷操作面板')
  await paletteTrigger.click()
  await page.mouse.click(1200, 780)
  await sleep(150)
  if (await page.locator('.mf-palette').count() === 0) ok('快捷操作面板支持点击外部关闭')
  else fail('点击外部仍无法收起快捷操作面板')
  if (await page.locator('.mf-wstate,.mf-writer-session-menu').count() === 0) ok('Web 模式未渲染重复的墨扉会话菜单')
  else fail('仍渲染墨扉会话菜单')
  const sidebarToggle = page.locator('[class*="hHd-Xa_toggle"]')
  const beforeLabel = await sidebarToggle.getAttribute('aria-label')
  if (beforeLabel === '打开侧边栏') {
    await sidebarToggle.click()
    await sleep(700)
  }
  const layout = await page.evaluate(() => {
    const root = document.querySelector('[class*="hHd-Xa_root"]')
    const frame = document.querySelector('[class*="_frame"]')
    const panel = document.querySelector('.mf-bubble-panel')
    const composer = document.querySelector('[class*="scrollBody"]')
    const panelRect = panel && panel.getBoundingClientRect()
    const composerRect = composer && composer.getBoundingClientRect()
    return {
      transformed: document.body.classList.contains('mf-transform'),
      expanded: !String(root && root.className || '').includes('collapsed'),
      grid: frame ? getComputedStyle(frame).gridTemplateColumns : '',
      historyItems: document.querySelectorAll('.YDXeBa_title').length,
      panelRight: panelRect ? panelRect.right : -1,
      composerLeft: composerRect ? composerRect.left : -1,
    }
  })
  if (layout.transformed && layout.expanded && layout.grid.includes('280px')) ok('变形态中官方右侧栏可展开')
  else fail('官方侧栏展开失败: ' + JSON.stringify(layout))
  if (layout.panelRight >= 0 && layout.composerLeft >= 0 && Math.abs(layout.composerLeft - layout.panelRight) <= 2) ok('Composer 与墨扉面板边界对齐')
  else fail('Composer 被墨扉面板覆盖: ' + JSON.stringify(layout))
  if (layout.historyItems > 0) ok('官方侧栏显示历史会话树（' + layout.historyItems + ' 项）')
  else fail('官方侧栏未显示历史会话')

  // —— 3. 窄屏工作台 ——
  // 500px 宽度下不再为 Composer 保留 380px，墨扉应保留可编辑的主区域和 55px 官方窄轨。
  await page.setViewportSize({ width: 500, height: 800 })
  await sleep(350)
  const narrow = await page.evaluate(() => {
    const panel = document.querySelector('.mf-bubble-panel')
    const workbench = document.querySelector('.mf-panel.mf-view')
    const projectColumn = document.querySelector('.mf-panel.mf-view .mf-col')
    const editor = document.querySelector('.mf-panel.mf-view .mf-editor')
    const panelRect = panel && panel.getBoundingClientRect()
    const columnRect = projectColumn && projectColumn.getBoundingClientRect()
    const editorRect = editor && editor.getBoundingClientRect()
    return {
      panelWidth: panelRect ? Math.round(panelRect.width) : 0,
      workbenchWidth: workbench ? Math.round(workbench.getBoundingClientRect().width) : 0,
      projectColumnWidth: columnRect ? Math.round(columnRect.width) : 0,
      editorWidth: editorRect ? Math.round(editorRect.width) : 0,
      horizontalOverflow: !!(panel && panel.scrollWidth > panel.clientWidth),
    }
  })
  if (narrow.panelWidth >= 430 && narrow.workbenchWidth >= 430) ok('500px 窄屏工作台保留可用主区域（' + narrow.panelWidth + 'px）')
  else fail('500px 窄屏工作台被压缩: ' + JSON.stringify(narrow))
  if (narrow.projectColumnWidth > 0 && narrow.editorWidth >= 200 && !narrow.horizontalOverflow) ok('500px 窄屏项目列与编辑区无横向裁切')
  else fail('500px 窄屏内部布局异常: ' + JSON.stringify(narrow))

  await browser.close()
  console.log(failures === 0 ? '== V0.19 WORKSPACE+SIDEBAR ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
