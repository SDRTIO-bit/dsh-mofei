// 墨扉数据迁移：把旧 JSON（.mofei-*.json / .openfic-*.json）完整导出为 .mofei/projects/** 文件树，
// 并做双向校验（JSON 与文件树一致）。文件树是唯一事实源；JSON 降级为运行缓存。
//
// 用法（cwd = 项目根目录）：
//   node tools\migrate-to-files.mjs            导出 + 双向校验
//   node tools\migrate-to-files.mjs --verify-only   只做双向校验（不写文件）
//   node tools\migrate-to-files.mjs --quiet    成功时不打印细节
//
// 退出码：0 = 一致；1 = 校验失败；2 = 数据文件缺失。
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const QUIET = process.argv.includes('--quiet')
const VERIFY_ONLY = process.argv.includes('--verify-only')
const ROOT = process.cwd()
const MOFEI_ROOT = path.join(ROOT, '.mofei')
const log = (message) => { if (!QUIET) console.log(message) }
let failures = 0
const fail = (message) => { failures += 1; if (!QUIET) console.error('FAIL: ' + message) }

function safeFileSegment(value, fallback) {
  const raw = String(value || fallback).replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '-').replace(/\s+/g, '-').slice(0, 80)
  return raw || fallback
}
function frontmatter(meta) {
  return '---\n' + Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n') + '\n---\n'
}
function parseFrontmatter(textValue) {
  const source = String(textValue || '')
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/)
  const meta = {}
  if (match) for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    const raw = line.slice(idx + 1).trim()
    try { meta[key] = JSON.parse(raw) } catch (error) { meta[key] = raw.replace(/^"|"$/g, '') }
  }
  return { meta, body: match ? source.slice(match[0].length) : source }
}
function normalizeKeys(value) {
  const source = Array.isArray(value) ? value : []
  const out = []
  source.forEach((item) => {
    const cleaned = String(item === undefined || item === null ? '' : item).trim().replace(/\s+/g, ' ')
    if (cleaned && !out.includes(cleaned)) out.push(cleaned)
  })
  return out
}

async function readJson(target, fallback) {
  try { return JSON.parse(await readFile(target, 'utf8')) } catch (error) { return fallback }
}

async function exists(target) { try { await readFile(target); return true } catch (error) { return false } }

async function resolveFirst(...names) {
  for (const name of names) if (await exists(path.join(ROOT, name))) return name
  return null
}

async function writeMofei(relative, content) {
  const target = path.join(MOFEI_ROOT, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
}

// ---- 导出（与 plugin/lib/index.js mirrorFileTree 同构） ----
async function exportFileTree(store, summaryStore, chainStore) {
  if (VERIFY_ONLY) return
  await writeMofei('zone.yml', 'active: true\nversion: 1\n')
  for (const project of store.projects || []) {
    const base = path.posix.join('projects', safeFileSegment(project.id, 'project'))
    await writeMofei(path.posix.join(base, 'project.yml'), frontmatter({ id: project.id, title: project.title || '未命名项目', description: project.description || '', goal: project.goal || 0, currentStyle: project.currentStyle || 'default' }))
    for (const volume of project.volumes || []) {
      const volDir = safeFileSegment(volume.id, volume.title || '卷')
      for (const chapter of project.chapters.filter((item) => item.volumeId === volume.id)) {
        await writeMofei(path.posix.join(base, 'chapters', volDir, `${safeFileSegment(chapter.id, chapter.title || '章节')}.md`), frontmatter({ id: chapter.id, title: chapter.title, order: chapter.order, revision: chapter.revision, volumeId: chapter.volumeId || null }) + (chapter.content || ''))
      }
    }
    for (const chapter of project.chapters.filter((item) => !item.volumeId)) {
      await writeMofei(path.posix.join(base, 'chapters', `${safeFileSegment(chapter.id, chapter.title || '章节')}.md`), frontmatter({ id: chapter.id, title: chapter.title, order: chapter.order, revision: chapter.revision, volumeId: null }) + (chapter.content || ''))
    }
    for (const character of project.characters || []) await writeMofei(path.posix.join(base, 'characters', `${safeFileSegment(character.id, character.name || '角色')}.md`), frontmatter({ id: character.id, name: character.name, isFavorited: !!character.isFavorited }) + (character.description || ''))
    for (const note of project.notes || []) await writeMofei(path.posix.join(base, 'notes', `${safeFileSegment(note.id, note.title || '笔记')}.md`), frontmatter({ id: note.id, title: note.title, categoryId: note.categoryId || null, isLocked: !!note.isLocked, isHidden: !!note.isHidden }) + (note.content || ''))
    for (const entry of project.worldEntries || []) await writeMofei(path.posix.join(base, 'world', `${safeFileSegment(entry.id, entry.name || '条目')}.md`), frontmatter({ id: entry.id, name: entry.name, keys: normalizeKeys(entry.keys), isEnabled: entry.isEnabled !== false, constant: !!entry.constant, order: entry.order }) + (entry.content || ''))
    for (const [chapterId, entry] of Object.entries(summaryStore.chapters || {})) {
      if (entry && entry.summary) await writeMofei(path.posix.join(base, 'summaries', 'chapters', `${safeFileSegment(chapterId, 'chapter')}.md`), frontmatter({ chapterId, updatedAt: entry.updatedAt || 0, chapterRevision: entry.chapterRevision || 0 }) + entry.summary)
    }
    for (const range of summaryStore.ranges || []) await writeMofei(path.posix.join(base, 'summaries', 'ranges', `${safeFileSegment(range.id, 'range')}.md`), frontmatter({ id: range.id, title: range.title || range.id, chapterIds: range.chapterIds || [] }) + (range.summary || ''))
    for (const chain of (chainStore.byProject && chainStore.byProject[project.id]) || []) await writeMofei(path.posix.join(base, 'chains', `${safeFileSegment(chain.id, chain.name || '链')}.md`), frontmatter({ id: chain.id, name: chain.name, updatedAt: chain.updatedAt || 0 }) + (chain.content || ''))
  }
}

// ---- 双向校验：读回文件树并与 JSON 对比 ----
async function walkMarkdown(dir) {
  const out = []
  const walk = async (relative) => {
    let entries
    try { entries = await readdir(relative, { withFileTypes: true }) } catch (error) { return }
    for (const entry of entries) {
      const child = path.join(relative, entry.name)
      if (entry.isDirectory()) await walk(child)
      else if (entry.isFile() && entry.name.endsWith('.md')) out.push(child)
    }
  }
  await walk(dir)
  return out.sort()
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const num = (value, fallback) => typeof value === 'number' && isFinite(value) ? value : fallback

async function verifyFileTree(store, summaryStore, chainStore) {
  let checked = 0
  for (const project of store.projects || []) {
    const id = project.id
    const base = path.join(MOFEI_ROOT, 'projects', safeFileSegment(id, 'project'))
    const projectYml = parseFrontmatter(await readFile(path.join(base, 'project.yml'), 'utf8'))
    if (projectYml.meta.id !== id) fail(`project ${id}: project.yml id 不一致`)
    if (projectYml.meta.title !== (project.title || '未命名项目')) fail(`project ${id}: title 不一致`)
    if (projectYml.meta.currentStyle !== (project.currentStyle || 'default')) fail(`project ${id}: currentStyle 不一致`)
    checked += 1
    const chapters = []
    for (const file of await walkMarkdown(path.join(base, 'chapters'))) {
      const parsed = parseFrontmatter(await readFile(file, 'utf8'))
      chapters.push({ id: parsed.meta.id || path.basename(file, '.md'), meta: parsed.meta, body: parsed.body })
    }
    for (const chapter of project.chapters || []) {
      const match = chapters.find((item) => item.id === chapter.id)
      if (!match) { fail(`project ${id} 章节 ${chapter.id}: 文件树缺少`); continue }
      if (match.meta.revision !== chapter.revision) fail(`project ${id} 章节 ${chapter.id}: revision 不一致 ${match.meta.revision} vs ${chapter.revision}`)
      if (match.meta.title !== chapter.title) fail(`project ${id} 章节 ${chapter.id}: title 不一致`)
      if ((match.meta.volumeId || null) !== (chapter.volumeId || null)) fail(`project ${id} 章节 ${chapter.id}: volumeId 不一致`)
      if (match.body !== (chapter.content || '')) fail(`project ${id} 章节 ${chapter.id}: 正文不一致`)
      checked += 1
    }
    for (const character of project.characters || []) {
      const file = path.join(base, 'characters', `${safeFileSegment(character.id, character.name || '角色')}.md`)
      const parsed = parseFrontmatter(await readFile(file, 'utf8'))
      if (parsed.meta.name !== character.name) fail(`project ${id} 角色 ${character.id}: name 不一致`)
      if (!!parsed.meta.isFavorited !== !!character.isFavorited) fail(`project ${id} 角色 ${character.id}: isFavorited 不一致`)
      if (parsed.body !== (character.description || '')) fail(`project ${id} 角色 ${character.id}: 描述不一致`)
      checked += 1
    }
    for (const note of project.notes || []) {
      const file = path.join(base, 'notes', `${safeFileSegment(note.id, note.title || '笔记')}.md`)
      const parsed = parseFrontmatter(await readFile(file, 'utf8'))
      if (parsed.meta.title !== note.title) fail(`project ${id} 笔记 ${note.id}: title 不一致`)
      if ((parsed.meta.categoryId || null) !== (note.categoryId || null)) fail(`project ${id} 笔记 ${note.id}: categoryId 不一致`)
      if (!!parsed.meta.isLocked !== !!note.isLocked) fail(`project ${id} 笔记 ${note.id}: isLocked 不一致`)
      if (!!parsed.meta.isHidden !== !!note.isHidden) fail(`project ${id} 笔记 ${note.id}: isHidden 不一致`)
      if (parsed.body !== (note.content || '')) fail(`project ${id} 笔记 ${note.id}: 内容不一致`)
      checked += 1
    }
    for (const entry of project.worldEntries || []) {
      const file = path.join(base, 'world', `${safeFileSegment(entry.id, entry.name || '条目')}.md`)
      const parsed = parseFrontmatter(await readFile(file, 'utf8'))
      if (parsed.meta.name !== entry.name) fail(`project ${id} 世界条目 ${entry.id}: name 不一致`)
      if (!eq(normalizeKeys(parsed.meta.keys), normalizeKeys(entry.keys))) fail(`project ${id} 世界条目 ${entry.id}: keys 不一致`)
      if (parsed.meta.isEnabled !== (entry.isEnabled !== false)) fail(`project ${id} 世界条目 ${entry.id}: isEnabled 不一致`)
      if (!!parsed.meta.constant !== !!entry.constant) fail(`project ${id} 世界条目 ${entry.id}: constant 不一致`)
      if (parsed.body !== (entry.content || '')) fail(`project ${id} 世界条目 ${entry.id}: 内容不一致`)
      checked += 1
    }
    for (const [chapterId, entry] of Object.entries(summaryStore.chapters || {})) {
      if (!entry || !entry.summary) continue
      const file = path.join(base, 'summaries', 'chapters', `${safeFileSegment(chapterId, 'chapter')}.md`)
      const parsed = parseFrontmatter(await readFile(file, 'utf8'))
      if (parsed.meta.chapterId !== chapterId) fail(`project ${id} 章摘要 ${chapterId}: chapterId 不一致`)
      if (num(parsed.meta.chapterRevision, 0) !== num(entry.chapterRevision, 0)) fail(`project ${id} 章摘要 ${chapterId}: chapterRevision 不一致`)
      if (parsed.body !== entry.summary) fail(`project ${id} 章摘要 ${chapterId}: 摘要内容不一致`)
      checked += 1
    }
    for (const range of summaryStore.ranges || []) {
      const file = path.join(base, 'summaries', 'ranges', `${safeFileSegment(range.id, 'range')}.md`)
      const parsed = parseFrontmatter(await readFile(file, 'utf8'))
      if (parsed.meta.id !== range.id) fail(`project ${id} 区间摘要 ${range.id}: id 不一致`)
      if (!eq(parsed.meta.chapterIds || [], range.chapterIds || [])) fail(`project ${id} 区间摘要 ${range.id}: chapterIds 不一致`)
      if (parsed.body !== (range.summary || '')) fail(`project ${id} 区间摘要 ${range.id}: 摘要内容不一致`)
      checked += 1
    }
    for (const chain of (chainStore.byProject && chainStore.byProject[project.id]) || []) {
      const file = path.join(base, 'chains', `${safeFileSegment(chain.id, chain.name || '链')}.md`)
      const parsed = parseFrontmatter(await readFile(file, 'utf8'))
      if (parsed.meta.id !== chain.id) fail(`project ${id} 链 ${chain.id}: id 不一致`)
      if (parsed.meta.name !== chain.name) fail(`project ${id} 链 ${chain.id}: name 不一致`)
      if (parsed.body !== (chain.content || '')) fail(`project ${id} 链 ${chain.id}: 内容不一致`)
      checked += 1
    }
  }
  return checked
}

async function main() {
  const projectsName = await resolveFirst('.mofei-projects.json', '.openfic-projects.json')
  if (!projectsName) { console.error('数据文件缺失：.mofei-projects.json / .openfic-projects.json 均不存在'); process.exit(2) }
  const summariesName = await resolveFirst('.mofei-summaries.json', '.openfic-summaries.json')
  const chainsName = await resolveFirst('.mofei-chains.json', '.openfic-chains.json')
  const store = await readJson(path.join(ROOT, projectsName), null)
  const summaryStore = summariesName ? await readJson(path.join(ROOT, summariesName), { version: 1, chapters: {}, ranges: [] }) : { version: 1, chapters: {}, ranges: [] }
  const chainStore = chainsName ? await readJson(path.join(ROOT, chainsName), { version: 1, byProject: {} }) : { version: 1, byProject: {} }
  if (!store || !Array.isArray(store.projects)) { console.error('数据文件格式异常：' + projectsName); process.exit(2) }
  const started = Date.now()
  await exportFileTree(store, summaryStore, chainStore)
  const checked = await verifyFileTree(store, summaryStore, chainStore)
  const counts = { projects: store.projects.length, chapters: store.projects.reduce((sum, p) => sum + (p.chapters || []).length, 0), characters: store.projects.reduce((sum, p) => sum + (p.characters || []).length, 0), notes: store.projects.reduce((sum, p) => sum + (p.notes || []).length, 0), worldEntries: store.projects.reduce((sum, p) => sum + (p.worldEntries || []).length, 0) }
  if (!VERIFY_ONLY) {
    const manifest = { at: new Date().toISOString(), source: projectsName, mode: 'export', counts, checked, verified: failures === 0 }
    await writeMofei('migration-manifest.json', JSON.stringify(manifest, null, 2) + '\n')
  }
  if (failures === 0) {
    log(`== 文件树迁移完成 == 数据源 ${projectsName}，项目 ${counts.projects} / 章节 ${counts.chapters} / 角色 ${counts.characters} / 笔记 ${counts.notes} / 世界条目 ${counts.worldEntries}，校验实体 ${checked} 个，双向一致（${Date.now() - started}ms）`)
    process.exit(0)
  }
  console.error(`== 文件树迁移校验失败：${failures} 处不一致 ==`)
  process.exit(1)
}

main().catch((error) => { console.error(error); process.exit(2) })
