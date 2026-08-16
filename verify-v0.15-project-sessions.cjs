// v0.15: 每本小说项目拥有独立 mofei-writer 会话；绝不复用 DSH 开发会话。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const stamp = String(Date.now()).slice(-6)
const firstTitle = 'v15项目会话-A-' + stamp
const secondTitle = 'v15项目会话-B-' + stamp
let failures = 0
const fail = (message) => { failures += 1; console.log('FAIL: ' + message) }
const ok = (message) => console.log('PASS: ' + message)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  page.on('pageerror', (error) => console.log('PAGEERROR:', error.message.slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.mf-orb').waitFor({ state: 'visible', timeout: 30000 })

  const request = (url, body) => page.evaluate(async ({ url, body }) => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return response.json()
  }, { url, body })
  const mofei = async (method, args) => {
    const response = await request('/api/mofei', { method, args: args || {} })
    return response && response.value
  }
  const dsh = async (method, payload) => {
    const response = await request('/api/' + method, { type: 'client-request', rpcId: 'mf-v15-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), method, payload })
    return (response && response.result && response.result.value) || (response && response.value) || response
  }
  const waitForWriterSession = async (projectId) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const mapped = await mofei('writer-session', { projectId })
      if (mapped && mapped.sessionId) return mapped.sessionId
      await sleep(250)
    }
    return null
  }
  const cleanup = async () => {
    const listed = await mofei('list-projects', {})
    for (const project of (listed && listed.projects) || []) {
      if (project.title === firstTitle || project.title === secondTitle) await mofei('delete-project', { projectId: project.id })
    }
  }

  try {
    await cleanup()
    const first = await mofei('create-project', { title: firstTitle })
    const second = await mofei('create-project', { title: secondTitle })
    if (!first || !second || !first.project || !second.project) throw new Error('无法创建验证项目')

    const before = await dsh('session.list', {})
    const beforeById = new Map(((before && before.items) || []).map((item) => [item.sessionId, item.agentPreset]))

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('.mf-orb').click()
    await page.locator('.mf-panel.mf-view').waitFor({ state: 'visible', timeout: 10000 })

    await page.locator('.mf-proj', { hasText: firstTitle }).first().click()
    const firstSessionId = await waitForWriterSession(first.project.id)
    if (firstSessionId) ok('打开项目 A 自动创建并绑定专属写作会话')
    else fail('项目 A 没有绑定写作会话')

    await page.locator('.mf-back').click()
    await page.locator('.mf-proj', { hasText: secondTitle }).first().click()
    const secondSessionId = await waitForWriterSession(second.project.id)
    if (secondSessionId) ok('打开项目 B 自动创建并绑定专属写作会话')
    else fail('项目 B 没有绑定写作会话')
    if (firstSessionId && secondSessionId && firstSessionId !== secondSessionId) ok('两本小说没有共享 DSH 会话')
    else fail('项目会话隔离失败: ' + firstSessionId + ' / ' + secondSessionId)

    const sessions = await dsh('session.list', {})
    const byId = new Map(((sessions && sessions.items) || []).map((item) => [item.sessionId, item]))
    if (byId.get(firstSessionId) && byId.get(firstSessionId).agentPreset === 'mofei-writer' && byId.get(secondSessionId) && byId.get(secondSessionId).agentPreset === 'mofei-writer') ok('两个项目会话均为 mofei-writer 预设')
    else fail('项目会话未使用 mofei-writer 预设')

    const unchanged = [...beforeById.entries()].every(([sessionId, preset]) => byId.has(sessionId) && byId.get(sessionId).agentPreset === preset)
    if (unchanged) ok('既有 DSH 会话未被切换或重写')
    else fail('既有 DSH 会话的预设发生变化')

    const writerMenu = page.locator('.mf-wstate')
    await writerMenu.click()
    const menuText = await page.locator('.mf-writer-session-menu').innerText()
    if (menuText.includes(secondTitle) && menuText.includes('项目专属写作会话')) ok('会话菜单只呈现当前小说的专属写作会话')
    else fail('项目会话菜单文案异常: ' + menuText.slice(0, 160))
  } finally {
    await cleanup()
    await browser.close()
  }

  console.log(failures === 0 ? '== V0.15 PROJECT SESSIONS ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => { console.error('SCRIPT ERROR: ' + (error && error.stack || error)); process.exit(2) })
