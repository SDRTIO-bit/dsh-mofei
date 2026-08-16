// 墨扉真实子代理写作流水线验收：主会话 agent 使用 DSH subagent 工具派 Writer 续写，
// 再派 Reviewer 审稿，最后回读章节验证正文确实由 mofei_* 工具写回。
// 用法（在 OpenFic-DSH 目录）：
//   $env:MOFEI_BASE='http://127.0.0.1:3088'; node tools\verify-subagent-pipeline.mjs
import crypto from 'node:crypto'

const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const CWD = process.cwd()
const SESSION_ID = `mofei-pipeline-${Date.now()}`
const TITLE = `流水线实测-${String(Date.now()).slice(-6)}`
const SETTING_WORDS = ['青城', '林轩', '剑意']
const TIMEOUT_MS = Number(process.env.MOFEI_AGENT_TIMEOUT || 540000)
let failures = 0
const fail = (message) => { failures += 1; console.error('FAIL: ' + message) }
const ok = (message) => console.log('PASS: ' + message)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function mofei(method, args = {}) {
  const response = await fetch(`${BASE}/api/mofei`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, args }),
  })
  const body = await response.json()
  if (!body || body.ok !== true) throw new Error(`mofei ${method}: ${JSON.stringify(body)}`)
  return body.value
}

async function rpc(method, payload = {}) {
  const message = {
    type: 'client-request',
    rpcId: crypto.randomUUID(),
    method,
    payload,
  }
  const response = await fetch(`${BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  })
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`)
  const envelope = await response.json()
  if (envelope.type !== 'server-response') throw new Error(`${method}: unexpected envelope ${envelope.type}`)
  if (envelope.rpcId !== message.rpcId) throw new Error(`${method}: rpcId mismatch`)
  if (!envelope.result.ok) throw new Error(`${method}: ${JSON.stringify(envelope.result.error)}`)
  return envelope.result.value
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.map((part) => part && part.type === 'text' ? part.text : '').filter(Boolean).join('\n')
}

function eventLog(events) {
  const lines = []
  for (const entry of events || []) {
    const event = entry.event
    const data = event.data || {}
    if (event.type === 'assistant/chunk') continue
    if (event.type === 'tool/call') lines.push(`  tool/call: ${data.name || '?'}`)
    else if (event.type === 'tool/result') lines.push(`  tool/result: ${textOf(data.message && data.message.content).slice(0, 300)}`)
    else if (event.type === 'assistant/message') lines.push(`  assistant/message: ${textOf(data.message && data.message.content).slice(0, 400)}`)
    else if (event.type === 'turn/start' || event.type === 'turn/end' || event.type === 'step/start' || event.type === 'step/end') lines.push(`  ${event.type}: ${JSON.stringify(data).slice(0, 160)}`)
    else lines.push(`  ${event.type}`)
  }
  return lines.join('\n')
}

let projectId = null
try {
  // 0. 清理历史同名临时项目，避免前次中断残留
  const existing = await mofei('list-projects', {})
  for (const item of existing.projects || []) {
    if (item.title && item.title.startsWith('流水线实测-')) {
      await mofei('delete-project', { projectId: item.id })
      console.log('INFO: 清理历史临时项目 ' + item.title)
    }
  }

  // 1. 数据准备：临时项目 + 1 章 + 1 角色
  const { project } = await mofei('create-project', { title: TITLE })
  projectId = project.id
  const { chapter } = await mofei('create-chapter', { projectId, title: '第一章' })
  const chapterId = chapter.id
  await mofei('create-character', { projectId, name: '林轩', description: '主角，青城剑修，擅长剑意。' })
  const initialContent = '青城山门在晨雾中若隐若现。\n林轩背着木剑，第一次踏上问剑石阶。'
  await mofei('update-chapter', { projectId, chapterId, content: initialContent, expectedRevision: chapter.revision })
  ok(`临时项目已建：${TITLE} / chapter=${chapterId}`)

  // 2. 主会话派两个同步 subagent
  const created = await rpc('session.create', { cwd: CWD, sessionId: SESSION_ID, agentPreset: 'mofei-writer' })
  const sessionId = created.sessionId
  ok(`主会话已建：${sessionId}`)

  const before = await rpc('session.history', { sessionId })
  const beforeSeq = before.events.length ? before.events[before.events.length - 1].event.seq : 0

  const writerPrompt = [
    '你是 Writer。项目 id 是 ' + projectId + '，章节 id 是 ' + chapterId + '。',
    '1) 调用 mofei_list-characters 读角色设定；',
    '2) 调用 mofei_read-chapter 读章节当前内容与 revision；',
    '3) 续写 200-400 字正文，必须自然使用并保留这些设定词：青城、林轩、剑意；',
    '4) 调用 mofei_update-chapter 提交完整正文（expectedRevision 必须等于刚才读取到的 revision）。',
    '完成后只输出一行 JSON：{"status":"done","revision":<提交后的 revision>}。',
  ].join('\n')
  const reviewerPrompt = [
    '你是 Reviewer。项目 id 是 ' + projectId + '，章节 id 是 ' + chapterId + '。',
    '1) 调用 mofei_read-chapter 读章节全文；',
    '2) 调用 mofei_search-chapters 检查设定词：青城、林轩、剑意；',
    '3) 不得修改正文；若所有设定词均存在且用法一致，只输出一行 JSON {"verdict":"PASS"}；',
    '   否则输出 {"verdict":"ISSUES","issues":["..."]}。',
  ].join('\n')

  const promptText = [
    '请严格按以下步骤执行，不要自己直接调用 mofei_* 修改章节。',
    '第一步：调用 subagent 工具启动 Writer 子代理。参数：description="Writer 续写"，run_in_background=false，prompt 如下：',
    '---WRITER PROMPT BEGIN---',
    writerPrompt,
    '---WRITER PROMPT END---',
    '第二步：拿到 Writer 结果后，调用 subagent 工具启动 Reviewer 子代理。参数：description="Reviewer 审稿"，run_in_background=false，prompt 如下：',
    '---REVIEWER PROMPT BEGIN---',
    reviewerPrompt,
    '---REVIEWER PROMPT END---',
    '第三步：两个子代理都结束后，最后只输出一行 JSON：{"writer":<Writer 输出的 JSON 字符串>,"reviewer":<Reviewer 输出的 JSON 字符串>}。',
  ].join('\n')

  const accepted = await rpc('session.prompt', {
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: promptText }],
  })
  if (accepted && accepted.accepted === true) ok('主会话流水线指令已入队')
  else fail('session.prompt 未接受: ' + JSON.stringify(accepted))

  const startedAt = Date.now()
  let events = []
  let done = false
  let lastLog = ''
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await sleep(5000)
    const history = await rpc('session.history', { sessionId })
    events = history.events
    const after = events.filter((entry) => entry.event.seq > beforeSeq)
    const turnEnds = after.filter((entry) => entry.event.type === 'turn/end')
    if (turnEnds.length > 0) { done = true; break }
    const current = eventLog(after)
    if (current !== lastLog) {
      console.log('INFO: agent activity so far:\n' + current)
      lastLog = current
    }
  }
  if (!done) fail(`主会话在 ${TIMEOUT_MS}ms 内未结束 turn`)

  const after = events.filter((entry) => entry.event.seq > beforeSeq)
  console.log('INFO: final events:\n' + eventLog(after))

  const subagentCalls = after.filter((entry) => entry.event.type === 'tool/call' && entry.event.data && entry.event.data.name === 'subagent')
  if (subagentCalls.length >= 2) ok(`主会话派生了 ${subagentCalls.length} 个 subagent（Writer+Reviewer）`)
  else fail(`subagent 调用次数应为至少 2，实际 ${subagentCalls.length}`)
  for (const call of subagentCalls) {
    const args = call.event.data.arguments || {}
    console.log(`INFO: subagent call: ${args.description || ''} background=${args.run_in_background}`)
  }

  const subagentResults = after.filter((entry) => entry.event.type === 'tool/result' && textOf(entry.event.data && entry.event.data.message && entry.event.data.message.content).includes(''))
  const resultText = subagentResults.map((entry) => textOf(entry.event.data.message && entry.event.data.message.content)).join('\n')
  console.log('INFO: subagent 工具返回汇总:\n' + resultText.slice(0, 6000))

  const messages = after.filter((entry) => entry.event.type === 'assistant/message').map((entry) => {
    const data = entry.event.data || {}
    return textOf(data.content || (data.message && data.message.content))
  }).join('\n')
  console.log('INFO: 主 agent 最终消息:\n' + messages.slice(0, 4000))

  // 3. 回读项目，确认正文真的被 Writer 通过 mofei_update-chapter 写回
  const { projects } = await mofei('list-projects', {})
  const currentProject = projects.find((item) => item.id === projectId)
  const currentChapter = currentProject && currentProject.chapters.find((item) => item.id === chapterId)
  if (!currentChapter) fail('临时章节消失')
  else {
    const content = currentChapter.content || ''
    const revision = currentChapter.revision || 0
    console.log(`INFO: 章节 revision=${revision}，字数=${content.length}`)
    if (revision > 1) ok(`Writer 已提交修订：revision ${revision}`)
    else fail('章节 revision 未增长，Writer 可能没有写回')
    if (content.length > initialContent.length + 80) ok('章节正文明显变长（续写已写入）')
    else fail(`章节正文长度异常：${content.length}`)
    const missing = SETTING_WORDS.filter((word) => !content.includes(word))
    if (missing.length === 0) ok('设定词青城/林轩/剑意全部保留')
    else fail('缺失设定词: ' + missing.join(', '))
    const search = await mofei('search-chapters', { projectId, query: '剑意' })
    const hit = search.results && search.results.some((item) => item.chapterId === chapterId)
    if (hit) ok('Reviewer 检查路径 mofei_search-chapters 可命中剑意')
    else fail('mofei_search-chapters 未命中剑意')
  }

  const reviewerPass = resultText.includes('PASS') || messages.includes('PASS')
  if (reviewerPass) ok('Reviewer 结论含 PASS')
  else console.log('INFO: Reviewer 结论未直接含 PASS（以回读结果为准）')
} catch (error) {
  fail(error && error.stack || error)
} finally {
  if (projectId) {
    try {
      await mofei('delete-project', { projectId })
      console.log('INFO: 临时项目已删除')
    } catch (error) {
      console.error('WARN: 删除临时项目失败: ' + (error && error.message))
    }
  }
}

console.log(failures === 0 ? '== SUBAGENT PIPELINE ALL PASS ==' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
