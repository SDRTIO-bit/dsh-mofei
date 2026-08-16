return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const h = React.createElement
    const panel = { open: false, listeners: [] }
    const locks = {}
    styles.insert(`
      .of8-open{pointer-events:auto;border:0;border-radius:6px;background:var(--primary);color:var(--primary-foreground);padding:8px 12px;cursor:pointer;font:600 13px/1.2 sans-serif}.of8-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0}.of8-card span{font-size:12px;color:var(--muted-foreground)}
      .of8-float{position:fixed;right:16px;bottom:16px;z-index:80;pointer-events:auto;box-shadow:0 8px 28px rgba(0,0,0,.25)}.of8-side{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font:inherit}.of8-mark{display:grid;place-items:center;width:24px;height:24px;border:1px solid currentColor;border-radius:5px;font-size:10px;font-weight:700}
      .of8-overlay{position:fixed;inset:0;z-index:100;pointer-events:auto;display:flex;justify-content:flex-end;background:rgba(0,0,0,.32)}.of8-panel{width:min(1120px,calc(100vw - 24px));height:calc(100vh - 24px);margin:12px;display:grid;grid-template-rows:52px minmax(0,1fr);overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--background);color:var(--foreground);box-shadow:0 20px 60px rgba(0,0,0,.28)}
      .of8-head,.of8-sh,.of8-eh,.of8-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;border-bottom:1px solid var(--border)}.of8-head strong{font-size:15px}.of8-head small{margin-left:10px;color:var(--muted-foreground)}.of8-close{border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer}.of8-body{display:grid;grid-template-columns:220px 240px minmax(0,1fr);min-height:0}.of8-col{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid var(--border)}.of8-sh,.of8-eh{height:46px;font-size:12px;font-weight:650}.of8-list{overflow:auto;padding:8px}.of8-item{display:block;width:100%;padding:9px 10px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}.of8-item:hover,.of8-item.on{background:var(--accent)}.of8-item.on{font-weight:650}.of8-item small{display:block;margin-top:3px;color:var(--muted-foreground);font-size:11px;font-weight:400}
      .of8-btn{border:1px solid var(--border);border-radius:5px;background:var(--background);color:inherit;padding:6px 9px;cursor:pointer;font:inherit}.of8-btn:disabled{opacity:.5}.of8-primary{border-color:transparent;background:var(--primary);color:var(--primary-foreground)}.of8-form{display:grid;gap:7px;padding:9px;border-bottom:1px solid var(--border)}.of8-input{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--border);border-radius:5px;background:var(--background);color:inherit;font:inherit}.of8-empty{padding:16px 12px;color:var(--muted-foreground);font-size:12px}
      .of8-editor{display:flex;min-width:0;min-height:0;flex-direction:column}.of8-status{font-size:11px;color:var(--muted-foreground)}.of8-status.unsaved{color:#b45309}.of8-status.saving{color:#2563eb}.of8-status.error{color:#dc2626}.of8-alert{padding:10px 14px;border-bottom:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.08);color:#dc2626;font-size:12px}.of8-actions{display:flex;gap:7px;margin-top:8px}.of8-text{box-sizing:border-box;width:100%;flex:1;min-height:0;resize:none;border:0;outline:0;background:var(--background);color:inherit;padding:28px clamp(20px,6vw,72px);font:16px/1.85 ui-serif,Georgia,serif}.of8-foot{min-height:48px;border-top:1px solid var(--border);border-bottom:0;color:var(--muted-foreground);font-size:11px}
      @media(max-width:760px){.of8-panel{width:100vw;height:100vh;margin:0;border:0;border-radius:0}.of8-body{grid-template-columns:120px minmax(0,1fr)}.of8-body>.of8-col:nth-child(2){display:none}.of8-text{padding:18px 15px}.of8-head small{display:none}}
    `)
    function setOpen(value) { panel.open = value; panel.listeners.slice().forEach((listener) => listener(value)) }
    function useOpen() { const state = React.useState(panel.open); React.useEffect(() => { panel.listeners.push(state[1]); return () => { panel.listeners = panel.listeners.filter((listener) => listener !== state[1]) } }, []); return state[0] }
    function OpenButton(props) { return h('button', { className: props && props.float ? 'of8-open of8-float' : 'of8-open', type: 'button', onClick: () => setOpen(true) }, '打开 OpenFic') }
    function RunCard() { return h('div', { className: 'of8-card' }, h('span', null, 'OpenFic 草稿工作区已运行'), h(OpenButton, null)) }
    function SideAction(props) { return h('button', { className: 'of8-side', type: 'button', onClick: () => setOpen(true), title: '打开 OpenFic' }, h('span', { className: 'of8-mark' }, 'OF'), props && props.wide ? h('span', null, 'OpenFic') : null) }
    function Workspace() {
      const open = useOpen()
      const ps = React.useState([]), projects = ps[0], setProjects = ps[1]
      const ds = React.useState([]), drafts = ds[0], setDrafts = ds[1]
      const pstate = React.useState(''), projectId = pstate[0], setProjectId = pstate[1]
      const cstate = React.useState(''), chapterId = cstate[0], setChapterId = cstate[1]
      const dstate = React.useState(''), draft = dstate[0], setDraft = dstate[1]
      const sstate = React.useState(''), saved = sstate[0], setSaved = sstate[1]
      const rstate = React.useState(0), revision = rstate[0], setRevision = rstate[1]
      const statusState = React.useState('saved'), status = statusState[0], setStatus = statusState[1]
      const errorState = React.useState(''), error = errorState[0], setError = errorState[1]
      const conflictState = React.useState(null), conflict = conflictState[0], setConflict = conflictState[1]
      const loadingState = React.useState(true), loading = loadingState[0], setLoading = loadingState[1]
      const pf = React.useState(false), projectForm = pf[0], setProjectForm = pf[1]
      const cf = React.useState(false), chapterForm = cf[0], setChapterForm = cf[1]
      const np = React.useState(''), newProject = np[0], setNewProject = np[1]
      const nc = React.useState(''), newChapter = nc[0], setNewChapter = nc[1]
      const project = projects.find((item) => item.id === projectId)
      const chapter = project && project.chapters.find((item) => item.id === chapterId)
      const changed = !!chapterId && draft !== saved
      React.useEffect(() => {
        if (!open) return undefined
        let alive = true; setLoading(true)
        host.call('openfic.bootstrap', {}).then((result) => { if (alive) { setProjects(result && Array.isArray(result.projects) ? result.projects : []); setDrafts(result && Array.isArray(result.drafts) ? result.drafts : []); setLoading(false) } }).catch((failure) => { if (alive) { setLoading(false); setError('无法加载写作工作区') }; console.error(failure) })
        return () => { alive = false }
      }, [open])
      function persist() {
        if (!projectId || !chapterId || !changed) return Promise.resolve(null)
        return host.call('openfic.save-draft', { projectId, chapterId, content: draft, baseRevision: revision }).then((result) => { if (result && result.draft) setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === chapterId)).concat([result.draft])); return result }).catch((failure) => { setStatus('error'); setError('草稿持久化失败，请勿关闭页面'); console.error(failure); return null })
      }
      function updateView(next) { setProjects((items) => items.map((item) => item.id !== projectId ? item : { id: item.id, title: item.title, description: item.description, chapters: item.chapters.map((current) => current.id === next.id ? next : current) })) }
      function accept(next) { updateView(next); setDraft(next.content); setSaved(next.content); setRevision(next.revision); setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === next.id))); setStatus('saved'); setError(''); setConflict(null) }
      function saveChapter() {
        if (!changed || status === 'saving' || conflict) return Promise.resolve(null)
        const key = projectId + ':' + chapterId
        if (locks[key]) return locks[key]
        setStatus('saving'); setError('')
        const operation = host.call('openfic.update-chapter', { projectId, chapterId, content: draft, expectedRevision: revision }).then((result) => { if (result && result.conflict) { setConflict(result.chapter); setStatus('error'); setError('远端正文已更新，当前草稿没有被覆盖。') } else if (result && result.chapter) accept(result.chapter); else { setStatus('error'); setError('保存失败，草稿仍已保留') }; return result }).catch((failure) => { setStatus('error'); setError('保存失败，草稿仍已保留'); console.error(failure); return null }).then((result) => { delete locks[key]; return result })
        locks[key] = operation; return operation
      }
      React.useEffect(() => { if (!open || !changed) return undefined; const task = ctx.debounce(() => { persist() }, 800); task(); return () => task.dispose() }, [open, projectId, chapterId, draft, revision])
      React.useEffect(() => { if (!open || !changed || status !== 'unsaved' || conflict) return undefined; const task = ctx.debounce(() => { saveChapter() }, 180000); task(); return () => task.dispose() }, [open, projectId, chapterId, draft, revision, status, conflict])
      function pickProject(id) { persist(); setProjectId(id); setChapterId(''); setDraft(''); setSaved(''); setRevision(0); setStatus('saved'); setError(''); setConflict(null) }
      function pickChapter(next) { persist(); const local = drafts.find((item) => item.projectId === projectId && item.chapterId === next.id); setChapterId(next.id); setSaved(next.content); setDraft(local ? local.content : next.content); setRevision(local ? local.baseRevision : next.revision); if (local && local.baseRevision !== next.revision) { setConflict(next); setStatus('error'); setError('正文版本已变化，本地草稿已恢复但不会覆盖正文。') } else { setConflict(null); setStatus(local && local.content !== next.content ? 'unsaved' : 'saved'); setError('') } }
      function createProject() { if (!newProject.trim()) return; host.call('openfic.create-project', { title: newProject }).then((result) => { if (result && result.project) { setProjects((items) => items.concat([result.project])); setNewProject(''); setProjectForm(false); pickProject(result.project.id) } }).catch((failure) => { setError('创建项目失败'); console.error(failure) }) }
      function createChapter() { if (!projectId || !newChapter.trim()) return; host.call('openfic.create-chapter', { projectId, title: newChapter }).then((result) => { if (result && result.chapter) { setProjects((items) => items.map((item) => item.id !== projectId ? item : { id: item.id, title: item.title, description: item.description, chapters: item.chapters.concat([result.chapter]) })); setNewChapter(''); setChapterForm(false); pickChapter(result.chapter) } }).catch((failure) => { setError('创建章节失败'); console.error(failure) }) }
      function close() { persist(); setOpen(false) }
      function rebase() { if (conflict) { updateView(conflict); setSaved(conflict.content); setRevision(conflict.revision); setConflict(null); setStatus('unsaved'); setError('草稿已基于远端最新版本，可检查后保存。') } }
      if (!open) return h(OpenButton, { float: true })
      const label = status === 'saving' ? '正在保存' : status === 'unsaved' ? '未保存' : status === 'error' ? '需要处理' : '已保存'
      return h('div', { className: 'of8-overlay', onMouseDown: (event) => { if (event.target === event.currentTarget) close() } }, h('section', { className: 'of8-panel', role: 'dialog', 'aria-label': 'OpenFic 写作工作区' },
        h('header', { className: 'of8-head' }, h('div', null, h('strong', null, 'OpenFic'), h('small', null, '草稿与版本保护')), h('button', { className: 'of8-close', type: 'button', onClick: close, title: '关闭' }, '×')),
        h('div', { className: 'of8-body' },
          h('aside', { className: 'of8-col' }, h('div', { className: 'of8-sh' }, h('span', null, '项目'), h('button', { className: 'of8-btn', type: 'button', onClick: () => setProjectForm(!projectForm) }, '+ 新建')), projectForm ? h('div', { className: 'of8-form' }, h('input', { className: 'of8-input', value: newProject, placeholder: '项目名称', onChange: (event) => setNewProject(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createProject() } }), h('button', { className: 'of8-btn of8-primary', type: 'button', onClick: createProject }, '创建')) : null, h('div', { className: 'of8-list' }, loading ? h('div', { className: 'of8-empty' }, '正在加载…') : projects.length ? projects.map((item) => h('button', { key: item.id, className: 'of8-item' + (item.id === projectId ? ' on' : ''), type: 'button', onClick: () => pickProject(item.id) }, item.title, h('small', null, String(item.chapters.length) + ' 章'))) : h('div', { className: 'of8-empty' }, '创建第一个小说项目。'))),
          h('aside', { className: 'of8-col' }, h('div', { className: 'of8-sh' }, h('span', null, '章节'), h('button', { className: 'of8-btn', type: 'button', disabled: !project, onClick: () => setChapterForm(!chapterForm) }, '+ 新建')), chapterForm && project ? h('div', { className: 'of8-form' }, h('input', { className: 'of8-input', value: newChapter, placeholder: '章节标题', onChange: (event) => setNewChapter(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createChapter() } }), h('button', { className: 'of8-btn of8-primary', type: 'button', onClick: createChapter }, '创建')) : null, h('div', { className: 'of8-list' }, !project ? h('div', { className: 'of8-empty' }, '选择项目。') : project.chapters.length ? project.chapters.map((item) => h('button', { key: item.id, className: 'of8-item' + (item.id === chapterId ? ' on' : ''), type: 'button', onClick: () => pickChapter(item) }, item.title, h('small', null, '版本 ' + String(item.revision)))) : h('div', { className: 'of8-empty' }, '创建第一章开始写作。'))),
          h('main', { className: 'of8-editor' }, h('div', { className: 'of8-eh' }, h('span', null, chapter ? chapter.title : '正文编辑器'), h('span', { className: 'of8-status ' + status }, chapter ? label : '')), error ? h('div', { className: 'of8-alert' }, h('div', null, error), conflict ? h('div', { className: 'of8-actions' }, h('button', { className: 'of8-btn', type: 'button', onClick: rebase }, '保留草稿继续'), h('button', { className: 'of8-btn', type: 'button', onClick: () => accept(conflict) }, '使用远端正文')) : null) : null, chapter ? h('textarea', { className: 'of8-text', value: draft, spellCheck: true, placeholder: '开始写作…', onChange: (event) => { setDraft(event.target.value); if (!conflict) { setStatus('unsaved'); setError('') } } }) : h('div', { className: 'of8-empty' }, '选择章节后开始写作。'), h('div', { className: 'of8-foot' }, h('span', null, chapter ? String(draft.length) + ' 字符 · 草稿 800ms · 正文 3 分钟' : ''), h('button', { className: 'of8-btn of8-primary', type: 'button', disabled: !changed || status === 'saving' || !!conflict, onClick: saveChapter }, status === 'saving' ? '保存中' : '保存正文')))
        )
      ))
    }
    slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'openfic-workspace', order: 20, label: 'OpenFic' }, SideAction))
    slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'openfic-draft-workspace', order: 20, label: 'OpenFic Workspace' }, Workspace))
    slots.inject('tool.view.cordis', () => slots.register({ name: 'tool.view.cordis', key: 'self' }, RunCard))
  },
}
