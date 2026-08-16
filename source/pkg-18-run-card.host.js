return {
  inject: ['fs', 'sandboxPolicy'],
  apply(ctx) {
    const fs = ctx.fs
    const cwd = ctx.sandboxPolicy.workspaceRoot
    const policy = ctx.sandboxPolicy.resolve()
    let projectTarget, draftTarget, loading
    let queue = Promise.resolve()
    let store = { version: 2, nextId: 1, projects: [] }
    let draftStore = { version: 1, items: [] }
    function text(value, fallback) { const result = typeof value === 'string' ? value.trim() : ''; return result || fallback }
    function chapterView(item) { return { id: item.id, title: item.title, content: item.content, order: item.order, revision: item.revision } }
    function projectView(item) { return { id: item.id, title: item.title, description: item.description, chapters: item.chapters.map(chapterView) } }
    function draftView(item) { return { projectId: item.projectId, chapterId: item.chapterId, content: item.content, baseRevision: item.baseRevision } }
    function projectBy(id) { return store.projects.find((item) => item.id === id) }
    function chapterBy(project, id) { return project && project.chapters.find((item) => item.id === id) }
    function allocate(prefix) { const id = prefix + '-' + String(store.nextId); store.nextId += 1; return id }
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
        const projects = await readJson(projectTarget, store)
        const drafts = await readJson(draftTarget, draftStore)
        if (Array.isArray(projects.projects)) {
          store = projects
          if (typeof store.nextId !== 'number') store.nextId = 1
          store.projects.forEach((project) => {
            if (!Array.isArray(project.chapters)) project.chapters = []
            project.chapters.forEach((chapter, index) => {
              if (typeof chapter.content !== 'string') chapter.content = ''
              if (typeof chapter.order !== 'number') chapter.order = index
              if (typeof chapter.revision !== 'number') chapter.revision = 1
            })
          })
        }
        if (Array.isArray(drafts.items)) draftStore = drafts
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
    async function snapshot() { await load(); await queue; return { projects: store.projects.map(projectView), drafts: draftStore.items.map(draftView) } }
    harness.handle('openfic.bootstrap', snapshot)
    harness.handle('openfic.list-projects', async () => ({ projects: (await snapshot()).projects }))
    harness.handle('openfic.create-project', async (args) => mutate(async () => {
      const project = { id: allocate('project'), title: text(args && args.title, '未命名项目'), description: text(args && args.description, ''), chapters: [] }
      store.projects.push(project); await saveProjects(); return { project: projectView(project) }
    }))
    harness.handle('openfic.create-chapter', async (args) => mutate(async () => {
      const project = projectBy(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const chapter = { id: allocate('chapter'), title: text(args && args.title, '未命名章节'), content: '', order: project.chapters.length, revision: 1 }
      project.chapters.push(chapter); await saveProjects(); return { chapter: chapterView(chapter) }
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
      chapter.content = typeof args.content === 'string' ? args.content : chapter.content
      chapter.revision += 1
      await saveProjects()
      draftStore.items = draftStore.items.filter((item) => !(item.projectId === project.id && item.chapterId === chapter.id))
      await saveDrafts()
      return { saved: true, chapter: chapterView(chapter) }
    }))
  },
}
