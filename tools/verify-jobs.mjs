// v0.10.2 P3 验收：DSH Jobs 集成——摘要后台任务（启动/进度/完成回填/取消）。
// 前置：3088 运行（novel profile），模型可用（LLM）。
// 用法：$env:MOFEI_BASE='http://127.0.0.1:3088'; node tools\verify-jobs.mjs
import http from 'node:http'

const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
let failures = 0
const fail = (m) => { failures += 1; console.error('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function mofei(method, args = {}) {
  const payload = JSON.stringify({ method, args })
  const body = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: new URL(BASE).hostname, port: new URL(BASE).port || 80, path: '/api/mofei', method: 'POST', headers: { 'content-type': 'application/json', connection: 'close' } }, (res) => {
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

async function waitForJob(jobId, deadlineMs = 120000) {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    const result = await mofei('job-result-mofei', { jobId })
    if (result.status === 'completed' || result.status === 'failed' || result.status === 'killed') return result
    await sleep(1500)
  }
  return null
}

let projectId = null
let killProjectId = null
try {
  const { project } = await mofei('create-project', { title: 'jobs验收-' + String(Date.now()).slice(-6) })
  projectId = project.id
  const { chapter: c1 } = await mofei('create-chapter', { projectId, title: '第一章' })
  await mofei('update-chapter', { projectId, chapterId: c1.id, content: '林轩站在青城山门，山风灌入袖口。他握紧长剑。', expectedRevision: 1 })
  const { chapter: c2 } = await mofei('create-chapter', { projectId, title: '第二章' })
  await mofei('update-chapter', { projectId, chapterId: c2.id, content: '雪落无声，剑光破空。少年回望山门。', expectedRevision: 1 })

  // ---- 启动章节摘要后台任务 ----
  const started = await mofei('job-start-summarize', { projectId, kind: 'chapters' })
  if (!started.jobId) {
    if (started.error === 'JOBS_UNAVAILABLE') { fail('jobs 服务不可用：' + (started.reason || '')) }
    else fail('启动失败: ' + JSON.stringify(started))
  } else {
    ok('job-start-summarize 返回 jobId=' + started.jobId)
    const list = await mofei('job-list-mofei', {})
    const entry = (list.jobs || []).find((j) => j.id === started.jobId)
    if (entry && entry.status === 'running') ok('job-list-mofei 可见运行中任务（label=' + entry.label + '）')
    else fail('任务列表异常: ' + JSON.stringify(list.jobs && list.jobs[0]))
    const done = await waitForJob(started.jobId)
    if (done && done.status === 'completed') {
      ok('任务完成（completed）')
      if (Array.isArray(done.summaries) && done.summaries.length === 2) ok('job-result 回填 2 条章节摘要')
      else fail('摘要条数异常: ' + JSON.stringify(done.summaries && done.summaries.length))
    } else fail('任务未完成: ' + JSON.stringify(done))
    // 再次运行应全部 fresh（0 条重算）——顺带验证幂等
    const again = await mofei('job-start-summarize', { projectId, kind: 'chapters' })
    if (again.jobId) {
      const done2 = await waitForJob(again.jobId)
      if (done2 && done2.status === 'completed' && done2.summaries.length === 0) ok('重复运行全部 fresh（0 条重算，幂等）')
      else fail('幂等异常: ' + JSON.stringify(done2 && done2.summaries && done2.summaries.length))
    }
  }

  // ---- 取消路径 ----
  const { project: kp } = await mofei('create-project', { title: 'jobs取消-' + String(Date.now()).slice(-6) })
  killProjectId = kp.id
  const { chapter: kc } = await mofei('create-chapter', { projectId: killProjectId, title: '取消章' })
  await mofei('update-chapter', { projectId: killProjectId, chapterId: kc.id, content: '很长的一段正文，用于取消测试。'.repeat(50), expectedRevision: 1 })
  const killStart = await mofei('job-start-summarize', { projectId: killProjectId, kind: 'chapters' })
  if (killStart.jobId) {
    await sleep(300)
    const killed = await mofei('job-kill-mofei', { jobId: killStart.jobId })
    if (killed.killed === true) ok('job-kill-mofei 请求成功')
    else fail('取消请求失败: ' + JSON.stringify(killed))
    const done3 = await waitForJob(killStart.jobId, 30000)
    if (done3 && (done3.status === 'killed' || done3.status === 'failed')) ok('任务终止（' + done3.status + '，' + (done3.error || '用户取消') + '）')
    else fail('任务未按预期终止: ' + JSON.stringify(done3))
  } else {
    console.log('INFO: 取消路径跳过（jobs 不可用或启动失败）')
  }
} catch (error) {
  fail(error && error.stack || error)
} finally {
  if (projectId) { try { await mofei('delete-project', { projectId }) } catch (error) { /* noop */ } }
  if (killProjectId) { try { await mofei('delete-project', { projectId: killProjectId }) } catch (error) { /* noop */ } }
}

console.log(failures === 0 ? '== JOBS ALL PASS ==' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
