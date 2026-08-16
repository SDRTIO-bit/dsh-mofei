return {
  inject: ['fs', 'sandboxPolicy'],
  apply(ctx) {
    const fs = ctx.fs
    const cwd = ctx.sandboxPolicy.workspaceRoot
    const policy = ctx.sandboxPolicy.resolve()
    const HISTORY_CAP = 20
    let projectTarget, draftTarget, statsTarget, loading
    let queue = Promise.resolve()
    let store = { version: 4, nextId: 1, projects: [] }
    let draftStore = { version: 1, items: [] }
    let stats = { version: 1, days: {} }
    function text(value, fallback) { const result = typeof value === 'string' ? value.trim() : ''; return result || fallback }
    function pad(value) { return value < 10 ? '0' + String(value) : String(value) }
    function dayKey(date) { return String(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) }
    function chapterView(item) { return { id: item.id, title: item.title, content: item.content, order: item.order, revision: item.revision, historyCount: Array.isArray(item.history) ? item.history.length : 0, volumeId: item.volumeId || null } }
    function volumeView(item, chapters) { return { id: item.id, title: item.title, description: item.description, order: item.order, chapterCount: chapters.filter((c) => c.volumeId === item.id).length } }
    function characterView(item) { return { id: item.id, name: item.name, description: item.description, isFavorited: !!item.isFavorited } }
    function categoryView(item) { return { id: item.id, title: item.title, parentId: item.parentId || null } }
    function noteView(item) { return { id: item.id, title: item.title, content: item.content, categoryId: item.categoryId || null, isLocked: !!item.isLocked, isHidden: !!item.isHidden } }
    function projectView(item) { return { id: item.id, title: item.title, description: item.description, goal: typeof item.goal === 'number' ? item.goal : 0, chapters: item.chapters.map(chapterView), volumes: (item.volumes || []).map((v) => volumeView(v, item.chapters)), characters: (item.characters || []).map(characterView), notes: (item.notes || []).map(noteView), noteCategories: (item.noteCategories || []).map(categoryView) } }
    function draftView(item) { return { projectId: item.projectId, chapterId: item.chapterId, content: item.content, baseRevision: item.baseRevision } }
    function projectBy(id) { return store.projects.find((item) => item.id === id) }
    function chapterBy(project, id) { return project && project.chapters.find((item) => item.id === id) }
    function volumeBy(project, id) { return project && (project.volumes || []).find((item) => item.id === id) }
    function characterBy(project, id) { return project && (project.characters || []).find((item) => item.id === id) }
    function categoryBy(project, id) { return project && (project.noteCategories || []).find((item) => item.id === id) }
    function noteBy(project, id) { return project && (project.notes || []).find((item) => item.id === id) }
    function allocate(prefix) { const id = prefix + '-' + String(store.nextId); store.nextId += 1; return id }
    function statsView() {
      const keys = Object.keys(stats.days).sort()
      const totalChars = keys.reduce((sum, key) => sum + (stats.days[key].chars || 0), 0)
      const today = dayKey(new Date())
      const entry = stats.days[today]
      return { today: today, todayChars: entry ? entry.chars : 0, totalChars: totalChars, streak: computeStreak(), days: keys.length }
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
    function pushHistory(chapter) {
      if (!Array.isArray(chapter.history)) chapter.history = []
      chapter.history.push({ revision: chapter.revision, content: chapter.content, at: Date.now() })
      if (chapter.history.length > HISTORY_CAP) chapter.history.splice(0, chapter.history.length - HISTORY_CAP)
    }
    function countAdded(previous, next) { return next.length - previous.length }
    async function readJson(target, fallback) {
      if (await fs.stat(target) === undefined) return fallback
      try { const value = JSON.parse(await fs.readText(target)); return value && typeof value === 'object' ? value : fallback }
      catch (error) { console.error('OpenFic could not read persisted data', error); return fallback }
    }
    async function load() {
      if (loading) return loading
      loading = (async () => {
        projectTarget = await fs.resolve('.openfic-projects.json', { cwd })
        draftTarget = await fs.resolve('.openfic-drafts.json', { cwd })
        statsTarget = await fs.resolve('.openfic-stats.json', { cwd })
        const projects = await readJson(projectTarget, store)
        const drafts = await readJson(draftTarget, draftStore)
        const statsData = await readJson(statsTarget, stats)
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
          })
        }
        if (Array.isArray(drafts.items)) draftStore = drafts
        if (statsData && statsData.days && typeof statsData.days === 'object' && !Array.isArray(statsData.days)) {
          stats = statsData
          stats.version = 1
        }
      })()
      return loading
    }
    function mutate(operation) {
      const run = queue.then(async () => { await load(); return operation() }, async () => { await load(); return operation() })
      queue = run.then(() => undefined, () => undefined)
      return run
    }
    async function saveProjects() { await fs.writeText(projectTarget, JSON.stringify(store, null, 2), undefined, undefined, policy) }
    async function saveDrafts() { await fs.writeText(draftTarget, JSON.stringify(draftStore, null, 2), undefined, undefined, policy) }
    async function saveStats() { await fs.writeText(statsTarget, JSON.stringify(stats, null, 2), undefined, undefined, policy) }
    async function snapshot() { await load(); await queue; return { projects: store.projects.map(projectView), drafts: draftStore.items.map(draftView), stats: statsView() } }
    harness.handle('openfic.bootstrap', snapshot)
    harness.handle('openfic.list-projects', async () => ({ projects: (await snapshot()).projects }))
    harness.handle('openfic.stats', async () => { await load(); await queue; return statsView() })
    harness.handle('openfic.create-project', async (args) => mutate(async () => {
      const project = { id: allocate('project'), title: text(args && args.title, '未命名项目'), description: text(args && args.description, ''), goal: 0, chapters: [], volumes: [], characters: [], notes: [], noteCategories: [] }
      store.projects.push(project); await saveProjects(); return { project: projectView(project) }
    }))
    harness.handle('openfic.create-chapter', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const volumeId = args && args.volumeId && volumeBy(project, args.volumeId) ? args.volumeId : null
      const chapter = { id: allocate('chapter'), title: text(args && args.title, '未命名章节'), content: '', order: project.chapters.length, revision: 1, history: [], volumeId: volumeId }
      project.chapters.push(chapter); await saveProjects(); return { chapter: chapterView(chapter) }
    }))
    harness.handle('openfic.update-project', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      if (typeof args.title === 'string' && args.title.trim()) project.title = args.title.trim()
      if (typeof args.description === 'string') project.description = args.description
      if (typeof args.goal === 'number' && args.goal >= 0) project.goal = Math.floor(args.goal)
      await saveProjects(); return { project: projectView(project) }
    }))
    harness.handle('openfic.delete-project', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      store.projects = store.projects.filter((item) => item.id !== project.id)
      const before = draftStore.items.length
      draftStore.items = draftStore.items.filter((item) => item.projectId !== project.id)
      if (before !== draftStore.items.length) await saveDrafts()
      await saveProjects(); return { deleted: true, projectId: project.id }
    }))
    harness.handle('openfic.update-chapter-meta', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const chapter = chapterBy(project, args && args.chapterId)
      if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
      if (typeof args.title === 'string' && args.title.trim()) chapter.title = args.title.trim()
      await saveProjects(); return { chapter: chapterView(chapter) }
    }))
    harness.handle('openfic.delete-chapter', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const index = project.chapters.findIndex((item) => item.id === (args && args.chapterId))
      if (index < 0) return { error: 'CHAPTER_NOT_FOUND' }
      project.chapters.splice(index, 1)
      project.chapters.forEach((item, order) => { item.order = order })
      const before = draftStore.items.length
      draftStore.items = draftStore.items.filter((item) => !(item.projectId === project.id && item.chapterId === (args && args.chapterId)))
      if (before !== draftStore.items.length) await saveDrafts()
      await saveProjects(); return { deleted: true, chapterId: args.chapterId }
    }))
    harness.handle('openfic.move-chapter', async (args) => mutate(async () => {
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
    }))
    harness.handle('openfic.save-draft', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const chapter = chapterBy(project, args && args.chapterId)
      if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
      const item = { projectId: project.id, chapterId: chapter.id, content: typeof args.content === 'string' ? args.content : '', baseRevision: typeof args.baseRevision === 'number' ? args.baseRevision : chapter.revision }
      const index = draftStore.items.findIndex((current) => current.projectId === item.projectId && current.chapterId === item.chapterId)
      if (index < 0) draftStore.items.push(item); else draftStore.items[index] = item
      await saveDrafts(); return { draft: draftView(item), remoteRevision: chapter.revision }
    }))
    harness.handle('openfic.clear-draft', async (args) => mutate(async () => {
      const count = draftStore.items.length
      draftStore.items = draftStore.items.filter((item) => !(item.projectId === (args && args.projectId) && item.chapterId === (args && args.chapterId)))
      if (count !== draftStore.items.length) await saveDrafts()
      return { cleared: count !== draftStore.items.length }
    }))
    harness.handle('openfic.update-chapter', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const chapter = chapterBy(project, args && args.chapterId)
      if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
      if ((args && args.expectedRevision) !== chapter.revision) return { conflict: true, chapter: chapterView(chapter), expectedRevision: args && args.expectedRevision, actualRevision: chapter.revision }
      const previous = chapter.content
      pushHistory(chapter)
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
    }))
    harness.handle('openfic.chapter-history', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const chapter = chapterBy(project, args && args.chapterId)
      if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
      const history = (Array.isArray(chapter.history) ? chapter.history : []).slice().reverse()
      return { history: history.map((item) => ({ revision: item.revision, at: item.at, chars: item.content.length })) }
    }))
    harness.handle('openfic.rollback-chapter', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const chapter = chapterBy(project, args && args.chapterId)
      if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
      const history = Array.isArray(chapter.history) ? chapter.history : []
      const entry = history.find((item) => item.revision === (args && args.toRevision))
      if (!entry) return { error: 'REVISION_NOT_FOUND' }
      pushHistory(chapter)
      chapter.content = entry.content
      chapter.revision += 1
      await saveProjects()
      draftStore.items = draftStore.items.filter((item) => !(item.projectId === project.id && item.chapterId === chapter.id))
      await saveDrafts()
      return { chapter: chapterView(chapter) }
    }))
    // ---- v4: 卷 ----
    harness.handle('openfic.create-volume', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const volume = { id: allocate('volume'), title: text(args && args.title, '未命名卷'), description: text(args && args.description, ''), order: project.volumes.length }
      project.volumes.push(volume); await saveProjects(); return { volume: volumeView(volume, project.chapters) }
    }))
    harness.handle('openfic.update-volume', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const volume = volumeBy(project, args && args.volumeId)
      if (!volume) return { error: 'VOLUME_NOT_FOUND' }
      if (typeof args.title === 'string' && args.title.trim()) volume.title = args.title.trim()
      if (typeof args.description === 'string') volume.description = args.description
      await saveProjects(); return { volume: volumeView(volume, project.chapters) }
    }))
    harness.handle('openfic.delete-volume', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const volume = volumeBy(project, args && args.volumeId)
      if (!volume) return { error: 'VOLUME_NOT_FOUND' }
      const count = project.chapters.filter((c) => c.volumeId === volume.id).length
      project.volumes = project.volumes.filter((v) => v.id !== volume.id)
      project.chapters = project.chapters.filter((c) => c.volumeId !== volume.id)
      project.chapters.forEach((c, order) => { c.order = order })
      const before = draftStore.items.length
      const removedIds = project.chapters.map((c) => c.id)
      draftStore.items = draftStore.items.filter((item) => !(item.projectId === project.id && !removedIds.includes(item.chapterId)))
      if (before !== draftStore.items.length) await saveDrafts()
      await saveProjects(); return { deleted: true, volumeId: volume.id, chapterCount: count }
    }))
    harness.handle('openfic.move-volume', async (args) => mutate(async () => {
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
    }))
    harness.handle('openfic.set-chapter-volume', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const chapter = chapterBy(project, args && args.chapterId)
      if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
      const volumeId = args && args.volumeId
      if (volumeId !== null && volumeId !== undefined && !volumeBy(project, volumeId)) return { error: 'VOLUME_NOT_FOUND' }
      chapter.volumeId = volumeId === null || volumeId === undefined ? null : volumeId
      await saveProjects(); return { chapter: chapterView(chapter) }
    }))
    // ---- v4: 角色 ----
    harness.handle('openfic.create-character', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const character = { id: allocate('character'), name: text(args && args.name, '未命名角色'), description: text(args && args.description, ''), isFavorited: false }
      project.characters.push(character); await saveProjects(); return { character: characterView(character) }
    }))
    harness.handle('openfic.update-character', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const character = characterBy(project, args && args.characterId)
      if (!character) return { error: 'CHARACTER_NOT_FOUND' }
      if (typeof args.name === 'string' && args.name.trim()) character.name = args.name.trim()
      if (typeof args.description === 'string') character.description = args.description
      await saveProjects(); return { character: characterView(character) }
    }))
    harness.handle('openfic.delete-character', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const before = project.characters.length
      project.characters = project.characters.filter((c) => c.id !== (args && args.characterId))
      if (before === project.characters.length) return { error: 'CHARACTER_NOT_FOUND' }
      await saveProjects(); return { deleted: true, characterId: args.characterId }
    }))
    harness.handle('openfic.toggle-character-favorite', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const character = characterBy(project, args && args.characterId)
      if (!character) return { error: 'CHARACTER_NOT_FOUND' }
      character.isFavorited = !character.isFavorited
      await saveProjects(); return { character: characterView(character) }
    }))
    // ---- v4: 笔记 ----
    harness.handle('openfic.create-note-category', async (args) => mutate(async () => {
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
    }))
    harness.handle('openfic.rename-note-category', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const category = categoryBy(project, args && args.categoryId)
      if (!category) return { error: 'CATEGORY_NOT_FOUND' }
      if (typeof args.title === 'string' && args.title.trim()) category.title = args.title.trim()
      await saveProjects(); return { category: categoryView(category) }
    }))
    harness.handle('openfic.delete-note-category', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const category = categoryBy(project, args && args.categoryId)
      if (!category) return { error: 'CATEGORY_NOT_FOUND' }
      const doomed = [category.id]
      project.noteCategories.forEach((c) => { if (c.parentId === category.id) doomed.push(c.id) })
      project.noteCategories = project.noteCategories.filter((c) => !doomed.includes(c.id))
      project.notes.forEach((n) => { if (doomed.includes(n.categoryId)) n.categoryId = null })
      await saveProjects(); return { deleted: true, categoryId: category.id }
    }))
    harness.handle('openfic.create-note', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const categoryId = args && args.categoryId ? args.categoryId : null
      if (categoryId && !categoryBy(project, categoryId)) return { error: 'CATEGORY_NOT_FOUND' }
      const note = { id: allocate('note'), title: text(args && args.title, '未命名笔记'), content: '', categoryId: categoryId, isLocked: false, isHidden: false }
      project.notes.push(note); await saveProjects(); return { note: noteView(note) }
    }))
    harness.handle('openfic.update-note', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const note = noteBy(project, args && args.noteId)
      if (!note) return { error: 'NOTE_NOT_FOUND' }
      if (typeof args.title === 'string' && args.title.trim()) note.title = args.title.trim()
      if (typeof args.content === 'string') note.content = args.content
      if (typeof args.isLocked === 'boolean') note.isLocked = args.isLocked
      if (typeof args.isHidden === 'boolean') note.isHidden = args.isHidden
      await saveProjects(); return { note: noteView(note) }
    }))
    harness.handle('openfic.delete-note', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const before = project.notes.length
      project.notes = project.notes.filter((n) => n.id !== (args && args.noteId))
      if (before === project.notes.length) return { error: 'NOTE_NOT_FOUND' }
      await saveProjects(); return { deleted: true, noteId: args.noteId }
    }))
    harness.handle('openfic.move-note', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      const note = noteBy(project, args && args.noteId)
      if (!note) return { error: 'NOTE_NOT_FOUND' }
      const categoryId = args && args.categoryId ? args.categoryId : null
      if (categoryId && !categoryBy(project, categoryId)) return { error: 'CATEGORY_NOT_FOUND' }
      note.categoryId = categoryId
      await saveProjects(); return { note: noteView(note) }
    }))
    // ---- v4: 全文搜索 ----
    harness.handle('openfic.search-chapters', async (args) => mutate(async () => {
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
    }))
  },
}
