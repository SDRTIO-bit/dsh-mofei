// v0.17 验收（技能开关/自创技能 + 会话导航）：
// 1. 技能开关：禁用某技能 → 设置落盘 + list-skill-settings 返回 enabled:false
// 2. 自创技能：create-custom-skill → ~/.dsh/skills/<name>.md 落盘 + custom 列表可见
// 3. 会话菜单：顶栏「写作助手」菜单含「全部会话」+ 会话项 + 当前有会话时「退出当前对话」
// 4. 退出当前对话：点击后右侧面板解除绑定（菜单内「退出当前对话」消失）
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ts = String(Date.now()).slice(-6)
const PROJ = 'v17技能-' + ts
const CUSTOM_SKILL = 'test-custom-' + ts
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

  // 清理测试残留
  const cleanupProjects = await call(page, 'list-projects', {})
  for (const p of (cleanupProjects.value && cleanupProjects.value.projects) || []) if (/^v17/.test(p.title)) await call(page, 'delete-project', { projectId: p.id })
  const settings0 = await call(page, 'list-skill-settings', {})
  for (const c of (settings0.value && settings0.value.custom) || []) if (String(c.name).startsWith('test-custom')) await call(page, 'delete-custom-skill', { name: c.name })
  const reenable = (settings0.value && settings0.value.disabledSkills) || []
  for (const id of reenable) if (id !== 'mofei-deslop-writing') await call(page, 'set-skill-enabled', { skillId: id, enabled: true })

  // —— 1. 技能开关 ——
  const toggle = await call(page, 'set-skill-enabled', { skillId: 'mofei-deslop-writing', enabled: false })
  if (toggle.value && !toggle.value.error && toggle.value.enabled === false) ok('技能开关：禁用 mofei-deslop-writing')
  else fail('禁用失败: ' + JSON.stringify(toggle.value || toggle.error))
  const settingsFile = path.join(__dirname, '.mofei-skill-settings.json')
  if (fs.existsSync(settingsFile) && fs.readFileSync(settingsFile, 'utf8').includes('mofei-deslop-writing')) ok('设置已落盘 .mofei-skill-settings.json')
  else fail('设置未落盘')
  const settings1 = await call(page, 'list-skill-settings', {})
  const deslop = (settings1.value.skills || []).find((s) => s.name === 'mofei-deslop-writing')
  if (deslop && deslop.enabled === false) ok('list-skill-settings 返回 enabled:false')
  else fail('list-skill-settings 状态异常')
  await call(page, 'set-skill-enabled', { skillId: 'mofei-deslop-writing', enabled: true })

  // —— 2. 自创技能 ——
  const created = await call(page, 'create-custom-skill', { name: CUSTOM_SKILL, description: '验证用自创技能', whenToUse: '测试时使用', content: '这是自创技能的规则正文。' })
  if (created.value && created.value.saved) ok('自创技能创建成功: ' + CUSTOM_SKILL)
  else fail('创建失败: ' + JSON.stringify(created.value || created.error))
  const customFile = path.join(os.homedir(), '.dsh', 'skills', CUSTOM_SKILL + '.md')
  if (fs.existsSync(customFile) && fs.readFileSync(customFile, 'utf8').includes('name: ' + CUSTOM_SKILL)) ok('~/.dsh/skills/' + CUSTOM_SKILL + '.md 落盘（skill-filesystem 可发现）')
  else fail('自创技能文件未落盘: ' + customFile)
  const settings2 = await call(page, 'list-skill-settings', {})
  if ((settings2.value.custom || []).some((c) => c.name === CUSTOM_SKILL)) ok('list-skill-settings custom 列表可见')
  else fail('custom 列表未包含新技能')

  // —— 3. 会话菜单（UI）——
  const created2 = await call(page, 'create-project', { title: PROJ })
  const pid = created2.value.project.id
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(2500)
  await page.locator('.mf-orb').click()
  await sleep(900)
  await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-proj', { hasText: PROJ }).first().waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.mf-proj', { hasText: PROJ }).first().click()
  await page.locator('.mf-wstate').first().waitFor({ state: 'visible', timeout: 10000 })
  await sleep(2500)
  await page.locator('.mf-wstate').first().click()
  await page.locator('.mf-writer-session-menu').waitFor({ state: 'visible', timeout: 5000 })
  const menuText = await page.locator('.mf-writer-session-menu').innerText()
  if (menuText.includes('全部会话')) ok('会话菜单含「全部会话」区')
  else fail('会话菜单缺「全部会话」: ' + menuText.slice(0, 120))
  const sessionItems = await page.locator('.mf-writer-session-menu .mf-writer-session-item').count()
  if (sessionItems >= 2) ok('会话菜单显示历史会话项（' + sessionItems + ' 项）')
  else fail('会话菜单会话项不足: ' + sessionItems)
  if (menuText.includes('退出当前对话')) ok('会话菜单含「退出当前对话」按钮（当前已绑定会话）')
  else fail('缺「退出当前对话」按钮')

  // —— 4. 退出当前对话 ——
  const exitBtn = page.locator('.mf-writer-session-menu .mf-btn.danger', { hasText: '退出当前对话' })
  if (await exitBtn.count()) {
    await exitBtn.first().click()
    await sleep(600)
    await page.locator('.mf-wstate').first().click()
    await page.locator('.mf-writer-session-menu').waitFor({ state: 'visible', timeout: 5000 })
    const afterText = await page.locator('.mf-writer-session-menu').innerText()
    if (afterText.includes('退出当前对话')) fail('退出后「退出当前对话」仍在（绑定未解除）')
    else ok('退出当前对话：绑定已解除，菜单回到会话选择态')
  } else fail('未找到退出按钮，跳过退出验证')

  // 清理
  await call(page, 'delete-project', { projectId: pid })
  await call(page, 'delete-custom-skill', { name: CUSTOM_SKILL })
  await browser.close()
  console.log(failures === 0 ? '== V0.17 SKILLS+SESSIONS ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
