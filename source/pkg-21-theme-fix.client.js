return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const h = React.createElement
    const panel = { open: false, listeners: [] }
    const locks = {}
    styles.insert('.of8-open{pointer-events:auto;border:0;border-radius:6px;background:var(--primary);color:var(--primary-foreground);padding:8px 12px;cursor:pointer;font:600 13px/1.2 sans-serif}.of8-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0}.of8-card span{font-size:12px;color:var(--muted-foreground)}.of8-float{position:fixed;right:16px;bottom:16px;z-index:80;pointer-events:auto;box-shadow:0 8px 28px rgba(0,0,0,.25)}.of8-side{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font:inherit}.of8-mark{display:grid;place-items:center;width:24px;height:24px;border:1px solid currentColor;border-radius:5px;font-size:10px;font-weight:700}.of8-overlay{position:fixed;inset:0;z-index:100;pointer-events:auto;display:flex;justify-content:flex-end;background:rgba(0,0,0,.32)}.of8-panel{width:min(1120px,calc(100vw - 24px));height:calc(100vh - 24px);margin:12px;display:grid;grid-template-rows:52px minmax(0,1fr);overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--background);color:var(--foreground);box-shadow:0 20px 60px rgba(0,0,0,.28)}.of8-head,.of8-sh,.of8-eh,.of8-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;border-bottom:1px solid var(--border)}.of8-head strong{font-size:15px}.of8-head small{margin-left:10px;color:var(--muted-foreground)}.of8-close{border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer}.of8-body{display:grid;grid-template-columns:220px 240px minmax(0,1fr);min-height:0}.of8-panel.of8-focus .of8-body{grid-template-columns:minmax(0,1fr)}.of8-panel.of8-focus .of8-col{display:none}.of8-col{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid var(--border)}.of8-sh,.of8-eh{height:46px;font-size:12px;font-weight:650}.of8-eh-actions{display:flex;align-items:center;gap:6px}.of8-list{overflow:auto;padding:8px}.of8-item{display:block;width:100%;padding:6px 8px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}.of8-item:hover,.of8-item.on{background:var(--accent)}.of8-item.on{font-weight:650}.of8-item small{display:block;margin-top:3px;color:var(--muted-foreground);font-size:11px;font-weight:400}.of8-row{display:flex;align-items:center;gap:5px;width:100%}.of8-title{flex:1;min-width:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}.of8-minis{display:flex;gap:3px;flex-shrink:0}.of8-mini{display:grid;place-items:center;min-width:20px;height:20px;padding:0 4px;border:1px solid var(--border);border-radius:4px;background:transparent;color:inherit;cursor:pointer;font-size:11px;line-height:1}.of8-mini:hover{background:var(--accent)}.of8-mini.danger{color:#dc2626;border-color:rgba(220,38,38,.45)}.of8-mini.danger.armed{background:rgba(220,38,38,.18)}.of8-btn{border:1px solid var(--border);border-radius:5px;background:var(--background);color:inherit;padding:6px 9px;cursor:pointer;font:inherit}.of8-btn:disabled{opacity:.5}.of8-primary{border-color:transparent;background:var(--primary);color:var(--primary-foreground)}.of8-form{display:grid;gap:7px;padding:9px;border-bottom:1px solid var(--border)}.of8-input{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--border);border-radius:5px;background:var(--background);color:inherit;font:inherit}.of8-rename{min-width:0;padding:4px 6px;font-size:12px}.of8-goal{padding:6px 9px;border-bottom:1px solid var(--border)}.of8-goal-btn{width:100%;border:1px dashed var(--border);border-radius:5px;background:transparent;color:var(--muted-foreground);padding:6px;cursor:pointer;font:inherit;font-size:11px}.of8-empty{padding:16px 12px;color:var(--muted-foreground);font-size:12px}.of8-editor{display:flex;min-width:0;min-height:0;flex-direction:column}.of8-status{font-size:11px;color:var(--muted-foreground)}.of8-status.unsaved{color:#b45309}.of8-status.saving{color:#2563eb}.of8-status.error{color:#dc2626}.of8-alert{padding:10px 14px;border-bottom:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.08);color:#dc2626;font-size:12px}.of8-actions{display:flex;gap:7px;margin-top:8px}.of8-text{box-sizing:border-box;width:100%;flex:1;min-height:0;resize:none;border:0;outline:0;background:var(--background);color:inherit;padding:28px clamp(20px,6vw,72px);font:16px/1.85 ui-serif,Georgia,serif}.of8-hist{max-height:240px;overflow:auto;border-bottom:1px solid var(--border);padding:8px}.of8-hist-head{display:flex;align-items:center;justify-content:space-between;padding:2px 6px 8px;font-size:12px;font-weight:650}.of8-hist-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 8px;border-radius:5px}.of8-hist-item:hover{background:var(--accent)}.of8-hist-meta{display:flex;align-items:center;gap:10px;min-width:0}.of8-hist-meta strong{font-size:12px}.of8-hist-meta span{color:var(--muted-foreground);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.of8-foot{min-height:48px;border-top:1px solid var(--border);border-bottom:0;color:var(--muted-foreground);font-size:11px}.of8-stat{display:inline-flex;gap:8px;flex-wrap:wrap}@media(max-width:760px){.of8-panel{width:100vw;height:100vh;margin:0;border:0;border-radius:0}.of8-body{grid-template-columns:120px minmax(0,1fr)}.of8-body>.of8-col:nth-child(2){display:none}.of8-panel.of8-focus .of8-body{grid-template-columns:minmax(0,1fr)}.of8-text{padding:18px 15px}.of8-head small{display:none}}.of8-open,.of8-side,.of8-card,.of8-overlay{--primary:var(--dsw-alias-state-business-primary);--primary-foreground:#fff;--background:var(--dsw-alias-bg-base);--foreground:var(--dsw-alias-label-primary);--border:var(--dsw-alias-border-l1);--muted-foreground:var(--dsw-alias-label-secondary);--accent:var(--dsw-alias-interactive-bg-hover)}')
    function setOpen(value) { panel.open = value; panel.listeners.slice().forEach((listener) => listener(value)) }
    function useOpen() { const state = React.useState(panel.open); React.useEffect(() => { panel.listeners.push(state[1]); return () => { panel.listeners = panel.listeners.filter((listener) => listener !== state[1]) } }, []); return state[0] }
    function fmtTime(at) { try { return new Date(at).toLocaleString() } catch (error) { return String(at) } }
    function OpenButton(props) { return h('button', { className: props && props.float ? 'of8-open of8-float' : 'of8-open', type: 'button', onClick: () => setOpen(true) }, '打开 OpenFic') }
    function RunCard() { return h('div', { className: 'of8-card' }, h('span', null, 'OpenFic 写作平台已运行'), h(OpenButton, null)) }
    function SideAction(props) { return h('button', { className: 'of8-side', type: 'button', onClick: () => setOpen(true), title: '打开 OpenFic' }, h('span', { className: 'of8-mark' }, 'OF'), props && props.wide ? h('span', null, 'OpenFic') : null) }
    function MiniButton(props) { return h('button', { className: 'of8-mini' + (props.danger ? ' danger' : '') + (props.armed ? ' armed' : ''), type: 'button', title: props.title || '', disabled: props.disabled, onClick: (event) => { event.stopPropagation(); if (props.onClick) props.onClick(event) } }, props.label) }
    function Workspace() {
      const open = useOpen()
      const ps = React.useState([]), projects = ps[0], setProjects = ps[1]
      const ds = React.useState([]), drafts = ds[0], setDrafts = ds[1]
      const ss = React.useState(null), stats = ss[0], setStats = ss[1]
      const pstate = React.useState(''), projectId = pstate[0], setProjectId = pstate[1]
      const cstate = React.useState(''), chapterId = cstate[0], setChapterId = cstate[1]
      const dstate = React.useState(''), draft = dstate[0], setDraft = dstate[1]
      const svstate = React.useState(''), saved = svstate[0], setSaved = svstate[1]
      const rstate = React.useState(0), revision = rstate[0], setRevision = rstate[1]
      const statusState = React.useState('saved'), status = statusState[0], setStatus = statusState[1]
      const errorState = React.useState(''), error = errorState[0], setError = errorState[1]
      const conflictState = React.useState(null), conflict = conflictState[0], setConflict = conflictState[1]
      const loadingState = React.useState(true), loading = loadingState[0], setLoading = loadingState[1]
      const pf = React.useState(false), projectForm = pf[0], setProjectForm = pf[1]
      const cf = React.useState(false), chapterForm = cf[0], setChapterForm = cf[1]
      const np = React.useState(''), newProject = np[0], setNewProject = np[1]
      const nc = React.useState(''), newChapter = nc[0], setNewChapter = nc[1]
      const focusState = React.useState(false), focus = focusState[0], setFocus = focusState[1]
      const histState = React.useState(false), showHistory = histState[0], setShowHistory = histState[1]
      const hlState = React.useState([]), historyList = hlState[0], setHistoryList = hlState[1]
      const hllState = React.useState(false), historyLoading = hllState[0], setHistoryLoading = hllState[1]
      const armState = React.useState(null), armed = armState[0], setArmed = armState[1]
      const renameState = React.useState(null), rename = renameState[0], setRename = renameState[1]
      const rvState = React.useState(''), renameValue = rvState[0], setRenameValue = rvState[1]
      const gfState = React.useState(false), goalForm = gfState[0], setGoalForm = gfState[1]
      const giState = React.useState(''), goalInput = giState[0], setGoalInput = giState[1]
      const project = projects.find((item) => item.id === projectId)
      const chapter = project && project.chapters.find((item) => item.id === chapterId)
      const changed = !!chapterId && draft !== saved
      const projectChars = project ? project.chapters.reduce((sum, item) => sum + item.content.length, 0) : 0
      function arm(kind, id) {
        if (armed && armed.kind === kind && armed.id === id) return true
        setArmed({ kind, id })
        ctx.timeout(() => setArmed((current) => current && current.kind === kind && current.id === id ? null : current), 4000)
        return false
      }
      function disarm() { setArmed(null) }
      function reload() {
        return host.call('openfic.bootstrap', {}).then((result) => {
          const nextProjects = result && Array.isArray(result.projects) ? result.projects : []
          const nextDrafts = result && Array.isArray(result.drafts) ? result.drafts : []
          setProjects(nextProjects)
          setDrafts(nextDrafts)
          if (result && result.stats) setStats(result.stats)
          if (projectId && !nextProjects.find((item) => item.id === projectId)) { setProjectId(''); setChapterId(''); setDraft(''); setSaved(''); setRevision(0); setStatus('saved'); setError(''); setConflict(null) }
          else if (chapterId && nextProjects.find((item) => item.id === projectId) && !nextProjects.find((item) => item.id === projectId).chapters.find((item2) => item2.id === chapterId)) { setChapterId(''); setDraft(''); setSaved(''); setRevision(0); setStatus('saved'); setError(''); setConflict(null) }
          return result
        }).catch((failure) => { setError('操作失败'); console.error(failure); return null })
      }
      React.useEffect(() => {
        if (!open) return undefined
        let alive = true; setLoading(true)
        host.call('openfic.bootstrap', {}).then((result) => { if (alive) { setProjects(result && Array.isArray(result.projects) ? result.projects : []); setDrafts(result && Array.isArray(result.drafts) ? result.drafts : []); if (result && result.stats) setStats(result.stats); setLoading(false) } }).catch((failure) => { if (alive) { setLoading(false); setError('无法加载写作工作区') }; console.error(failure) })
        return () => { alive = false }
      }, [open])
      function persist() {
        if (!projectId || !chapterId || !changed) return Promise.resolve(null)
        return host.call('openfic.save-draft', { projectId, chapterId, content: draft, baseRevision: revision }).then((result) => { if (result && result.draft) setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === chapterId)).concat([result.draft])); return result }).catch((failure) => { setStatus('error'); setError('草稿持久化失败，请勿关闭页面'); console.error(failure); return null })
      }
      function updateView(next) { setProjects((items) => items.map((item) => item.id !== projectId ? item : { id: item.id, title: item.title, description: item.description, goal: item.goal, chapters: item.chapters.map((current) => current.id === next.id ? next : current) })) }
      function accept(next) { updateView(next); setDraft(next.content); setSaved(next.content); setRevision(next.revision); setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === next.id))); setStatus('saved'); setError(''); setConflict(null) }
      function saveChapter() {
        if (!changed || status === 'saving' || conflict) return Promise.resolve(null)
        const key = projectId + ':' + chapterId
        if (locks[key]) return locks[key]
        setStatus('saving'); setError('')
        const operation = host.call('openfic.update-chapter', { projectId, chapterId, content: draft, expectedRevision: revision }).then((result) => { if (result && result.stats) setStats(result.stats); if (result && result.conflict) { setConflict(result.chapter); setStatus('error'); setError('远端正文已更新，当前草稿没有被覆盖。') } else if (result && result.chapter) accept(result.chapter); else { setStatus('error'); setError('保存失败，草稿仍已保留') }; return result }).catch((failure) => { setStatus('error'); setError('保存失败，草稿仍已保留'); console.error(failure); return null }).then((result) => { delete locks[key]; return result })
        locks[key] = operation; return operation
      }
      React.useEffect(() => { if (!open || !changed) return undefined; const task = ctx.debounce(() => { persist() }, 800); task(); return () => task.dispose() }, [open, projectId, chapterId, draft, revision])
      React.useEffect(() => { if (!open || !changed || status !== 'unsaved' || conflict) return undefined; const task = ctx.debounce(() => { saveChapter() }, 180000); task(); return () => task.dispose() }, [open, projectId, chapterId, draft, revision, status, conflict])
      React.useEffect(() => {
        if (!open || !showHistory || !projectId || !chapterId) { if (!showHistory) setHistoryList([]); return undefined }
        let alive = true; setHistoryLoading(true)
        host.call('openfic.chapter-history', { projectId, chapterId }).then((result) => { if (alive) { setHistoryList(result && Array.isArray(result.history) ? result.history : []); setHistoryLoading(false) } }).catch((failure) => { if (alive) { setHistoryLoading(false); setError('无法读取历史版本') }; console.error(failure) })
        return () => { alive = false }
      }, [open, showHistory, projectId, chapterId])
      function pickProject(id) { persist(); disarm(); setShowHistory(false); setProjectId(id); setChapterId(''); setDraft(''); setSaved(''); setRevision(0); setStatus('saved'); setError(''); setConflict(null) }
      function pickChapter(next) { persist(); disarm(); setShowHistory(false); const local = drafts.find((item) => item.projectId === projectId && item.chapterId === next.id); setChapterId(next.id); setSaved(next.content); setDraft(local ? local.content : next.content); setRevision(local ? local.baseRevision : next.revision); if (local && local.baseRevision !== next.revision) { setConflict(next); setStatus('error'); setError('正文版本已变化，本地草稿已恢复但不会覆盖正文。') } else { setConflict(null); setStatus(local && local.content !== next.content ? 'unsaved' : 'saved'); setError('') } }
      function createProject() { if (!newProject.trim()) return; host.call('openfic.create-project', { title: newProject }).then((result) => { if (result && result.project) { setNewProject(''); setProjectForm(false); setProjectId(result.project.id); reload() } }).catch((failure) => { setError('创建项目失败'); console.error(failure) }) }
      function createChapter() { if (!projectId || !newChapter.trim()) return; host.call('openfic.create-chapter', { projectId, title: newChapter }).then((result) => { if (result && result.chapter) { setNewChapter(''); setChapterForm(false); pickChapter(result.chapter) } }).catch((failure) => { setError('创建章节失败'); console.error(failure) }) }
      function startRename(kind, id, currentTitle) { setRename({ kind, id }); setRenameValue(currentTitle) }
      function commitRename() {
        if (!rename || !renameValue.trim()) { setRename(null); return }
        const args = rename.kind === 'project' ? { projectId: rename.id, title: renameValue } : { projectId, chapterId: rename.id, title: renameValue }
        const method = rename.kind === 'project' ? 'openfic.update-project' : 'openfic.update-chapter-meta'
        host.call(method, args).then(() => { setRename(null); setRenameValue(''); reload() }).catch((failure) => { setError('重命名失败'); console.error(failure) })
      }
      function deleteProject(id) { if (!arm('delete-project', id)) return; host.call('openfic.delete-project', { projectId: id }).then(() => { disarm(); reload() }).catch((failure) => { disarm(); setError('删除项目失败'); console.error(failure) }) }
      function deleteChapter(id) { if (!arm('delete-chapter', id)) return; host.call('openfic.delete-chapter', { projectId, chapterId: id }).then(() => { disarm(); reload() }).catch((failure) => { disarm(); setError('删除章节失败'); console.error(failure) }) }
      function moveChapter(id, direction) { host.call('openfic.move-chapter', { projectId, chapterId: id, direction }).then(() => reload()).catch((failure) => { setError('调整顺序失败'); console.error(failure) }) }
      function commitGoal() { const value = parseInt(goalInput, 10); if (isNaN(value) || value < 0) { setGoalForm(false); return } host.call('openfic.update-project', { projectId, goal: value }).then(() => { setGoalForm(false); reload() }).catch((failure) => { setError('设置目标失败'); console.error(failure) }) }
      function rollbackTo(rev) { if (!arm('rollback', String(rev))) return; host.call('openfic.rollback-chapter', { projectId, chapterId, toRevision: rev }).then((result) => { disarm(); setShowHistory(false); if (result && result.chapter) accept(result.chapter); else reload() }).catch((failure) => { disarm(); setError('回滚失败'); console.error(failure) }) }
      function close() { persist(); setOpen(false) }
      function rebase() { if (conflict) { updateView(conflict); setSaved(conflict.content); setRevision(conflict.revision); setConflict(null); setStatus('unsaved'); setError('草稿已基于远端最新版本，可检查后保存。') } }
      if (!open) return h(OpenButton, { float: true })
      const label = status === 'saving' ? '正在保存' : status === 'unsaved' ? '未保存' : status === 'error' ? '需要处理' : '已保存'
      return h('div', { className: 'of8-overlay', onMouseDown: (event) => { if (event.target === event.currentTarget) close() } }, h('section', { className: 'of8-panel' + (focus ? ' of8-focus' : ''), role: 'dialog', 'aria-label': 'OpenFic 写作工作区' },
        h('header', { className: 'of8-head' }, h('div', null, h('strong', null, 'OpenFic'), h('small', null, '写作平台 · 版本保护')), h('button', { className: 'of8-close', type: 'button', onClick: close, title: '关闭' }, '×')),
        h('div', { className: 'of8-body' },
          h('aside', { className: 'of8-col' },
            h('div', { className: 'of8-sh' }, h('span', null, '项目'), h('button', { className: 'of8-btn', type: 'button', onClick: () => setProjectForm(!projectForm) }, '+ 新建')),
            projectForm ? h('div', { className: 'of8-form' }, h('input', { className: 'of8-input', value: newProject, placeholder: '项目名称', onChange: (event) => setNewProject(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createProject() } }), h('button', { className: 'of8-btn of8-primary', type: 'button', onClick: createProject }, '创建')) : null,
            h('div', { className: 'of8-list' }, loading ? h('div', { className: 'of8-empty' }, '正在加载…') : projects.length ? projects.map((item) => h('div', { key: item.id, className: 'of8-item' + (item.id === projectId ? ' on' : '') }, h('div', { className: 'of8-row' }, h('button', { className: 'of8-title', type: 'button', onClick: () => pickProject(item.id) }, item.title, h('small', null, String(item.chapters.length) + ' 章')), rename && rename.kind === 'project' && rename.id === item.id ? h('input', { className: 'of8-input of8-rename', value: renameValue, autoFocus: true, onFocus: (event) => event.target.select(), onChange: (event) => setRenameValue(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') setRename(null) } }) : h('span', { className: 'of8-minis' }, h(MiniButton, { label: '✎', title: '重命名', onClick: () => startRename('project', item.id, item.title) }), h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-project' && armed.id === item.id, title: armed && armed.kind === 'delete-project' && armed.id === item.id ? '再次点击确认删除' : '删除项目', onClick: () => deleteProject(item.id) }))))) : h('div', { className: 'of8-empty' }, '创建第一个小说项目。')),
            project ? h('div', { className: 'of8-goal' }, goalForm ? h('div', { className: 'of8-form' }, h('input', { className: 'of8-input', value: goalInput, placeholder: '目标总字数', type: 'number', onChange: (event) => setGoalInput(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') commitGoal() } }), h('button', { className: 'of8-btn of8-primary', type: 'button', onClick: commitGoal }, '设置')) : h('button', { className: 'of8-goal-btn', type: 'button', onClick: () => { setGoalInput(String(project.goal || '')); setGoalForm(true) } }, '目标 ' + String(project.goal || 0) + ' 字 · 进度 ' + (project.goal ? String(Math.min(100, Math.round(projectChars / project.goal * 100))) + '%' : '—') + ' ✎')) : null
          ),
          h('aside', { className: 'of8-col' },
            h('div', { className: 'of8-sh' }, h('span', null, '章节'), h('button', { className: 'of8-btn', type: 'button', disabled: !project, onClick: () => setChapterForm(!chapterForm) }, '+ 新建')),
            chapterForm && project ? h('div', { className: 'of8-form' }, h('input', { className: 'of8-input', value: newChapter, placeholder: '章节标题', onChange: (event) => setNewChapter(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') createChapter() } }), h('button', { className: 'of8-btn of8-primary', type: 'button', onClick: createChapter }, '创建')) : null,
            h('div', { className: 'of8-list' }, !project ? h('div', { className: 'of8-empty' }, '选择项目。') : project.chapters.length ? project.chapters.map((item) => h('div', { key: item.id, className: 'of8-item' + (item.id === chapterId ? ' on' : '') }, h('div', { className: 'of8-row' }, h('button', { className: 'of8-title', type: 'button', onClick: () => pickChapter(item) }, item.title, h('small', null, 'r' + String(item.revision) + (item.historyCount ? ' · 历史 ' + String(item.historyCount) : ''))), rename && rename.kind === 'chapter' && rename.id === item.id ? h('input', { className: 'of8-input of8-rename', value: renameValue, autoFocus: true, onFocus: (event) => event.target.select(), onChange: (event) => setRenameValue(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') setRename(null) } }) : h('span', { className: 'of8-minis' }, h(MiniButton, { label: '↑', title: '上移', onClick: () => moveChapter(item.id, 'up') }), h(MiniButton, { label: '↓', title: '下移', onClick: () => moveChapter(item.id, 'down') }), h(MiniButton, { label: '✎', title: '重命名', onClick: () => startRename('chapter', item.id, item.title) }), h(MiniButton, { label: '×', danger: true, armed: armed && armed.kind === 'delete-chapter' && armed.id === item.id, title: armed && armed.kind === 'delete-chapter' && armed.id === item.id ? '再次点击确认删除' : '删除章节', onClick: () => deleteChapter(item.id) }))))) : h('div', { className: 'of8-empty' }, '创建第一章开始写作。'))
          ),
          h('main', { className: 'of8-editor' },
            h('div', { className: 'of8-eh' }, h('span', null, chapter ? chapter.title : '正文编辑器'), h('span', { className: 'of8-eh-actions' }, chapter ? h(MiniButton, { label: showHistory ? '收起历史' : '历史', title: '章节历史版本', onClick: () => setShowHistory(!showHistory) }) : null, h(MiniButton, { label: focus ? '退出专注' : '专注', title: '专注模式', onClick: () => setFocus(!focus) }), h('span', { className: 'of8-status ' + status }, chapter ? label : ''))),
            error ? h('div', { className: 'of8-alert' }, h('div', null, error), conflict ? h('div', { className: 'of8-actions' }, h('button', { className: 'of8-btn', type: 'button', onClick: rebase }, '保留草稿继续'), h('button', { className: 'of8-btn', type: 'button', onClick: () => accept(conflict) }, '使用远端正文')) : null) : null,
            showHistory && chapter ? h('div', { className: 'of8-hist' }, h('div', { className: 'of8-hist-head' }, h('span', null, '历史版本（回滚将产生新修订）'), h('button', { className: 'of8-close', type: 'button', onClick: () => setShowHistory(false), title: '关闭' }, '×')), historyLoading ? h('div', { className: 'of8-empty' }, '正在加载…') : historyList.length ? historyList.map((item) => h('div', { key: item.revision, className: 'of8-hist-item' }, h('div', { className: 'of8-hist-meta' }, h('strong', null, 'r' + String(item.revision)), h('span', null, fmtTime(item.at) + ' · ' + String(item.chars) + ' 字')), h(MiniButton, { label: armed && armed.kind === 'rollback' && armed.id === String(item.revision) ? '确认回滚' : '回滚', danger: true, armed: armed && armed.kind === 'rollback' && armed.id === String(item.revision), title: '回滚到此版本', onClick: () => rollbackTo(item.revision) }))) : h('div', { className: 'of8-empty' }, '暂无历史版本')) : null,
            chapter ? h('textarea', { className: 'of8-text', value: draft, spellCheck: true, placeholder: '开始写作…（Ctrl+S 保存正文）', onChange: (event) => { setDraft(event.target.value); if (!conflict) { setStatus('unsaved'); setError('') } }, onKeyDown: (event) => { if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's') { event.preventDefault(); saveChapter() } } }) : h('div', { className: 'of8-empty' }, '选择章节后开始写作。'),
            h('div', { className: 'of8-foot' }, h('span', { className: 'of8-stat' }, chapter ? String(draft.length) + ' 字符' : '', project && project.goal ? ' · 目标 ' + String(project.goal) + '（' + String(Math.min(100, Math.round(projectChars / project.goal * 100))) + '%）' : '', stats ? ' · 今日 +' + String(stats.todayChars) + ' · 连续 ' + String(stats.streak) + ' 天 · 累计 ' + String(stats.totalChars) + ' 字' : ''), h('button', { className: 'of8-btn of8-primary', type: 'button', disabled: !changed || status === 'saving' || !!conflict, onClick: saveChapter }, status === 'saving' ? '保存中' : '保存正文')))
        )
      ))
    }
    slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'openfic-workspace', order: 20, label: 'OpenFic' }, SideAction))
    slots.inject('shell.overlay', () => slots.register({ name: 'shell.overlay', id: 'openfic-draft-workspace', order: 20, label: 'OpenFic Workspace' }, Workspace))
    slots.inject('tool.view.cordis', () => slots.register({ name: 'tool.view.cordis', key: 'self' }, RunCard))
  },
}
