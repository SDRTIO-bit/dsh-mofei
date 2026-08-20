// 墨扉 Agent 工具插件（dsh-mofei/tools）
// 只应在 mofei-writer 等写作 preset 的 agent.cordis.yml 中加载。
// 依赖 Host Plane 的 mofei 服务：ctx.get('mofei')。
const renderText = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
const obj = (properties = {}, required = [], additionalProperties = false) => ({ type: 'object', properties, required, additionalProperties })
const str = (description) => ({ type: 'string', ...(description === undefined ? {} : { description }) })
const num = (description) => ({ type: 'number', ...(description === undefined ? {} : { description }) })
const bool = (description) => ({ type: 'boolean', ...(description === undefined ? {} : { description }) })
const arr = (items = {}) => ({ type: 'array', ...(items === undefined ? {} : { items }) })
const any = (description) => ({ type: 'object', ...(description === undefined ? {} : { description }) })

function tool(name, description, parameters, outputSchema, execute) {
  return { name, description, parameters, output: { schema: outputSchema, render: renderText }, execute }
}

function buildTools(mofei) {
  // v0.10.3: 工具写入标记 _source='agent'，实体/章节 history 条目记录来源（审计）。
  const run = (method) => async (args) => mofei.run(method, { ...(args || {}), _source: 'agent' })
  const defs = [
    tool('mofei_get-active-context', '读取作者当前在墨扉工作台打开的项目和章节的精装上下文。处理续写、改写、审稿或查设定请求时，先调用本工具；bound 为 true 时必须以返回的 project/chapter/revision/contextText 为准。',
      obj({}), obj({ bound: bool(), contextText: str(), project: any(), chapter: { oneOf: [{ type: 'object' }, { type: 'null' }] }, boundAt: num(), error: str() }, ['bound', 'contextText']),
      async (_args, exec) => mofei.activeAgentContext(exec && exec.agent && exec.agent.id)),
    tool('mofei_list-projects', '列出全部 墨扉小说项目及其章节数。', obj({}), obj({ projects: arr({ type: 'object' }) }, ['projects']), async () => mofei.listProjects()),
    tool('mofei_read-chapter', '读取 墨扉项目某个章节的完整内容与修订号。',
      obj({ projectId: str('项目 id（用 mofei_list-projects 获取）'), chapterId: str('章节 id') }, ['projectId', 'chapterId']),
      obj({ id: str(), title: str(), content: str(), order: num(), revision: num(), historyCount: num(), volumeId: { oneOf: [{ type: 'string' }, { type: 'null' }] } }, ['id', 'title', 'content', 'revision']),
      async (args) => mofei.readChapter(args && args.projectId, args && args.chapterId)),
    tool('mofei_write-chapter', '整章写入正文（expectedRevision 冲突保护）。',
      obj({ projectId: str(), chapterId: str(), content: str('新的完整正文'), expectedRevision: num('读取章节时获得的修订号') }, ['projectId', 'chapterId', 'content']),
      obj({ saved: bool(), chapter: any(), stats: any(), conflict: bool(), expectedRevision: num(), actualRevision: num() }),
      run('update-chapter')),
    tool('mofei_edit-chapter', '局部编辑章节正文：按行号替换，保留 revision 保护。',
      obj({ projectId: str(), chapterId: str(), startLine: num('起始行（1 起）'), endLine: num('结束行（含）'), replacement: str('替换文本'), expectedRevision: num() }, ['projectId', 'chapterId', 'startLine', 'replacement']),
      obj({ saved: bool(), chapter: any(), conflict: bool() }),
      run('edit-chapter')),
    tool('mofei_search-chapters', '在 墨扉项目的章节正文中全文搜索，返回命中章节与行号。',
      obj({ projectId: str(), query: str('搜索词') }, ['projectId', 'query']),
      obj({ results: arr() }, ['results']), run('search-chapters')),
     tool('mofei_rag-status', '读取项目 RAG 索引状态；写作前需要确认索引是否 fresh。', obj({ projectId: str() }, ['projectId']), obj({ status: str(), indexedChunks: num() }, ['status', 'indexedChunks']), run('rag-status')),
     tool('mofei_build-rag-index', '建立或重建项目 RAG 索引；章节发生变化或索引 stale 时使用。', obj({ projectId: str(), chunkSize: num(), chunkOverlap: num() }, ['projectId']), obj({ status: str(), indexedChunks: num() }, ['status', 'indexedChunks']), run('rag-build-index')),
     tool('mofei_search-rag', '在项目 RAG 索引中检索与问题最相关的正文 chunk、角色、笔记、世界书和摘要。索引 stale 时先更新，或明确使用 force。', obj({ projectId: str(), query: str('检索问题'), limit: num(), force: bool() }, ['projectId', 'query']), obj({ query: str(), results: arr(), status: str(), indexedChunks: num() }, ['query', 'results', 'status']), run('search-rag')),
     tool('mofei_get-rag-context', '把项目 RAG 检索结果整理成带来源引用的上下文文本，供 writer/reviewer/analyzer 使用。索引 stale 时先更新。', obj({ projectId: str(), query: str('检索问题'), limit: num(), force: bool() }, ['projectId', 'query']), obj({ query: str(), contextText: str(), sources: arr(), status: str() }, ['query', 'contextText', 'sources', 'status']), run('rag-context')),
    tool('mofei_list-characters', '列出 墨扉项目的角色（名称/收藏/描述）。', obj({ projectId: str() }, ['projectId']), obj({ characters: arr() }, ['characters']),
      async (args) => mofei.listCharacters(args && args.projectId)),
    tool('mofei_write-character', '创建或整体更新角色。',
      obj({ projectId: str(), characterId: str(), name: str(), description: str() }, ['projectId']),
      obj({ character: any() }),
      async (args) => args && args.characterId ? run('update-character')(args) : run('create-character')(args)),
    tool('mofei_list-notes', '列出 墨扉项目的笔记（标题/分类/锁定状态；隐藏笔记不返回）。', obj({ projectId: str() }, ['projectId']), obj({ notes: arr() }, ['notes']),
      async (args) => mofei.listNotes(args && args.projectId)),
    tool('mofei_write-note', '整体更新笔记标题/内容；锁定笔记拒绝修改。',
      obj({ projectId: str(), noteId: str(), title: str(), content: str() }, ['projectId', 'noteId']),
      obj({ note: any() }, ['note']), run('update-note')),
    tool('mofei_list-world-entries', '列出 墨扉项目的世界书条目（名称/触发词/内容/开关）。', obj({ projectId: str() }, ['projectId']), obj({ entries: arr() }, ['entries']),
      async (args) => mofei.listWorldEntries(args && args.projectId)),
    tool('mofei_write-world-entry', '创建或整体更新世界书条目。',
      obj({ projectId: str(), entryId: str(), name: str(), keys: arr(str()), content: str(), isEnabled: bool(), constant: bool() }, ['projectId']),
      obj({ entry: any() }),
      async (args) => args && args.entryId ? run('update-world-entry')(args) : run('create-world-entry')(args)),
    tool('mofei_get-chapter-context', '获取章节的精装上下文（角色/未隐藏笔记/激活世界书/前情章节/章节结尾），用于继续写作或摘要。',
      obj({ projectId: str(), chapterId: str(), tailChars: num('章节结尾字符数，默认 6000'), fullContent: bool('是否取全文（最多 24000 字）') }, ['projectId', 'chapterId']),
      obj({ contextText: str() }, ['contextText']),
      async (args) => { const result = await mofei.run('chapter-context', args); return { contextText: result.contextText } }),
    tool('mofei_summarize', '为项目章节生成/更新章摘要（只重算过期章并持久化）。',
      obj({ projectId: str(), chapterIds: arr(str()), maxChars: num(), maxAgeDays: num() }, ['projectId']),
      obj({ summaries: arr(), count: num(), staleCount: num(), freshCount: num() }, ['summaries', 'count']),
      run('ai-summarize-chapters')),
    tool('mofei_summarize-ranges', '为项目生成/更新区间摘要（默认每 10 章一组）。',
      obj({ projectId: str(), size: num(), maxAgeDays: num() }, ['projectId']),
      obj({ summaries: arr(), count: num(), staleCount: num(), freshCount: num(), total: num() }, ['summaries', 'count']),
      run('ai-summarize-ranges')),
    tool('mofei_get-chapter-summary', '读取某章已持久化摘要及过期状态。',
      obj({ projectId: str(), chapterId: str(), maxAgeDays: num() }, ['projectId', 'chapterId']),
      obj({ entry: { oneOf: [{ type: 'object' }, { type: 'null' }] }, stale: bool() }, ['stale']),
      run('chapter-summary')),
    tool('mofei_save-chapter-summary', '写入某章摘要。',
      obj({ projectId: str(), chapterId: str(), summary: str() }, ['projectId', 'chapterId', 'summary']),
      obj({ entry: any() }, ['entry']), run('save-chapter-summary')),
    tool('mofei_get-range-summaries', '列出区间摘要分组。',
      obj({ projectId: str(), size: num() }, ['projectId']),
      obj({ groups: arr() }, ['groups']), run('range-summary-groups')),
    tool('mofei_save-range-summary', '写入某个区间摘要。',
      obj({ projectId: str(), rangeId: str(), chapterIds: arr(str()), summary: str() }, ['projectId', 'rangeId', 'chapterIds', 'summary']),
      obj({ range: any() }, ['range']), run('save-range-summary')),
    tool('mofei_get-ai-history', '读取项目 AI 助手会话历史（最近 80 条）。',
      obj({ projectId: str() }, ['projectId']),
      obj({ messages: arr() }, ['messages']), run('ai-history')),
    tool('mofei_clear-ai-history', '清空项目 AI 助手会话历史。',
      obj({ projectId: str() }, ['projectId']),
      obj({ cleared: bool(), count: num() }, ['cleared']), run('ai-clear-history')),
    tool('mofei_list', '列出项目正式实体目录（chapters/characters/notes/world/summaries/chains）。',
      obj({ projectId: str(), kind: str('chapters|characters|notes|world|volumes|projects') }, ['kind']),
      obj({ items: arr() }, ['items']), async (args) => mofei.run('list-entities', args)),
    tool('mofei_retrieve', '项目结构化检索（RAG）：按查询词检索章节/角色/笔记/世界书/摘要，返回 entityType/entityId/行号/snippet/score（轻量本地倒排索引，接口预留可换 DSH 检索生态）。',
      obj({ projectId: str(), query: str('检索词'), limit: num('最多返回条数，默认 20，上限 100') }, ['projectId', 'query']),
      obj({ results: arr(), query: str(), total: num(), tookMs: num() }, ['results', 'query', 'total']),
      run('retrieve')),
    tool('mofei_history', '读取实体历史或项目 git 历史。',
      obj({ projectId: str(), kind: str(), entityId: str(), revision: num() }, ['projectId', 'kind']),
      obj({ history: arr() }, ['history']), run('entity-history')),
    tool('mofei_revert', '回滚实体到指定历史 revision。',
      obj({ projectId: str(), kind: str(), entityId: str(), revision: num() }, ['projectId', 'kind', 'entityId', 'revision']),
      obj({ reverted: bool(), entity: any() }), run('rollback-entity')),
    // v0.10.2: git 适配器工具（需工作区为 git 仓库；非 git 返回 available:false 优雅降级）。
    tool('mofei_project-history', '读取项目 git 提交历史；chainId 给定时返回该链的提交与最近 diff。',
      obj({ projectId: str(), chainId: str('可选：只看某 Prompt Chain 的提交'), diff: bool('含最近 3 条变更 diff') }, ['projectId']),
      obj({ available: bool(), commits: arr(), patch: str(), reason: str(), chainId: str() }, ['available']),
      run('git-history')),
    tool('mofei_diff-revision', '对比项目（或指定链）在两个 git 提交之间的差异，返回 unified diff。',
      obj({ projectId: str(), chainId: str(), from: str('起始提交，默认 HEAD~1'), to: str('结束提交，默认 HEAD') }, ['projectId']),
      obj({ available: bool(), patch: str(), from: str(), to: str(), error: str() }, ['available']),
      run('git-diff')),
    tool('mofei_revert-project', '把项目文件树回滚到指定 git 提交并从文件树重载（显式回滚：文件无条件胜出）。',
      obj({ projectId: str(), to: str('目标提交 hash 或 ref（如 HEAD~1）') }, ['projectId', 'to']),
      obj({ available: bool(), reverted: bool(), to: str(), report: any(), error: str() }, ['available']),
      run('git-revert-project')),
  ]

  // v0.9 旧名兼容：保留 23 个 mofei_* 工具名，便于旧会话与回归脚本平滑迁移。
  const legacy = [
    tool('mofei_update-chapter', '更新墨扉章节正文（带修订冲突保护）。',
      obj({ projectId: str(), chapterId: str(), content: str('新的完整正文'), expectedRevision: num() }, ['projectId', 'chapterId', 'content']),
      obj({ saved: bool(), chapter: any(), stats: any(), conflict: bool(), expectedRevision: num(), actualRevision: num() }),
      run('update-chapter')),
    tool('mofei_create-chapter', '在 墨扉项目中新建章节（可指定卷）。',
      obj({ projectId: str(), title: str(), volumeId: str() }, ['projectId', 'title']),
      obj({ chapter: any() }, ['chapter']), run('create-chapter')),
    tool('mofei_reorder-chapters', '按给定 chapterIds 顺序重新排列项目章节。',
      obj({ projectId: str(), chapterIds: arr(str()) }, ['projectId', 'chapterIds']),
      obj({ chapters: arr() }, ['chapters']), run('reorder-chapters')),
    tool('mofei_reorder-volumes', '按给定 volumeIds 顺序重新排列项目卷。',
      obj({ projectId: str(), volumeIds: arr(str()) }, ['projectId', 'volumeIds']),
      obj({ volumes: arr() }, ['volumes']), run('reorder-volumes')),
    tool('mofei_create-world-entry', '在 墨扉项目中创建世界书条目。',
      obj({ projectId: str(), name: str(), keys: arr(str()), content: str(), constant: bool() }, ['projectId', 'name', 'content']),
      obj({ entry: any() }, ['entry']), run('create-world-entry')),
    tool('mofei_update-world-entry', '更新 墨扉世界书条目。',
      obj({ projectId: str(), entryId: str(), name: str(), keys: arr(str()), content: str(), isEnabled: bool(), constant: bool() }, ['projectId', 'entryId']),
      obj({ entry: any() }, ['entry']), run('update-world-entry')),
    tool('mofei_delete-world-entry', '删除 墨扉世界书条目（不可恢复）。',
      obj({ projectId: str(), entryId: str() }, ['projectId', 'entryId']),
      obj({ deleted: bool(), entryId: str() }, ['deleted']), run('delete-world-entry')),
    tool('mofei_summarize-chapters', '为项目章节批量生成摘要（只重算过期章）。',
      obj({ projectId: str(), chapterIds: arr(str()), maxChars: num(), maxAgeDays: num() }, ['projectId']),
      obj({ summaries: arr(), count: num(), staleCount: num(), freshCount: num(), total: num(), fresh: arr() }, ['summaries', 'count']),
      run('ai-summarize-chapters')),
    tool('mofei_update-note', '更新墨扉笔记的标题或内容；锁定笔记拒绝修改。',
      obj({ projectId: str(), noteId: str(), title: str(), content: str() }, ['projectId', 'noteId']),
      obj({ note: any() }, ['note']), run('update-note')),
  ]
  // OpenFic 的 Agent 不是只能写正文的聊天框：它可在当前小说项目内维护全部创作资产。
  // 删除和改写类工具要求 Agent 先向作者确认目标；普通读取和新建由写作任务直接驱动。
  const authoring = [
    tool('mofei_create-project', '新建一本墨扉小说项目。只在作者明确要求创建新书时使用。', obj({ title: str(), description: str() }, ['title']), any(), run('create-project')),
    tool('mofei_update-project', '更新当前小说项目名称、简介或字数目标。', obj({ projectId: str(), title: str(), description: str(), goal: num() }, ['projectId']), any(), run('update-project')),
    tool('mofei_delete-project', '删除整本小说项目及其实体。高风险：必须先说明影响并取得作者明确确认。', obj({ projectId: str() }, ['projectId']), any(), run('delete-project')),
    tool('mofei_update-chapter-meta', '更新章节标题，不改正文。', obj({ projectId: str(), chapterId: str(), title: str() }, ['projectId', 'chapterId', 'title']), any(), run('update-chapter-meta')),
    tool('mofei_delete-chapter', '删除一个章节。高风险：必须先取得作者明确确认。', obj({ projectId: str(), chapterId: str() }, ['projectId', 'chapterId']), any(), run('delete-chapter')),
    tool('mofei_move-chapter', '在章节列表中上移或下移章节。', obj({ projectId: str(), chapterId: str(), direction: str('up|down') }, ['projectId', 'chapterId', 'direction']), any(), run('move-chapter')),
    tool('mofei_set-chapter-volume', '把章节移入指定卷，或传 null 移至未分卷。', obj({ projectId: str(), chapterId: str(), volumeId: { oneOf: [{ type: 'string' }, { type: 'null' }] } }, ['projectId', 'chapterId']), any(), run('set-chapter-volume')),
    tool('mofei_create-volume', '新建卷。', obj({ projectId: str(), title: str(), description: str() }, ['projectId', 'title']), any(), run('create-volume')),
    tool('mofei_update-volume', '更新卷标题或简介。', obj({ projectId: str(), volumeId: str(), title: str(), description: str() }, ['projectId', 'volumeId']), any(), run('update-volume')),
    tool('mofei_delete-volume', '删除卷及其中章节。高风险：必须先取得作者明确确认。', obj({ projectId: str(), volumeId: str() }, ['projectId', 'volumeId']), any(), run('delete-volume')),
    tool('mofei_move-volume', '在卷列表中上移或下移卷。', obj({ projectId: str(), volumeId: str(), direction: str('up|down') }, ['projectId', 'volumeId', 'direction']), any(), run('move-volume')),
    tool('mofei_read-character', '读取一个角色的完整资料。', obj({ projectId: str(), characterId: str() }, ['projectId', 'characterId']), any(), run('read-character')),
    tool('mofei_delete-character', '删除角色。高风险：必须先取得作者明确确认。', obj({ projectId: str(), characterId: str() }, ['projectId', 'characterId']), any(), run('delete-character')),
    tool('mofei_create-note', '新建笔记，可指定笔记分类。', obj({ projectId: str(), title: str(), categoryId: { oneOf: [{ type: 'string' }, { type: 'null' }] } }, ['projectId', 'title']), any(), run('create-note')),
    tool('mofei_read-note', '读取一个可见笔记的完整内容；隐藏笔记不可读取。', obj({ projectId: str(), noteId: str() }, ['projectId', 'noteId']), any(), run('read-note')),
    tool('mofei_delete-note', '删除笔记。高风险：必须先取得作者明确确认。', obj({ projectId: str(), noteId: str() }, ['projectId', 'noteId']), any(), run('delete-note')),
    tool('mofei_move-note', '把笔记移到分类，或传 null 移到根目录。', obj({ projectId: str(), noteId: str(), categoryId: { oneOf: [{ type: 'string' }, { type: 'null' }] } }, ['projectId', 'noteId']), any(), run('move-note')),
    tool('mofei_create-note-category', '新建笔记分类，可指定一级父分类。', obj({ projectId: str(), title: str(), parentId: { oneOf: [{ type: 'string' }, { type: 'null' }] } }, ['projectId', 'title']), any(), run('create-note-category')),
    tool('mofei_update-note-category', '重命名笔记分类。', obj({ projectId: str(), categoryId: str(), title: str() }, ['projectId', 'categoryId', 'title']), any(), run('rename-note-category')),
    tool('mofei_delete-note-category', '删除笔记分类并把其中笔记移回根目录。高风险：必须先取得作者明确确认。', obj({ projectId: str(), categoryId: str() }, ['projectId', 'categoryId']), any(), run('delete-note-category')),
    tool('mofei_read-world-entry', '读取一个世界书条目的完整内容与开关状态。', obj({ projectId: str(), entryId: str() }, ['projectId', 'entryId']), any(), run('read-world-entry')),
    tool('mofei_move-world-entry', '在世界书条目列表中上移或下移条目。', obj({ projectId: str(), entryId: str(), direction: str('up|down') }, ['projectId', 'entryId', 'direction']), any(), run('move-world-entry')),
    tool('mofei_update-world-entries', '批量更新世界书条目的启用或常驻状态。', obj({ projectId: str(), entryIds: arr(str()), patch: any() }, ['projectId', 'entryIds', 'patch']), any(), run('update-world-entries')),
    tool('mofei_delete-world-entries', '批量删除世界书条目。高风险：必须先取得作者明确确认。', obj({ projectId: str(), entryIds: arr(str()) }, ['projectId', 'entryIds']), any(), run('delete-world-entries')),
    tool('mofei_list-prompt-chains', '列出这本小说的提示词链。', obj({ projectId: str() }, ['projectId']), any(), run('list-prompt-chains')),
    tool('mofei_save-prompt-chain', '创建或更新项目提示词链。', obj({ projectId: str(), chainId: str(), name: str(), content: str() }, ['projectId', 'name', 'content']), any(), run('save-prompt-chain')),
    tool('mofei_delete-prompt-chain', '删除提示词链。高风险：必须先取得作者明确确认。', obj({ projectId: str(), chainId: str() }, ['projectId', 'chainId']), any(), run('delete-prompt-chain')),
    tool('mofei_compile-prompt-chain', '以当前项目与可选章节编译提示词链，先预览再运行。', obj({ projectId: str(), chainId: str(), chapterId: str(), instruction: str() }, ['projectId', 'chainId']), any(), run('compile-prompt-chain')),
    // v0.20: 有效角色目录 = 四个内置角色 + 项目覆盖/自建角色。
    tool('mofei_list-roles', '列出这本小说实际生效的子代理角色（含内置来源、项目覆盖状态和条目数）。', obj({ projectId: str() }, ['projectId']), any(), run('list-roles')),
    tool('mofei_read-role', '读取一个实际生效的子代理角色提示词（含 content/isEnabled/order 和来源），用于编辑或查看。', obj({ projectId: str(), roleId: str() }, ['projectId', 'roleId']), any(), run('read-role')),
    tool('mofei_write-role', '创建项目角色，或以同 id 完整覆盖内置角色。entries 为 {name, content, order, isEnabled} 数组；isEnabled 默认 true。', obj({ projectId: str(), roleId: str(), name: str(), entries: arr(obj({ name: str(), content: str(), order: num(), isEnabled: bool() })) }, ['projectId', 'name', 'entries']), any(), run('save-role')),
    tool('mofei_delete-role', '删除项目自建角色；内置角色只清除项目覆盖并恢复默认。高风险：必须先取得作者明确确认。', obj({ projectId: str(), roleId: str() }, ['projectId', 'roleId']), any(), run('delete-role')),
  ]
  defs.push(...legacy, ...authoring)
  return defs
}

export default {
  inject: ['tools', 'mofei'],
  apply(ctx) {
    const toolsService = ctx.get ? ctx.get('tools') : ctx.tools
    const mofei = ctx.get ? ctx.get('mofei') : ctx.mofei
    if (toolsService === undefined || mofei === undefined) return
    const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/
    const disposers = []
    const register = (definition) => {
      const name = String(definition.name)
      if (!TOOL_NAME_PATTERN.test(name)) { console.error('墨扉 tool name rejected: ' + name); return }
      try { disposers.push(toolsService.register(definition)) } catch (error) { console.error('墨扉 tool register failed: ' + name, error) }
    }
    for (const definition of buildTools(mofei)) {
      register(definition)
      register({ ...definition, name: definition.name.replace(/^mofei_/, 'openfic_'), description: '[旧名兼容，建议改用 ' + definition.name + '] ' + definition.description })
    }
    return () => { for (const dispose of disposers) { try { dispose() } catch (error) { /* noop */ } } }
  },
}
