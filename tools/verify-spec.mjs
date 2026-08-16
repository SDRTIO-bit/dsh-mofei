// MOFEI-SPEC 文件优先 + 写作风格 + 文件树回读（v0.10.1）验收。
// 用法：$env:MOFEI_BASE='http://127.0.0.1:3088'; node tools\verify-spec.mjs
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const BASE = process.env.MOFEI_BASE || 'http://127.0.0.1:3088'
const ROOT = process.cwd()
const TITLE = 'spec验收-' + String(Date.now()).slice(-6)
let failures = 0
const fail = (m) => { failures += 1; console.error('FAIL: ' + m) }
const ok = (m) => console.log('PASS: ' + m)

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
  if (!parsed || parsed.ok !== true) throw new Error(`${method}: ${JSON.stringify(parsed)}`)
  return parsed.value
}

function projectFile(projectId, ...rest) { return path.join(ROOT, '.mofei', 'projects', projectId, ...rest) }

async function readChapterFile(projectId, chapterId) {
  const file = projectFile(projectId, 'chapters', `${chapterId}.md`)
  return fs.readFile(file, 'utf8')
}

function bumpFileRevision(textValue, to) {
  return textValue.replace(/revision: (\d+)/, (match, revision) => 'revision: ' + to)
}

let projectId = null
try {
  const { project } = await mofei('create-project', { title: TITLE })
  projectId = project.id
  const { chapter } = await mofei('create-chapter', { projectId, title: '第一章' })
  await mofei('update-chapter', { projectId, chapterId: chapter.id, content: '林轩站在青城山门。', expectedRevision: 1 })
  await mofei('set-project-style', { projectId, styleId: 'plain' })

  const zone = path.join(ROOT, '.mofei', 'zone.yml')
  const projectFile_ = projectFile(projectId, 'project.yml')
  const chapterFile = projectFile(projectId, 'chapters', `${chapter.id}.md`)
  for (const file of [zone, projectFile_, chapterFile]) {
    try { await fs.access(file); ok('存在文件 ' + path.relative(ROOT, file)) }
    catch (error) { fail('缺少文件 ' + path.relative(ROOT, file)) }
  }
  const chapterText = await fs.readFile(chapterFile, 'utf8')
  if (chapterText.includes('林轩站在青城山门。')) ok('章节正文进入 Markdown 文件')
  else fail('章节文件内容异常')

  const { styles } = await mofei('list-styles', {})
  if (styles.some((item) => item.id === 'plain')) ok('styles 列表含白描')
  else fail('styles 列表缺少白描')
  const context = await mofei('chapter-context', { projectId, chapterId: chapter.id })
  if ((context.contextText || '').includes('当前写作风格：白描')) ok('写作风格已注入章节上下文')
  else fail('写作风格未注入章节上下文')

  // ---- v0.10.1 P0：外部编辑 → reload-from-files → 回读新内容 ----
  const externalText = chapterText.replace('林轩站在青城山门。', '林轩站在青城山门。\n\n山风灌入袖口，他握紧了剑。')
  await fs.writeFile(chapterFile, bumpFileRevision(externalText, 2), 'utf8')
  const reload = await mofei('reload-from-files', {})
  if (reload.chapters.updated >= 1) ok('reload-from-files 报告章节更新')
  else fail('reload-from-files 未报告章节更新: ' + JSON.stringify(reload.chapters))
  const after = await mofei('read-chapter', { projectId, chapterId: chapter.id })
  if (after.chapter.content.includes('山风灌入袖口') && after.chapter.revision === 2) ok('外部编辑回读：正文与 revision 均来自文件树')
  else fail('外部编辑未回读: revision=' + after.chapter.revision + ' content=' + JSON.stringify(after.chapter.content.slice(0, 60)))

  // ---- v0.10.1 P0：reload 后 JSON 已同步，file-tree-status 应全部 synced ----
  const synced = await mofei('file-tree-status', { projectId })
  const chapterStatus = synced.entities.find((item) => item.kind === 'chapter' && item.id === chapter.id)
  if (chapterStatus && chapterStatus.status === 'synced') ok('file-tree-status 章节 synced')
  else fail('file-tree-status 章节状态异常: ' + JSON.stringify(chapterStatus))

  // ---- v0.10.1 P0：冲突保护——文件 revision 小于 store 时以 store 为准 ----
  await fs.writeFile(chapterFile, bumpFileRevision(chapterText, 1), 'utf8') // 回退到旧内容 + revision 1 < store 2
  const reloadConflict = await mofei('reload-from-files', {})
  if (reloadConflict.chapters.conflicts >= 1) ok('reload-from-files 报告 revision 冲突')
  else fail('reload-from-files 未报告冲突: ' + JSON.stringify(reloadConflict.chapters))
  const kept = await mofei('read-chapter', { projectId, chapterId: chapter.id })
  if (kept.chapter.revision === 2 && kept.chapter.content.includes('山风灌入袖口')) ok('冲突保护：store 胜出，内容未被旧文件覆盖')
  else fail('冲突保护失效: revision=' + kept.chapter.revision)

  // ---- v0.10.1 P0：外部新建章节文件 → reload → 读回 ----
  const extId = 'chapter-ext-1'
  const extFile = projectFile(projectId, 'chapters', `${extId}.md`)
  await fs.writeFile(extFile, '---\nid: ' + extId + '\ntitle: 外部章节\norder: 2\nrevision: 1\nvolumeId: null\n---\n外部创建的章节内容。\n', 'utf8')
  const reloadNew = await mofei('reload-from-files', {})
  if (reloadNew.chapters.added >= 1) ok('reload-from-files 吸收外部新建章节')
  else fail('reload-from-files 未吸收外部新建章节: ' + JSON.stringify(reloadNew.chapters))
  const extRead = await mofei('read-chapter', { projectId, chapterId: extId })
  if (extRead.chapter.content.includes('外部创建的章节内容')) ok('外部新建章节可读回')
  else fail('外部新建章节读回失败')
  await mofei('delete-chapter', { projectId, chapterId: extId })

  // ---- 状态栏回读：file-tree-status 在故意不同步时标记 diverge-file ----
  await fs.writeFile(chapterFile, bumpFileRevision(externalText, 5), 'utf8')
  const diverge = await mofei('file-tree-status', { projectId })
  const divergeStatus = diverge.entities.find((item) => item.kind === 'chapter' && item.id === chapter.id)
  if (divergeStatus && divergeStatus.status === 'diverge-file') ok('file-tree-status 识别 diverge-file（revision 5 > store 2）')
  else fail('file-tree-status 未识别 diverge-file: ' + JSON.stringify(divergeStatus))

  await mofei('delete-project', { projectId })
  projectId = null
  try { await fs.access(projectFile_); fail('删除项目后镜像目录未清理') } catch (error) { ok('删除项目后镜像目录已清理') }
} catch (error) {
  fail(error && error.stack || error)
} finally {
  if (projectId) { try { await mofei('delete-project', { projectId }) } catch (error) { /* noop */ } }
}

console.log(failures === 0 ? '== MOFEI-SPEC ALL PASS ==' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
