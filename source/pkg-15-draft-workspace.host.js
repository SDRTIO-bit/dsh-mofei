return {
  inject: ['fs', 'sandboxPolicy'],
  apply(ctx) {
    const fs = ctx.fs
    const policy = ctx.sandboxPolicy.resolve()
    const cwd = ctx.sandboxPolicy.workspaceRoot
    let projectsTarget
    let draftsTarget
    let loadPromise
    let mutation = Promise.resolve()
    let data = { version: 2, nextId: 1, projects: [] }
    let draftData = { version: 1, items: [] }

    function cleanText(value, fallback) {
      const text = typeof value === 'string' ? value.trim() : ''
      return text || fallback
    }

    function copyChapter(chapter) {
      return {
        id: chapter.id,
        title: chapter.title,
        content: chapter.content,
        order: chapter.order,
        revision: chapter.revision,
      }
    }

    function copyProject(project) {
      return {
        id: project.id,
        title: project.title,
        description: project.description,
        chapters: project.chapters.map(copyChapter),
      }
    }

    function copyDraft(item) {
      return {
        projectId: item.projectId,
        chapterId: item.chapterId,
        content: item.content,
        baseRevision: item.baseRevision,
      }
    }

    function findProject(projectId) {
      return data.projects.find((item) => item.id === projectId)
    }

    function findChapter(project, chapterId) {
      return project && project.chapters.find((item) => item.id === chapterId)
    }

    function nextId(prefix) {
      const id = prefix + '-' + String(data.nextId)
      data.nextId += 1
      return id
    }

    async function loadJson(target, fallback) {
      const info = await fs.stat(target)
      if (info === undefined) return fallback
      try {
        const parsed = JSON.parse(await fs.readText(target))
        return parsed && typeof parsed === 'object' ? parsed : fallback
      } catch (error) {
        console.error('OpenFic persistence read failed', error)
        return fallback
      }
    }

    async function ensureLoaded() {
      if (loadPromise) return loadPromise
      loadPromise = (async () => {
        projectsTarget = await fs.resolve('.openfic-projects.json', { cwd })
        draftsTarget = await fs.resolve('.openfic-drafts.json', { cwd })
        const loadedProjects = await loadJson(projectsTarget, data)
        const loadedDrafts = await loadJson(draftsTarget, draftData)
        if (Array.isArray(loadedProjects.projects)) {
          data = loadedProjects
          if (typeof data.nextId !== 'number') data.nextId = 1
          data.projects.forEach((project) => {
            if (!Array.isArray(project.chapters)) project.chapters = []
            project.chapters.forEach((chapter, index) => {
              if (typeof chapter.revision !== 'number') chapter.revision = 1
              if (typeof chapter.order !== 'number') chapter.order = index
              if (typeof chapter.content !== 'string') chapter.content = ''
            })
          })
        }
        if (Array.isArray(loadedDrafts.items)) draftData = loadedDrafts
      })()
      return loadPromise
    }

    async function writeProjects() {
      await fs.writeText(projectsTarget, JSON.stringify(data, null, 2), undefined, undefined, policy)
    }

    async function writeDrafts() {
      await fs.writeText(draftsTarget, JSON.stringify(draftData, null, 2), undefined, undefined, policy)
    }

    function transact(operation) {
      const run = mutation.then(async () => {
        await ensureLoaded()
        return operation()
      }, async () => {
        await ensureLoaded()
        return operation()
      })
      mutation = run.then(() => undefined, () => undefined)
      return run
    }

    async function snapshot() {
      await ensureLoaded()
      await mutation
      return {
        projects: data.projects.map(copyProject),
        drafts: draftData.items.map(copyDraft),
      }
    }

    ctx.provide('openficDomain', {
      snapshot,
    })

    harness.handle('openfic.bootstrap', async () => snapshot())

    harness.handle('openfic.list-projects', async () => {
      const result = await snapshot()
      return { projects: result.projects }
    })

    harness.handle('openfic.create-project', async (args) => transact(async () => {
      const project = {
        id: nextId('project'),
        title: cleanText(args && args.title, '未命名项目'),
        description: typeof (args && args.description) === 'string' ? args.description.trim() : '',
        chapters: [],
      }
      data.projects.push(project)
      await writeProjects()
      return { project: copyProject(project) }
    }))

    harness.handle('openfic.create-chapter', async (args) => transact(async () => {
      const project = findProject(args && args.projectId)
      if (!project) return { error: 'PROJECT_NOT_FOUND' }
      const chapter = {
        id: nextId('chapter'),
        title: cleanText(args && args.title, '未命名章节'),
        content: '',
        order: project.chapters.length,
        revision: 1,
      }
      project.chapters.push(chapter)
      await writeProjects()
      return { chapter: copyChapter(chapter) }
    }))

    harness.handle('openfic.save-draft', async (args) => transact(async () => {
      const project = findProject(args && args.projectId)
      const chapter = findChapter(project, args && args.chapterId)
      if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
      const content = typeof args.content === 'string' ? args.content : ''
      const baseRevision = typeof args.baseRevision === 'number' ? args.baseRevision : chapter.revision
      const index = draftData.items.findIndex((item) => item.projectId === project.id && item.chapterId === chapter.id)
      const next = { projectId: project.id, chapterId: chapter.id, content, baseRevision }
      if (index >= 0) draftData.items[index] = next
      else draftData.items.push(next)
      await writeDrafts()
      return { draft: copyDraft(next), remoteRevision: chapter.revision }
    }))

    harness.handle('openfic.clear-draft', async (args) => transact(async () => {
      const before = draftData.items.length
      draftData.items = draftData.items.filter((item) => !(item.projectId === (args && args.projectId) && item.chapterId === (args && args.chapterId)))
      if (draftData.items.length !== before) await writeDrafts()
      return { cleared: draftData.items.length !== before }
    }))

    harness.handle('openfic.update-chapter', async (args) => transact(async () => {
      const project = findProject(args && args.projectId)
      const chapter = findChapter(project, args && args.chapterId)
      if (!chapter) return { error: 'CHAPTER_NOT_FOUND' }
      const expectedRevision = args && args.expectedRevision
      if (expectedRevision !== chapter.revision) {
        return {
          conflict: true,
          chapter: copyChapter(chapter),
          expectedRevision,
          actualRevision: chapter.revision,
        }
      }
      chapter.content = typeof args.content === 'string' ? args.content : chapter.content
      if (typeof args.title === 'string' && args.title.trim()) chapter.title = args.title.trim()
      chapter.revision += 1
      await writeProjects()
      draftData.items = draftData.items.filter((item) => !(item.projectId === project.id && item.chapterId === chapter.id))
      await writeDrafts()
      return { saved: true, chapter: copyChapter(chapter) }
    }))
  },
}
