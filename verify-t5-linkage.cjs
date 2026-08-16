// v0.12.1 T5 联动冒烟：@提及跳转章节 + 回复插入正文 + 预设选择器（多预设时）。
const { chromium } = require('C:/Users/zhao/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright')
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ts = String(Date.now()).slice(-6)
const PROJ = 'T5联动-' + ts
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
  await page.waitForSelector('.mf-panel.mf-view', { state: 'visible', timeout: 20000 })

  // 种子：项目 + 章节（RPC），随后刷新让 bootstrap 拉到
  await call(page, 'create-project', { title: PROJ }).then(async (r) => {
    const pid = r.value.project.id
    const ch = await call(page, 'create-chapter', { projectId: pid, title: '第一章' })
    await call(page, 'update-chapter', { projectId: pid, chapterId: ch.value.chapter.id, content: '青城。林轩。剑意。', expectedRevision: 1 })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.mf-panel.mf-view', { state: 'visible', timeout: 20000 })
    await page.waitForSelector('.mf-proj', { state: 'visible', timeout: 20000 })
    await sleep(1000)

    // 1. 发送带 @提及 格式的用户消息（projectId/chapterId）——右气泡内输入框
    const composer = page.locator('.mf-chat-input textarea').first()
    await composer.waitFor({ state: 'visible', timeout: 15000 })
    const mention = '【墨扉 · 项目《' + PROJ + '》 · 章节《第一章》】\nprojectId: ' + pid + '\nchapterId: ' + ch.value.chapter.id + '\n范围: 整章\n---\n请只回复两个字：收到\n---'
    await composer.fill(mention)
    await composer.press('Enter')

    // 2. 用户气泡出现「📄 跳转章节」
    await page.locator('.mf-chat-msg.user').first().waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('.mf-chat-msg.user .mf-chat-jump').first().waitFor({ state: 'visible', timeout: 5000 })
    ok('提及消息显示「跳转章节」按钮')

    // 3. 等待助手回复完成 → 「↓ 插入正文」出现
    await page.waitForFunction(() => {
      const body = document.querySelector('.mf-chat-body')
      if (!body) return false
      const msgs = body.querySelectorAll('.mf-chat-msg.assistant')
      const last = msgs[msgs.length - 1]
      return last && !last.textContent.includes('正在输入') && !last.textContent.includes('▌') && last.textContent.trim().length > 0
    }, { timeout: 120000 })
    await page.locator('.mf-chat-msg.assistant .mf-chat-jump').first().waitFor({ state: 'visible', timeout: 5000 })
    ok('助手回复显示「插入正文」按钮')

    // 4. 点击「跳转章节」→ 编辑器打开该章节
    await page.locator('.mf-chat-msg.user .mf-chat-jump').first().click()
    await page.waitForFunction((expected) => {
      const input = document.querySelector('.mf-title-input')
      return input && input.value === expected
    }, '第一章', { timeout: 10000 })
    const editorVal = await page.locator('textarea.mf-text').inputValue()
    if (editorVal.includes('青城')) ok('跳转章节成功：编辑器打开《第一章》')
    else fail('章节正文异常: ' + editorVal.slice(0, 40))

    // 5. 点击「插入正文」→ 回复文本插入光标处
    const assistantTexts = await page.locator('.mf-chat-msg.assistant').allInnerTexts()
    const reply = (assistantTexts[assistantTexts.length - 1] || '').replace('↓ 插入正文', '').trim()
    await page.locator('.mf-chat-msg.assistant .mf-chat-jump').first().click()
    await page.waitForFunction((text) => document.querySelector('textarea.mf-text').value.includes(text), reply.slice(0, 20), { timeout: 5000 })
    ok('回复已插入正文：' + reply.slice(0, 20))

    // 清理
    await call(page, 'delete-project', { projectId: pid })
  })

  await browser.close()
  console.log(failures === 0 ? '== T5 LINKAGE ALL PASS ==' : failures + ' FAILURES')
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('SCRIPT ERROR: ' + (e && e.stack || e)); process.exit(2) })
