return {
  inject: ['fs', 'sandboxPolicy'],
  apply(ctx) {
    const fs = ctx.fs
    const cwd = ctx.sandboxPolicy.workspaceRoot
    const policy = ctx.sandboxPolicy.resolve()
    const HISTORY_CAP = 20
    let projectTarget, draftTarget, statsTarget, loading
    let queue = Promise.resolve()
    let store = { version: 3, nextId: 1, projects: [] }
    let draftStore = { version: 1, items: [] }
    let stats = { version: 1, days: {} }
    function text(value, fallback) { const result = typeof value === 'string' ? value.trim() : ''; return result || fallback }
    function pad(value) { return value < 10 ? '0' + String(value) : String(value) }
    function dayKey(date) { return String(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) }
    function chapterView(item) { return { id: item.id, title: item.title, content: item.content, order: item.order, revision: item.revision, historyCount: Array.isArray(item.history) ? item.history.length : 0 } }
    function projectView(item) { return { id: item.id, title: item.title, description: item.description, goal: typeof item.goal === 'number' ? item.goal : 0, chapters: item.chapters.map(chapterView) } }
    function draftView(item) { return { projectId: item.projectId, chapterId: item.chapterId, content: item.content, baseRevision: item.baseRevision } }
    function projectBy(id) { return store.projects.find((item) => item.id === id) }
    function chapterBy(project, id) { return project && project.chapters.find((item) => item.id === id) }
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
          store.version = 3
          if (typeof store.nextId !== 'number') store.nextId = 1
          store.projects.forEach((project) => {
            if (!Array.isArray(project.chapters)) project.chapters = []
            project.chapters.forEach((chapter, index) => {
              if (typeof chapter.content !== 'string') chapter.content = ''
              if (typeof chapter.order !== 'number') chapter.order = index
              if (typeof chapter.revision !== 'number') chapter.revision = 1
              if (!Array.isArray(chapter.history)) chapter.history = []
              chapter.history = chapter.history.filter((entry) => entry && typeof entry.content === 'string' && typeof entry.revision === 'number')
              if (chapter.history.length > HISTORY_CAP) chapter.history.splice(0, chapter.history.length - HISTORY_CAP)
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
      const project = { id: allocate('project'), title: text(args && args.title, '未命名项目'), description: text(args && args.description, ''), goal: 0, chapters: [] }
      store.projects.push(project); await saveProjects(); return { project: projectView(project) }
    }))
    harness.handle('openfic.create-chapter', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const chapter = { id: allocate('chapter'), title: text(args && args.title, '未命名章节'), content: '', order: project.chapters.length, revision: 1, history: [] }
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
  },
}
