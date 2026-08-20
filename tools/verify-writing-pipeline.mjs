// 子代理写作流水线数据路径冒烟（Writer → Reviewer → 冲突保护）。
// 用真实 /api/mofei RPC 模拟 AGENTS.md 的 Writer/Reviewer 流程；
// 真实 subagent + mofei_* 工具的流水线实测需在 DSH 重启加载新工具 schema 后执行。
import http from 'node:http'

// 墨扉写作环境固定使用 novel profile 的 3088；需要覆盖时显式设置 MOFEI_BASE。
const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ts = String(Date.now()).slice(-6)
const TITLE = '流水线验证-' + ts

async function rpc(method, args) {
  const payload = JSON.stringify({ method, args: args || {} })
  const body = await new Promise((resolve, reject) => {
    const req = http.request(BASE + '/api/mofei', {
      method: 'POST',
      headers: { 'content-type': 'application/json', connection: 'close' },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.end(payload)
  })
  const parsed = JSON.parse(body)
  if (!parsed || parsed.ok !== true) throw new Error((parsed && parsed.error) || 'rpc failed')
  return parsed.value
}

let failures = 0
function fail(message) { failures += 1; console.error('FAIL: ' + message) }
function ok(message) { console.log('PASS: ' + message) }

const { project } = await rpc('create-project', { title: TITLE })
const projectId = project.id
const { chapter } = await rpc('create-chapter', { projectId, title: '第一章' })

// Writer：写正文（expectedRevision 保护）
const written = await rpc('update-chapter', {
  projectId,
  chapterId: chapter.id,
  content: '林轩站在青城山门前，剑已在手。',
  expectedRevision: chapter.revision,
})
if (written && written.saved === true) ok('Writer 写入正文')
else fail('Writer 写入失败: ' + JSON.stringify(written))

// Reviewer：全文搜索设定词
const search = await rpc('search-chapters', { projectId, query: '林轩' })
const hit = search.results && search.results.some((item) => item.chapterId === chapter.id)
if (hit) ok('Reviewer 搜索命中设定词')
else fail('Reviewer 搜索未命中')

// 冲突保护：用旧 revision 再写
const conflict = await rpc('update-chapter', { projectId, chapterId: chapter.id, content: '覆盖失败的内容', expectedRevision: chapter.revision })
if (conflict && conflict.conflict === true) ok('expectedRevision 冲突保护生效')
else fail('冲突保护失效: ' + JSON.stringify(conflict))

// 合并重写（读最新 revision 后提交）
const { projects } = await rpc('list-projects', {})
const latest = projects.find((item) => item.id === projectId).chapters.find((item) => item.id === chapter.id)
const merged = await rpc('update-chapter', {
  projectId,
  chapterId: chapter.id,
  content: latest.content + '\n他沿着石阶向山门走去。',
  expectedRevision: latest.revision,
})
if (merged && merged.saved === true) ok('Writer 合并后按新 revision 提交')
else fail('合并提交失败: ' + JSON.stringify(merged))

await rpc('delete-project', { projectId })
console.log(failures === 0 ? '== PIPELINE DATA PATH ALL PASS ==' : failures + ' FAILURES')
process.exit(failures === 0 ? 0 : 1)
