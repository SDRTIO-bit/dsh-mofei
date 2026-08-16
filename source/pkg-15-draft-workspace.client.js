return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const h = React.createElement
    const ui = { open: false, listeners: [] }
    const saveLocks = {}

    styles.insert(`
      .ofic-trigger{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border:0;background:transparent;color:var(--foreground);cursor:pointer;font:inherit;border-radius:6px}
      .ofic-trigger:hover{background:var(--accent)}.ofic-trigger-mark{display:grid;place-items:center;width:24px;height:24px;border:1px solid var(--border);border-radius:5px;font-size:10px;font-weight:700;background:var(--background)}
      .ofic-overlay{position:fixed;inset:0;display:flex;justify-content:flex-end;background:rgba(0,0,0,.28);pointer-events:auto;z-index:40}
      .ofic-panel{width:min(1120px,calc(100vw - 24px));height:calc(100vh - 24px);margin:12px;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.25);display:grid;grid-template-rows:52px minmax(0,1fr);overflow:hidden}
      .ofic-head{display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid var(--border)}.ofic-brand{display:flex;align-items:baseline;gap:10px}.ofic-brand strong{font-size:15px}.ofic-brand span{font-size:12px;color:var(--muted-foreground)}
      .ofic-icon{width:32px;height:32px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:20px}.ofic-icon:hover{background:var(--accent)}
      .ofic-body{display:grid;grid-template-columns:230px 250px minmax(0,1fr);min-height:0}.ofic-col{min-width:0;min-height:0;border-right:1px solid var(--border);display:flex;flex-direction:column}.ofic-editor{min-width:0;min-height:0;display:flex;flex-direction:column}
      .ofic-colhead{height:46px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid var(--border);font-size:12px;font-weight:650}.ofic-add{border:1px solid var(--border);background:var(--background);color:inherit;border-radius:5px;padding:5px 8px;cursor:pointer}.ofic-add:hover{background:var(--accent)}
      .ofic-list{padding:8px;overflow:auto}.ofic-item{width:100%;text-align:left;border:0;background:transparent;color:inherit;border-radius:5px;padding:9px 10px;cursor:pointer;font:inherit}.ofic-item:hover{background:var(--accent)}.ofic-item.active{background:var(--accent);font-weight:650}.ofic-item small{display:block;margin-top:3px;color:var(--muted-foreground);font-size:11px;font-weight:400}
      .ofic-empty{padding:18px 12px;color:var(--muted-foreground);font-size:12px;line-height:1.5}.ofic-form{display:grid;gap:8px;padding:10px;border-bottom:1px solid var(--border)}.ofic-input{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:5px;background:var(--background);color:inherit;padding:8px;font:inherit}.ofic-formrow{display:flex;gap:6px;justify-content:flex-end}
      .ofic-editorhead{height:46px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 14px;border-bottom:1px solid var(--border)}.ofic-title{font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ofic-status{font-size:11px;color:var(--muted-foreground);white-space:nowrap}.ofic-status.unsaved{color:#b45309}.ofic-status.saving{color:#2563eb}.ofic-status.error{color:#dc2626}
      .ofic-textarea{flex:1;min-height:0;width:100%;box-sizing:border-box;resize:none;border:0;outline:0;background:var(--background);color:inherit;padding:28px clamp(20px,6vw,72px);font:16px/1.85 ui-serif,Georgia,serif}.ofic-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 14px;border-top:1px solid var(--border);font-size:11px;color:var(--muted-foreground)}
      .ofic-primary{border:0;border-radius:5px;background:var(--primary);color:var(--primary-foreground);padding:7px 12px;cursor:pointer;font:inherit}.ofic-primary:disabled{opacity:.55;cursor:not-allowed}.ofic-error{padding:9px 14px;background:rgba(220,38,38,.09);color:#dc2626;font-size:12px;border-bottom:1px solid rgba(220,38,38,.25)}
      @media(max-width:760px){.ofic-panel{width:100vw;height:100vh;margin:0;border-radius:0;border:0}.ofic-body{grid-template-columns:120px minmax(0,1fr)}.ofic-body>.ofic-col:nth-child(2){display:none}.ofic-textarea{padding:18px 16px}.ofic-brand span{display:none}}
    `)

    function setOpen(value) {
      ui.open = value
      ui.listeners.slice().forEach((listener) => listener(value))
    }

    function useOpen() {
      const state = React.useState(ui.open)
      const value = state[0]
      const setValue = state[1]
      React.useEffect(() => {
        ui.listeners.push(setValue)
        return () => {
          ui.listeners = ui.listeners.filter((listener) => listener !== setValue)
        }
      }, [])
      return value
    }

    function FooterAction(props) {
      return h('button', { className: 'ofic-trigger', type: 'button', onClick: () => setOpen(true), title: '打开 OpenFic' },
        h('span', { className: 'ofic-trigger-mark' }, 'OF'),
        props && props.wide ? h('span', null, 'OpenFic') : null,
      )
    }

    function Workspace() {
      const open = useOpen()
      const projectsState = React.useState([])
      const projects = projectsState[0]
      const setProjects = projectsState[1]
      const draftsState = React.useState([])
      const drafts = draftsState[0]
      const setDrafts = draftsState[1]
      const projectState = React.useState('')
      const projectId = projectState[0]
      const setProjectId = projectState[1]
      const chapterState = React.useState('')
      const chapterId = chapterState[0]
      const setChapterId = chapterState[1]
      const draftState = React.useState('')
      const draft = draftState[0]
      const setDraft = draftState[1]
      const savedState = React.useState('')
      const savedContent = savedState[0]
      const setSavedContent = savedState[1]
      const revisionState = React.useState(0)
      const baseRevision = revisionState[0]
      const setBaseRevision = revisionState[1]
      const statusState = React.useState('saved')
      const saveStatus = statusState[0]
      const setSaveStatus = statusState[1]
      const errorState = React.useState('')
      const error = errorState[0]
      const setError = errorState[1]
      const loadingState = React.useState(true)
      const loading = loadingState[0]
      const setLoading = loadingState[1]
      const projectFormState = React.useState(false)
      const showProjectForm = projectFormState[0]
      const setShowProjectForm = projectFormState[1]
      const chapterFormState = React.useState(false)
      const showChapterForm = chapterFormState[0]
      const setShowChapterForm = chapterFormState[1]
      const newProjectState = React.useState('')
      const newProjectTitle = newProjectState[0]
      const setNewProjectTitle = newProjectState[1]
      const newChapterState = React.useState('')
      const newChapterTitle = newChapterState[0]
      const setNewChapterTitle = newChapterState[1]

      const selectedProject = projects.find((item) => item.id === projectId)
      const selectedChapter = selectedProject && selectedProject.chapters.find((item) => item.id === chapterId)
      const hasChanges = !!chapterId && draft !== savedContent

      React.useEffect(() => {
        if (!open) return undefined
        let alive = true
        setLoading(true)
        host.call('openfic.bootstrap', {}).then((result) => {
          if (!alive) return
          const nextProjects = result && Array.isArray(result.projects) ? result.projects : []
          const nextDrafts = result && Array.isArray(result.drafts) ? result.drafts : []
          setProjects(nextProjects)
          setDrafts(nextDrafts)
          setLoading(false)
          setError('')
        }).catch((failure) => {
          if (!alive) return
          setLoading(false)
          setError('无法加载写作工作区')
          console.error(failure)
        })
        return () => { alive = false }
      }, [open])

      function persistDraft() {
        if (!projectId || !chapterId || !hasChanges) return Promise.resolve(null)
        return host.call('openfic.save-draft', { projectId, chapterId, content: draft, baseRevision }).then((result) => {
          if (result && result.draft) {
            setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === chapterId)).concat([result.draft]))
          }
          return result
        }).catch((failure) => {
          setSaveStatus('error')
          setError('草稿持久化失败，请勿关闭页面')
          console.error(failure)
          return null
        })
      }

      function applySavedChapter(chapter) {
        setProjects((items) => items.map((project) => project.id !== projectId ? project : {
          id: project.id,
          title: project.title,
          description: project.description,
          chapters: project.chapters.map((item) => item.id === chapter.id ? chapter : item),
        }))
        setSavedContent(chapter.content)
        setDraft(chapter.content)
        setBaseRevision(chapter.revision)
        setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === chapter.id)))
        setSaveStatus('saved')
        setError('')
      }

      function saveChapter() {
        if (!projectId || !chapterId || !hasChanges) return Promise.resolve(null)
        const key = projectId + ':' + chapterId
        if (saveLocks[key]) return saveLocks[key]
        setSaveStatus('saving')
        setError('')
        const operation = host.call('openfic.update-chapter', {
          projectId,
          chapterId,
          content: draft,
          expectedRevision: baseRevision,
        }).then((result) => {
          if (result && result.conflict) {
            setSaveStatus('error')
            setError('远端正文已更新。当前草稿已保留，请对照后再保存。')
            return result
          }
          if (!result || !result.chapter) {
            setSaveStatus('error')
            setError('保存失败')
            return result
          }
          applySavedChapter(result.chapter)
          return result
        }).catch((failure) => {
          setSaveStatus('error')
          setError('保存失败，草稿仍已保留')
          console.error(failure)
          return null
        }).then((result) => {
          delete saveLocks[key]
          return result
        }, (failure) => {
          delete saveLocks[key]
          throw failure
        })
        saveLocks[key] = operation
        return operation
      }

      React.useEffect(() => {
        if (!open || !hasChanges || !projectId || !chapterId) return undefined
        const persist = ctx.debounce(() => { persistDraft() }, 800)
        persist()
        return () => persist.dispose()
      }, [open, projectId, chapterId, draft, baseRevision])

      React.useEffect(() => {
        if (!open || !hasChanges || saveStatus === 'saving' || saveStatus === 'error') return undefined
        const autosave = ctx.debounce(() => { saveChapter() }, 180000)
        autosave()
        return () => autosave.dispose()
      }, [open, projectId, chapterId, draft, baseRevision, saveStatus])

      React.useEffect(() => () => {
        if (projectId && chapterId && draft !== savedContent) {
          host.call('openfic.save-draft', { projectId, chapterId, content: draft, baseRevision }).catch((failure) => console.error(failure))
        }
      }, [projectId, chapterId, draft, savedContent, baseRevision])

      function chooseProject(id) {
        persistDraft()
        setProjectId(id)
        setChapterId('')
        setDraft('')
        setSavedContent('')
        setBaseRevision(0)
        setSaveStatus('saved')
        setError('')
      }

      function chooseChapter(chapter) {
        persistDraft()
        const stored = drafts.find((item) => item.projectId === projectId && item.chapterId === chapter.id)
        setChapterId(chapter.id)
        setSavedContent(chapter.content)
        setBaseRevision(stored ? stored.baseRevision : chapter.revision)
        setDraft(stored ? stored.content : chapter.content)
        if (stored && stored.baseRevision !== chapter.revision) {
          setSaveStatus('error')
          setError('检测到正文版本变化，已保留本地草稿。')
        } else {
          setSaveStatus(stored && stored.content !== chapter.content ? 'unsaved' : 'saved')
          setError('')
        }
      }

      function createProject() {
        if (!newProjectTitle.trim()) return
        host.call('openfic.create-project', { title: newProjectTitle }).then((result) => {
          if (!result || !result.project) return
          setProjects((items) => items.concat([result.project]))
          setNewProjectTitle('')
          setShowProjectForm(false)
          chooseProject(result.project.id)
        }).catch((failure) => { setError('创建项目失败'); console.error(failure) })
      }

      function createChapter() {
        if (!projectId || !newChapterTitle.trim()) return
        host.call('openfic.create-chapter', { projectId, title: newChapterTitle }).then((result) => {
          if (!result || !result.chapter) return
          setProjects((items) => items.map((project) => project.id !== projectId ? project : {
            id: project.id,
            title: project.title,
            description: project.description,
            chapters: project.chapters.concat([result.chapter]),
          }))
          setNewChapterTitle('')
          setShowChapterForm(false)
          chooseChapter(result.chapter)
        }).catch((failure) => { setError('创建章节失败'); console.error(failure) })
      }

      function closeWorkspace() {
        persistDraft()
        setOpen(false)
      }

      if (!open) return null

      const statusText = saveStatus === 'saving' ? '正在保存' : saveStatus === 'unsaved' ? '未保存' : saveStatus === 'error' ? '需要处理' : '已保存'
      const chapterCount = selectedProject ? selectedProject.chapters.length : 0

      return h('div', { className: 'ofic-overlay', onMouseDown: (event) => { if (event.target === event.currentTarget) closeWorkspace() } },
        h('section', { className: 'ofic-panel', role: 'dialog', 'aria-label': 'OpenFic 写作工作区' },
          h('header', { className: 'ofic-head' },
            h('div', { className: 'ofic-brand' }, h('strong', null, 'OpenFic'), h('span', null, '持久化写作工作区')),
            h('button', { className: 'ofic-icon', type: 'button', onClick: closeWorkspace, title: '关闭' }, '×'),
          ),
          h('div', { className: 'ofic-body' },
            h('aside', { className: 'ofic-col' },
              h('div', { className: 'ofic-colhead' }, h('span', null, '项目'), h('button', { className: 'ofic-add', type: 'button', onClick: () => setShowProjectForm(!showProjectForm) }, '+ 新建')),
              showProjectForm ? h('div', { className: 'ofic-form' },
                h('input', { className: 'ofic-input', value: newProjectTitle, placeholder: '项目名称', onChange: (event) => setNewProjectTitle(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createProject() } }),
                h('div', { className: 'ofic-formrow' }, h('button', { className: 'ofic-primary', type: 'button', onClick: createProject }, '创建')),
              ) : null,
              h('div', { className: 'ofic-list' }, loading ? h('div', { className: 'ofic-empty' }, '正在加载…') : projects.length === 0 ? h('div', { className: 'ofic-empty' }, '创建第一个小说项目。') : projects.map((project) => h('button', { key: project.id, className: 'ofic-item' + (project.id === projectId ? ' active' : ''), type: 'button', onClick: () => chooseProject(project.id) }, project.title, h('small', null, String(project.chapters.length) + ' 章')))),
            ),
            h('aside', { className: 'ofic-col' },
              h('div', { className: 'ofic-colhead' }, h('span', null, '章节'), h('button', { className: 'ofic-add', type: 'button', disabled: !selectedProject, onClick: () => setShowChapterForm(!showChapterForm) }, '+ 新建')),
              showChapterForm && selectedProject ? h('div', { className: 'ofic-form' },
                h('input', { className: 'ofic-input', value: newChapterTitle, placeholder: '章节标题', onChange: (event) => setNewChapterTitle(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createChapter() } }),
                h('div', { className: 'ofic-formrow' }, h('button', { className: 'ofic-primary', type: 'button', onClick: createChapter }, '创建')),
              ) : null,
              h('div', { className: 'ofic-list' }, !selectedProject ? h('div', { className: 'ofic-empty' }, '选择一个项目。') : chapterCount === 0 ? h('div', { className: 'ofic-empty' }, '创建第一章开始写作。') : selectedProject.chapters.map((chapter) => h('button', { key: chapter.id, className: 'ofic-item' + (chapter.id === chapterId ? ' active' : ''), type: 'button', onClick: () => chooseChapter(chapter) }, chapter.title, h('small', null, '版本 ' + String(chapter.revision))))),
            ),
            h('main', { className: 'ofic-editor' },
              h('div', { className: 'ofic-editorhead' }, h('div', { className: 'ofic-title' }, selectedChapter ? selectedChapter.title : '正文编辑器'), h('div', { className: 'ofic-status ' + saveStatus }, selectedChapter ? statusText : '')),
              error ? h('div', { className: 'ofic-error' }, error) : null,
              selectedChapter ? h('textarea', { className: 'ofic-textarea', value: draft, spellCheck: true, placeholder: '开始写作…', onChange: (event) => { setDraft(event.target.value); setSaveStatus('unsaved'); setError('') } }) : h('div', { className: 'ofic-empty' }, '选择章节后开始写作。'),
              h('div', { className: 'ofic-toolbar' },
                h('span', null, selectedChapter ? String(draft.length) + ' 字符 · 自动保存 3 分钟' : ''),
                h('button', { className: 'ofic-primary', type: 'button', disabled: !hasChanges || saveStatus === 'saving' || saveStatus === 'error', onClick: saveChapter }, saveStatus === 'saving' ? '保存中' : '保存正文'),
              ),
            ),
          ),
        ),
      )
    }

    slots.inject('sidebar.footer.action', () => slots.register(
      { name: 'sidebar.footer.action', id: 'openfic-workspace', order: 20, label: 'OpenFic' },
      FooterAction,
    ))
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'openfic-draft-workspace', order: 20, label: 'OpenFic Workspace' },
      Workspace,
    ))
  },
}
