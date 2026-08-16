// 墨扉固定插件 Host 半体：fs 持久化 + /api/mofei HTTP RPC + /mofei 独立站点
// 业务逻辑迁移自动态插件 pkg-23（v4 数据模型），通信从 harness.handle 改为 webServer 路由。
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTxt, exportProject, importTitle } from './txt.js'
import { parseWorldInfoJson, buildChapterContext, normalizeWorldEntry, normalizeKeys, cleanText } from './world.js'
import { normalizeAiSession, aiSessionView, appendAiMessage, buildAiMessages, chapterSelection, summaryRequest, sseEvent } from './ai.js'
import { normalizeSummaryStore, chapterSummaryView, isChapterSummaryStale, applyChapterSummary, buildRangeGroups, applyRangeSummary, planSummaryBatch } from './summary.js'
import { normalizeChainStore, compilePromptChain, promptChainView } from './prompt-chain.js'
import { mofeiSkills } from './skills.js'
const pluginRoot = fileURLToPath(new URL('..', import.meta.url))
export default {
  inject: ['fs', 'sandboxPolicy', 'webServer'],
  apply(ctx) {
    const fs = ctx.fs
    const cwd = ctx.sandboxPolicy.workspaceRoot
    const policy = ctx.sandboxPolicy.resolve()
    const HISTORY_CAP = 20
    const ENTITY_HISTORY_MAX = 50
    const AI_MESSAGE_CAP = 80
    let projectTarget, draftTarget, statsTarget, aiSessionsTarget, summaryTarget, chainsTarget, skillSettingsTarget, loading
    let queue = Promise.resolve()
    let store = { version: 4, nextId: 1, projects: [] }
    let draftStore = { version: 1, items: [] }
    let stats = { version: 1, days: {} }
    let aiSessions = { version: 1, sessions: {} }
    let summaryStore = normalizeSummaryStore(undefined)
    let chainStore = normalizeChainStore(undefined)
    // v0.17: 写作技能开关（禁用名单；自创技能直接写 ~/.dsh/skills/，由 DSH skill-filesystem 发现）。
    let skillSettings = { version: 1, disabledSkills: [] }
    // 当前浏览器工作台与 DSH 写作会话之间的短生命周期关联；不写入小说数据。
    const agentContexts = new Map()
    function text(value, fallback) { const result = typeof value === 'string' ? value.trim() : ''; return result || fallback }
    function slice200(value) { const result = typeof value === 'string' ? value : ''; return result.length > 200 ? result.slice(0, 200) : result }
    function pad(value) { return value < 10 ? '0' + String(value) : String(value) }
    function dayKey(date) { return String(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) }
    function chapterView(item) { return { id: item.id, title: item.title, content: item.content, order: item.order, revision: item.revision, historyCount: Array.isArray(item.history) ? item.history.length : 0, volumeId: item.volumeId || null } }
    function volumeView(item, chapters) { return { id: item.id, title: item.title, description: item.description, order: item.order, chapterCount: chapters.filter((c) => c.volumeId === item.id).length } }
    function characterView(item) { return { id: item.id, name: item.name, description: item.description, isFavorited: !!item.isFavorited } }
    function categoryView(item) { return { id: item.id, title: item.title, parentId: item.parentId || null } }
    function noteView(item) { return { id: item.id, title: item.title, content: item.content, categoryId: item.categoryId || null, isLocked: !!item.isLocked, isHidden: !!item.isHidden } }
    function worldEntryView(item, index) { return { id: item.id, name: cleanText(item.name, '未命名条目'), keys: normalizeKeys(item.keys), content: item.content, isEnabled: item.isEnabled !== false, constant: !!item.constant, order: typeof item.order === 'number' ? item.order : index } }
    function projectWriterSessionId(project) { return project && typeof project.writerSessionId === 'string' ? project.writerSessionId.trim() : '' }
    function projectView(item) { return { id: item.id, title: item.title, description: item.description, goal: typeof item.goal === 'number' ? item.goal : 0, currentStyle: item.currentStyle || 'default', writerSessionId: projectWriterSessionId(item), chapters: item.chapters.map(chapterView), volumes: (item.volumes || []).map((v) => volumeView(v, item.chapters)), characters: (item.characters || []).map(characterView), notes: (item.notes || []).map(noteView), noteCategories: (item.noteCategories || []).map(categoryView), worldEntries: (item.worldEntries || []).map(worldEntryView) } }
    function draftView(item) { return { projectId: item.projectId, chapterId: item.chapterId, content: item.content, baseRevision: item.baseRevision } }
    function projectBy(id) { return store.projects.find((item) => item.id === id) }
    function chapterBy(project, id) { return project && project.chapters.find((item) => item.id === id) }
    function volumeBy(project, id) { return project && (project.volumes || []).find((item) => item.id === id) }
    function characterBy(project, id) { return project && (project.characters || []).find((item) => item.id === id) }
    function categoryBy(project, id) { return project && (project.noteCategories || []).find((item) => item.id === id) }
    function noteBy(project, id) { return project && (project.notes || []).find((item) => item.id === id) }
    function worldEntryBy(project, id) { return project && (project.worldEntries || []).find((item) => item.id === id) }
    function boundAgentContext(args) {
      const sessionId = typeof (args && args.sessionId) === 'string' ? args.sessionId.trim() : ''
      const projectId = typeof (args && args.projectId) === 'string' ? args.projectId.trim() : ''
      const chapterId = typeof (args && args.chapterId) === 'string' ? args.chapterId.trim() : ''
      if (!sessionId || sessionId.length > 512 || !projectId) return null
      return { sessionId, projectId, chapterId }
    }
    function projectAgentContext(project) {
      const take = (items, format, limit) => (items || []).slice(0, limit).map(format).filter(Boolean).join('\n')
      const characters = take(project.characters, (item) => '【角色】' + item.name + (item.description ? '：' + slice200(item.description) : ''), 20)
      const notes = take((project.notes || []).filter((item) => !item.isHidden), (item) => '【笔记】' + item.title + (item.content ? '：' + slice200(item.content) : ''), 20)
      const world = take((project.worldEntries || []).filter((item) => item.isEnabled !== false), (item) => '【世界书】' + item.name + (item.content ? '：' + slice200(item.content) : ''), 20)
      return [
        '【当前墨扉小说项目】《' + project.title + '》',
        'projectId: ' + project.id,
        '当前未选中章节。你仍处于这本小说的写作项目中；可创建、读取或整理章节、卷、角色、笔记和世界书。',
        characters,
        notes,
        world,
      ].filter(Boolean).join('\n\n')
    }
    function worldEntryNameConflict(project, name, excludeId) {
      const cleaned = cleanText(name, '')
      if (!cleaned) return null
      const key = cleaned.toLowerCase()
      return (project && project.worldEntries || []).find((entry) => entry.id !== excludeId && String(cleanText(entry.name, '未命名条目')).toLowerCase() === key) || null
    }
    function allocate(prefix) { const id = prefix + '-' + String(store.nextId); store.nextId += 1; return id }
    function statsView() {
      const keys = Object.keys(stats.days).sort()
      const totalChars = keys.reduce((sum, key) => sum + (stats.days[key].chars || 0), 0)
      const today = dayKey(new Date())
      const entry = stats.days[today]
      const calendar = {}
      keys.forEach((key) => { calendar[key] = stats.days[key].chars || 0 })
      return { today: today, todayChars: entry ? entry.chars : 0, totalChars: totalChars, streak: computeStreak(), days: keys.length, calendar: calendar }
    }
    function computeStreak() {
      const set = {}
      Object.keys(stats.days).forEach((key) => { set[key] = true })
      const date = new Date()
      if (!set[dayKey(date)]) date.setDate(date.getDate() - 1)
      let streak = 0
      while (set[dayKey(date)]) { streak += 1; date.setDate(date.getDate() - 1) }
      return streak
    }
    // v0.10.3: 写操作来源（工具注入 _source:'agent'；UI/RPC 缺省）
    function writeSource(args) { return args && args._source === 'agent' ? 'agent' : undefined }
    // v0.10.3: history 条目携带 source（'agent' = 工具写入，缺省 = UI/RPC）。
    function pushHistory(chapter, source) {
      if (!Array.isArray(chapter.history)) chapter.history = []
      chapter.history.push({ revision: chapter.revision, content: chapter.content, at: Date.now(), ...(source ? { source } : {}) })
      if (chapter.history.length > HISTORY_CAP) chapter.history.splice(0, chapter.history.length - HISTORY_CAP)
    }
    // v9: 实体快照与回滚（角色/笔记/世界书条目）
    function characterSnapshot(entity) { return { name: entity.name, description: entity.description, isFavorited: !!entity.isFavorited } }
    function noteSnapshot(entity) { return { title: entity.title, content: entity.content, categoryId: entity.categoryId || null, isLocked: !!entity.isLocked, isHidden: !!entity.isHidden } }
    function worldEntrySnapshot(entity) { return { name: entity.name, keys: normalizeKeys(entity.keys), content: entity.content, isEnabled: entity.isEnabled !== false, constant: !!entity.constant, order: typeof entity.order === 'number' ? entity.order : 0 } }
    function entitySnapshot(entity, kind) {
      if (kind === 'character') return characterSnapshot(entity)
      if (kind === 'note') return noteSnapshot(entity)
      if (kind === 'world-entry') return worldEntrySnapshot(entity)
      return null
    }
    function pushEntityHistory(entity, kind, source) {
      if (!entity || typeof entity !== 'object') return
      if (!Array.isArray(entity.history)) entity.history = []
      const lastRevision = entity.history.length ? (typeof entity.history[entity.history.length - 1].revision === 'number' ? entity.history[entity.history.length - 1].revision : entity.history.length) : 0
      const nextRevision = (typeof entity.historySeq === 'number' && Number.isFinite(entity.historySeq) && entity.historySeq > lastRevision ? entity.historySeq : lastRevision) + 1
      entity.historySeq = nextRevision
      entity.history.push({ at: Date.now(), revision: nextRevision, snapshot: entitySnapshot(entity, kind), ...(source ? { source } : {}) })
      if (entity.history.length > ENTITY_HISTORY_MAX) entity.history.splice(0, entity.history.length - ENTITY_HISTORY_MAX)
    }
    function resolveEntity(project, kind, entityId) {
      if (!project) return null
      if (kind === 'character') return characterBy(project, entityId)
      if (kind === 'note') return noteBy(project, entityId)
      if (kind === 'world-entry') return worldEntryBy(project, entityId)
      return null
    }
    function entityViewFor(project, kind, entity) {
      if (kind === 'character') return characterView(entity)
      if (kind === 'note') return noteView(entity)
      if (kind === 'world-entry') return worldEntryView(entity, (project && project.worldEntries || []).indexOf(entity))
      return null
    }
    function applyEntitySnapshot(entity, kind, snapshot) {
      if (kind === 'character') {
        entity.name = snapshot && typeof snapshot.name === 'string' ? snapshot.name : entity.name
        entity.description = snapshot && typeof snapshot.description === 'string' ? snapshot.description : entity.description
        entity.isFavorited = !!(snapshot && snapshot.isFavorited)
      } else if (kind === 'note') {
        entity.title = snapshot && typeof snapshot.title === 'string' ? snapshot.title : entity.title
        entity.content = snapshot && typeof snapshot.content === 'string' ? snapshot.content : entity.content
        entity.categoryId = snapshot && snapshot.categoryId ? snapshot.categoryId : null
        entity.isLocked = !!(snapshot && snapshot.isLocked)
        entity.isHidden = !!(snapshot && snapshot.isHidden)
      } else if (kind === 'world-entry') {
        entity.name = snapshot && typeof snapshot.name === 'string' ? snapshot.name : entity.name
        entity.keys = normalizeKeys(snapshot && snapshot.keys)
        entity.content = snapshot && typeof snapshot.content === 'string' ? snapshot.content : entity.content
        entity.isEnabled = !!(snapshot && snapshot.isEnabled)
        entity.constant = !!(snapshot && snapshot.constant)
        entity.order = snapshot && typeof snapshot.order === 'number' ? snapshot.order : entity.order
      }
    }
    function countAdded(previous, next) { return next.length - previous.length }
    function aiSessionFor(projectId) {
      if (!aiSessions.sessions[projectId]) aiSessions.sessions[projectId] = { messages: [] }
      return aiSessions.sessions[projectId]
    }
    function aiSessionSnapshot(projectId) { return normalizeAiSession(aiSessionFor(projectId)) }
    async function readJson(target, fallback) {
      if (await fs.stat(target) === undefined) return fallback
      try { const value = JSON.parse(await fs.readText(target)); return value && typeof value === 'object' ? value : fallback }
      catch (error) { console.error('墨扉 could not read persisted data', error); return fallback }
    }
    async function resolveDataTarget(name, legacyName) {
      const current = await fs.resolve(name, { cwd })
      if (await fs.stat(current) !== undefined) return { target: current, current, migrated: false }
      const legacy = await fs.resolve(legacyName, { cwd })
      if (await fs.stat(legacy) !== undefined) return { target: legacy, current, migrated: true }
      return { target: current, current, migrated: false }
    }
    async function load() {
      if (loading) return loading
      loading = (async () => {
        const projectResolved = await resolveDataTarget('.mofei-projects.json', '.openfic-projects.json')
        const draftResolved = await resolveDataTarget('.mofei-drafts.json', '.openfic-drafts.json')
        const statsResolved = await resolveDataTarget('.mofei-stats.json', '.openfic-stats.json')
        const aiResolved = await resolveDataTarget('.mofei-ai-sessions.json', '.openfic-ai-sessions.json')
        projectTarget = projectResolved.target
        draftTarget = draftResolved.target
        statsTarget = statsResolved.target
        aiSessionsTarget = aiResolved.target
        summaryTarget = await fs.resolve('.mofei-summaries.json', { cwd })
        chainsTarget = await fs.resolve('.mofei-chains.json', { cwd })
        skillSettingsTarget = await fs.resolve('.mofei-skill-settings.json', { cwd })
        const skillSettingsData = await readJson(skillSettingsTarget, skillSettings)
        if (skillSettingsData && Array.isArray(skillSettingsData.disabledSkills)) {
          skillSettings = { version: 1, disabledSkills: skillSettingsData.disabledSkills.filter((item) => typeof item === 'string') }
        }
        const projects = await readJson(projectTarget, store)
        const drafts = await readJson(draftTarget, draftStore)
        const statsData = await readJson(statsTarget, stats)
        const aiData = await readJson(aiSessionsTarget, aiSessions)
        summaryStore = normalizeSummaryStore(await readJson(summaryTarget, summaryStore))
        chainStore = normalizeChainStore(await readJson(chainsTarget, chainStore))
        if (Array.isArray(projects.projects)) {
          store = projects
          store.version = 4
          if (typeof store.nextId !== 'number') store.nextId = 1
          store.projects.forEach((project) => {
            if (!Array.isArray(project.chapters)) project.chapters = []
            if (!Array.isArray(project.volumes)) project.volumes = []
            if (!Array.isArray(project.characters)) project.characters = []
            if (!Array.isArray(project.notes)) project.notes = []
            if (!Array.isArray(project.noteCategories)) project.noteCategories = []
            if (!Array.isArray(project.worldEntries)) project.worldEntries = []
            project.chapters.forEach((chapter, index) => {
              if (typeof chapter.content !== 'string') chapter.content = ''
              if (typeof chapter.order !== 'number') chapter.order = index
              if (typeof chapter.revision !== 'number') chapter.revision = 1
              if (!Array.isArray(chapter.history)) chapter.history = []
              chapter.history = chapter.history.filter((entry) => entry && typeof entry.content === 'string' && typeof entry.revision === 'number')
              if (chapter.history.length > HISTORY_CAP) chapter.history.splice(0, chapter.history.length - HISTORY_CAP)
              if (chapter.volumeId !== null && chapter.volumeId !== undefined && !project.volumes.some((v) => v.id === chapter.volumeId)) chapter.volumeId = null
              if (chapter.volumeId === undefined) chapter.volumeId = null
            })
            project.volumes.forEach((volume, index) => {
              if (typeof volume.title !== 'string') volume.title = '未命名卷'
              if (typeof volume.order !== 'number') volume.order = index
              if (typeof volume.description !== 'string') volume.description = ''
            })
            project.characters.forEach((character) => {
              if (typeof character.name !== 'string') character.name = '未命名角色'
              if (typeof character.description !== 'string') character.description = ''
            })
            project.notes.forEach((note) => {
              if (typeof note.title !== 'string') note.title = '未命名笔记'
              if (typeof note.content !== 'string') note.content = ''
              if (note.categoryId !== null && note.categoryId !== undefined && !project.noteCategories.some((c) => c.id === note.categoryId)) note.categoryId = null
              if (note.categoryId === undefined) note.categoryId = null
            })
            project.noteCategories.forEach((category) => {
              if (typeof category.title !== 'string') category.title = '未命名分类'
              if (category.parentId !== null && category.parentId !== undefined && !project.noteCategories.some((c) => c.id === category.parentId)) category.parentId = null
              if (category.parentId === undefined) category.parentId = null
            })
            project.worldEntries = project.worldEntries.map((entry, index) => normalizeWorldEntry(entry, entry.id || allocate('world'), index))
          })
        }
        if (Array.isArray(drafts.items)) draftStore = drafts
        if (statsData && statsData.days && typeof statsData.days === 'object' && !Array.isArray(statsData.days)) {
          stats = statsData
          stats.version = 1
        }
        if (aiData && aiData.sessions && typeof aiData.sessions === 'object' && !Array.isArray(aiData.sessions)) {
          aiSessions = { version: 1, sessions: aiData.sessions }
          Object.keys(aiSessions.sessions).forEach((projectId) => { aiSessions.sessions[projectId] = normalizeAiSession(aiSessions.sessions[projectId]) })
        } else aiSessions = { version: 1, sessions: {} }
        // 旧品牌数据迁移：优先写 .mofei-*.json，原 .openfic-*.json 保留作回退
        if (projectResolved.migrated) { projectTarget = projectResolved.current; await saveProjects() }
        if (draftResolved.migrated) { draftTarget = draftResolved.current; await saveDrafts() }
        if (statsResolved.migrated) { statsTarget = statsResolved.current; await saveStats() }
        if (aiResolved.migrated) { aiSessionsTarget = aiResolved.current; await saveAiSessions() }
        // v0.10.1: 文件树优先。.mofei/projects 存在 → 文件树胜出（revision 冲突保护），改动再落盘 JSON。
        if (!isVirtualRoot()) {
          const projectRootDir = path.join(mofeiFileRoot, 'projects')
          try {
            const entries = await readdir(projectRootDir)
            if (entries.length) {
              const imported = await importFileTree()
              if (imported.changed) {
                await saveProjects()
                await saveSummaries()
                await saveChains()
              }
            }
          } catch (error) { /* 尚无 projects 目录 */ }
        }
        await mirrorFileTree()
      })()
      return loading
    }
    function mutate(operation) {
      const run = queue.then(async () => { await load(); return operation() }, async () => { await load(); return operation() })
      queue = run.then(() => undefined, () => undefined)
      return run
    }
    async function saveProjects() { await fs.writeText(projectTarget, JSON.stringify(store, null, 2), undefined, undefined, policy); await mirrorFileTree(); await gitCommitAll('墨扉 项目保存').catch(() => { /* 非 git 工作区忽略 */ }) }
    async function saveDrafts() { await fs.writeText(draftTarget, JSON.stringify(draftStore, null, 2), undefined, undefined, policy); await mirrorFileTree() }
    async function saveStats() { await fs.writeText(statsTarget, JSON.stringify(stats, null, 2), undefined, undefined, policy); await mirrorFileTree() }
    async function saveAiSessions() { await fs.writeText(aiSessionsTarget, JSON.stringify(aiSessions, null, 2), undefined, undefined, policy) }
    async function saveSummaries() { await fs.writeText(summaryTarget, JSON.stringify(summaryStore, null, 2), undefined, undefined, policy); await mirrorFileTree() }
    async function saveChains() { await fs.writeText(chainsTarget, JSON.stringify(chainStore, null, 2), undefined, undefined, policy); await mirrorFileTree() }
    async function saveSkillSettings() { await fs.writeText(skillSettingsTarget, JSON.stringify(skillSettings, null, 2), undefined, undefined, policy) }
    // v0.17: 自创技能目录 = DSH skill-filesystem 的用户技能根（~/.dsh/skills/*.md）。
    function customSkillDir() { return path.join(os.homedir(), '.dsh', 'skills') }
    async function listCustomSkills() {
      const out = []
      let names = []
      try { names = await readdir(customSkillDir()) } catch (error) { return out }
      for (const name of names.sort()) {
        if (!name.endsWith('.md')) continue
        try {
          const parsed = parseFrontmatter(await readFile(path.join(customSkillDir(), name), 'utf8'))
          if (typeof parsed.meta.name !== 'string' || !parsed.meta.name) continue
          out.push({ name: parsed.meta.name, file: name, description: typeof parsed.meta.description === 'string' ? parsed.meta.description : '', whenToUse: typeof parsed.meta.whenToUse === 'string' ? parsed.meta.whenToUse : '' })
        } catch (error) { /* 忽略坏文件 */ }
      }
      return out
    }

    // v10: 文件优先镜像。JSON 仍是运行缓存/兼容层；文件树是用户可直接查看编辑、可 git 管理的正式形态。
    // v0.18: 项目级 rootDir（小说文件夹）——有 rootDir 的项目实体文件写/读 rootDir，否则工作区 .mofei/projects/<id>。
    const mofeiFileRoot = path.join(cwd, '.mofei')
    function projectFileBase(project) {
      if (project && typeof project.rootDir === 'string' && project.rootDir.trim()) return path.resolve(project.rootDir.trim())
      return path.join(mofeiFileRoot, 'projects', safeFileSegment(project && project.id, 'project'))
    }
    function safeFileSegment(value, fallback) { const raw = String(value || fallback).replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '-').replace(/\s+/g, '-').slice(0, 80); return raw || fallback }
    function frontmatter(meta) { return '---\n' + Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n') + '\n---\n' }
    function styleMeta(project) { return { id: project.id, title: project.title || '未命名项目', description: project.description || '', goal: project.goal || 0, currentStyle: project.currentStyle || 'default', writerSessionId: projectWriterSessionId(project) || null } }
    async function writeMofeiFile(relative, content) {
      if (String(cwd).startsWith('virtual-root')) return
      // v0.18: 绝对路径 = rootDir 项目直接写入；相对路径 = 工作区 .mofei 下
      const target = path.isAbsolute(relative) ? relative : path.join(mofeiFileRoot, relative)
      // v0.15: 内容相同不重写——否则每次镜像都会刷新全部文件 mtime，
      // 触发 sync-status 轮询误判「外部编辑」→ reload-from-files → 镜像 → 无限 ping-pong。
      try { if (await readFile(target, 'utf8') === content) return } catch (error) { /* 文件不存在 → 创建 */ }
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, content, 'utf8')
    }
    async function mirrorFileTree() {
      if (String(cwd).startsWith('virtual-root')) return
      await writeMofeiFile('zone.yml', 'active: true\nversion: 1\n')
      for (const project of store.projects) {
        // v0.18: 项目级 rootDir（小说文件夹）或工作区 .mofei/projects/<id>
        const base = projectFileBase(project)
        await writeMofeiFile(path.join(base, 'project.yml'), frontmatter(styleMeta(project)))
        for (const volume of project.volumes || []) {
          const volDir = safeFileSegment(volume.id, volume.title || '卷')
          for (const chapter of project.chapters.filter((item) => item.volumeId === volume.id)) {
            await writeMofeiFile(path.join(base, 'chapters', volDir, `${safeFileSegment(chapter.id, chapter.title || '章节')}.md`), frontmatter({ id: chapter.id, title: chapter.title, order: chapter.order, revision: chapter.revision, volumeId: chapter.volumeId || null }) + (chapter.content || ''))
          }
        }
        for (const chapter of project.chapters.filter((item) => !item.volumeId)) {
          await writeMofeiFile(path.join(base, 'chapters', `${safeFileSegment(chapter.id, chapter.title || '章节')}.md`), frontmatter({ id: chapter.id, title: chapter.title, order: chapter.order, revision: chapter.revision, volumeId: null }) + (chapter.content || ''))
        }
        for (const character of project.characters || []) await writeMofeiFile(path.join(base, 'characters', `${safeFileSegment(character.id, character.name || '角色')}.md`), frontmatter({ id: character.id, name: character.name, isFavorited: !!character.isFavorited }) + (character.description || ''))
        for (const note of project.notes || []) await writeMofeiFile(path.join(base, 'notes', `${safeFileSegment(note.id, note.title || '笔记')}.md`), frontmatter({ id: note.id, title: note.title, categoryId: note.categoryId || null, isLocked: !!note.isLocked, isHidden: !!note.isHidden }) + (note.content || ''))
        for (const entry of project.worldEntries || []) await writeMofeiFile(path.join(base, 'world', `${safeFileSegment(entry.id, entry.name || '条目')}.md`), frontmatter({ id: entry.id, name: entry.name, keys: normalizeKeys(entry.keys), isEnabled: entry.isEnabled !== false, constant: !!entry.constant, order: entry.order }) + (entry.content || ''))
        const chapterSummaries = (summaryStore.chapters && summaryStore.chapters || {})
        for (const [chapterId, entry] of Object.entries(chapterSummaries)) if (entry && entry.summary) await writeMofeiFile(path.join(base, 'summaries', 'chapters', `${safeFileSegment(chapterId, 'chapter')}.md`), frontmatter({ chapterId, updatedAt: entry.updatedAt || 0, chapterRevision: entry.chapterRevision || 0 }) + entry.summary)
        for (const range of summaryStore.ranges || []) await writeMofeiFile(path.join(base, 'summaries', 'ranges', `${safeFileSegment(range.id, 'range')}.md`), frontmatter({ id: range.id, title: range.title || range.id, chapterIds: range.chapterIds || [] }) + (range.summary || ''))
        const chains = (chainStore.byProject && chainStore.byProject[project.id]) || []
        for (const chain of chains) await writeMofeiFile(path.join(base, 'chains', `${safeFileSegment(chain.id, chain.name || '链')}.md`), frontmatter({ id: chain.id, name: chain.name, updatedAt: chain.updatedAt || 0 }) + (chain.content || ''))
      }
      const styleDir = path.join(mofeiFileRoot, 'styles')
      await mkdir(styleDir, { recursive: true })
      const defaultStyles = {
        'default.md': '---\nid: default\nname: 默认\n---\n\n# 默认写作风格\n\n- 保持与作品已有文风一致\n- 不堆砌辞藻，以清晰叙事优先\n',
        'plain.md': '---\nid: plain\nname: 白描\n---\n\n# 白描\n\n- 短句为主，克制形容词\n- 少比喻，动作与画面优先\n- 对话干净，不堆情绪词\n',
        'classical.md': '---\nid: classical\nname: 古风\n---\n\n# 古风\n\n- 半文半白，句式凝练\n- 用词偏古典但不刻意生僻\n- 意境优先，避免现代口语\n',
        'light-novel.md': '---\nid: light-novel\nname: 轻小说\n---\n\n# 轻小说\n\n- 以对话推进剧情\n- 节奏轻快，段落短\n- 内心独白与吐槽适度\n',
      }
      for (const [name, content] of Object.entries(defaultStyles)) { const target = path.join(styleDir, name); try { await writeFile(target, content, { flag: 'wx' }) } catch (error) { if (error && error.code !== 'EEXIST') console.error('墨扉 style init failed', error) } }
    }
    // v0.10.1: 项目级 styles/ 覆盖全局 styles/。
    async function readStyle(styleId, projectId) {
      const fileName = `${safeFileSegment(styleId || 'default', 'default')}.md`
      if (projectId) {
        try { return await readFile(path.join(mofeiFileRoot, 'projects', safeFileSegment(projectId, 'project'), 'styles', fileName), 'utf8') } catch (error) { /* fall through to global */ }
      }
      try { return await readFile(path.join(cwd, '.mofei', 'styles', fileName), 'utf8') } catch (error) { return '' }
    }
    function parseStyle(textValue, fallbackId) {
      const source = String(textValue || '')
      const match = source.match(/^---\n([\s\S]*?)\n---\n/)
      const meta = {}
      if (match) for (const line of match[1].split('\n')) { const idx = line.indexOf(':'); if (idx > 0) { const key = line.slice(0, idx).trim(); const raw = line.slice(idx + 1).trim(); try { meta[key] = JSON.parse(raw) } catch (error) { meta[key] = raw.replace(/^"|"$/g, '') } } }
      return { id: meta.id || fallbackId || 'default', name: meta.name || fallbackId || '默认', description: typeof meta.description === 'string' ? meta.description : '', tags: Array.isArray(meta.tags) ? meta.tags.filter((item) => typeof item === 'string') : [], content: source.replace(/^---\n[\s\S]*?\n---\n/, '').trim(), meta }
    }
    // v0.10.1: 通用 frontmatter + Markdown 正文解析（文件树唯一事实源）。
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
      const body = match ? source.slice(match[0].length) : source
      return { meta, body }
    }
    function isVirtualRoot() { return String(cwd).startsWith('virtual-root') }
    async function mofeiReadFile(relative) { return readFile(path.isAbsolute(relative) ? relative : path.join(mofeiFileRoot, relative), 'utf8') }
    async function listMofeiMarkdown(relativeDir) {
      const out = []
      const walk = async (relative) => {
        let entries
        try { entries = await readdir(path.isAbsolute(relative) ? relative : path.join(mofeiFileRoot, relative), { withFileTypes: true }) } catch (error) { return }
        for (const entry of entries) {
          const child = path.join(relative, entry.name)
          if (entry.isDirectory()) await walk(child)
          else if (entry.isFile() && entry.name.endsWith('.md')) out.push(child)
        }
      }
      await walk(relativeDir)
      return out.sort()
    }
    // v0.15: 轻量同步签名——客户端 2s 轮询据此检测「AI/外部写入」，不依赖聊天会话绑定。
    // storeStamp：内存 store 的章节 revision 指纹（工具/UI 写入后内存已更新，只需 UI reload）。
    // fileStamp：.mofei/projects/** 文件+目录 mtime 混合签名（外部直接改文件时需文件优先导入）。
    function storeStamp() {
      return store.projects.map((project) => project.id + ':' + (project.chapters || []).map((chapter) => chapter.id + ':' + chapter.revision).join(',')).join('|')
    }
    let fileStampCache = null
    async function fileTreeStamp() {
      if (isVirtualRoot()) return ''
      const now = Date.now()
      if (fileStampCache && now - fileStampCache.at < 1200) return fileStampCache.value
      let count = 0
      let max = 0
      let sum = 0
      const walk = async (relative) => {
        let entries
        try { entries = await readdir(path.isAbsolute(relative) ? relative : path.join(mofeiFileRoot, relative), { withFileTypes: true }) } catch (error) { return }
        for (const entry of entries) {
          const child = path.join(relative, entry.name)
          try {
            const info = await stat(path.isAbsolute(child) ? child : path.join(mofeiFileRoot, child))
            const mtime = info.mtimeMs || 0
            count += 1; sum += mtime; if (mtime > max) max = mtime
          } catch (error) { /* 文件刚被删除则忽略 */ }
          if (entry.isDirectory()) await walk(child)
        }
      }
      await walk('projects')
      // v0.18: rootDir 项目（小说文件夹）纳入变更检测
      for (const project of store.projects) {
        if (typeof project.rootDir === 'string' && project.rootDir.trim() && path.isAbsolute(project.rootDir)) {
          await walk(path.resolve(project.rootDir.trim()))
        }
      }
      const value = count + ':' + max + ':' + sum
      fileStampCache = { at: now, value }
      return value
    }
    // 保证 allocate() 不会与文件树实体 id 冲突。
    function bumpNextId(id) {
      const match = /-(\d+)$/.exec(String(id || ''))
      if (match) { const number = parseInt(match[1], 10); if (Number.isFinite(number) && number + 1 > store.nextId) store.nextId = number + 1 }
    }
    // v0.10.1: 从 .mofei/projects/** 文件树重建内存 store（文件优先）。
    // 规则：文件 revision >= 内存 revision → 文件胜出；否则内存胜出并计入 conflicts。
    // v0.10.2: options.preferFiles=true（显式回滚）时文件无条件胜出。
    async function importFileTree(options) {
      const preferFiles = !!(options && options.preferFiles)
      const empty = () => ({ added: 0, updated: 0, conflicts: 0 })
      const report = { changed: false, projects: [], chapters: empty(), characters: empty(), notes: empty(), worldEntries: empty(), summaries: { updated: 0, conflicts: 0 }, chains: { updated: 0, conflicts: 0 }, nextId: store.nextId }
      if (isVirtualRoot()) return report
      const importProjectDir = async (base) => {
        let projectMeta = {}
        try { projectMeta = parseFrontmatter(await mofeiReadFile(path.join(base, 'project.yml'))).meta } catch (error) { return }
        const projectId = typeof projectMeta.id === 'string' && projectMeta.id ? projectMeta.id : path.basename(base)
        bumpNextId(projectId)
        let project = projectBy(projectId)
        if (!project) {
          // v0.18: 工作区 projects 目录之外的 base 视为小说文件夹 rootDir
          const inheritedRoot = path.dirname(base) === path.join(mofeiFileRoot, 'projects') ? '' : base
          project = { id: projectId, title: text(projectMeta.title, '未命名项目'), description: typeof projectMeta.description === 'string' ? projectMeta.description : '', goal: typeof projectMeta.goal === 'number' && isFinite(projectMeta.goal) ? projectMeta.goal : 0, currentStyle: typeof projectMeta.currentStyle === 'string' && projectMeta.currentStyle ? projectMeta.currentStyle : 'default', writerSessionId: typeof projectMeta.writerSessionId === 'string' ? projectMeta.writerSessionId.trim() : '', ...(inheritedRoot ? { rootDir: inheritedRoot } : {}), chapters: [], volumes: [], characters: [], notes: [], noteCategories: [], worldEntries: [] }
          store.projects.push(project)
          report.projects.push({ id: projectId, added: true })
          report.changed = true
        } else {
          const styleChanged = typeof projectMeta.currentStyle === 'string' && projectMeta.currentStyle && projectMeta.currentStyle !== (project.currentStyle || 'default')
          const titleChanged = typeof projectMeta.title === 'string' && projectMeta.title && projectMeta.title !== project.title
          const descriptionChanged = typeof projectMeta.description === 'string' && projectMeta.description !== (project.description || '')
          const goalChanged = typeof projectMeta.goal === 'number' && isFinite(projectMeta.goal) && projectMeta.goal !== (project.goal || 0)
          const writerSessionChanged = typeof projectMeta.writerSessionId === 'string' && projectMeta.writerSessionId.trim() !== projectWriterSessionId(project)
          if (styleChanged) project.currentStyle = projectMeta.currentStyle
          if (titleChanged) project.title = projectMeta.title
          if (descriptionChanged) project.description = projectMeta.description
          if (goalChanged) project.goal = projectMeta.goal
          if (writerSessionChanged) project.writerSessionId = projectMeta.writerSessionId.trim()
          if (styleChanged || titleChanged || descriptionChanged || goalChanged || writerSessionChanged) report.changed = true
          report.projects.push({ id: projectId, added: false })
        }
        // 章节：chapters/**/*.md（卷目录或平铺），frontmatter.id 为准，文件名仅作可读标签。
        const volumes = new Map((project.volumes || []).map((volume) => [volume.id, volume]))
        for (const relative of await listMofeiMarkdown(path.join(base, 'chapters'))) {
          const parsed = parseFrontmatter(await mofeiReadFile(relative))
          const id = typeof parsed.meta.id === 'string' && parsed.meta.id ? parsed.meta.id : path.basename(relative, '.md')
          bumpNextId(id)
          let volumeId = typeof parsed.meta.volumeId === 'string' && parsed.meta.volumeId ? parsed.meta.volumeId : null
          if (volumeId && !volumes.has(volumeId)) {
            const volume = { id: volumeId, title: path.basename(path.dirname(relative)) || '未命名卷', description: '', order: project.volumes.length }
            project.volumes.push(volume)
            volumes.set(volumeId, volume)
            report.changed = true
          }
          const fileRevision = typeof parsed.meta.revision === 'number' && isFinite(parsed.meta.revision) ? Math.max(1, Math.floor(parsed.meta.revision)) : 1
          const existing = chapterBy(project, id)
          if (!existing) {
            project.chapters.push({ id, title: text(parsed.meta.title, '未命名章节'), content: parsed.body, order: typeof parsed.meta.order === 'number' && isFinite(parsed.meta.order) ? parsed.meta.order : project.chapters.length, revision: fileRevision, history: [], volumeId })
            report.chapters.added += 1
            report.changed = true
          } else if (preferFiles || fileRevision >= existing.revision) {
            const contentChanged = parsed.body !== existing.content
            const titleChanged = text(parsed.meta.title, existing.title) !== existing.title
            const orderChanged = typeof parsed.meta.order === 'number' && isFinite(parsed.meta.order) && parsed.meta.order !== existing.order
            const volumeChanged = volumeId !== (existing.volumeId || null)
            if (contentChanged) existing.content = parsed.body
            if (titleChanged) existing.title = text(parsed.meta.title, existing.title)
            if (orderChanged) existing.order = parsed.meta.order
            if (volumeChanged) existing.volumeId = volumeId
            if (contentChanged) existing.revision = preferFiles ? Math.max(1, fileRevision) : fileRevision
            else if (titleChanged || orderChanged || volumeChanged) existing.revision = Math.max(existing.revision, fileRevision)
            if (contentChanged || titleChanged || orderChanged || volumeChanged) { report.chapters.updated += 1; report.changed = true }
          } else {
            report.chapters.conflicts += 1
          }
        }
        // 角色
        for (const relative of await listMofeiMarkdown(path.join(base, 'characters'))) {
          const parsed = parseFrontmatter(await mofeiReadFile(relative))
          const id = typeof parsed.meta.id === 'string' && parsed.meta.id ? parsed.meta.id : path.basename(relative, '.md')
          bumpNextId(id)
          const existing = characterBy(project, id)
          if (!existing) {
            project.characters.push({ id, name: text(parsed.meta.name, '未命名角色'), description: parsed.body, isFavorited: !!parsed.meta.isFavorited })
            report.characters.added += 1; report.changed = true
          } else {
            const changed = text(parsed.meta.name, existing.name) !== existing.name || parsed.body !== existing.description || !!parsed.meta.isFavorited !== !!existing.isFavorited
            if (changed) {
              existing.name = text(parsed.meta.name, existing.name)
              existing.description = parsed.body
              existing.isFavorited = !!parsed.meta.isFavorited
              report.characters.updated += 1; report.changed = true
            }
          }
        }
        // 笔记
        for (const relative of await listMofeiMarkdown(path.join(base, 'notes'))) {
          const parsed = parseFrontmatter(await mofeiReadFile(relative))
          const id = typeof parsed.meta.id === 'string' && parsed.meta.id ? parsed.meta.id : path.basename(relative, '.md')
          bumpNextId(id)
          let categoryId = typeof parsed.meta.categoryId === 'string' && parsed.meta.categoryId ? parsed.meta.categoryId : null
          if (categoryId && !(project.noteCategories || []).some((category) => category.id === categoryId)) categoryId = null
          const existing = noteBy(project, id)
          if (!existing) {
            project.notes.push({ id, title: text(parsed.meta.title, '未命名笔记'), content: parsed.body, categoryId, isLocked: !!parsed.meta.isLocked, isHidden: !!parsed.meta.isHidden })
            report.notes.added += 1; report.changed = true
          } else {
            const changed = text(parsed.meta.title, existing.title) !== existing.title || parsed.body !== existing.content || categoryId !== (existing.categoryId || null) || !!parsed.meta.isLocked !== !!existing.isLocked || !!parsed.meta.isHidden !== !!existing.isHidden
            if (changed) {
              existing.title = text(parsed.meta.title, existing.title)
              existing.content = parsed.body
              existing.categoryId = categoryId
              existing.isLocked = !!parsed.meta.isLocked
              existing.isHidden = !!parsed.meta.isHidden
              report.notes.updated += 1; report.changed = true
            }
          }
        }
        // 世界书
        for (const relative of await listMofeiMarkdown(path.join(base, 'world'))) {
          const parsed = parseFrontmatter(await mofeiReadFile(relative))
          const id = typeof parsed.meta.id === 'string' && parsed.meta.id ? parsed.meta.id : path.basename(relative, '.md')
          bumpNextId(id)
          const existing = worldEntryBy(project, id)
          const incoming = normalizeWorldEntry({ name: parsed.meta.name, keys: parsed.meta.keys, content: parsed.body, isEnabled: parsed.meta.isEnabled !== false, constant: !!parsed.meta.constant, order: parsed.meta.order }, id, project.worldEntries.length)
          if (!existing) {
            project.worldEntries.push(incoming)
            report.worldEntries.added += 1; report.changed = true
          } else {
            const changed = incoming.name !== existing.name || JSON.stringify(normalizeKeys(incoming.keys)) !== JSON.stringify(normalizeKeys(existing.keys)) || incoming.content !== existing.content || incoming.isEnabled !== (existing.isEnabled !== false) || !!incoming.constant !== !!existing.constant || incoming.order !== existing.order
            if (changed) {
              existing.name = incoming.name
              existing.keys = normalizeKeys(incoming.keys)
              existing.content = incoming.content
              existing.isEnabled = incoming.isEnabled
              existing.constant = !!incoming.constant
              existing.order = incoming.order
              report.worldEntries.updated += 1; report.changed = true
            }
          }
        }
        // 摘要：summaries/chapters/*.md 与 summaries/ranges/*.md
        for (const relative of await listMofeiMarkdown(path.join(base, 'summaries'))) {
          const parsed = parseFrontmatter(await mofeiReadFile(relative))
          const fileUpdatedAt = typeof parsed.meta.updatedAt === 'number' && isFinite(parsed.meta.updatedAt) ? parsed.meta.updatedAt : 0
          const parts = relative.split(/[\\/]/)
          const kind = parts[parts.length - 2]
          if (kind === 'chapters') {
            const chapterId = typeof parsed.meta.chapterId === 'string' && parsed.meta.chapterId ? parsed.meta.chapterId : path.basename(relative, '.md')
            const existing = summaryStore.chapters && summaryStore.chapters[chapterId]
            if (!existing || fileUpdatedAt >= existing.updatedAt) {
              summaryStore = applyChapterSummary(summaryStore, chapterId, typeof parsed.meta.chapterRevision === 'number' ? parsed.meta.chapterRevision : 0, parsed.body)
              if (fileUpdatedAt) summaryStore.chapters[chapterId].updatedAt = fileUpdatedAt
              report.summaries.updated += 1; report.changed = true
            } else report.summaries.conflicts += 1
          } else if (kind === 'ranges') {
            const rangeId = typeof parsed.meta.id === 'string' && parsed.meta.id ? parsed.meta.id : path.basename(relative, '.md')
            const existing = (summaryStore.ranges || []).find((range) => range.id === rangeId)
            if (!existing || fileUpdatedAt >= existing.updatedAt) {
              summaryStore = applyRangeSummary(summaryStore, rangeId, Array.isArray(parsed.meta.chapterIds) ? parsed.meta.chapterIds : [], parsed.body)
              if (fileUpdatedAt) { const range = summaryStore.ranges.find((item) => item.id === rangeId); if (range) range.updatedAt = fileUpdatedAt }
              report.summaries.updated += 1; report.changed = true
            } else report.summaries.conflicts += 1
          }
        }
        // 链：chains/*.md
        for (const relative of await listMofeiMarkdown(path.join(base, 'chains'))) {
          const parsed = parseFrontmatter(await mofeiReadFile(relative))
          const id = typeof parsed.meta.id === 'string' && parsed.meta.id ? parsed.meta.id : path.basename(relative, '.md')
          bumpNextId(id)
          const fileUpdatedAt = typeof parsed.meta.updatedAt === 'number' && isFinite(parsed.meta.updatedAt) ? parsed.meta.updatedAt : 0
          const list = chainList(project.id).slice()
          const existing = list.find((item) => item.id === id)
          if (!existing || fileUpdatedAt >= existing.updatedAt) {
            const chain = { id, name: text(parsed.meta.name, '未命名链'), content: parsed.body, updatedAt: fileUpdatedAt || Date.now() }
            const byProject = {}
            Object.keys(chainStore.byProject).forEach((pid) => {
              if (pid === project.id) return
              Object.defineProperty(byProject, pid, { value: chainStore.byProject[pid], enumerable: true, writable: true, configurable: true })
            })
            Object.defineProperty(byProject, project.id, { value: existing ? list.map((item) => item.id === id ? chain : item) : list.concat([chain]), enumerable: true, writable: true, configurable: true })
            chainStore = { version: 1, byProject }
            report.chains.updated += 1; report.changed = true
          } else report.chains.conflicts += 1
        }
      }
      // v0.18: 阶段 1 工作区 .mofei/projects/**；阶段 2 rootDir 项目（小说文件夹）
      const projectsRoot = path.join(mofeiFileRoot, 'projects')
      let projectDirs = []
      try { projectDirs = (await readdir(projectsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() } catch (error) { /* 尚无 projects 目录 */ }
      for (const dirName of projectDirs) await importProjectDir(path.join(projectsRoot, dirName))
      for (const project of store.projects.slice()) {
        if (typeof project.rootDir === 'string' && project.rootDir.trim() && path.isAbsolute(project.rootDir)) {
          await importProjectDir(path.resolve(project.rootDir.trim()))
        }
      }
      report.nextId = store.nextId
      return report
    }
    async function dropChainsFor(projectId) {
      if (typeof projectId !== 'string' || !projectId) return
      if (!chainStore.byProject[projectId]) return
      const byProject = {}
      Object.keys(chainStore.byProject).forEach((id) => {
        if (id === projectId) return
        Object.defineProperty(byProject, id, { value: chainStore.byProject[id], enumerable: true, writable: true, configurable: true })
      })
      chainStore = { version: 1, byProject }
      await saveChains()
    }
    async function dropSummariesFor(chapterIds) {
      const doomed = new Set(Array.isArray(chapterIds) ? chapterIds : [])
      if (!doomed.size) return
      let changed = false
      const chapters = {}
      Object.keys(summaryStore.chapters).forEach((chapterId) => {
        if (doomed.has(chapterId)) changed = true
        else chapters[chapterId] = summaryStore.chapters[chapterId]
      })
      const ranges = summaryStore.ranges.filter((range) => {
        const touched = range.chapterIds.some((chapterId) => doomed.has(chapterId))
        if (touched) changed = true
        return !touched
      })
      if (changed) {
        summaryStore = { version: 1, chapters, ranges }
        await saveSummaries()
      }
    }
    function summaryPlanView(chapter) { return { id: chapter.id, title: chapter.title, order: chapter.order, revision: chapter.revision } }
    function summaryRangeView(group) {
      const saved = summaryStore.ranges.find((range) => range.id === group.id)
      return { id: group.id, title: group.title, chapterIds: group.chapterIds.slice(), summary: saved ? saved.summary : '', updatedAt: saved ? saved.updatedAt : 0, hasSummary: !!(saved && saved.summary) }
    }
    function isRangeSummaryStale(group, chaptersById, options) {
      const saved = summaryStore.ranges.find((range) => range.id === group.id)
      if (!saved || !saved.summary) return true
      const maxAgeDays = typeof (options && options.maxAgeDays) === 'number' && isFinite(options.maxAgeDays) ? options.maxAgeDays : 30
      if (Date.now() - saved.updatedAt > maxAgeDays * 86400e3) return true
      return group.chapterIds.some((chapterId) => {
        const chapter = chaptersById.get(chapterId)
        if (!chapter) return true
        const entry = summaryStore.chapters[chapterId]
        return !entry || entry.chapterRevision !== chapter.revision
      })
    }
    function currentModel() {
      const selectionService = ctx.get('agentDefaultModel')
      if (!selectionService) return null
      try {
        const selection = selectionService.currentSelection()
        const provider = selection && selection.provider || ''
        const model = selection && selection.model || ''
        return provider && model ? { provider, model } : null
      } catch (error) { return null }
    }
    async function generateText(provider, model, system, messages, maxTokens, hooks) {
      const llm = ctx.get('llm')
      if (llm === undefined) return { error: 'LLM_UNAVAILABLE' }
      let output = ''
      let failure = null
      try {
        const stream = llm.stream({ provider: provider, model: model, system: system, messages: messages, maxTokens: maxTokens })
        if (hooks && typeof hooks.onStream === 'function') hooks.onStream(stream)
        for await (const chunk of stream) {
          if (hooks && typeof hooks.isCanceled === 'function' && hooks.isCanceled()) {
            if (typeof stream.return === 'function') { try { await stream.return(null) } catch (error) { /* canceled */ } }
            return { canceled: true }
          }
          if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text
          else if (chunk && chunk.type === 'finish' && chunk.reason && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) failure = chunk.reason.failure
        }
      } catch (error) { return { error: 'LLM_FAILED:' + (error instanceof Error ? error.message : String(error)) } }
      if (failure) return { error: 'LLM_FAILED:' + (failure.code || 'error') + ':' + (failure.message || String(failure)) }
      if (!output) return { error: 'LLM_EMPTY' }
      return { text: output }
    }
    const SUMMARY_SYSTEM = '你是 墨扉小说编辑。请只输出摘要正文，不要解释，不要使用 Markdown 标记。'
    async function generateChapterSummary(selectedModel, chapter, args, hooks) {
      const request = summaryRequest(chapter, { maxChars: typeof (args && args.maxChars) === 'number' ? args.maxChars : 8000 })
      const result = await generateText(selectedModel.provider, selectedModel.model, SUMMARY_SYSTEM, buildAiMessages({ messages: [] }, request, { maxHistory: 0 }), 700, hooks)
      if (result.error || result.canceled) return result
      await mutate(async () => {
        summaryStore = applyChapterSummary(summaryStore, chapter.id, chapter.revision, result.text)
        await saveSummaries()
      })
      return { summary: result.text }
    }
    async function generateRangeSummary(selectedModel, group, chaptersById, args, hooks) {
      const pieces = group.chapterIds.map((chapterId) => {
        const chapter = chaptersById.get(chapterId)
        if (!chapter) return ''
        const entry = summaryStore.chapters[chapterId]
        const excerpt = entry && entry.summary ? entry.summary : String(chapter.content || '').replace(/\s+/g, '').slice(0, 400)
        return '《' + chapter.title + '》' + (excerpt ? '：' + excerpt : '')
      }).filter(Boolean).join('\n')
      const request = '请为以下连续章节生成 300 字以内的区间摘要，只输出摘要正文：\n' + pieces
      const result = await generateText(selectedModel.provider, selectedModel.model, SUMMARY_SYSTEM, buildAiMessages({ messages: [] }, request, { maxHistory: 0 }), 900, hooks)
      if (result.error || result.canceled) return result
      await mutate(async () => {
        summaryStore = applyRangeSummary(summaryStore, group.id, group.chapterIds, result.text)
        summaryStore = { version: 1, chapters: summaryStore.chapters, ranges: summaryStore.ranges.map((range) => range.id === group.id ? { ...range, title: group.title } : range) }
        await saveSummaries()
      })
      return { summary: result.text }
    }
    function selectRangeGroups(groups, rangeIds) {
      const wanted = Array.isArray(rangeIds) && rangeIds.length ? rangeIds : null
      if (!wanted) return { groups, notFound: false }
      const selected = groups.filter((group) => wanted.includes(group.id))
      return { groups: selected, notFound: selected.length === 0 }
    }
    async function buildAiAssistRequest(project, args) {
      const selectedModel = currentModel()
      if (!selectedModel) return { error: 'LLM_UNAVAILABLE' }
      const mode = args && args.mode || 'custom'
      const chapter = chapterBy(project, args && args.chapterId)
      const content = chapter ? String(chapter.content) : ''
      const selected = typeof (args && args.selected) === 'string' ? args.selected : ''
      const customPrompt = typeof (args && args.prompt) === 'string' ? args.prompt.trim() : ''
      const contextInfo = buildChapterContext(project, chapter || null, { tailChars: 6000, maxEntries: 30, maxChars: 8000, maxEntryChars: 1500 })
      const context = contextInfo.contextText
      // v0.10.1: 当前写作风格注入续写/改写/自定义（项目级 styles/ 覆盖全局）。
      const styleId = (args && args.styleId) || project.currentStyle || 'default'
      const style = parseStyle(await readStyle(styleId, project.id), styleId)
      const styleBlock = style.content ? `【当前写作风格：${style.name}】\n${style.content}\n\n` : ''
      const system = styleBlock + '你是 墨扉小说写作助手。以下项目背景、角色、世界书激活条目、设定笔记与前情章节为参考信息（锁定笔记为不可更改的世界观）。只输出正文文本本身，不要解释、不要使用 Markdown 标题或列表标记，保持与原文一致的风格、视角和时态。'
      let user = ''
      if (mode === 'continue') user = '请续写本章，自然衔接现有内容：\n\n' + content.slice(-6000)
      else if (mode === 'rewrite') user = '请改写以下选中文本（保留原意并改进表达）' + (customPrompt ? '，要求：' + customPrompt : '') + '：\n\n' + selected
      else if (mode === 'summary') user = '请为本章生成 200 字以内的摘要：\n\n' + content.slice(0, 12000)
      else user = (customPrompt || '请根据上下文提供写作建议') + '\n\n本章现有内容：\n' + content.slice(-6000)
      const history = aiSessionSnapshot(project.id)
      const maxHistory = args && typeof args.maxHistory === 'number' ? args.maxHistory : 8
      const messages = buildAiMessages(history, user, { maxHistory })
      return { selectedModel, mode, system: system + '\n\n' + context, messages, user, contextInfo, styleId: styleId, styleName: style.name || styleId }
    }
    async function persistAiExchange(projectId, user, mode, text) {
      return mutate(async () => {
        let session = aiSessionFor(projectId)
        session = appendAiMessage(session, { role: 'user', content: user, mode }).session
        session = appendAiMessage(session, { role: 'assistant', content: text, mode }).session
        aiSessions.sessions[projectId] = session
        await saveAiSessions()
        return session.messages.length
      })
    }
    function sseErrorFrame(code, message) {
      return sseEvent('error', { code: code, message: typeof message === 'string' && message ? message : code })
    }
    function writeSse(res, frame) {
      if (typeof res.write === 'function') { res.write(frame); return true }
      return false
    }
    async function streamAiAssist(req, res, args) {
      await load(); await queue
      const project = projectBy(args && args.projectId)
      if (!project) { writeSse(res, sseErrorFrame('PROJECT_NOT_FOUND', '项目不存在')); res.end(); return }
      const request = await buildAiAssistRequest(project, args)
      if (request.error) { writeSse(res, sseErrorFrame(request.error, request.error)); res.end(); return }
      const llm = ctx.get('llm')
      if (llm === undefined) { writeSse(res, sseErrorFrame('LLM_UNAVAILABLE', '模型服务不可用')); res.end(); return }
      res.statusCode = 200
      res.setHeader('content-type', 'text/event-stream; charset=utf-8')
      res.setHeader('cache-control', 'no-cache, no-transform')
      res.setHeader('connection', 'keep-alive')
      if (typeof res.flushHeaders === 'function') res.flushHeaders()
      let output = ''
      let failure = null
      let closed = false
      let ended = false
      const finishResponse = () => { if (!ended) { ended = true; try { res.end() } catch (error) { /* already closed */ } } }
      if (req && typeof req.once === 'function') req.once('close', () => { closed = true; finishResponse() })
      try {
        const stream = llm.stream({ provider: request.selectedModel.provider, model: request.selectedModel.model, system: request.system, messages: request.messages, maxTokens: 2048 })
        for await (const chunk of stream) {
          if (closed) {
            if (stream && typeof stream.return === 'function') { try { await stream.return(null) } catch (error) { /* aborted */ } }
            return
          }
          if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') {
            output += chunk.text
            writeSse(res, sseEvent('delta', { text: chunk.text }))
          } else if (chunk && chunk.type === 'finish' && chunk.reason && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
            failure = chunk.reason.failure
          }
        }
        if (closed) return
        if (failure) {
          writeSse(res, sseErrorFrame('LLM_FAILED:' + (failure.code || 'error'), failure.message || String(failure)))
          finishResponse()
          return
        }
        if (!output) {
          writeSse(res, sseErrorFrame('LLM_EMPTY', '模型未返回内容'))
          finishResponse()
          return
        }
        const historyCount = await persistAiExchange(project.id, request.user, request.mode, output)
        writeSse(res, sseEvent('done', { text: output, mode: request.mode, historyCount }))
        finishResponse()
      } catch (error) {
        if (!closed) {
          writeSse(res, sseErrorFrame('LLM_FAILED', error instanceof Error ? error.message : String(error)))
          finishResponse()
        }
      }
    }
    async function streamSummarize(req, res, args) {
      await load(); await queue
      const project = projectBy(args && args.projectId)
      if (!project) { writeSse(res, sseErrorFrame('PROJECT_NOT_FOUND', '项目不存在')); res.end(); return }
      const kind = args && args.kind
      if (kind !== 'chapters' && kind !== 'ranges') { writeSse(res, sseErrorFrame('INVALID_KIND', '无效的摘要类型')); res.end(); return }
      const selectedModel = currentModel()
      if (!selectedModel) { writeSse(res, sseErrorFrame('LLM_UNAVAILABLE', '模型服务不可用')); res.end(); return }
      const llm = ctx.get('llm')
      if (llm === undefined) { writeSse(res, sseErrorFrame('LLM_UNAVAILABLE', '模型服务不可用')); res.end(); return }
      res.statusCode = 200
      res.setHeader('content-type', 'text/event-stream; charset=utf-8')
      res.setHeader('cache-control', 'no-cache, no-transform')
      res.setHeader('connection', 'keep-alive')
      if (typeof res.flushHeaders === 'function') res.flushHeaders()
      let closed = false
      let ended = false
      const finishResponse = () => { if (!ended) { ended = true; try { res.end() } catch (error) { /* already closed */ } } }
      if (req && typeof req.once === 'function') req.once('close', () => { closed = true; finishResponse() })
      const hooks = { isCanceled: () => closed }
      try {
        if (kind === 'chapters') {
          const chapters = chapterSelection(project.chapters, args && args.chapterIds)
          const force = args && args.force === true
          const plan = chapters.length ? (force ? { stale: chapters, fresh: [], total: chapters.length } : planSummaryBatch(chapters, summaryStore, { maxAgeDays: typeof (args && args.maxAgeDays) === 'number' ? args.maxAgeDays : 30 })) : { stale: [], fresh: [], total: 0 }
          const total = plan.stale.length
          const summaries = []
          let done = 0
          for (const chapter of plan.stale) {
            if (closed) return
            writeSse(res, sseEvent('progress', { done, total, chapterId: chapter.id, title: chapter.title }))
            const generated = await generateChapterSummary(selectedModel, chapter, args, hooks)
            if (closed) return
            if (generated.canceled) return
            if (generated.error) { writeSse(res, sseErrorFrame(generated.error, generated.error)); finishResponse(); return }
            summaries.push({ chapterId: chapter.id, title: chapter.title, summary: generated.summary })
            done += 1
          }
          if (closed) return
          writeSse(res, sseEvent('done', { summaries, count: summaries.length, total: chapters.length, staleCount: plan.stale.length, freshCount: plan.fresh.length, fresh: plan.fresh.map(summaryPlanView) }))
          finishResponse()
          return
        }
        const size = typeof (args && args.size) === 'number' && isFinite(args.size) && args.size >= 1 ? Math.floor(args.size) : 10
        const selected = selectRangeGroups(buildRangeGroups(project.chapters, size), args && args.rangeIds)
        if (selected.notFound) { writeSse(res, sseErrorFrame('RANGE_NOT_FOUND', '区间不存在')); finishResponse(); return }
        const groups = selected.groups
        if (!groups.length) {
          writeSse(res, sseEvent('done', { summaries: [], count: 0, total: 0, staleCount: 0, freshCount: 0 }))
          finishResponse()
          return
        }
        const chaptersById = new Map(project.chapters.map((chapter) => [chapter.id, chapter]))
        const options = { maxAgeDays: typeof (args && args.maxAgeDays) === 'number' ? args.maxAgeDays : 30 }
        const force = args && args.force === true
        const staleGroups = force ? groups : groups.filter((group) => isRangeSummaryStale(group, chaptersById, options))
        const total = staleGroups.length
        const summaries = []
        let done = 0
        for (const group of staleGroups) {
          if (closed) return
          writeSse(res, sseEvent('progress', { done, total, rangeId: group.id, title: group.title }))
          const generated = await generateRangeSummary(selectedModel, group, chaptersById, args, hooks)
          if (closed) return
          if (generated.canceled) return
          if (generated.error) { writeSse(res, sseErrorFrame(generated.error, generated.error)); finishResponse(); return }
          summaries.push({ rangeId: group.id, title: group.title, summary: generated.summary })
          done += 1
        }
        if (closed) return
        writeSse(res, sseEvent('done', { summaries, count: summaries.length, total: groups.length, staleCount: staleGroups.length, freshCount: groups.length - staleGroups.length }))
        finishResponse()
      } catch (error) {
        if (!closed) {
          writeSse(res, sseErrorFrame('LLM_FAILED', error instanceof Error ? error.message : String(error)))
          finishResponse()
        }
      }
    }
    // v9: prompt chains（纯逻辑见 prompt-chain.js；此处负责持久化/上下文组装/LLM 桥接）
    function chainList(projectId) {
      const list = chainStore.byProject[projectId]
      return Array.isArray(list) ? list : []
    }
    // v0.10.1: 链上下文包含当前写作风格（{{style}} 宏 + 系统提示注入）。
    async function buildPromptChainContext(project, args) {
      const chapter = chapterBy(project, args && args.chapterId)
      const charset = slice200
      const characters = (Array.isArray(project.characters) ? project.characters : []).map((item) => charset(text(item.name, '未命名角色')) + '：' + charset(typeof item.description === 'string' ? item.description : '')).join('\n')
      const world = (Array.isArray(project.worldEntries) ? project.worldEntries : []).filter((entry) => entry.isEnabled !== false).map((entry) => charset(text(entry.name, '未命名条目')) + '：' + charset(typeof entry.content === 'string' ? entry.content : '')).join('\n')
      const notes = (Array.isArray(project.notes) ? project.notes : []).filter((note) => !note.isHidden).map((note) => charset(text(note.title, '未命名笔记')) + '：' + charset(typeof note.content === 'string' ? note.content : '')).join('\n')
      const styleId = (args && args.styleId) || project.currentStyle || 'default'
      const style = parseStyle(await readStyle(styleId, project.id), styleId)
      return {
        project: typeof project.title === 'string' ? project.title : '',
        chapter: chapter && typeof chapter.title === 'string' ? chapter.title : '',
        chapterText: chapter && typeof chapter.content === 'string' ? chapter.content.slice(0, 12000) : '',
        selected: typeof (args && args.selected) === 'string' ? args.selected : '',
        characters,
        world,
        notes,
        instruction: typeof (args && args.instruction) === 'string' ? args.instruction : '',
        style: style.content,
        styleId,
        styleName: style.name || styleId,
      }
    }
    async function snapshot() { await load(); await queue; return { projects: store.projects.map(projectView), drafts: draftStore.items.map(draftView), stats: statsView() } }
    // v0.10.1: git 适配（P2：Prompt Chains 版本 diff / 项目历史）。非 git 工作区优雅降级。
    // v0.10.2: 节流（最多每 10s 一次 commit，尾随合并）+ 串行队列。
    // saveProjects 会等待 git 提交完成，避免「git add 进行中写入被并入前一个提交」的竞态；
    // 链保存/删除用 force=true 立即提交（离散操作，不受节流）。
    const GIT_COMMIT_INTERVAL_MS = 10000
    let gitPendingMessage = '墨扉 更新'
    let gitCommitTimer = null
    let gitLastCommitAt = 0
    let gitQueue = Promise.resolve()
    function runGit(args, gitCwd) {
      return new Promise((resolve) => {
        execFile('git', args, { cwd: gitCwd || cwd, timeout: 10000 }, (error, stdout, stderr) => {
          if (error) resolve({ error: String(error.message || error), code: typeof error.code === 'number' ? error.code : null, stdout: String(stdout || ''), stderr: String(stderr || '') })
          else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
        })
      })
    }
    async function gitAvailable() {
      const result = await runGit(['rev-parse', '--is-inside-work-tree'])
      return !result.error && String(result.stdout).trim() === 'true'
    }
    async function gitCommitAll(message, force) {
      if (isVirtualRoot()) return { skipped: true }
      const available = await gitAvailable()
      if (!available) return { available: false }
      if (!force) {
        const now = Date.now()
        if (now - gitLastCommitAt < GIT_COMMIT_INTERVAL_MS) {
          gitPendingMessage = message || gitPendingMessage
          if (!gitCommitTimer) {
            const delay = GIT_COMMIT_INTERVAL_MS - (now - gitLastCommitAt)
            gitCommitTimer = setTimeout(() => { gitCommitTimer = null; gitCommitAll(gitPendingMessage, true) }, delay)
          }
          return { scheduled: true }
        }
      }
      const run = gitQueue.then(async () => {
        try {
          const add = await runGit(['add', '.mofei'])
          if (add.error) return { available: true, committed: false, error: add.error }
          // Windows 下 -m 参数按 ANSI 代码页传参会损坏中文，改用临时 UTF-8 文件 + -F。
          const messageFile = path.join(os.tmpdir(), `mofei-gitmsg-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`)
          try {
            await writeFile(messageFile, String(message || '墨扉 更新').slice(0, 200), 'utf8')
            const commit = await runGit(['commit', '-F', messageFile])
            if (commit.error) {
              if (String(commit.stdout + commit.stderr).includes('nothing to commit')) return { available: true, committed: false, reason: 'no-changes' }
              return { available: true, committed: false, error: commit.error }
            }
            return { available: true, committed: true }
          } finally {
            try { await rm(messageFile, { force: true }) } catch (error) { /* noop */ }
          }
        } catch (error) {
          return { available: true, committed: false, error: String(error && error.message || error) }
        } finally {
          gitLastCommitAt = Date.now()
        }
      })
      gitQueue = run.then(() => undefined, () => undefined)
      return run
    }
    // v0.10.2: DSH Jobs 集成（摘要后台任务）。jobs 服务缺失时优雅降级为同步/SSE 路径。
    const mofeiJobRecords = new Map() // jobId -> record
    const mofeiJobCancels = new Map() // jobId -> () => void
    function jobsService() {
      const jobs = ctx.get('jobs')
      return jobs && typeof jobs.start === 'function' ? jobs : null
    }
    async function runChapterSummariesJob(project, args, record, canceled) {
      const selectedModel = currentModel()
      if (!selectedModel) throw new Error('LLM_UNAVAILABLE')
      const chapters = chapterSelection(project.chapters, args && args.chapterIds)
      const force = args && args.force === true
      const plan = force ? { stale: chapters, fresh: [], total: chapters.length } : planSummaryBatch(chapters, summaryStore, { maxAgeDays: typeof (args && args.maxAgeDays) === 'number' ? args.maxAgeDays : 30 })
      const total = plan.stale.length
      record.total = total
      record.done = 0
      const summaries = []
      for (const chapter of plan.stale) {
        if (canceled.canceled) throw new Error('JOB_CANCELED')
        record.current = chapter.title || chapter.id
        const generated = await generateChapterSummary(selectedModel, chapter, args, { isCanceled: () => canceled.canceled })
        if (generated.canceled) throw new Error('JOB_CANCELED')
        if (generated.error) throw new Error(generated.error)
        summaries.push({ chapterId: chapter.id, title: chapter.title, summary: generated.summary })
        record.done += 1
      }
      return summaries
    }
    async function runRangeSummariesJob(project, args, record, canceled) {
      const selectedModel = currentModel()
      if (!selectedModel) throw new Error('LLM_UNAVAILABLE')
      const size = typeof (args && args.size) === 'number' && isFinite(args.size) && args.size >= 1 ? Math.floor(args.size) : 10
      const selected = selectRangeGroups(buildRangeGroups(project.chapters, size), args && args.rangeIds)
      if (selected.notFound) throw new Error('RANGE_NOT_FOUND')
      const groups = selected.groups
      const chaptersById = new Map(project.chapters.map((chapter) => [chapter.id, chapter]))
      const options = { maxAgeDays: typeof (args && args.maxAgeDays) === 'number' ? args.maxAgeDays : 30 }
      const force = args && args.force === true
      const staleGroups = force ? groups : groups.filter((group) => isRangeSummaryStale(group, chaptersById, options))
      record.total = staleGroups.length
      record.done = 0
      const summaries = []
      for (const group of staleGroups) {
        if (canceled.canceled) throw new Error('JOB_CANCELED')
        record.current = group.title || group.id
        const generated = await generateRangeSummary(selectedModel, group, chaptersById, args, { isCanceled: () => canceled.canceled })
        if (generated.canceled) throw new Error('JOB_CANCELED')
        if (generated.error) throw new Error(generated.error)
        summaries.push({ rangeId: group.id, title: group.title, summary: generated.summary })
        record.done += 1
      }
      return summaries
    }
    // v0.10.1: 检索辅助（纯函数 + 每项目缓存）。
    const retrieveCache = new Map()
    const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/
    const LATIN_RE = /[A-Za-z0-9]/
    function simpleHash(value) {
      let hash = 2166136261
      const source = String(value || '')
      for (let i = 0; i < source.length; i += 1) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619) }
      return (hash >>> 0).toString(36)
    }
    function tokenizeRetrieval(value) {
      const tokens = []
      const source = String(value || '')
      let run = ''
      const flush = () => { if (run) { tokens.push(run.toLowerCase()); run = '' } }
      for (let i = 0; i < source.length; i += 1) {
        const ch = source[i]
        if (CJK_RE.test(ch)) {
          flush()
          if (i + 1 < source.length && CJK_RE.test(source[i + 1])) tokens.push(ch + source[i + 1])
          tokens.push(ch)
        } else if (LATIN_RE.test(ch)) {
          run += ch
        } else {
          flush()
        }
      }
      flush()
      return tokens
    }
    function buildRetrieveIndex(project) {
      const index = new Map()
      const addToken = (token, entityType, entityId, line) => {
        let postings = index.get(token)
        if (!postings) { postings = []; index.set(token, postings) }
        const last = postings[postings.length - 1]
        if (last && last.entityType === entityType && last.entityId === entityId && last.line === line) last.count += 1
        else postings.push({ entityType, entityId, line, count: 1 })
      }
      const indexLines = (entityType, entityId, content) => {
        const lines = String(content || '').split('\n')
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          for (const token of tokenizeRetrieval(lines[lineIndex])) addToken(token, entityType, entityId, lineIndex + 1)
        }
      }
      project.chapters.forEach((chapter) => indexLines('chapter', chapter.id, chapter.title + '\n' + chapter.content))
      ;(project.characters || []).forEach((character) => indexLines('character', character.id, character.name + '\n' + character.description))
      ;(project.notes || []).forEach((note) => indexLines('note', note.id, note.title + '\n' + note.content))
      ;(project.worldEntries || []).forEach((entry) => indexLines('world', entry.id, entry.name + '\n' + entry.content))
      Object.keys(summaryStore.chapters || {}).forEach((chapterId) => {
        const entry = summaryStore.chapters[chapterId]
        if (entry && entry.summary) indexLines('summary', chapterId, entry.summary)
      })
      return index
    }
    function retrieveSignature(project) {
      let signature = ''
      project.chapters.forEach((chapter) => { signature += chapter.id + ':' + chapter.revision + ':' + simpleHash(chapter.title) + ';' })
      ;(project.characters || []).forEach((character) => { signature += 'c' + character.id + ':' + simpleHash(character.name + '\u0000' + character.description) + ';' })
      ;(project.notes || []).forEach((note) => { signature += 'n' + note.id + ':' + simpleHash(note.title + '\u0000' + note.content) + ';' })
      ;(project.worldEntries || []).forEach((entry) => { signature += 'w' + entry.id + ':' + simpleHash(entry.name + '\u0000' + entry.content) + ';' })
      Object.keys(summaryStore.chapters || {}).forEach((chapterId) => {
        const entry = summaryStore.chapters[chapterId]
        if (entry && entry.summary) signature += 's' + chapterId + ':' + entry.updatedAt + ';'
      })
      return signature
    }
    function locateEntityLine(project, entityType, entityId, line) {
      const fallback = { title: entityId, lineText: '' }
      const at = (title, content) => ({ title, lineText: String(content || '').split('\n')[Math.max(0, (line || 1) - 1)] || '' })
      // v0.10.2: 章节类命中携带卷信息，便于客户端按卷分组。
      const volFor = (chapter) => {
        const volume = chapter && chapter.volumeId && volumeBy(project, chapter.volumeId)
        return { volumeId: volume ? volume.id : null, volumeTitle: volume ? volume.title : null }
      }
      if (entityType === 'chapter') { const chapter = chapterBy(project, entityId); return chapter ? { ...at(chapter.title, chapter.content), ...volFor(chapter) } : fallback }
      if (entityType === 'character') { const character = characterBy(project, entityId); return character ? at(character.name, character.description) : fallback }
      if (entityType === 'note') { const note = noteBy(project, entityId); return note ? at(note.title, note.content) : fallback }
      if (entityType === 'world') { const entry = worldEntryBy(project, entityId); return entry ? at(entry.name, entry.content) : fallback }
      if (entityType === 'summary') { const entry = summaryStore.chapters && summaryStore.chapters[entityId]; const chapter = chapterBy(project, entityId); return entry ? { ...at('摘要·' + (chapter ? chapter.title : entityId), entry.summary), ...volFor(chapter), chapterId: entityId } : fallback }
      return fallback
    }
    function snippetFor(lineText, query) {
      const source = String(lineText || '')
      if (!source) return ''
      const lowered = source.toLowerCase()
      let index = -1
      for (const token of tokenizeRetrieval(query)) {
        const found = lowered.indexOf(token)
        if (found >= 0) { index = found; break }
      }
      if (index < 0) index = 0
      const start = Math.max(0, index - 40)
      const end = Math.min(source.length, index + 80)
      return (start > 0 ? '…' : '') + source.slice(start, end) + (end < source.length ? '…' : '')
    }    const handlers = {
      'bootstrap': async () => snapshot(),
      'list-projects': async () => ({ projects: (await snapshot()).projects }),
      // 每本小说拥有一个专属 mofei-writer 会话。DSH 的标准开发会话绝不被复用或切换。
      'writer-session': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        return { projectId: project.id, sessionId: projectWriterSessionId(project) || null }
      },
      'bind-writer-session': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const sessionId = typeof (args && args.sessionId) === 'string' ? args.sessionId.trim() : ''
        if (!sessionId || sessionId.length > 512) return { error: 'INVALID_SESSION_ID' }
        project.writerSessionId = sessionId
        await saveProjects()
        return { projectId: project.id, sessionId }
      }),
      // UI 仅绑定当前项目及可选章节；写作 Agent 在实际执行前读取最新上下文。
      'bind-agent-context': async (args) => {
        await load(); await queue
        const binding = boundAgentContext(args)
        if (!binding) return { bound: false, error: 'INVALID_AGENT_CONTEXT' }
        const project = projectBy(binding.projectId)
        const chapter = binding.chapterId ? chapterBy(project, binding.chapterId) : null
        if (!project || (binding.chapterId && !chapter)) { agentContexts.delete(binding.sessionId); return { bound: false, error: project ? 'CHAPTER_NOT_FOUND' : 'PROJECT_NOT_FOUND' } }
        agentContexts.set(binding.sessionId, { projectId: binding.projectId, chapterId: binding.chapterId, updatedAt: Date.now() })
        return { bound: true, project: { id: project.id, title: project.title }, chapter: chapter ? { id: chapter.id, title: chapter.title, revision: chapter.revision } : null }
      },
      'list-entities': async (args) => { await load(); await queue; const project = projectBy(args && args.projectId); const kind = args && args.kind; if (!project) return { error: 'PROJECT_NOT_FOUND' }; if (kind === 'volumes') return { items: (project.volumes || []).map((item) => volumeView(item, project.chapters)) }; if (kind === 'chapters') return { items: project.chapters.map(chapterView) }; if (kind === 'characters') return { items: (project.characters || []).map(characterView) }; if (kind === 'notes') return { items: (project.notes || []).map(noteView) }; if (kind === 'world') return { items: (project.worldEntries || []).map(worldEntryView) }; if (kind === 'summaries') return { items: summaryStore.ranges || [] }; if (kind === 'chains') return { items: (chainStore.projects && chainStore.projects[project.id] || []) }; return { error: 'INVALID_KIND' } },
      'read-character': async (args) => { await load(); await queue; const project = projectBy(args && args.projectId); const character = characterBy(project, args && args.characterId); if (!character) return { error: project ? 'CHARACTER_NOT_FOUND' : 'PROJECT_NOT_FOUND' }; return { character: characterView(character) } },
      'read-note': async (args) => { await load(); await queue; const project = projectBy(args && args.projectId); const note = noteBy(project, args && args.noteId); if (!note) return { error: project ? 'NOTE_NOT_FOUND' : 'PROJECT_NOT_FOUND' }; if (note.isHidden) return { error: 'NOTE_HIDDEN' }; return { note: noteView(note) } },
      'read-world-entry': async (args) => { await load(); await queue; const project = projectBy(args && args.projectId); const entry = worldEntryBy(project, args && args.entryId); if (!entry) return { error: project ? 'WORLD_ENTRY_NOT_FOUND' : 'PROJECT_NOT_FOUND' }; return { entry: worldEntryView(entry) } },
      // 技能只在 mofei-writer preset 中注册；此处仅向写作工作台提供可浏览的目录，
      // 让作者清楚当前写作助手实际具备哪些 OpenFic 写作能力。
      'list-writing-skills': async () => ({ skills: mofeiSkills.map((skill) => ({ name: skill.name, description: skill.description, whenToUse: skill.whenToUse, invocation: skill.invocation, provider: skill.provider, content: skill.content })) }),
      // v0.17: 技能开关 + 自创技能（写入 ~/.dsh/skills/，DSH skill-filesystem 自动发现）。
      'list-skill-settings': async () => {
        await load(); await queue
        const disabled = new Set(skillSettings.disabledSkills)
        return {
          skills: mofeiSkills.map((skill) => ({ name: skill.name, description: skill.description, whenToUse: skill.whenToUse, enabled: !disabled.has(skill.name) })),
          disabledSkills: skillSettings.disabledSkills.slice(),
          custom: await listCustomSkills(),
        }
      },
      'set-skill-enabled': async (args) => mutate(async () => {
        await load()
        const skillId = typeof (args && args.skillId) === 'string' ? args.skillId : ''
        if (!skillId || !mofeiSkills.some((skill) => skill.name === skillId)) return { error: 'SKILL_NOT_FOUND' }
        const enabled = (args && args.enabled) === false ? false : true
        skillSettings.disabledSkills = skillSettings.disabledSkills.filter((item) => item !== skillId)
        if (!enabled) skillSettings.disabledSkills.push(skillId)
        await saveSkillSettings()
        return { skillId, enabled, note: '下次新建写作会话时生效' }
      }),
      'create-custom-skill': async (args) => mutate(async () => {
        const name = typeof (args && args.name) === 'string' ? args.name.trim() : ''
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return { error: 'INVALID_SKILL_NAME', hint: '技能名须为小写 kebab-case（如 my-style-check）' }
        const description = typeof (args && args.description) === 'string' ? args.description.trim() : ''
        if (!description) return { error: 'DESCRIPTION_REQUIRED' }
        const whenToUse = typeof (args && args.whenToUse) === 'string' ? args.whenToUse.trim() : ''
        const content = typeof (args && args.content) === 'string' ? args.content : ''
        const dir = customSkillDir()
        await mkdir(dir, { recursive: true })
        const front = '---\nname: ' + name + '\ndescription: ' + JSON.stringify(description) + '\n' + (whenToUse ? 'whenToUse: ' + JSON.stringify(whenToUse) + '\n' : '') + '---\n\n'
        await writeFile(path.join(dir, name + '.md'), front + content + '\n', 'utf8')
        return { saved: true, name, file: name + '.md' }
      }),
      'delete-custom-skill': async (args) => mutate(async () => {
        const name = typeof (args && args.name) === 'string' ? args.name.trim() : ''
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return { error: 'INVALID_SKILL_NAME' }
        try { await rm(path.join(customSkillDir(), name + '.md')); return { deleted: true, name } }
        catch (error) { return { deleted: false, name } }
      }),
      // v0.10.1: styles 列表支持项目级覆盖（projectId 提供时合并，项目级优先显示在全局之前）。
      'list-styles': async (args) => { await load(); await queue; const result = []; try { const { readdir } = await import('node:fs/promises'); const pushDir = async (dir, scope) => { let names = []; try { names = await readdir(dir) } catch (error) { return } for (const name of names.sort()) if (name.endsWith('.md')) { const item = parseStyle(await readFile(path.join(dir, name), 'utf8'), name.replace(/\.md$/, '')); if (scope === 'project' && result.some((existing) => existing.id === item.id)) continue; result.push({ id: item.id, name: item.name, description: item.description, tags: item.tags, file: name, content: item.content, scope }) } }; const projectId = args && args.projectId && projectBy(args.projectId) ? args.projectId : null; if (projectId) await pushDir(path.join(mofeiFileRoot, 'projects', safeFileSegment(projectId, 'project'), 'styles'), 'project'); await pushDir(path.join(cwd, '.mofei', 'styles'), 'global') } catch (error) { result.push({ id: 'default', name: '默认', file: 'default.md', content: '保持已有文风。', scope: 'global' }) } return { styles: result } },
      'get-style': async (args) => { await load(); await queue; const styleId = args && args.styleId; const projectId = args && args.projectId && projectBy(args.projectId) ? args.projectId : null; const textValue = await readStyle(styleId, projectId); if (!textValue) return { error: 'STYLE_NOT_FOUND', styleId: styleId || null }; const item = parseStyle(textValue, styleId); return { style: item, text: textValue, scope: projectId ? 'project' : 'global' } },
      'set-project-style': async (args) => mutate(async () => { const project = projectBy(args && args.projectId); if (!project) return { error: 'PROJECT_NOT_FOUND' }; const styleId = typeof (args && args.styleId) === 'string' && args.styleId.trim() ? args.styleId.trim() : ''; if (!styleId) return { error: 'STYLE_REQUIRED' }; const styleText = await readStyle(styleId, project.id); if (!styleText) return { error: 'STYLE_NOT_FOUND', styleId }; project.currentStyle = styleId; await saveProjects(); return { projectId: project.id, currentStyle: styleId } }),
      // v0.10.1: 风格 CRUD（scope: global 默认；project 写入项目级 styles/ 覆盖全局）。
      'save-style': async (args) => mutate(async () => {
        const styleId = typeof (args && args.styleId) === 'string' && args.styleId.trim() ? args.styleId.trim() : ''
        if (!styleId) return { error: 'STYLE_REQUIRED' }
        const scope = (args && args.scope) === 'project' ? 'project' : 'global'
        const projectId = scope === 'project' ? (args && args.projectId) : null
        if (scope === 'project' && !projectBy(projectId)) return { error: 'PROJECT_NOT_FOUND' }
        const name = text(args && args.name, styleId)
        const description = typeof (args && args.description) === 'string' ? args.description : ''
        const tags = Array.isArray(args && args.tags) ? args.tags.filter((item) => typeof item === 'string').slice(0, 20) : []
        const body = typeof (args && args.content) === 'string' ? args.content : ''
        const fileName = safeFileSegment(styleId, 'style') + '.md'
        const dir = scope === 'project' ? path.join(mofeiFileRoot, 'projects', safeFileSegment(projectId, 'project'), 'styles') : path.join(mofeiFileRoot, 'styles')
        await mkdir(dir, { recursive: true })
        await writeFile(path.join(dir, fileName), frontmatter({ id: styleId, name, description, tags }) + '\n' + body + '\n', 'utf8')
        return { saved: true, style: { id: styleId, name, description, tags, file: fileName, scope, projectId: projectId || null } }
      }),
      'delete-style': async (args) => mutate(async () => {
        const styleId = typeof (args && args.styleId) === 'string' && args.styleId.trim() ? args.styleId.trim() : ''
        if (!styleId) return { error: 'STYLE_REQUIRED' }
        const scope = (args && args.scope) === 'project' ? 'project' : 'global'
        const projectId = scope === 'project' ? (args && args.projectId) : null
        if (scope === 'project' && !projectBy(projectId)) return { error: 'PROJECT_NOT_FOUND' }
        const file = path.join(scope === 'project' ? path.join(mofeiFileRoot, 'projects', safeFileSegment(projectId, 'project'), 'styles') : path.join(mofeiFileRoot, 'styles'), safeFileSegment(styleId, 'style') + '.md')
        try { await rm(file); return { deleted: true, styleId, scope, projectId: projectId || null } } catch (error) { return { deleted: false, styleId, scope } }
      }),
      'get-project-style': async (args) => { await load(); await queue; const project = projectBy(args && args.projectId); if (!project) return { error: 'PROJECT_NOT_FOUND' }; return { currentStyle: project.currentStyle || 'default', style: parseStyle(await readStyle(project.currentStyle || 'default', project.id), project.currentStyle || 'default') } },
      'read-chapter': async (args) => { await load(); await queue; const project = projectBy(args && args.projectId); const chapter = chapterBy(project, args && args.chapterId); if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }; return { chapter: chapterView(chapter) } },
      // v0.10.1: 文件树唯一事实源——手动从 .mofei/projects/** 重载并落盘。
      'reload-from-files': async (args) => mutate(async () => {
        await load()
        const report = await importFileTree()
        await saveProjects()
        await saveSummaries()
        await saveChains()
        return report
      }),
      // v0.10.1: 每个实体文件与内存 store 的同步状态（revision 比较）。
      'file-tree-status': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const entities = []
        const push = (entry) => entities.push(entry)
        const statusOf = (fileRevision, storeRevision) => {
          if (fileRevision === null) return 'missing-file'
          if (fileRevision > storeRevision) return 'diverge-file'
          if (fileRevision < storeRevision) return 'diverge-store'
          return 'synced'
        }
        const base = projectFileBase(project)
        const fileRevisionOf = async (relative) => {
          try { return parseFrontmatter(await mofeiReadFile(relative)).meta.revision } catch (error) { return null }
        }
        const fileEntityOf = async (relative) => {
          try { return parseFrontmatter(await mofeiReadFile(relative)) } catch (error) { return null }
        }
        const syncedEntity = (parsed, nameKey, bodyKey, extra) => {
          if (!parsed) return false
          const meta = parsed.meta
          const store = extra || {}
          if (text(meta[nameKey], store[nameKey]) !== store[nameKey]) return false
          if (parsed.body !== store[bodyKey]) return false
          if (nameKey === 'name' && !!meta.isFavorited !== !!store.isFavorited) return false
          if (nameKey === 'title') {
            if ((typeof meta.isLocked === 'boolean' ? meta.isLocked : !!store.isLocked) !== !!store.isLocked) return false
            if ((typeof meta.isHidden === 'boolean' ? meta.isHidden : !!store.isHidden) !== !!store.isHidden) return false
            const metaCategory = typeof meta.categoryId === 'string' ? meta.categoryId : null
            if (metaCategory !== (store.categoryId || null)) return false
          }
          if (nameKey === 'name' && Array.isArray(meta.keys)) {
            if (JSON.stringify(normalizeKeys(meta.keys)) !== JSON.stringify(normalizeKeys(store.keys))) return false
            if ((typeof meta.isEnabled === 'boolean' ? meta.isEnabled : store.isEnabled !== false) !== (store.isEnabled !== false)) return false
            if ((typeof meta.constant === 'boolean' ? meta.constant : !!store.constant) !== !!store.constant) return false
            if (typeof meta.order === 'number' && meta.order !== store.order) return false
          }
          return true
        }
        push({ kind: 'project', id: project.id, file: path.join(base, 'project.yml'), exists: true, status: 'synced', storeRevision: null, fileRevision: null })
        for (const chapter of project.chapters) {
          const file = path.join(base, 'chapters', `${safeFileSegment(chapter.id, chapter.title || '章节')}.md`)
          const fileRevision = await fileRevisionOf(file)
          push({ kind: 'chapter', id: chapter.id, title: chapter.title, file, exists: fileRevision !== null, fileRevision, storeRevision: chapter.revision, status: statusOf(fileRevision, chapter.revision) })
        }
        for (const character of project.characters || []) {
          const file = path.join(base, 'characters', `${safeFileSegment(character.id, character.name || '角色')}.md`)
          const parsed = await fileEntityOf(file)
          push({ kind: 'character', id: character.id, name: character.name, file, exists: parsed !== null, fileRevision: null, storeRevision: null, status: parsed === null ? 'missing-file' : syncedEntity(parsed, 'name', 'description', character) ? 'synced' : 'diverge-file' })
        }
        for (const note of project.notes || []) {
          const file = path.join(base, 'notes', `${safeFileSegment(note.id, note.title || '笔记')}.md`)
          const parsed = await fileEntityOf(file)
          push({ kind: 'note', id: note.id, title: note.title, file, exists: parsed !== null, fileRevision: null, storeRevision: null, status: parsed === null ? 'missing-file' : syncedEntity(parsed, 'title', 'content', note) ? 'synced' : 'diverge-file' })
        }
        for (const entry of project.worldEntries || []) {
          const file = path.join(base, 'world', `${safeFileSegment(entry.id, entry.name || '条目')}.md`)
          const parsed = await fileEntityOf(file)
          push({ kind: 'world', id: entry.id, name: entry.name, file, exists: parsed !== null, fileRevision: null, storeRevision: null, status: parsed === null ? 'missing-file' : syncedEntity(parsed, 'name', 'content', entry) ? 'synced' : 'diverge-file' })
        }
        const summaryEntries = summaryStore.chapters || {}
        for (const chapterId of Object.keys(summaryEntries)) {
          const entry = summaryEntries[chapterId]
          const file = path.join(base, 'summaries', 'chapters', `${safeFileSegment(chapterId, 'chapter')}.md`)
          let fileUpdatedAt = null
          try { fileUpdatedAt = parseFrontmatter(await mofeiReadFile(file)).meta.updatedAt } catch (error) { /* missing */ }
          push({ kind: 'chapter-summary', id: chapterId, file, exists: fileUpdatedAt !== null, fileRevision: fileUpdatedAt, storeRevision: entry.updatedAt, status: fileUpdatedAt === null ? 'missing-file' : fileUpdatedAt > entry.updatedAt ? 'diverge-file' : fileUpdatedAt < entry.updatedAt ? 'diverge-store' : 'synced' })
        }
        for (const range of summaryStore.ranges || []) {
          const file = path.join(base, 'summaries', 'ranges', `${safeFileSegment(range.id, 'range')}.md`)
          let fileUpdatedAt = null
          try { fileUpdatedAt = parseFrontmatter(await mofeiReadFile(file)).meta.updatedAt } catch (error) { /* missing */ }
          push({ kind: 'range-summary', id: range.id, file, exists: fileUpdatedAt !== null, fileRevision: fileUpdatedAt, storeRevision: range.updatedAt, status: fileUpdatedAt === null ? 'missing-file' : fileUpdatedAt > range.updatedAt ? 'diverge-file' : fileUpdatedAt < range.updatedAt ? 'diverge-store' : 'synced' })
        }
        for (const chain of chainList(project.id)) {
          const file = path.join(base, 'chains', `${safeFileSegment(chain.id, chain.name || '链')}.md`)
          let fileUpdatedAt = null
          try { fileUpdatedAt = parseFrontmatter(await mofeiReadFile(file)).meta.updatedAt } catch (error) { /* missing */ }
          push({ kind: 'chain', id: chain.id, name: chain.name, file, exists: fileUpdatedAt !== null, fileRevision: fileUpdatedAt, storeRevision: chain.updatedAt, status: fileUpdatedAt === null ? 'missing-file' : fileUpdatedAt > chain.updatedAt ? 'diverge-file' : fileUpdatedAt < chain.updatedAt ? 'diverge-store' : 'synced' })
        }
        const summary = { total: entities.length, synced: 0, divergeFile: 0, divergeStore: 0, missingFile: 0 }
        entities.forEach((item) => { if (summary[item.status] !== undefined) summary[item.status] += 1 })
        return { projectId: project.id, entities, summary }
      },
      // v0.15: 变更检测轮询。storeStamp 变 → 工具/UI 写入（内存已新，UI 直接 reload）；
      // fileStamp 变而 storeStamp 不变 → 外部文件编辑（需 reload-from-files 文件优先导入）。
      'sync-status': async () => {
        await load(); await queue
        return { storeStamp: storeStamp(), fileStamp: await fileTreeStamp() }
      },
      'stats': async () => { await load(); await queue; return statsView() },
      'create-project': async (args) => mutate(async () => {
        // v0.18: rootDir（小说文件夹）可选；绝对路径时该项目实体文件存 rootDir
        const rootDir = typeof (args && args.rootDir) === 'string' ? args.rootDir.trim() : ''
        const safeRoot = rootDir && path.isAbsolute(rootDir) ? path.resolve(rootDir) : ''
        const project = { id: allocate('project'), title: text(args && args.title, '未命名项目'), description: text(args && args.description, ''), goal: 0, writerSessionId: '', ...(safeRoot ? { rootDir: safeRoot } : {}), chapters: [], volumes: [], characters: [], notes: [], noteCategories: [], worldEntries: [] }
        store.projects.push(project); await saveProjects(); return { project: projectView(project) }
      }),
      // v0.18: 向导回显项目存储位置（rootDir 或工作区默认）
      'get-project-root': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        return { projectId: project.id, rootDir: (typeof project.rootDir === 'string' && project.rootDir) ? project.rootDir : null, defaultRoot: path.join(mofeiFileRoot, 'projects', safeFileSegment(project.id, 'project')) }
      },
      'create-chapter': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const volumeId = args && args.volumeId && volumeBy(project, args.volumeId) ? args.volumeId : null
        const chapter = { id: allocate('chapter'), title: text(args && args.title, '未命名章节'), content: '', order: project.chapters.length, revision: 1, history: [], volumeId: volumeId }
        project.chapters.push(chapter); await saveProjects(); return { chapter: chapterView(chapter) }
      }),
      'update-project': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        if (typeof args.title === 'string' && args.title.trim()) project.title = args.title.trim()
        if (typeof args.description === 'string') project.description = args.description
        if (typeof args.goal === 'number' && args.goal >= 0) project.goal = Math.floor(args.goal)
        await saveProjects(); return { project: projectView(project) }
      }),
      'delete-project': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const removedChapterIds = project.chapters.map((item) => item.id)
        for (const [sessionId, binding] of agentContexts) if (binding.projectId === project.id) agentContexts.delete(sessionId)
        store.projects = store.projects.filter((item) => item.id !== project.id)
        const before = draftStore.items.length
        draftStore.items = draftStore.items.filter((item) => item.projectId !== project.id)
        if (before !== draftStore.items.length) await saveDrafts()
        await dropSummariesFor(removedChapterIds)
        await dropChainsFor(project.id)
        await saveProjects()
        if (!String(cwd).startsWith('virtual-root')) { try { await rm(path.join(mofeiFileRoot, 'projects', safeFileSegment(project.id, 'project')), { recursive: true, force: true }) } catch (error) { console.error('墨扉 mirror delete failed', error) } }
        return { deleted: true, projectId: project.id }
      }),
      'update-chapter-meta': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        if (typeof args.title === 'string' && args.title.trim()) chapter.title = args.title.trim()
        await saveProjects(); return { chapter: chapterView(chapter) }
      }),
      'delete-chapter': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const index = project.chapters.findIndex((item) => item.id === (args && args.chapterId))
        if (index < 0) return { error: 'CHAPTER_NOT_FOUND' }
        project.chapters.splice(index, 1)
        project.chapters.forEach((item, order) => { item.order = order })
        const before = draftStore.items.length
        draftStore.items = draftStore.items.filter((item) => !(item.projectId === project.id && item.chapterId === (args && args.chapterId)))
        if (before !== draftStore.items.length) await saveDrafts()
        await dropSummariesFor([args && args.chapterId])
        await saveProjects(); return { deleted: true, chapterId: args.chapterId }
      }),
      'move-chapter': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const index = project.chapters.findIndex((item) => item.id === (args && args.chapterId))
        if (index < 0) return { error: 'CHAPTER_NOT_FOUND' }
        const direction = args && args.direction === 'up' ? -1 : args && args.direction === 'down' ? 1 : 0
        const target = index + direction
        if (direction === 0 || target < 0 || target >= project.chapters.length) return { error: 'BOUNDARY' }
        const list = project.chapters
        const temp = list[index]; list[index] = list[target]; list[target] = temp
        list.forEach((item, order) => { item.order = order })
        await saveProjects(); return { chapter: chapterView(list[target]) }
      }),
      'save-draft': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        const item = { projectId: project.id, chapterId: chapter.id, content: typeof args.content === 'string' ? args.content : '', baseRevision: typeof args.baseRevision === 'number' ? args.baseRevision : chapter.revision }
        const index = draftStore.items.findIndex((current) => current.projectId === item.projectId && current.chapterId === item.chapterId)
        if (index < 0) draftStore.items.push(item); else draftStore.items[index] = item
        await saveDrafts(); return { draft: draftView(item), remoteRevision: chapter.revision }
      }),
      'clear-draft': async (args) => mutate(async () => {
        const count = draftStore.items.length
        draftStore.items = draftStore.items.filter((item) => !(item.projectId === (args && args.projectId) && item.chapterId === (args && args.chapterId)))
        if (count !== draftStore.items.length) await saveDrafts()
        return { cleared: count !== draftStore.items.length }
      }),
      'edit-chapter': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        if ((args && args.expectedRevision) !== chapter.revision) return { conflict: true, chapter: chapterView(chapter), expectedRevision: args && args.expectedRevision, actualRevision: chapter.revision }
        const lines = String(chapter.content || '').split('\n')
        const startLine = Number.isInteger(args && args.startLine) ? args.startLine : 1
        const endLine = Number.isInteger(args && args.endLine) ? args.endLine : startLine
        const replacement = typeof (args && args.replacement) === 'string' ? args.replacement : ''
        if (startLine < 1 || endLine < startLine || startLine > lines.length + 1) return { error: 'INVALID_RANGE' }
        const previous = chapter.content
        pushHistory(chapter, writeSource(args))
        lines.splice(startLine - 1, endLine - startLine + 1, ...replacement.split('\n'))
        chapter.content = lines.join('\n')
        chapter.revision += 1
        await saveProjects()
        const added = countAdded(previous, chapter.content)
        if (added > 0) { const key = dayKey(new Date()); const entry = stats.days[key] || (stats.days[key] = { chars: 0 }); entry.chars += added; await saveStats() }
        draftStore.items = draftStore.items.filter((item) => !(item.projectId === project.id && item.chapterId === chapter.id))
        await saveDrafts()
        return { saved: true, chapter: chapterView(chapter), stats: statsView() }
      }),
      'update-chapter': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        if ((args && args.expectedRevision) !== chapter.revision) return { conflict: true, chapter: chapterView(chapter), expectedRevision: args && args.expectedRevision, actualRevision: chapter.revision }
        const previous = chapter.content
        pushHistory(chapter, writeSource(args))
        chapter.content = typeof args.content === 'string' ? args.content : chapter.content
        chapter.revision += 1
        await saveProjects()
        const added = countAdded(previous, chapter.content)
        if (added > 0) {
          const key = dayKey(new Date())
          const entry = stats.days[key] || (stats.days[key] = { chars: 0 })
          entry.chars += added
          await saveStats()
        }
        draftStore.items = draftStore.items.filter((item) => !(item.projectId === project.id && item.chapterId === chapter.id))
        await saveDrafts()
        return { saved: true, chapter: chapterView(chapter), stats: statsView() }
      }),
      'chapter-history': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        const history = (Array.isArray(chapter.history) ? chapter.history : []).slice().reverse()
        return { history: history.map((item) => ({ revision: item.revision, at: item.at, chars: item.content.length, source: item.source || null })) }
      }),
      'rollback-chapter': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        const history = Array.isArray(chapter.history) ? chapter.history : []
        const entry = history.find((item) => item.revision === (args && args.toRevision))
        if (!entry) return { error: 'REVISION_NOT_FOUND' }
        pushHistory(chapter, writeSource(args))
        chapter.content = entry.content
        chapter.revision += 1
        await saveProjects()
        draftStore.items = draftStore.items.filter((item) => !(item.projectId === project.id && item.chapterId === chapter.id))
        await saveDrafts()
        return { chapter: chapterView(chapter) }
      }),
      // v9: 实体快照与回滚（角色/笔记/世界书条目）
      'entity-history': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const kind = args && args.kind
        if (kind !== 'character' && kind !== 'note' && kind !== 'world-entry') return { error: 'INVALID_KIND' }
        const entity = resolveEntity(project, kind, args && args.entityId)
        if (!entity) return { error: 'ENTITY_NOT_FOUND' }
        const history = (Array.isArray(entity.history) ? entity.history : []).slice().reverse()
        return { kind, entityId: entity.id, history: history.map((item) => ({ revision: item.revision, at: item.at, snapshot: item.snapshot, source: item.source || null })) }
      }),
      'rollback-entity': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const kind = args && args.kind
        if (kind !== 'character' && kind !== 'note' && kind !== 'world-entry') return { error: 'INVALID_KIND' }
        const entity = resolveEntity(project, kind, args && args.entityId)
        if (!entity) return { error: 'ENTITY_NOT_FOUND' }
        const history = Array.isArray(entity.history) ? entity.history : []
        const entry = history.find((item) => item.revision === (args && args.toRevision))
        if (!entry) return { error: 'REVISION_NOT_FOUND' }
        pushEntityHistory(entity, kind, writeSource(args))
        applyEntitySnapshot(entity, kind, entry.snapshot)
        await saveProjects()
        return { entity: entityViewFor(project, kind, entity), historyCount: entity.history.length }
      }),
      // v4: 卷
      'create-volume': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const volume = { id: allocate('volume'), title: text(args && args.title, '未命名卷'), description: text(args && args.description, ''), order: project.volumes.length }
        project.volumes.push(volume); await saveProjects(); return { volume: volumeView(volume, project.chapters) }
      }),
      'update-volume': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const volume = volumeBy(project, args && args.volumeId)
        if (!volume) return { error: 'VOLUME_NOT_FOUND' }
        if (typeof args.title === 'string' && args.title.trim()) volume.title = args.title.trim()
        if (typeof args.description === 'string') volume.description = args.description
        await saveProjects(); return { volume: volumeView(volume, project.chapters) }
      }),
      'delete-volume': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const volume = volumeBy(project, args && args.volumeId)
        if (!volume) return { error: 'VOLUME_NOT_FOUND' }
        const count = project.chapters.filter((c) => c.volumeId === volume.id).length
        project.volumes = project.volumes.filter((v) => v.id !== volume.id)
        const removed = project.chapters.filter((c) => c.volumeId === volume.id)
        project.chapters = project.chapters.filter((c) => c.volumeId !== volume.id)
        project.chapters.forEach((c, order) => { c.order = order })
        const removedIds = removed.map((c) => c.id)
        const before = draftStore.items.length
        draftStore.items = draftStore.items.filter((item) => !(item.projectId === project.id && removedIds.includes(item.chapterId)))
        if (before !== draftStore.items.length) await saveDrafts()
        await dropSummariesFor(removedIds)
        await saveProjects(); return { deleted: true, volumeId: volume.id, chapterCount: count }
      }),
      'move-volume': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const index = project.volumes.findIndex((v) => v.id === (args && args.volumeId))
        if (index < 0) return { error: 'VOLUME_NOT_FOUND' }
        const direction = args && args.direction === 'up' ? -1 : args && args.direction === 'down' ? 1 : 0
        const target = index + direction
        if (direction === 0 || target < 0 || target >= project.volumes.length) return { error: 'BOUNDARY' }
        const list = project.volumes
        const temp = list[index]; list[index] = list[target]; list[target] = temp
        list.forEach((v, order) => { v.order = order })
        await saveProjects(); return { volume: volumeView(list[target], project.chapters) }
      }),
      'set-chapter-volume': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        const volumeId = args && args.volumeId
        if (volumeId !== null && volumeId !== undefined && !volumeBy(project, volumeId)) return { error: 'VOLUME_NOT_FOUND' }
        chapter.volumeId = volumeId === null || volumeId === undefined ? null : volumeId
        await saveProjects(); return { chapter: chapterView(chapter) }
      }),
      'reorder-chapters': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const ids = Array.isArray(args && args.chapterIds) ? args.chapterIds : []
        if (!ids.length || ids.length !== project.chapters.length || new Set(ids).size !== ids.length || ids.some((id) => !chapterBy(project, id))) return { error: 'INVALID_ORDER' }
        const byId = new Map(project.chapters.map((chapter) => [chapter.id, chapter]))
        project.chapters = ids.map((id) => byId.get(id))
        project.chapters.forEach((chapter, order) => { chapter.order = order })
        await saveProjects(); return { chapters: project.chapters.map(chapterView) }
      }),
      'reorder-volumes': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const ids = Array.isArray(args && args.volumeIds) ? args.volumeIds : []
        if (!ids.length || ids.length !== project.volumes.length || new Set(ids).size !== ids.length || ids.some((id) => !volumeBy(project, id))) return { error: 'INVALID_ORDER' }
        const byId = new Map(project.volumes.map((volume) => [volume.id, volume]))
        project.volumes = ids.map((id) => byId.get(id))
        project.volumes.forEach((volume, order) => { volume.order = order })
        await saveProjects(); return { volumes: project.volumes.map((volume) => volumeView(volume, project.chapters)) }
      }),
      // v4: 角色
      'create-character': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const character = { id: allocate('character'), name: text(args && args.name, '未命名角色'), description: text(args && args.description, ''), isFavorited: false }
        project.characters.push(character); await saveProjects(); return { character: characterView(character) }
      }),
      'update-character': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const character = characterBy(project, args && args.characterId)
        if (!character) return { error: 'CHARACTER_NOT_FOUND' }
        const nameChange = typeof args.name === 'string' && args.name.trim() && args.name.trim() !== character.name
        const descriptionChange = typeof args.description === 'string' && args.description !== character.description
        const favoriteChange = typeof args.isFavorited === 'boolean' && args.isFavorited !== !!character.isFavorited
        if (nameChange || descriptionChange || favoriteChange) pushEntityHistory(character, 'character', writeSource(args))
        if (typeof args.name === 'string' && args.name.trim()) character.name = args.name.trim()
        if (typeof args.description === 'string') character.description = args.description
        if (typeof args.isFavorited === 'boolean') character.isFavorited = args.isFavorited
        await saveProjects(); return { character: characterView(character) }
      }),
      'delete-character': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const before = project.characters.length
        project.characters = project.characters.filter((c) => c.id !== (args && args.characterId))
        if (before === project.characters.length) return { error: 'CHARACTER_NOT_FOUND' }
        await saveProjects(); return { deleted: true, characterId: args.characterId }
      }),
      'toggle-character-favorite': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const character = characterBy(project, args && args.characterId)
        if (!character) return { error: 'CHARACTER_NOT_FOUND' }
        character.isFavorited = !character.isFavorited
        await saveProjects(); return { character: characterView(character) }
      }),
      // v4: 笔记
      'create-note-category': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const parentId = args && args.parentId ? args.parentId : null
        if (parentId) {
          const parent = categoryBy(project, parentId)
          if (!parent) return { error: 'CATEGORY_NOT_FOUND' }
          if (parent.parentId) return { error: 'CATEGORY_DEPTH' }
        }
        const category = { id: allocate('category'), title: text(args && args.title, '未命名分类'), parentId: parentId }
        project.noteCategories.push(category); await saveProjects(); return { category: categoryView(category) }
      }),
      'rename-note-category': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const category = categoryBy(project, args && args.categoryId)
        if (!category) return { error: 'CATEGORY_NOT_FOUND' }
        if (typeof args.title === 'string' && args.title.trim()) category.title = args.title.trim()
        await saveProjects(); return { category: categoryView(category) }
      }),
      'delete-note-category': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const category = categoryBy(project, args && args.categoryId)
        if (!category) return { error: 'CATEGORY_NOT_FOUND' }
        const doomed = [category.id]
        project.noteCategories.forEach((c) => { if (c.parentId === category.id) doomed.push(c.id) })
        project.noteCategories = project.noteCategories.filter((c) => !doomed.includes(c.id))
        project.notes.forEach((n) => { if (doomed.includes(n.categoryId)) n.categoryId = null })
        await saveProjects(); return { deleted: true, categoryId: category.id }
      }),
      'create-note': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const categoryId = args && args.categoryId ? args.categoryId : null
        if (categoryId && !categoryBy(project, categoryId)) return { error: 'CATEGORY_NOT_FOUND' }
        const note = { id: allocate('note'), title: text(args && args.title, '未命名笔记'), content: '', categoryId: categoryId, isLocked: false, isHidden: false }
        project.notes.push(note); await saveProjects(); return { note: noteView(note) }
      }),
      'update-note': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const note = noteBy(project, args && args.noteId)
        if (!note) return { error: 'NOTE_NOT_FOUND' }
        const titleChange = typeof args.title === 'string' && args.title.trim() && args.title.trim() !== note.title
        const contentChange = typeof args.content === 'string' && args.content !== note.content
        const lockedChange = typeof args.isLocked === 'boolean' && args.isLocked !== !!note.isLocked
        const hiddenChange = typeof args.isHidden === 'boolean' && args.isHidden !== !!note.isHidden
        if (titleChange || contentChange || lockedChange || hiddenChange) pushEntityHistory(note, 'note', writeSource(args))
        if (typeof args.title === 'string' && args.title.trim()) note.title = args.title.trim()
        if (typeof args.content === 'string') note.content = args.content
        if (typeof args.isLocked === 'boolean') note.isLocked = args.isLocked
        if (typeof args.isHidden === 'boolean') note.isHidden = args.isHidden
        await saveProjects(); return { note: noteView(note) }
      }),
      'delete-note': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const before = project.notes.length
        project.notes = project.notes.filter((n) => n.id !== (args && args.noteId))
        if (before === project.notes.length) return { error: 'NOTE_NOT_FOUND' }
        await saveProjects(); return { deleted: true, noteId: args.noteId }
      }),
      'move-note': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const note = noteBy(project, args && args.noteId)
        if (!note) return { error: 'NOTE_NOT_FOUND' }
        const categoryId = args && args.categoryId ? args.categoryId : null
        if (categoryId && !categoryBy(project, categoryId)) return { error: 'CATEGORY_NOT_FOUND' }
        if (categoryId !== (note.categoryId || null)) pushEntityHistory(note, 'note', writeSource(args))
        note.categoryId = categoryId
        await saveProjects(); return { note: noteView(note) }
      }),
      // v6: 世界书（SillyTavern Lorebook 兼容）与章节上下文
      'create-world-entry': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        if (worldEntryNameConflict(project, args && args.name)) return { error: 'DUPLICATE_WORLD_NAME' }
        const entry = normalizeWorldEntry({ name: args && args.name, keys: args && args.keys, content: args && args.content, isEnabled: args && typeof args.isEnabled === 'boolean' ? args.isEnabled : true, constant: args && args.constant }, allocate('world'), project.worldEntries.length)
        project.worldEntries.push(entry); await saveProjects(); return { entry: worldEntryView(entry) }
      }),
      'update-world-entry': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const entry = worldEntryBy(project, args && args.entryId)
        if (!entry) return { error: 'WORLD_ENTRY_NOT_FOUND' }
        const nameChange = typeof args.name === 'string' && args.name.trim() && args.name.trim() !== entry.name
        if (nameChange && worldEntryNameConflict(project, args.name, entry.id)) return { error: 'DUPLICATE_WORLD_NAME' }
        const keysChange = args && args.keys !== undefined && JSON.stringify(normalizeKeys(args.keys)) !== JSON.stringify(normalizeKeys(entry.keys))
        const contentChange = typeof args.content === 'string' && args.content !== entry.content
        const enabledChange = typeof args.isEnabled === 'boolean' && args.isEnabled !== (entry.isEnabled !== false)
        const constantChange = typeof args.constant === 'boolean' && args.constant !== !!entry.constant
        if (nameChange || keysChange || contentChange || enabledChange || constantChange) pushEntityHistory(entry, 'world-entry', writeSource(args))
        if (nameChange) entry.name = args.name.trim()
        if (args && args.keys !== undefined) entry.keys = normalizeKeys(args.keys)
        if (typeof args.content === 'string') entry.content = args.content
        if (typeof args.isEnabled === 'boolean') entry.isEnabled = args.isEnabled
        if (typeof args.constant === 'boolean') entry.constant = args.constant
        await saveProjects(); return { entry: worldEntryView(entry) }
      }),
      'delete-world-entry': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const before = project.worldEntries.length
        project.worldEntries = project.worldEntries.filter((item) => item.id !== (args && args.entryId))
        if (before === project.worldEntries.length) return { error: 'WORLD_ENTRY_NOT_FOUND' }
        await saveProjects(); return { deleted: true, entryId: args.entryId }
      }),
      'update-world-entries': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId); if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const ids = Array.isArray(args && args.entryIds) ? args.entryIds.filter((id) => typeof id === 'string') : []
        if (!ids.length) return { error: 'INVALID_IDS' }
        const byId = new Map((project.worldEntries || []).map((entry) => [entry.id, entry]))
        const missing = ids.find((id) => !byId.has(id)); if (missing) return { error: 'WORLD_ENTRY_NOT_FOUND' }
        const patch = args && args.patch || {}
        ids.forEach((id) => {
          const entry = byId.get(id)
          const enabledChange = typeof patch.isEnabled === 'boolean' && patch.isEnabled !== (entry.isEnabled !== false)
          const constantChange = typeof patch.constant === 'boolean' && patch.constant !== !!entry.constant
          if (enabledChange || constantChange) pushEntityHistory(entry, 'world-entry', writeSource(args))
          if (typeof patch.isEnabled === 'boolean') entry.isEnabled = patch.isEnabled
          if (typeof patch.constant === 'boolean') entry.constant = patch.constant
        })
        await saveProjects()
        return { entries: ids.map((id) => worldEntryView(byId.get(id))) }
      }),
      'delete-world-entries': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId); if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const ids = Array.isArray(args && args.entryIds) ? args.entryIds.filter((id) => typeof id === 'string') : []
        if (!ids.length) return { error: 'INVALID_IDS' }
        const missing = ids.find((id) => !worldEntryBy(project, id)); if (missing) return { error: 'WORLD_ENTRY_NOT_FOUND' }
        project.worldEntries = (project.worldEntries || []).filter((entry) => !ids.includes(entry.id))
        project.worldEntries.forEach((entry, order) => { entry.order = order })
        await saveProjects()
        return { deleted: true, count: ids.length }
      }),
      'move-world-entry': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const list = project.worldEntries
        const index = list.findIndex((item) => item.id === (args && args.entryId))
        if (index < 0) return { error: 'WORLD_ENTRY_NOT_FOUND' }
        const direction = args && args.direction === 'up' ? -1 : args && args.direction === 'down' ? 1 : 0
        const target = index + direction
        if (direction === 0 || target < 0 || target >= list.length) return { error: 'BOUNDARY' }
        pushEntityHistory(list[index], 'world-entry', writeSource(args))
        const temp = list[index]; list[index] = list[target]; list[target] = temp
        list.forEach((item, order) => { item.order = order })
        await saveProjects(); return { entry: worldEntryView(list[target]) }
      }),
      'import-world-info-json': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const parsed = parseWorldInfoJson(args && args.content)
        if (parsed.error) return { error: parsed.error }
        const mode = (args && args.mode) === 'overwrite' ? 'overwrite' : 'append'
        if (mode === 'overwrite') project.worldEntries = []
        const start = project.worldEntries.reduce((max, item) => Math.max(max, typeof item.order === 'number' ? item.order : 0), 0) + 1
        parsed.entries.forEach((item, index) => { project.worldEntries.push(normalizeWorldEntry(item, allocate('world'), start + index)) })
        await saveProjects()
        return { importedCount: parsed.entries.length, mode, worldEntries: project.worldEntries.map(worldEntryView) }
      }),
      'chapter-context': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        // v0.10.2: 分级上下文（mid=前情章摘要 / far=区间摘要）
        const base = buildChapterContext(project, chapter, args, {
          chapter: (chapterId) => chapterSummaryView(summaryStore, chapterId),
          range: (chapterId) => {
            const range = (summaryStore.ranges || []).find((item) => Array.isArray(item.chapterIds) && item.chapterIds.includes(chapterId))
            return range ? { summary: range.summary } : null
          },
        })
        const styleId = (args && args.styleId) || project.currentStyle || 'default'
        const style = parseStyle(await readStyle(styleId, project.id), styleId)
        if (!style.content) return { ...base, styleId }
        return { ...base, styleId, styleName: style.name, contextText: `【当前写作风格：${style.name}】\n${style.content}\n\n${base.contextText || ''}` }
      }),
      // v4: 全文搜索
      'search-chapters': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const query = typeof args.query === 'string' ? args.query.trim() : ''
        if (!query) return { results: [] }
        const lower = query.toLowerCase()
        const results = []
        project.chapters.forEach((chapter) => {
          const lines = String(chapter.content).split('\n')
          const matches = []
          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(lower)) matches.push({ line: index + 1, text: line.length > 120 ? line.slice(0, 120) + '…' : line })
          })
          if (matches.length) results.push({ chapterId: chapter.id, title: chapter.title, volumeId: chapter.volumeId || null, matches: matches.slice(0, 50) })
        })
        return { results: results }
      }),
      // v0.10.1: 结构化检索（轻量本地倒排索引：中文 bigram + 单字 + 拉丁词）。
      // 返回 entityType/entityId/行号/snippet/score；缓存按实体签名失效，未来可整体换成 DSH RAG 生态。
      'retrieve': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const query = typeof (args && args.query) === 'string' ? args.query.trim() : ''
        if (!query) return { results: [], query, total: 0, tookMs: 0 }
        const started = performance.now()
        const limit = Math.min(Math.max(typeof (args && args.limit) === 'number' ? Math.floor(args.limit) : 20, 1), 100)
        const signature = retrieveSignature(project)
        let cached = retrieveCache.get(project.id)
        if (!cached || cached.signature !== signature) {
          if (retrieveCache.size >= 8) { const first = retrieveCache.keys().next().value; if (first !== undefined) retrieveCache.delete(first) }
          cached = { signature, index: buildRetrieveIndex(project) }
          retrieveCache.set(project.id, cached)
        }
        const scores = new Map()
        for (const token of tokenizeRetrieval(query)) {
          const postings = cached.index.get(token)
          if (!postings) continue
          for (const posting of postings) {
            const key = posting.entityType + ':' + posting.entityId
            let entry = scores.get(key)
            if (!entry) { entry = { entityType: posting.entityType, entityId: posting.entityId, score: 0, bestLine: posting.line, bestCount: 0 }; scores.set(key, entry) }
            entry.score += posting.count
            if (posting.count > entry.bestCount) { entry.bestCount = posting.count; entry.bestLine = posting.line }
          }
        }
        const ranked = Array.from(scores.values()).sort((a, b) => b.score - a.score || a.entityType.localeCompare(b.entityType) || a.entityId.localeCompare(b.entityId)).slice(0, limit)
        const results = ranked.map((hit) => {
          const located = locateEntityLine(project, hit.entityType, hit.entityId, hit.bestLine)
          return { entityType: hit.entityType, entityId: hit.entityId, title: located.title, line: hit.bestLine, snippet: snippetFor(located.lineText, query), score: hit.score, volumeId: located.volumeId || null, volumeTitle: located.volumeTitle || null, chapterId: located.chapterId || (hit.entityType === 'chapter' ? hit.entityId : null) }
        })
        return { results, query, total: ranked.length, tookMs: Math.round(performance.now() - started) }
      },
      // v5: TXT 整书导入（预览→确认）与导出
      'import-txt-preview': async (args) => {
        const parsed = parseTxt(args && args.content)
        if (parsed.error) return { error: parsed.error }
        const volumes = parsed.volumes.map((volume) => ({ title: volume.title, chapterCount: volume.chapters.length, chars: volume.chapters.reduce((sum, chapter) => sum + chapter.content.length, 0), sample: volume.chapters[0] ? { title: volume.chapters[0].title, preview: volume.chapters[0].content.slice(0, 80) } : null }))
        return { chapterCount: parsed.chapterCount, chars: parsed.chars, volumeCount: parsed.volumes.length, volumes }
      },
      'import-txt-confirm': async (args) => mutate(async () => {
        const parsed = parseTxt(args && args.content)
        if (parsed.error) return { error: parsed.error }
        const project = { id: allocate('project'), title: importTitle(args && args.title, '导入项目'), description: typeof (args && args.description) === 'string' ? args.description.trim() : '', goal: 0, chapters: [], volumes: [], characters: [], notes: [], noteCategories: [], worldEntries: [] }
        parsed.volumes.forEach((volume, index) => {
          const volumeId = volume.title ? allocate('volume') : null
          if (volumeId) project.volumes.push({ id: volumeId, title: volume.title, description: '', order: index })
          volume.chapters.forEach((chapter) => {
            project.chapters.push({ id: allocate('chapter'), title: chapter.title, content: chapter.content, order: project.chapters.length, revision: 1, history: [], volumeId })
          })
        })
        store.projects.push(project)
        await saveProjects()
        return { project: projectView(project), chapterCount: project.chapters.length }
      }),
      'export-project-txt': async (args) => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        return exportProject(project, args)
      },
      // v5: AI 写作助手（llm 桥接）
      'ai-assist': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const request = await buildAiAssistRequest(project, args)
        if (request.error) return request
        const result = await generateText(request.selectedModel.provider, request.selectedModel.model, request.system, request.messages, 2048)
        if (result.error) return result
        const persisted = await persistAiExchange(project.id, request.user, request.mode, result.text)
        return { text: result.text, mode: request.mode, worldEntries: request.contextInfo.worldEntries.length, contextChars: request.contextInfo.contextText.length, historyCount: persisted, styleId: request.styleId, styleName: request.styleName }
      },
      'ai-history': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        return aiSessionView(aiSessionFor(project.id))
      },
      'ai-clear-history': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const before = aiSessionFor(project.id).messages.length
        aiSessions.sessions[project.id] = { messages: [] }
        await saveAiSessions()
        return { cleared: before > 0, count: before }
      }),
      'ai-summarize-chapters': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const selectedModel = currentModel()
        if (!selectedModel) return { error: 'LLM_UNAVAILABLE' }
        const chapters = chapterSelection(project.chapters, args && args.chapterIds)
        if (!chapters.length) return { summaries: [], count: 0, total: 0, staleCount: 0, freshCount: 0 }
        const force = args && args.force === true
        const plan = force ? { stale: chapters, fresh: [], total: chapters.length } : planSummaryBatch(chapters, summaryStore, { maxAgeDays: typeof (args && args.maxAgeDays) === 'number' ? args.maxAgeDays : 30 })
        const summaries = []
        for (const chapter of plan.stale) {
          const generated = await generateChapterSummary(selectedModel, chapter, args)
          if (generated.error) return { error: generated.error, partial: summaries.length, total: plan.stale.length, staleCount: plan.stale.length, freshCount: plan.fresh.length }
          summaries.push({ chapterId: chapter.id, title: chapter.title, summary: generated.summary })
        }
        return { summaries, count: summaries.length, total: chapters.length, staleCount: plan.stale.length, freshCount: plan.fresh.length, fresh: plan.fresh.map(summaryPlanView) }
      },
      // v8: 摘要体系（.mofei-summaries.json 持久化 + 章/区间摘要 RPC）
      'chapter-summaries': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const chapters = project.chapters.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
        return { chapters: chapters.map((chapter) => {
          const entry = chapterSummaryView(summaryStore, chapter.id)
          return { chapterId: chapter.id, title: chapter.title, order: chapter.order, revision: chapter.revision, volumeId: chapter.volumeId || null, entry, stale: isChapterSummaryStale(entry, chapter, args) }
        }) }
      },
      'chapter-summary': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        const entry = chapterSummaryView(summaryStore, chapter.id)
        return { entry, stale: isChapterSummaryStale(entry, chapter, args) }
      },
      'save-chapter-summary': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        const chapter = chapterBy(project, args && args.chapterId)
        if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
        if (typeof (args && args.summary) !== 'string') return { error: 'SUMMARY_REQUIRED' }
        summaryStore = applyChapterSummary(summaryStore, chapter.id, chapter.revision, args.summary)
        await saveSummaries()
        return { entry: chapterSummaryView(summaryStore, chapter.id) }
      }),
      'summary-plan': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const chapters = chapterSelection(project.chapters, args && args.chapterIds)
        const plan = planSummaryBatch(chapters, summaryStore, args)
        return { stale: plan.stale.map(summaryPlanView), fresh: plan.fresh.map(summaryPlanView), total: plan.total }
      },
      'range-summary-groups': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const size = typeof (args && args.size) === 'number' && isFinite(args.size) && args.size >= 1 ? Math.floor(args.size) : 10
        return { groups: buildRangeGroups(project.chapters, size).map(summaryRangeView) }
      },
      'save-range-summary': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const rangeId = typeof (args && args.rangeId) === 'string' && args.rangeId.trim() ? args.rangeId.trim() : ''
        const chapterIds = Array.isArray(args && args.chapterIds) ? args.chapterIds.filter((id) => typeof id === 'string') : []
        if (!rangeId || !chapterIds.length) return { error: 'INVALID_RANGE' }
        if (chapterIds.some((id) => !chapterBy(project, id))) return { error: 'CHAPTER_NOT_FOUND' }
        if (typeof (args && args.summary) !== 'string') return { error: 'SUMMARY_REQUIRED' }
        summaryStore = applyRangeSummary(summaryStore, rangeId, chapterIds, args.summary)
        await saveSummaries()
        return { range: summaryStore.ranges.find((range) => range.id === rangeId) }
      }),
      'ai-summarize-ranges': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const selectedModel = currentModel()
        if (!selectedModel) return { error: 'LLM_UNAVAILABLE' }
        const size = typeof (args && args.size) === 'number' && isFinite(args.size) && args.size >= 1 ? Math.floor(args.size) : 10
        const selected = selectRangeGroups(buildRangeGroups(project.chapters, size), args && args.rangeIds)
        if (selected.notFound) return { error: 'RANGE_NOT_FOUND' }
        const groups = selected.groups
        if (!groups.length) return { summaries: [], count: 0, total: 0, staleCount: 0, freshCount: 0 }
        const chaptersById = new Map(project.chapters.map((chapter) => [chapter.id, chapter]))
        const options = { maxAgeDays: typeof (args && args.maxAgeDays) === 'number' ? args.maxAgeDays : 30 }
        const force = args && args.force === true
        const staleGroups = force ? groups : groups.filter((group) => isRangeSummaryStale(group, chaptersById, options))
        const summaries = []
        for (const group of staleGroups) {
          const generated = await generateRangeSummary(selectedModel, group, chaptersById, args)
          if (generated.error) return { error: generated.error, partial: summaries.length, total: staleGroups.length }
          summaries.push({ rangeId: group.id, title: group.title, summary: generated.summary })
        }
        return { summaries, count: summaries.length, total: groups.length, staleCount: staleGroups.length, freshCount: groups.length - staleGroups.length }
      },
      // v9: prompt chains 简版（Host 持久化 + RPC）
      'list-prompt-chains': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        return { chains: chainList(project.id).map(promptChainView) }
      },
      // v0.10.1: git 历史/对比（P2）。projectId+chainId → 链文件 diff；仅 projectId → 项目目录提交史。
      'git-history': async (args) => {
        await load(); await queue
        const projectId = args && args.projectId
        const chainId = args && args.chainId
        if (projectId && !projectBy(projectId)) return { error: 'PROJECT_NOT_FOUND' }
        if (chainId && !projectId) return { error: 'PROJECT_REQUIRED' }
        const available = await gitAvailable()
        if (!available) return { available: false, reason: '当前工作区不是 git 仓库（或 git 不可用），无法提供历史。', commits: [], patch: '' }
        const rel = chainId
          ? path.posix.join('.mofei', 'projects', safeFileSegment(projectId, 'project'), 'chains', `${safeFileSegment(chainId, 'chain')}.md`)
          : path.posix.join('.mofei', 'projects', safeFileSegment(projectId, 'project'))
        const log = await runGit(['log', '--format=%H%x1f%at%x1f%s', '-n', '30', '--', rel])
        if (log.error) return { available: true, error: log.error, commits: [], patch: '' }
        const commits = String(log.stdout).trim().split('\n').filter(Boolean).map((line) => {
          const [hash, at, ...rest] = line.split('\x1f')
          return { hash: hash || '', at: Number(at) || 0, subject: rest.join('\x1f') || '' }
        })
        let patch = ''
        if ((chainId || args && args.diff) && commits.length) {
          const diff = await runGit(['log', '-p', '-n', '3', '--', rel])
          if (!diff.error) patch = diff.stdout
        }
        return { available: true, commits, patch, chainId: chainId || null, projectId }
      },
      // v0.10.2: git diff（默认 HEAD~1..HEAD，可指定 from/to）。
      'git-diff': async (args) => {
        await load(); await queue
        const projectId = args && args.projectId
        const chainId = args && args.chainId
        if (projectId && !projectBy(projectId)) return { error: 'PROJECT_NOT_FOUND' }
        const available = await gitAvailable()
        if (!available) return { available: false, reason: '当前工作区不是 git 仓库（或 git 不可用）。', patch: '', from: null, to: null }
        const from = typeof (args && args.from) === 'string' && args.from.trim() ? args.from.trim() : 'HEAD~1'
        const to = typeof (args && args.to) === 'string' && args.to.trim() ? args.to.trim() : 'HEAD'
        const rel = chainId
          ? path.posix.join('.mofei', 'projects', safeFileSegment(projectId, 'project'), 'chains', `${safeFileSegment(chainId, 'chain')}.md`)
          : path.posix.join('.mofei', 'projects', safeFileSegment(projectId, 'project'))
        const diff = await runGit(['diff', from, to, '--', rel])
        if (diff.error) return { available: true, error: diff.error, patch: '', from, to }
        return { available: true, patch: diff.stdout, from, to, chainId: chainId || null }
      },
      // v0.10.2: 项目文件树回滚到指定 git 提交（显式回滚，preferFiles 让文件胜出）。
      'git-revert-project': async (args) => mutate(async () => {
        await load()
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const to = typeof (args && args.to) === 'string' && args.to.trim() ? args.to.trim() : ''
        if (!to) return { error: 'REVISION_REQUIRED' }
        const available = await gitAvailable()
        if (!available) return { available: false, reason: '当前工作区不是 git 仓库（或 git 不可用），无法回滚。' }
        const rel = path.posix.join('.mofei', 'projects', safeFileSegment(project.id, 'project'))
        const checkout = await runGit(['checkout', to, '--', rel])
        if (checkout.error) return { available: true, reverted: false, error: checkout.error }
        const report = await importFileTree({ preferFiles: true })
        await saveProjects()
        await saveSummaries()
        await saveChains()
        return { available: true, reverted: true, to, report }
      }),
      // v0.10.2: DSH Jobs——摘要后台任务（可查询状态/取消；无 jobs 服务返回 JOBS_UNAVAILABLE）。
      'job-start-summarize': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const kind = args && args.kind
        if (kind !== 'chapters' && kind !== 'ranges') return { error: 'INVALID_KIND' }
        const jobs = jobsService()
        if (!jobs) return { error: 'JOBS_UNAVAILABLE', reason: '当前 DSH 未提供 jobs 服务（旧版本或不含 dsh-jobs）' }
        const label = (kind === 'chapters' ? '章节摘要' : '区间摘要') + '《' + project.title + '》'
        const record = { id: '', kind, label, status: 'running', done: 0, total: 0, current: '', startedAt: Date.now(), finishedAt: 0, error: '', summaries: [] }
        const canceled = { canceled: false }
        let jobId = ''
        try {
          jobId = jobs.start({
            kind: 'mofei-summarize',
            label,
            outputLimitBytes: 2 * 1024 * 1024,
            run: () => {
              const work = (async () => {
                try {
                  const summaries = kind === 'chapters'
                    ? await runChapterSummariesJob(project, args, record, canceled)
                    : await runRangeSummariesJob(project, args, record, canceled)
                  record.summaries = summaries
                  record.status = 'completed'
                  record.finishedAt = Date.now()
                  return { status: 'completed', detail: 'summaries: ' + summaries.length, output: JSON.stringify(summaries).slice(0, 100000) }
                } catch (error) {
                  record.status = 'failed'
                  record.error = String(error && error.message || error)
                  record.finishedAt = Date.now()
                  return { status: 'failed', detail: String(error && error.message || error).slice(0, 200) }
                }
              })()
              return {
                cancel: () => { canceled.canceled = true },
                done: work,
                readOutput: () => JSON.stringify(record.summaries).slice(0, 100000),
              }
            },
          })
        } catch (error) {
          return { error: 'JOB_START_FAILED:' + String(error && error.message || error) }
        }
        record.id = jobId
        mofeiJobRecords.set(jobId, record)
        mofeiJobCancels.set(jobId, () => { canceled.canceled = true })
        return { jobId, label, kind, status: 'running' }
      },
      'job-list-mofei': async () => {
        await load(); await queue
        const jobs = Array.from(mofeiJobRecords.values()).map((r) => ({ id: r.id, kind: r.kind, label: r.label, status: r.status, done: r.done, total: r.total, current: r.current, startedAt: r.startedAt, finishedAt: r.finishedAt, error: r.error, summaryCount: (r.summaries || []).length }))
        jobs.sort((a, b) => b.startedAt - a.startedAt)
        return { jobs }
      },
      'job-kill-mofei': async (args) => {
        const jobId = args && args.jobId
        const record = mofeiJobRecords.get(jobId)
        if (!record) return { error: 'JOB_NOT_FOUND' }
        const cancelFn = mofeiJobCancels.get(jobId)
        if (cancelFn) cancelFn()
        const jobs = jobsService()
        if (jobs && typeof jobs.kill === 'function') {
          try { jobs.kill(jobId, undefined, '墨扉 用户取消') } catch (error) { /* cancel 回调已置位 */ }
        }
        return { killed: true, jobId }
      },
      'job-result-mofei': async (args) => {
        const record = mofeiJobRecords.get(args && args.jobId)
        if (!record) return { error: 'JOB_NOT_FOUND' }
        return { jobId: record.id, status: record.status, summaries: record.summaries, error: record.error }
      },
      'save-prompt-chain': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        if (typeof (args && args.content) !== 'string') return { error: 'CHAIN_CONTENT_REQUIRED' }
        const chainId = typeof (args && args.chainId) === 'string' && args.chainId.trim() ? args.chainId.trim() : ''
        const name = text(args && args.name, '未命名链')
        const list = chainList(project.id).slice()
        const index = chainId ? list.findIndex((item) => item.id === chainId) : -1
        let chain
        if (chainId && index < 0) {
          chain = { id: chainId, name, content: args.content, updatedAt: Date.now() }
          list.push(chain)
        } else if (index >= 0) {
          chain = { id: list[index].id, name, content: args.content, updatedAt: Date.now() }
          list[index] = chain
        } else {
          chain = { id: allocate('chain'), name, content: args.content, updatedAt: Date.now() }
          list.push(chain)
        }
        const byProject = {}
        Object.keys(chainStore.byProject).forEach((id) => {
          Object.defineProperty(byProject, id, { value: chainStore.byProject[id], enumerable: true, writable: true, configurable: true })
        })
        Object.defineProperty(byProject, project.id, { value: list, enumerable: true, writable: true, configurable: true })
        chainStore = { version: 1, byProject }
        await saveChains()
        gitCommitAll('墨扉 链保存: ' + name, true).catch(() => { /* 非 git 工作区或 git 失败时忽略 */ })
        return { chain: promptChainView(chain) }
      }),
      'delete-prompt-chain': async (args) => mutate(async () => {
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const chainId = typeof (args && args.chainId) === 'string' ? args.chainId : ''
        if (!chainId) return { error: 'CHAIN_NOT_FOUND' }
        const list = chainList(project.id)
        if (!list.some((item) => item.id === chainId)) return { error: 'CHAIN_NOT_FOUND' }
        const byProject = {}
        Object.keys(chainStore.byProject).forEach((id) => {
          Object.defineProperty(byProject, id, { value: chainStore.byProject[id], enumerable: true, writable: true, configurable: true })
        })
        Object.defineProperty(byProject, project.id, { value: list.filter((item) => item.id !== chainId), enumerable: true, writable: true, configurable: true })
        chainStore = { version: 1, byProject }
        await saveChains()
        gitCommitAll('墨扉 链删除: ' + chainId, true).catch(() => { /* 非 git 工作区忽略 */ })
        return { deleted: true, chainId }
      }),
      'compile-prompt-chain': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const chain = chainList(project.id).find((item) => item.id === (args && args.chainId))
        if (!chain) return { error: 'CHAIN_NOT_FOUND' }
        const chapter = chapterBy(project, args && args.chapterId)
        if ((args && args.chapterId) && !chapter) return { error: 'CHAPTER_NOT_FOUND' }
        const context = await buildPromptChainContext(project, args)
        return { prompt: compilePromptChain(chain.content, context), styleId: context.styleId, styleName: context.styleName }
      },
      'run-prompt-chain': async (args) => {
        await load(); await queue
        const project = projectBy(args && args.projectId)
        if (!project) return { error: 'PROJECT_NOT_FOUND' }
        const chain = chainList(project.id).find((item) => item.id === (args && args.chainId))
        if (!chain) return { error: 'CHAIN_NOT_FOUND' }
        const chapter = chapterBy(project, args && args.chapterId)
        if ((args && args.chapterId) && !chapter) return { error: 'CHAPTER_NOT_FOUND' }
        const selectedModel = currentModel()
        if (!selectedModel) return { error: 'LLM_UNAVAILABLE' }
        const context = await buildPromptChainContext(project, args)
        const prompt = compilePromptChain(chain.content, context)
        const maxTokens = typeof (args && args.maxTokens) === 'number' && isFinite(args.maxTokens) && (args.maxTokens) >= 1 ? Math.floor(args.maxTokens) : 4096
        const messages = buildAiMessages({ messages: [] }, prompt, { maxHistory: 0 })
        const styleBlock = context.style ? `【当前写作风格：${context.styleName}】\n${context.style}\n\n` : ''
        const result = await generateText(selectedModel.provider, selectedModel.model, styleBlock + '你是 墨扉小说写作助手。请按提示词要求输出正文或写作内容，不要额外解释。', messages, maxTokens)
        if (result.error) return result
        const historyCount = await persistAiExchange(project.id, prompt, 'prompt-chain', result.text)
        return { text: result.text, prompt, historyCount, styleId: context.styleId, styleName: context.styleName }
      },
    }
    const rpcHandler = async (req, res) => {
      try {
        if (req.method !== 'POST') { res.setHeader('content-type', 'application/json'); res.statusCode = 405; res.end(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' })); return }
        let raw = ''
        for await (const chunk of req) raw += chunk
        if (raw.length > 16 * 1024 * 1024) { res.setHeader('content-type', 'application/json'); res.statusCode = 413; res.end(JSON.stringify({ ok: false, error: 'PAYLOAD_TOO_LARGE' })); return }
        let body
        try { body = JSON.parse(raw || '{}') } catch (e) { res.setHeader('content-type', 'application/json'); res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'BAD_JSON' })); return }
        const pathname = String(req.url || '/').split('?')[0]
        if (pathname === '/api/mofei/stream/ai-assist' || pathname === '/api/openfic/stream/ai-assist') { await streamAiAssist(req, res, body && body.args || {}); return }
        if (pathname === '/api/mofei/stream/ai-summarize' || pathname === '/api/openfic/stream/ai-summarize') { await streamSummarize(req, res, body && body.args || {}); return }
        res.setHeader('content-type', 'application/json')
        const method = body && typeof body.method === 'string' ? body.method : ''
        const handler = handlers[method]
        if (!handler) { res.statusCode = 404; res.end(JSON.stringify({ ok: false, error: 'METHOD_NOT_FOUND:' + method })); return }
        const value = await handler(body.args)
        res.end(JSON.stringify({ ok: true, value: value === undefined ? null : value }))
      } catch (error) {
        console.error('墨扉 rpc failed', error)
        res.setHeader('content-type', 'application/json')
        res.statusCode = 500
        res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
      }
    }
    ctx.webServer.register({ kind: 'prefix', path: '/api/mofei', handler: rpcHandler })
    // 旧品牌兼容路由（过渡期保留，可在后续版本移除）
    ctx.webServer.register({ kind: 'prefix', path: '/api/openfic', handler: rpcHandler })
    // P0 独立站点：/mofei 前缀静态 SPA（与官方 Web 完全隔离）
    const WEB_FILES = {
      'index.html': { file: path.join(pluginRoot, 'web', 'index.html'), type: 'text/html; charset=utf-8' },
      'app.js': { file: path.join(pluginRoot, 'lib', 'client.js'), type: 'text/javascript; charset=utf-8' },
      'vendor/react.js': { file: path.join(pluginRoot, 'web', 'vendor', 'react.js'), type: 'text/javascript; charset=utf-8' },
      'vendor/react-dom.js': { file: path.join(pluginRoot, 'web', 'vendor', 'react-dom.js'), type: 'text/javascript; charset=utf-8' },
    }
    ctx.webServer.register({
      kind: 'prefix',
      path: '/mofei',
      handler: async (req, res) => {
        try {
          if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end('Method Not Allowed'); return }
          const rawPath = String(req.url || '/').split('?')[0]
          const key = rawPath === '/mofei' || rawPath === '/mofei/' ? 'index.html' : decodeURIComponent(rawPath.slice('/mofei/'.length))
          const asset = WEB_FILES[key]
          if (!asset) { res.statusCode = 404; res.end('Not Found'); return }
          const body = await readFile(asset.file)
          res.setHeader('content-type', asset.type)
          res.setHeader('cache-control', 'no-cache')
          if (req.method === 'HEAD') res.end(); else res.end(body)
        } catch (error) {
          console.error('墨扉 web static failed', error)
          res.statusCode = 500
          res.end('Internal Server Error')
        }
      },
    })
    // 墨扉服务契约：Agent Plane 插件（mofei-dsh/tools / context）通过 ctx.get('mofei') 使用。
    // core 本身不注册任何 Agent 工具/技能，避免污染 standard coding 会话。
    const runMethod = async (method, args) => {
      await load(); await queue
      const result = await handlers[method](args)
      if (result && result.error) throw new Error(result.error)
      return result
    }
    const mofeiService = {
      run: runMethod,
      ready: async () => { await load(); await queue },
      listProjects: async () => { await load(); await queue; return { projects: store.projects.map((item) => ({ id: item.id, title: item.title, chapterCount: item.chapters.length })) } },
      readChapter: async (projectId, chapterId) => { await load(); await queue; const project = projectBy(projectId); const chapter = chapterBy(project, chapterId); if (!chapter) throw new Error('CHAPTER_NOT_FOUND'); return chapterView(chapter) },
      listCharacters: async (projectId) => { await load(); await queue; const project = projectBy(projectId); if (!project) throw new Error('PROJECT_NOT_FOUND'); return { characters: (project.characters || []).map(characterView) } },
      listNotes: async (projectId) => { await load(); await queue; const project = projectBy(projectId); if (!project) throw new Error('PROJECT_NOT_FOUND'); return { notes: (project.notes || []).filter((item) => !item.isHidden).map((item) => ({ id: item.id, title: item.title, categoryId: item.categoryId || null, isLocked: !!item.isLocked })) } },
      listWorldEntries: async (projectId) => { await load(); await queue; const project = projectBy(projectId); if (!project) throw new Error('PROJECT_NOT_FOUND'); return { entries: (project.worldEntries || []).map(worldEntryView) } },
      projectBy: async (projectId) => { await load(); await queue; const project = projectBy(projectId); if (!project) throw new Error('PROJECT_NOT_FOUND'); return project },
      activeAgentContext: async (sessionId) => {
        const id = typeof sessionId === 'string' ? sessionId.trim() : ''
        const binding = id ? agentContexts.get(id) : null
        if (!binding) return { bound: false, contextText: '' }
        const project = projectBy(binding.projectId)
        if (!project) { agentContexts.delete(id); return { bound: false, contextText: '', error: 'PROJECT_NOT_FOUND' } }
        if (!binding.chapterId) return { bound: true, boundAt: binding.updatedAt, project: { id: project.id, title: project.title }, chapter: null, contextText: projectAgentContext(project) }
        let result
        try { result = await runMethod('chapter-context', { projectId: binding.projectId, chapterId: binding.chapterId }) }
        catch (error) { agentContexts.delete(id); return { bound: false, contextText: '', error: String((error && error.message) || error) } }
        return { bound: true, boundAt: binding.updatedAt, project: result.project, chapter: result.chapter, contextText: result.contextText || '' }
      },
      zone: async () => ({ active: true, workspaceRoot: cwd }),
      // v0.17: 技能插件按此过滤禁用技能（skills-plugin.js 注册时调用）。
      listSkillSettings: async () => { await load(); return { disabledSkills: skillSettings.disabledSkills.slice() } },
    }
    if (typeof ctx.provide === 'function') ctx.provide('mofei', mofeiService)
    // v0.10.2: 挂接 DSH jobs controller（使 unowned 后台任务可启动）；无 jobs 服务时忽略。
    try {
      const jobs = ctx.get('jobs')
      if (jobs && typeof jobs.attachController === 'function') jobs.attachController('mofei-dsh')
    } catch (error) { console.warn('墨扉 jobs attachController 失败', error) }
  },
}
