// v0.10.2 P3 验收：Git 适配器——实体写操作自动提交（节流 10s）+ 项目/链历史 + diff + 文件树回滚。
// 前置：工作区已是 git 仓库（.gitignore 只跟踪 .mofei），3088 在运行。
// 用法：$env:MOFEI_BASE='http://127.0.0.1:3088'; node tools\verify-git-history.mjs
import http from 'node:http'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ROOT = process.cwd()
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

const isGitRepo = () => new Promise((resolve) => {
  execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT }, (error, stdout) => resolve(!error && String(stdout).trim() === 'true'))
})

// 提交节流 10s：轮询直到满足条件或超时。
async function waitFor(predicate, deadlineMs = 35000, label = 'git 提交') {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) return value
    await sleep(1200)
  }
  return null
}

let projectId = null
let revertProjectId = null
try {
  if (!(await isGitRepo())) { fail('工作区不是 git 仓库（需 git init 且 .gitignore 跟踪 .mofei）') }
  else ok('工作区为 git 仓库')

  // ---- 链：保存 ×2（跨节流窗口）→ 2 个提交 + diff ----
  const { project } = await mofei('create-project', { title: 'git验收-' + String(Date.now()).slice(-6) })
  projectId = project.id
  const chainId = 'chain-verify-' + String(Date.now()).slice(-4)
  await mofei('save-prompt-chain', { projectId, chainId, name: '验收链一', content: '{{project}} {{style}}' })
  const chainFile = path.join(ROOT, '.mofei', 'projects', projectId, 'chains', `${chainId}.md`)
  try { await readFile(chainFile, 'utf8'); ok('链文件已镜像到 .mofei/projects/<id>/chains/') }
  catch (error) { fail('链文件缺失: ' + chainFile) }
  const firstChainCommit = await waitFor(async () => {
    const h = await mofei('git-history', { projectId, chainId })
    const found = h.available && h.commits.find((c) => c.subject.includes('链保存'))
    return found ? found.hash : null
  }, 35000, '首个链提交')
  if (firstChainCommit) ok('链保存立即自动提交（首提交，中文信息完好）')
  else fail('首个链提交未出现（请确认工作区为 git 仓库）')
  await mofei('save-prompt-chain', { projectId, chainId, name: '验收链二', content: '{{project}} {{style}} 修订' })
  const secondChainCommit = await waitFor(async () => {
    const h = await mofei('git-history', { projectId, chainId })
    return h.available && h.commits.filter((c) => c.subject.includes('链保存')).length >= 2 ? true : null
  }, 35000, '第二个链提交')
  if (secondChainCommit) ok('链二次保存产生第 2 个 git 提交')
  else fail('第二个链提交未出现')

  const diff = await mofei('git-diff', { projectId, chainId })
  if (diff.available && /^\+\+\+|^---|^@@/m.test(diff.patch || '') && diff.patch.includes('修订')) ok('git-diff 返回链 unified diff（含第二次修订）')
  else fail('git-diff 异常: ' + JSON.stringify(diff).slice(0, 200))

  const projectHistory = await mofei('git-history', { projectId })
  if (projectHistory.available && projectHistory.commits.length >= 2) ok('项目级 git 历史可用（' + projectHistory.commits.length + ' 条）')
  else fail('项目级 git 历史异常')

  // ---- 回滚：v1（与创建合并为一个提交）→ 跨窗口 v2 → 回滚到 v1 的提交 ----
  const { project: rp } = await mofei('create-project', { title: 'git回滚-' + String(Date.now()).slice(-6) })
  revertProjectId = rp.id
  const { chapter: rc1 } = await mofei('create-chapter', { projectId: revertProjectId, title: '回滚章' })
  await mofei('update-chapter', { projectId: revertProjectId, chapterId: rc1.id, content: '第一版内容。', expectedRevision: 1 })
  const firstCommit = await waitFor(async () => {
    const h = await mofei('git-history', { projectId: revertProjectId })
    return (h.available && h.commits.length >= 1) ? h.commits[0].hash : null
  }, 35000, 'v1 提交')
  if (!firstCommit) { fail('回滚项目 v1 提交未出现') }
  else {
    await sleep(11000) // 越过节流窗口
    await mofei('update-chapter', { projectId: revertProjectId, chapterId: rc1.id, content: '第二版内容，将被回滚。', expectedRevision: 2 })
    const secondCommit = await waitFor(async () => {
      const h = await mofei('git-history', { projectId: revertProjectId })
      return (h.available && h.commits.length >= 2) ? h.commits[0].hash : null
    }, 35000, 'v2 提交')
    if (!secondCommit) { fail('回滚项目 v2 提交未出现') }
    else {
      const revert = await mofei('git-revert-project', { projectId: revertProjectId, to: firstCommit })
      if (revert.reverted === true) ok('git-revert-project 回滚成功到 ' + String(firstCommit).slice(0, 8))
      else fail('git-revert-project 失败: ' + JSON.stringify(revert).slice(0, 200))
      const after = await mofei('read-chapter', { projectId: revertProjectId, chapterId: rc1.id })
      if (after.chapter.content.includes('第一版内容') && !after.chapter.content.includes('第二版')) ok('回滚后正文回到第一版')
      else fail('回滚后正文异常: ' + JSON.stringify(after.chapter.content.slice(0, 40)))
      if (after.chapter.revision === 1) ok('回滚后 revision 回到历史值（1）')
      else fail('回滚后 revision 异常: ' + after.chapter.revision)
    }
  }
} catch (error) {
  fail(error && error.stack || error)
} finally {
  if (projectId) { try { await mofei('delete-project', { projectId }) } catch (error) { /* noop */ } }
  if (revertProjectId) { try { await mofei('delete-project', { projectId: revertProjectId }) } catch (error) { /* noop */ } }
}

console.log(failures === 0 ? '== GIT HISTORY ALL PASS ==' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
