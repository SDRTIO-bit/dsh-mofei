// v0.10.1 P1 验收：结构化检索（retrieve）+ 风格注入（style 覆盖 ai-assist/链/项目级覆盖/CRUD 校验）。
// 用法：$env:MOFEI_BASE='http://127.0.0.1:3088'; node tools\verify-retrieve-style.mjs
import http from 'node:http'
import { performance } from 'node:perf_hooks'

const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const HOST = new URL(BASE).hostname
const PORT = new URL(BASE).port || 80
const TITLE = '检索风格验收-' + String(Date.now()).slice(-6)
let failures = 0
const fail = (m) => { failures += 1; console.error('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)

async function mofei(method, args = {}) {
  const payload = JSON.stringify({ method, args })
  const body = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: HOST, port: PORT, path: '/api/mofei', method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.end(payload)
  })
  const parsed = JSON.parse(body)
  if (!parsed || parsed.ok !== true) throw new Error(`${method}: ${JSON.stringify(parsed).slice(0, 300)}`)
  return parsed.value
}

const CHAR_POOL = '林轩山风剑光雪夜城楼孤影灯火青衫行舟江湖恩怨情仇少年意气长歌当哭铁马冰河梦回吹角连营八百里分麾下炙五十弦翻塞外声沙场秋点兵'
function generateText(length) {
  let out = ''
  while (out.length < length) out += CHAR_POOL
  return out.slice(0, length)
}

let projectId = null
let bigProjectId = null
try {
  // ---- 检索：结构化命中（章节/角色/笔记/世界书/摘要） ----
  const { project } = await mofei('create-project', { title: TITLE })
  projectId = project.id
  const { chapter } = await mofei('create-chapter', { projectId, title: '第一章' })
  await mofei('update-chapter', { projectId, chapterId: chapter.id, content: '林轩站在青城山门，山风灌入袖口。\n他握紧长剑，剑锋映着雪光。', expectedRevision: 1 })
  const { character } = await mofei('create-character', { projectId, name: '林轩', description: '青城山弟子，佩剑名青霜。' })
  const { note } = await mofei('create-note', { projectId, title: '设定笔记' })
  await mofei('update-note', { projectId, noteId: note.id, title: '设定笔记', content: '青霜剑乃掌门所赠，剑鞘刻有云纹。' })
  const { entry } = await mofei('create-world-entry', { projectId, name: '青城山', keys: ['青城'], content: '蜀中名山，剑派驻地。' })
  await mofei('save-chapter-summary', { projectId, chapterId: chapter.id, summary: '林轩夜登山门，风雪将至。' })

  const r1 = await mofei('retrieve', { projectId, query: '林轩' })
  const chapterHit = r1.results.find((item) => item.entityType === 'chapter' && item.entityId === chapter.id)
  const characterHit = r1.results.find((item) => item.entityType === 'character' && item.entityId === character.id)
  if (chapterHit && typeof chapterHit.line === 'number' && typeof chapterHit.snippet === 'string' && typeof chapterHit.score === 'number') ok('retrieve 章节命中：entityType/entityId/行号/snippet/score 齐备')
  else fail('retrieve 章节命中缺失: ' + JSON.stringify(r1.results.slice(0, 3)))
  if (characterHit) ok('retrieve 角色命中（名称+描述入索引）：' + characterHit.title)
  else fail('retrieve 角色未命中')

  const r2 = await mofei('retrieve', { projectId, query: '青霜' })
  if (r2.results.some((item) => item.entityType === 'note' && item.entityId === note.id)) ok('retrieve 笔记命中')
  else fail('retrieve 笔记未命中')
  const r2b = await mofei('retrieve', { projectId, query: '青城' })
  if (r2b.results.some((item) => item.entityType === 'world' && item.entityId === entry.id)) ok('retrieve 世界书命中（名称入索引）')
  else fail('retrieve 世界书未命中')
  const r3 = await mofei('retrieve', { projectId, query: '风雪' })
  if (r3.results.some((item) => item.entityType === 'summary')) ok('retrieve 摘要命中')
  else fail('retrieve 摘要未命中: ' + JSON.stringify(r3.results))

  // 检索为空查询与 limit 边界
  const rEmpty = await mofei('retrieve', { projectId, query: '' })
  if (Array.isArray(rEmpty.results) && rEmpty.results.length === 0) ok('retrieve 空查询返回空结果')
  else fail('retrieve 空查询异常')

  // ---- 检索性能：百万字项目热查询 < 500ms ----
  const bigText = []
  for (let i = 1; i <= 100; i += 1) bigText.push('第' + i + '章 风起\n' + generateText(10000))
  const { project: bigProject, chapterCount } = await mofei('import-txt-confirm', { title: TITLE + '-百万字', content: bigText.join('\n') })
  bigProjectId = bigProject.id
  if (chapterCount === 100) ok('百万字测试项目导入（100 章 × 1 万字）')
  else fail('百万字测试项目章节数异常: ' + chapterCount)
  const coldStart = performance.now()
  const cold = await mofei('retrieve', { projectId: bigProjectId, query: '山风', limit: 10 })
  const coldMs = Math.round(performance.now() - coldStart)
  console.log('INFO: 百万字项目冷查询（含建索引）' + coldMs + 'ms，命中 ' + cold.total)
  const warmTimes = []
  for (let i = 0; i < 3; i += 1) {
    const start = performance.now()
    const warm = await mofei('retrieve', { projectId: bigProjectId, query: '剑光', limit: 10 })
    warmTimes.push(Math.round(performance.now() - start))
    if (warm.results.length === 0) fail('百万字项目热查询无结果')
  }
  const maxWarm = Math.max(...warmTimes)
  if (maxWarm < 500) ok('百万字项目热检索 < 500ms（' + warmTimes.join('/') + 'ms）')
  else fail('百万字项目热检索超时: ' + warmTimes.join('/') + 'ms')

  // ---- 风格：CRUD + 校验 + 项目级覆盖 + 链宏注入 ----
  const styleId = 'verify-style-' + String(Date.now()).slice(-4)
  await mofei('save-style', { styleId, name: '验证风格', description: '验收用', tags: ['测试'], content: '每句不超过十五字。' })
  const listStyles = await mofei('list-styles', {})
  if (listStyles.styles.some((item) => item.id === styleId)) ok('save-style 全局写入并出现在列表')
  else fail('save-style 后列表缺失: ' + styleId)
  const gotStyle = await mofei('get-style', { styleId })
  if (gotStyle.style && gotStyle.style.name === '验证风格' && gotStyle.style.tags.includes('测试')) ok('get-style 读取 frontmatter（name/tags）')
  else fail('get-style 异常: ' + JSON.stringify(gotStyle))

  await mofei('set-project-style', { projectId, styleId })
  const contextStyled = await mofei('chapter-context', { projectId, chapterId: chapter.id })
  if ((contextStyled.contextText || '').includes('【当前写作风格：验证风格】') && contextStyled.contextText.includes('每句不超过十五字')) ok('风格注入章节上下文')
  else fail('风格未注入章节上下文: ' + JSON.stringify((contextStyled.contextText || '').slice(0, 80)))

  // 项目级 styles/ 覆盖全局
  await mofei('save-style', { scope: 'project', projectId, styleId, name: '项目版验证风格', content: '项目级：短句。' })
  const projectStyle = await mofei('get-style', { styleId, projectId })
  if (projectStyle.scope === 'project' && projectStyle.style.name === '项目版验证风格') ok('项目级 styles/ 覆盖生效')
  else fail('项目级风格覆盖失败: ' + JSON.stringify(projectStyle))
  const contextOverridden = await mofei('chapter-context', { projectId, chapterId: chapter.id })
  if (contextOverridden.contextText.includes('项目级：短句')) ok('项目级风格注入章节上下文（覆盖全局）')
  else fail('项目级风格未注入')

  // 链 {{style}} 宏注入当前风格
  const chainId = 'verify-chain-' + String(Date.now()).slice(-4)
  await mofei('save-prompt-chain', { projectId, chainId, name: '验证链', content: '请按风格{{style}}续写：{{chapterText}}' })
  const compiled = await mofei('compile-prompt-chain', { projectId, chainId, chapterId: chapter.id })
  if ((compiled.prompt || '').includes('项目级：短句')) ok('{{style}} 宏注入项目级风格')
  else fail('{{style}} 宏未注入: ' + JSON.stringify((compiled.prompt || '').slice(0, 80)))

  // 错误码校验
  const unknownGet = await mofei('get-style', { styleId: 'no-such-style-xyz' })
  if (unknownGet.error === 'STYLE_NOT_FOUND') ok('get-style 未知风格返回 STYLE_NOT_FOUND')
  else fail('get-style 错误码异常: ' + JSON.stringify(unknownGet))
  const unknownSet = await mofei('set-project-style', { projectId, styleId: 'no-such-style-xyz' })
  if (unknownSet.error === 'STYLE_NOT_FOUND') ok('set-project-style 未知风格返回 STYLE_NOT_FOUND')
  else fail('set-project-style 错误码异常: ' + JSON.stringify(unknownSet))
  const missingStyleId = await mofei('save-style', { name: '无名' })
  if (missingStyleId.error === 'STYLE_REQUIRED') ok('save-style 缺 styleId 返回 STYLE_REQUIRED')
  else fail('save-style 错误码异常: ' + JSON.stringify(missingStyleId))

  // ai-assist 风格注入（尽力而为：LLM 可用则断言 styleId 透传）
  try {
    const assist = await mofei('ai-assist', { projectId, chapterId: chapter.id, mode: 'continue' })
    if (assist.styleId === styleId && assist.styleName === '项目版验证风格') ok('ai-assist 携带当前风格（styleId/styleName 透传）')
    else fail('ai-assist 风格透传异常: ' + JSON.stringify({ styleId: assist.styleId, styleName: assist.styleName, error: assist.error }))
  } catch (error) {
    if (String(error && error.message || error).includes('LLM_UNAVAILABLE')) console.log('INFO: ai-assist 跳过（LLM 不可用，已由链路透传与上下文注入覆盖）')
    else fail('ai-assist 调用异常: ' + String(error && error.message || error))
  }

  await mofei('delete-style', { styleId, scope: 'project', projectId })
  await mofei('delete-style', { styleId })
  const afterDelete = await mofei('get-style', { styleId })
  if (afterDelete.error === 'STYLE_NOT_FOUND') ok('delete-style 后 get-style 返回 STYLE_NOT_FOUND')
  else fail('delete-style 后仍存在: ' + JSON.stringify(afterDelete))

  // ---- v0.10.2 B：分级上下文（mid=前情章摘要 / far=区间摘要）+ 检索卷字段 ----
  const { chapter: later } = await mofei('create-chapter', { projectId, title: '后续章' })
  await mofei('save-chapter-summary', { projectId, chapterId: chapter.id, summary: '林轩入门摘要：夜登青城。' })
  await mofei('save-range-summary', { projectId, rangeId: 'range-tier', chapterIds: [chapter.id, later.id], summary: '区间摘要：入门至后续。' })
  const tiered = await mofei('chapter-context', { projectId, chapterId: later.id })
  if ((tiered.contextText || '').includes('前情摘要（mid）') && (tiered.contextText || '').includes('区间摘要（far）')) ok('分级上下文：mid 章摘要 + far 区间摘要注入')
  else fail('分级上下文缺失: ' + JSON.stringify((tiered.contextText || '').slice(0, 120)))
  const volRetrieve = await mofei('retrieve', { projectId, query: '林轩' })
  const volHit = volRetrieve.results.find((h) => h.entityType === 'chapter')
  if (volHit && 'volumeId' in volHit && 'volumeTitle' in volHit) ok('检索命中携带 volumeId/volumeTitle（可客户端按卷分组）')
  else fail('检索命中缺少卷字段: ' + JSON.stringify(volHit))

  await mofei('delete-project', { projectId })
  projectId = null
  await mofei('delete-project', { projectId: bigProjectId })
  bigProjectId = null
} catch (error) {
  fail(error && error.stack || error)
} finally {
  if (projectId) { try { await mofei('delete-project', { projectId }) } catch (error) { /* noop */ } }
  if (bigProjectId) { try { await mofei('delete-project', { projectId: bigProjectId }) } catch (error) { /* noop */ } }
}

console.log(failures === 0 ? '== RETRIEVE + STYLE ALL PASS ==' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
