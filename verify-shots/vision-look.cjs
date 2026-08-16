// 视觉图审（复用工具）：调本地 OpenAI 兼容端点（key=1）的 deepseek-v4-vision 看图。
// 用法：node verify-shots/vision-look.cjs <图片路径...> ["提示词"]
// 提示词缺省 = 通用三问（布局配色/对话面板细节/UI 问题）
const fs = require('fs')
const path = require('path')
const BASE = process.env.VISION_BASE || 'http://127.0.0.1:5001/v1'
const KEY = process.env.VISION_KEY || '1'
const MODEL = process.env.VISION_MODEL || 'deepseek-v4-vision-nothinking'

const args = process.argv.slice(2)
const resolveArg = (a) => (fs.existsSync(a) ? a : path.resolve(__dirname, '..', a))
// 文件 = 直接可解析或相对脚本上一级可解析的参数；其余第一个参数视为提示词
const files = args.filter((a) => fs.existsSync(a) || fs.existsSync(path.resolve(__dirname, '..', a))).map(resolveArg)
const DEFAULT_PROMPT = 'Reply in English. For each screenshot, describe concisely: 1) overall layout and color scheme 2) message bubbles / input card colors and whether text is clearly readable 3) any obvious UI problems (illegible text, misalignment, jarring styles). Number the points, separate each image.'
const custom = args.find((a) => !fs.existsSync(a))
const prompt = custom || DEFAULT_PROMPT

if (!files.length) { console.error('未找到图片文件。用法：node vision-look.cjs <图1> [图2...] ["提示词"]'); process.exit(2) }

async function look(file) {
  const b64 = fs.readFileSync(file).toString('base64')
  const body = {
    model: MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } },
      ],
    }],
    max_tokens: 700,
  }
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200))
  const j = await r.json()
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '(无内容)'
}

;(async () => {
  for (const f of files) {
    console.log('\n===== ' + path.basename(f) + ' =====')
    try { console.log(await look(f)) } catch (e) { console.error('读图失败: ' + e.message) }
  }
})().catch((e) => { console.error(e); process.exit(2) })