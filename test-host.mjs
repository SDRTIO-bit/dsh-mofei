import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import plugin from './plugin/lib/index.js'
import toolsPlugin from './plugin/lib/tools.js'

const root = 'virtual-root'
const files = new Map()

const mockFs = {
  async resolve(name, options) { return path.posix.join(options && options.cwd || root, name) },
  async stat(target) { return files.has(target) ? { size: files.get(target).length } : undefined },
  async readText(target) { if (!files.has(target)) throw new Error('ENOENT'); return files.get(target) },
  async writeText(target, content) { files.set(target, content); return undefined },
}

let route = null
let resEnd = null
let llmCalls = 0
const registeredRoutes = {}
const registeredTools = []
const ctx = {
  fs: mockFs,
  sandboxPolicy: { workspaceRoot: root, resolve: () => ({}) },
  webServer: { register: (definition) => { registeredRoutes[definition.path] = definition; route = definition } },
  get: (name) => {
    if (name === 'tools') return { register: (definition) => { registeredTools.push(definition) } }
    if (name === 'mofei') return ctx.mofei
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'mock', model: 'mock-chat' }) }
    if (name === 'llm') {
      return {
        stream: async function* (options) {
          llmCalls += 1
          const block = options.messages[0].content[0]
          assert.equal(options.messages[0].role, 'user')
          assert.equal(block.type, 'text')
          assert.equal(typeof block.text, 'string')
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text: '摘要：' }
          yield { type: 'text-delta', index: 0, text: '测试正文。' }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: '摘要：测试正文。' } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    }
    return undefined
  },
  provide: (name, value) => { ctx[name] = value },
  effect: () => {},
}

plugin.apply(ctx)
toolsPlugin.apply(ctx)
route = registeredRoutes['/api/mofei']
assert.ok(route, 'mofei webServer route registered')
assert.ok(registeredRoutes['/api/openfic'], 'legacy openfic route alias registered')

async function rpc(method, args) {
  let statusCode = 200
  let body = ''
  let done = false
  const payload = JSON.stringify({ method, args: args || {} })
  const req = {
    method: 'POST',
    [Symbol.asyncIterator]() {
      return {
        next: async () => done ? { done: true } : (done = true, { value: payload, done: false }),
      }
    },
  }
  const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk); resEnd = body } }
  res.statusCode = statusCode
  await route.handler(req, res)
  const parsed = JSON.parse(body)
  if (parsed.ok === false) { const error = new Error(parsed.error || 'rpc failed'); error.value = parsed; throw error }
  return parsed.value
}

async function sse(payload, pathname) {
  let writes = ''
  let ended = false
  let done = false
  const raw = JSON.stringify({ args: payload })
  const req = {
    method: 'POST',
    url: pathname || '/api/mofei/stream/ai-assist',
    [Symbol.asyncIterator]() {
      return {
        next: async () => done ? { done: true } : (done = true, { value: raw, done: false }),
      }
    },
  }
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value },
    flushHeaders() {},
    write(chunk) { writes += String(chunk) },
    end(chunk) { if (chunk !== undefined) writes += String(chunk); ended = true },
  }
  await route.handler(req, res)
  return { writes, ended, headers: res.headers, statusCode: res.statusCode }
}

// 解析 SSE 帧为 [{ event, data }]（data 已 JSON.parse）。
function parseSse(writes) {
  const frames = []
  for (const block of writes.split('\n\n')) {
    const segment = block.trim()
    if (!segment) continue
    let event = 'message'
    let data = null
    for (const line of segment.split('\n')) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
      else if (line.startsWith('data:')) data = JSON.parse(line.slice('data:'.length).trim())
    }
    frames.push({ event, data })
  }
  return frames
}

const tests = []
function test(name, fn) { tests.push([name, fn]) }

// 迷你 JSON Schema 校验器：覆盖 toolsList 中使用的 schema 子集
// （object / array / string / number / boolean / null + required + additionalProperties:false + items.type）。
function matchesType(value, type) {
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'null') return value === null
  return typeof value === type
}
function validateOutput(value, schema, where) {
  const errors = []
  const pathName = where || 'value'
  function walk(current, currentSchema, path) {
    if (!currentSchema) return
    if (Array.isArray(currentSchema.oneOf)) {
      const branchErrors = []
      for (const branchSchema of currentSchema.oneOf) {
        const start = errors.length
        walk(current, branchSchema, path)
        branchErrors.push(errors.slice(start))
        errors.length = start
      }
      if (!branchErrors.some((branch) => branch.length === 0)) {
        errors.push(path + ' must match oneOf [' + currentSchema.oneOf.map((branch) => branch.type || 'schema').join(' | ') + '], got ' + JSON.stringify(current))
      }
      return
    }
    if (currentSchema.type === 'object') {
      if (!matchesType(current, 'object')) { errors.push(path + ' must be object, got ' + JSON.stringify(current)); return }
      for (const [key, propertySchema] of Object.entries(currentSchema.properties || {})) {
        if (!(key in current)) continue
        walk(current[key], propertySchema, path + '.' + key)
      }
      for (const key of currentSchema.required || []) {
        if (!(key in current)) errors.push(path + '.' + key + ' is required')
      }
      if (currentSchema.additionalProperties === false) {
        for (const key of Object.keys(current)) {
          if (!(currentSchema.properties || {})[key]) errors.push(path + '.' + key + ' is not declared (additionalProperties: false)')
        }
      }
    } else if (currentSchema.type === 'array') {
      if (!Array.isArray(current)) { errors.push(path + ' must be array'); return }
      if (currentSchema.items && currentSchema.items.type && typeof currentSchema.items.type === 'string') {
        current.forEach((item, index) => {
          if (!matchesType(item, currentSchema.items.type)) errors.push(path + '[' + index + '] must be ' + currentSchema.items.type)
        })
      }
    } else if (Array.isArray(currentSchema.type)) {
      if (!currentSchema.type.some((type) => matchesType(current, type))) errors.push(path + ' must be one of ' + JSON.stringify(currentSchema.type) + ', got ' + JSON.stringify(current))
    } else if (!matchesType(current, currentSchema.type)) {
      errors.push(path + ' must be ' + currentSchema.type + ', got ' + JSON.stringify(current))
    }
  }
  walk(value, schema, pathName)
  return errors
}

test('Agent 工具 output schema 与真实返回形状一致', async () => {
  const toolDefinitions = registeredTools.filter((definition) => definition.name.startsWith('mofei_'))
  assert.ok(toolDefinitions.length >= 36, '应至少保留既有工具集')
  // 独立项目，避免污染其他用例的 projects[0] 假设
  const { project } = await rpc('create-project', { title: '工具契约' })
  const projectId = project.id
  const { chapter: chapter1 } = await rpc('create-chapter', { projectId, title: '契约章一' })
  const { volume } = await rpc('create-volume', { projectId, title: '契约卷' })
  const { character } = await rpc('create-character', { projectId, name: '契约角色' })
  const { note } = await rpc('create-note', { projectId, title: '契约笔记' })
  const { entry: entry1 } = await rpc('create-world-entry', { projectId, name: '契约条目', content: '设定' })
  const byName = new Map(toolDefinitions.map((definition) => [definition.name, definition]))
  const invoke = async (name, args) => {
    const definition = byName.get(name)
    assert.ok(definition, name + ' registered')
    const result = await definition.execute(args)
    const errors = validateOutput(result, definition.output.schema, name)
    assert.deepEqual(errors, [], name + ' -> ' + JSON.stringify(result))
    return result
  }
  await invoke('mofei_list-projects', {})
  const readResult = await invoke('mofei_read-chapter', { projectId, chapterId: chapter1.id })
  // DSH 运行时调用 output.render(args, value)：回归确认渲染的是 value 而不是 args。
  const renderedRead = byName.get('mofei_read-chapter').output.render({ projectId, chapterId: chapter1.id }, readResult)
  assert.ok(Array.isArray(renderedRead) && renderedRead[0] && renderedRead[0].type === 'text')
  assert.match(renderedRead[0].text, new RegExp(readResult.id))
  assert.doesNotMatch(renderedRead[0].text, /"projectId"/)
  await invoke('mofei_search-chapters', { projectId, query: '契约' })
  await invoke('mofei_list-characters', { projectId })
  await invoke('mofei_list-notes', { projectId })
  await invoke('mofei_list-world-entries', { projectId })
  await invoke('mofei_get-chapter-context', { projectId, chapterId: chapter1.id })
  const updated = await invoke('mofei_update-chapter', { projectId, chapterId: chapter1.id, content: '契约正文', expectedRevision: chapter1.revision })
  assert.equal(updated.saved, true)
  const conflict = await invoke('mofei_update-chapter', { projectId, chapterId: chapter1.id, content: '冲突写入', expectedRevision: chapter1.revision })
  assert.equal(conflict.conflict, true)
  const { chapter: chapter2 } = await invoke('mofei_create-chapter', { projectId, title: '契约章二' })
  const { chapter: chapter3 } = await invoke('mofei_create-chapter', { projectId, title: '契约章三' })
  await invoke('mofei_reorder-chapters', { projectId, chapterIds: [chapter3.id, chapter2.id, chapter1.id] })
  await invoke('mofei_reorder-volumes', { projectId, volumeIds: [volume.id] })
  await invoke('mofei_update-note', { projectId, noteId: note.id, content: '笔记内容' })
  const { entry: entry2 } = await invoke('mofei_create-world-entry', { projectId, name: '契约新条目', content: '新设定' })
  await invoke('mofei_update-world-entry', { projectId, entryId: entry1.id, content: '更新设定' })
  await invoke('mofei_delete-world-entry', { projectId, entryId: entry2.id })
  await invoke('mofei_get-ai-history', { projectId })
  const missingSummary = await invoke('mofei_get-chapter-summary', { projectId, chapterId: chapter3.id })
  assert.equal(missingSummary.entry, null)
  assert.equal(missingSummary.stale, true)
  await invoke('mofei_save-chapter-summary', { projectId, chapterId: chapter3.id, summary: '契约章三摘要' })
  const batch = await invoke('mofei_summarize-chapters', { projectId })
  assert.equal(batch.count, 2)
  assert.equal(batch.freshCount, 1)
  assert.ok(Array.isArray(batch.fresh))
  const groups = await invoke('mofei_get-range-summaries', { projectId })
  assert.equal(groups.groups.length, 1)
  await invoke('mofei_save-range-summary', { projectId, rangeId: groups.groups[0].id, chapterIds: groups.groups[0].chapterIds, summary: '契约区间摘要' })
  const ranges = await invoke('mofei_summarize-ranges', { projectId })
  assert.equal(ranges.freshCount, 1)
  await invoke('mofei_clear-ai-history', { projectId })
  await rpc('delete-project', { projectId })
})


test('Agent 工具名符合 DSH function.name 正则（mofei_* + 旧名 alias）', () => {
  const mofeiCount = registeredTools.filter((definition) => definition.name.startsWith('mofei_')).length
  const legacyCount = registeredTools.filter((definition) => definition.name.startsWith('openfic_')).length
  assert.ok(mofeiCount >= 36, '应至少保留既有 mofei 工具')
  assert.equal(legacyCount, mofeiCount, '每个 mofei 工具应有一个 openfic 兼容别名')
  assert.equal(registeredTools.length, mofeiCount + legacyCount)
  registeredTools.forEach((definition) => {
    assert.match(definition.name, /^[a-zA-Z0-9_-]+$/, definition.name)
  })
  assert.ok(registeredTools.some((definition) => definition.name === 'mofei_list-projects'))
  assert.ok(registeredTools.some((definition) => definition.name === 'openfic_list-projects'))
  assert.ok(registeredTools.some((definition) => definition.name === 'mofei_get-chapter-summary'))
  assert.ok(registeredTools.some((definition) => definition.name === 'mofei_summarize-ranges'))
})

test('独立站点路由 /mofei 注册并可返回 HTML', async () => {
  const webRoute = registeredRoutes['/mofei']
  assert.ok(webRoute, '/mofei static route registered')
  const fetchAsset = async (url) => {
    let body = ''
    const headers = {}
    const req = { method: 'GET', url }
    const res = { statusCode: 200, setHeader: (name, value) => { headers[name] = value }, end: (chunk) => { body = String(chunk) } }
    await webRoute.handler(req, res)
    return { body, headers, statusCode: res.statusCode }
  }
  const index = await fetchAsset('/mofei/')
  assert.equal(index.statusCode, 200)
  assert.match(index.headers['content-type'], /text\/html/)
  assert.match(index.body, /墨扉/)
  const app = await fetchAsset('/mofei/app.js')
  assert.equal(app.statusCode, 200)
  assert.match(app.headers['content-type'], /text\/javascript/)
  assert.ok(app.body.length > 10000)
  const react = await fetchAsset('/mofei/vendor/react.js')
  assert.equal(react.statusCode, 200)
  assert.ok(react.body.length > 5000)
  const missing = await fetchAsset('/mofei/not-found')
  assert.equal(missing.statusCode, 404)
})

test('写作指令目录：内置 mofei-* 指令可见且内容完整（v0.24 起指令注入 persona，非 runtime skills）', async () => {
  const { skills } = await rpc('list-writing-skills', {})
  assert.ok(Array.isArray(skills))
  assert.ok(skills.length >= 17, '内置写作指令应不少于 17 个，实际 ' + skills.length)
  skills.forEach((skill) => {
    assert.match(skill.name, /^[a-z0-9][a-z0-9-]*$/, skill.name)
    assert.ok(skill.description.length > 0)
    assert.ok(skill.content.length > 100)
  })
  assert.ok(skills.some((skill) => skill.name === 'mofei-writing'))
  const writing = skills.find((skill) => skill.name === 'mofei-writing')
  assert.ok(writing.content.length > 100)
})

test('create-project 包含 worldEntries 并持久化', async () => {
  const { project } = await rpc('create-project', { title: '集成测试' })
  assert.equal(project.title, '集成测试')
  assert.deepEqual(project.worldEntries, [])
  const file = path.posix.join(root, '.mofei-projects.json')
  const saved = JSON.parse(files.get(file))
  assert.equal(saved.projects[0].worldEntries.length, 0)
})

test('create-chapter / update-chapter 后 chapter-context 组装', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const { chapter } = await rpc('create-chapter', { projectId, title: '第一章' })
  await rpc('create-character', { projectId, name: '林轩', description: '主角' })
  await rpc('create-world-entry', { projectId, name: '林轩', keys: ['林轩', '小轩'], content: '青城修士。' })
  await rpc('update-chapter', { projectId, chapterId: chapter.id, content: '林轩下山。'.repeat(50), expectedRevision: 1 })
  const context = await rpc('chapter-context', { projectId, chapterId: chapter.id, tailChars: 300 })
  assert.equal(context.characters.length, 1)
  assert.equal(context.worldEntries.length, 1)
  assert.match(context.contextText, /世界书/)
  assert.match(context.contextText, /林轩下山/)
})

test('create-world-entry 默认字段与 keys 归一化', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const { entry } = await rpc('create-world-entry', { projectId, name: '青城', keys: '青城，仙门', content: '天下第一仙门' })
  assert.deepEqual(entry.keys, ['青城', '仙门'])
  assert.equal(entry.isEnabled, true)
  assert.equal(entry.constant, false)
})

test('update-world-entry 只更新指定字段', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const entry = projects[0].worldEntries.find((e) => e.name === '青城')
  const { entry: updated } = await rpc('update-world-entry', { projectId, entryId: entry.id, content: '青城，天下第一仙门。', constant: true })
  assert.equal(updated.content, '青城，天下第一仙门。')
  assert.equal(updated.constant, true)
  assert.deepEqual(updated.keys, ['青城', '仙门'])
})

test('import-world-info-json 解析 ST Lorebook 并追加/覆盖', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const st = JSON.stringify({ entries: { 0: { comment: '灵根', keys: ['灵根'], content: '五行灵根设定。', constant: false, disable: false, order: 1 }, 1: { comment: '王朝', content: '大夏王朝。', constant: true, disable: false, order: 0 } } })
  const appended = await rpc('import-world-info-json', { projectId, content: st, mode: 'append' })
  assert.equal(appended.importedCount, 2)
  assert.ok(appended.worldEntries.length >= 4)
  const overwritten = await rpc('import-world-info-json', { projectId, content: st, mode: 'overwrite' })
  assert.equal(overwritten.importedCount, 2)
  assert.equal(overwritten.worldEntries.length, 2)
  assert.equal(overwritten.worldEntries[0].name, '王朝')
})

test('chapter-context 世界书触发词激活 + 常驻', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const chapter = projects[0].chapters[0]
  await rpc('update-chapter', { projectId, chapterId: chapter.id, content: '林轩与灵根下山。'.repeat(50), expectedRevision: chapter.revision })
  const context = await rpc('chapter-context', { projectId, chapterId: chapter.id })
  assert.equal(context.worldEntries.length, 2)
  const names = context.worldEntries.map((e) => e.name)
  assert.ok(names.includes('王朝'))
  assert.ok(names.includes('灵根'))
})

test('reorder-chapters / reorder-volumes 拖拽排序', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const { chapter: second } = await rpc('create-chapter', { projectId, title: '第二章' })
  const { volume: v1 } = await rpc('create-volume', { projectId, title: '卷一' })
  const { volume: v2 } = await rpc('create-volume', { projectId, title: '卷二' })
  const first = projects[0].chapters[0]
  const reordered = await rpc('reorder-chapters', { projectId, chapterIds: [second.id, first.id] })
  assert.deepEqual(reordered.chapters.map((c) => c.id), [second.id, first.id])
  const reorderedVolumes = await rpc('reorder-volumes', { projectId, volumeIds: [v2.id, v1.id] })
  assert.deepEqual(reorderedVolumes.volumes.map((v) => v.id), [v2.id, v1.id])
  const invalid = await rpc('reorder-chapters', { projectId, chapterIds: [first.id] })
  assert.equal(invalid.error, 'INVALID_ORDER')
})

test('import-world-info-json 非法输入返回业务错误', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const result = await rpc('import-world-info-json', { projectId, content: '{"entries":{}}' })
  assert.equal(result.error, 'EMPTY_ENTRIES')
})

test('ai-assist 使用 content block 并返回流式文本', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const chapter = projects[0].chapters.find((c) => c.content.includes('林轩')) || projects[0].chapters[0]
  const result = await rpc('ai-assist', { projectId, chapterId: chapter.id, mode: 'summary' })
  assert.equal(result.error, undefined)
  assert.equal(result.text, '摘要：测试正文。')
  assert.equal(result.worldEntries, 2)
  assert.equal(result.historyCount, 2)
})

test('ai-history 持久化会话 / ai-clear-history 清空', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const history = await rpc('ai-history', { projectId })
  assert.equal(history.messages.length, 2)
  assert.equal(history.messages[0].role, 'user')
  assert.equal(history.messages[1].role, 'assistant')
  const cleared = await rpc('ai-clear-history', { projectId })
  assert.equal(cleared.cleared, true)
  const after = await rpc('ai-history', { projectId })
  assert.equal(after.messages.length, 0)
})

test('SSE 流式 ai-assist 输出 delta/done 并持久化历史', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const chapter = projects[0].chapters[0]
  const result = await sse({ projectId, chapterId: chapter.id, mode: 'summary' })
  assert.match(result.headers['content-type'], /text\/event-stream/)
  assert.ok(result.ended)
  assert.ok(result.writes.indexOf('event: delta') >= 0)
  assert.ok(result.writes.indexOf('event: done') > result.writes.indexOf('event: delta'))
  assert.match(result.writes, /"text":"摘要："/)
  assert.match(result.writes, /"text":"测试正文。"/)
  assert.match(result.writes, /"historyCount":/)
  const history = await rpc('ai-history', { projectId })
  assert.equal(history.messages.length, 2)
  assert.equal(history.messages[0].role, 'user')
  assert.equal(history.messages[1].role, 'assistant')
  assert.equal(history.messages[1].content, '摘要：测试正文。')
})

test('ai-summarize-chapters 批量摘要全部章节', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const result = await rpc('ai-summarize-chapters', { projectId })
  assert.equal(result.count, 2)
  assert.equal(result.summaries[0].summary, '摘要：测试正文。')
})

test('chapter-summary 读取/写入持久化 + 修订变化标记过期', async () => {
  const summaryFile = path.posix.join(root, '.mofei-summaries.json')
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const chapters = projects[0].chapters.slice().sort((a, b) => a.order - b.order)
  const first = chapters[0]
  const view = await rpc('chapter-summary', { projectId, chapterId: first.id })
  assert.equal(view.stale, false)
  assert.equal(view.entry.summary, '摘要：测试正文。')
  await rpc('update-chapter', { projectId, chapterId: first.id, content: first.content + ' 修订', expectedRevision: first.revision })
  const afterUpdate = await rpc('chapter-summary', { projectId, chapterId: first.id })
  assert.equal(afterUpdate.stale, true)
  const { entry } = await rpc('save-chapter-summary', { projectId, chapterId: first.id, summary: '新摘要' })
  assert.equal(entry.chapterRevision, first.revision + 1)
  const saved = await rpc('chapter-summary', { projectId, chapterId: first.id })
  assert.equal(saved.stale, false)
  assert.equal(saved.entry.summary, '新摘要')
  const persisted = JSON.parse(files.get(summaryFile))
  assert.equal(persisted.version, 1)
  assert.equal(persisted.chapters[first.id].summary, '新摘要')
})

test('ai-summarize-chapters 只重算过期章节并持久化', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const chapters = projects[0].chapters.slice().sort((a, b) => a.order - b.order)
  const second = chapters[1]
  await rpc('update-chapter', { projectId, chapterId: second.id, content: second.content + ' 修订', expectedRevision: second.revision })
  const result = await rpc('ai-summarize-chapters', { projectId })
  assert.equal(result.total, 2)
  assert.equal(result.staleCount, 1)
  assert.equal(result.count, 1)
  assert.equal(result.summaries[0].chapterId, second.id)
  assert.equal(result.freshCount, 1)
  assert.equal(result.fresh[0].id, chapters[0].id)
  const saved = await rpc('chapter-summary', { projectId, chapterId: second.id })
  assert.equal(saved.stale, false)
})

test('range-summary-groups / save-range-summary 持久化区间摘要', async () => {
  const summaryFile = path.posix.join(root, '.mofei-summaries.json')
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const groups = await rpc('range-summary-groups', { projectId })
  assert.equal(groups.groups.length, 1)
  const group = groups.groups[0]
  assert.equal(group.chapterIds.length, 2)
  assert.equal(group.hasSummary, false)
  await rpc('save-range-summary', { projectId, rangeId: group.id, chapterIds: group.chapterIds, summary: '区间摘要' })
  const after = await rpc('range-summary-groups', { projectId })
  assert.equal(after.groups[0].summary, '区间摘要')
  assert.equal(after.groups[0].hasSummary, true)
  assert.ok(after.groups[0].updatedAt > 0)
  const persisted = JSON.parse(files.get(summaryFile))
  assert.equal(persisted.ranges[0].summary, '区间摘要')
})

test('ai-summarize-ranges 只重算过期区间并持久化', async () => {
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const chapter = projects[0].chapters[0]
  await rpc('update-chapter', { projectId, chapterId: chapter.id, content: chapter.content + ' 区间', expectedRevision: chapter.revision })
  const result = await rpc('ai-summarize-ranges', { projectId })
  assert.equal(result.total, 1)
  assert.equal(result.staleCount, 1)
  assert.equal(result.count, 1)
  assert.equal(result.summaries[0].summary, '摘要：测试正文。')
  const after = await rpc('range-summary-groups', { projectId })
  assert.equal(after.groups[0].summary, '摘要：测试正文。')
})

test('delete-chapter 清理章节与区间摘要条目', async () => {
  const summaryFile = path.posix.join(root, '.mofei-summaries.json')
  const { projects } = await rpc('list-projects', {})
  const projectId = projects[0].id
  const victim = projects[0].chapters[0]
  await rpc('delete-chapter', { projectId, chapterId: victim.id })
  const persisted = JSON.parse(files.get(summaryFile))
  assert.equal(persisted.chapters[victim.id], undefined)
  assert.equal(persisted.ranges.length, 0)
  const missing = await rpc('chapter-summary', { projectId, chapterId: victim.id })
  assert.equal(missing.error, 'CHAPTER_NOT_FOUND')
})

test('数据重载后 worldEntries 保留（load 迁移）', async () => {
  // 新建一个 plugin 实例读取同一目录，验证持久化与 load 兼容
  const routes2 = {}
  const ctx2 = { fs: mockFs, sandboxPolicy: { workspaceRoot: root, resolve: () => ({}) }, webServer: { register: (d) => { routes2[d.path] = d } }, get: () => undefined, effect: () => {} }
  plugin.apply(ctx2)
  const route2 = routes2['/api/mofei']
  assert.ok(route2, 'second instance api route')
  let body = ''
  const req = { method: 'POST', [Symbol.asyncIterator]() { let done = false; return { next: async () => done ? { done: true } : (done = true, { value: JSON.stringify({ method: 'list-projects', args: {} }), done: false }) } } }
  const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
  await route2.handler(req, res)
  const value = JSON.parse(body).value
  assert.equal(value.projects[0].worldEntries.length, 2)
})

test('旧 .openfic-*.json 自动迁移为 .mofei-*.json', async () => {
  const legacyRoot = 'virtual-root-legacy'
  const legacyFiles = new Map()
  const legacyProjectFile = path.posix.join(legacyRoot, '.openfic-projects.json')
  legacyFiles.set(legacyProjectFile, JSON.stringify({ version: 4, nextId: 2, projects: [{ id: 'legacy-project', title: '旧品牌项目', description: '', goal: 0, chapters: [], volumes: [], characters: [], notes: [], noteCategories: [], worldEntries: [] }] }))
  const legacyFs = {
    async resolve(name, options) { return path.posix.join(options && options.cwd || legacyRoot, name) },
    async stat(target) { return legacyFiles.has(target) ? { size: legacyFiles.get(target).length } : undefined },
    async readText(target) { if (!legacyFiles.has(target)) throw new Error('ENOENT'); return legacyFiles.get(target) },
    async writeText(target, content) { legacyFiles.set(target, content) },
  }
  const legacyRoutes = {}
  plugin.apply({ fs: legacyFs, sandboxPolicy: { workspaceRoot: legacyRoot, resolve: () => ({}) }, webServer: { register: (definition) => { legacyRoutes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
  const legacyRoute = legacyRoutes['/api/mofei']
  assert.ok(legacyRoute, 'legacy data instance api route')
  let body = ''
  const req = { method: 'POST', [Symbol.asyncIterator]() { let done = false; return { next: async () => done ? { done: true } : (done = true, { value: JSON.stringify({ method: 'list-projects', args: {} }), done: false }) } } }
  const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
  await legacyRoute.handler(req, res)
  const value = JSON.parse(body).value
  assert.equal(value.projects[0].id, 'legacy-project')
  const migratedFile = path.posix.join(legacyRoot, '.mofei-projects.json')
  assert.ok(legacyFiles.has(migratedFile), '迁移后应写入 .mofei-projects.json')
  assert.equal(JSON.parse(legacyFiles.get(migratedFile)).projects[0].title, '旧品牌项目')
})

test('chapter-summaries 批量返回全部章节与 entry/stale', async () => {
  const { project } = await rpc('create-project', { title: '批量摘要' })
  const projectId = project.id
  const { chapter: c1 } = await rpc('create-chapter', { projectId, title: '批量章一' })
  const { chapter: c2 } = await rpc('create-chapter', { projectId, title: '批量章二' })
  await rpc('save-chapter-summary', { projectId, chapterId: c1.id, summary: '摘要A' })
  const result = await rpc('chapter-summaries', { projectId })
  assert.equal(result.chapters.length, 2)
  const a = result.chapters.find((row) => row.chapterId === c1.id)
  const b = result.chapters.find((row) => row.chapterId === c2.id)
  assert.equal(a.title, '批量章一')
  assert.equal(a.order, 0)
  assert.equal(a.revision, 1)
  assert.equal(a.volumeId, null)
  assert.equal(a.entry.summary, '摘要A')
  assert.equal(a.stale, false)
  assert.equal(b.entry, null)
  assert.equal(b.stale, true)
  await rpc('delete-project', { projectId })
})

test('ai-summarize-ranges 带 rangeIds 只处理选中区间', async () => {
  const { project } = await rpc('create-project', { title: '区间批量' })
  const projectId = project.id
  const { chapter: c1 } = await rpc('create-chapter', { projectId, title: '区间章一' })
  const { chapter: c2 } = await rpc('create-chapter', { projectId, title: '区间章二' })
  const { chapter: c3 } = await rpc('create-chapter', { projectId, title: '区间章三' })
  await rpc('update-chapter', { projectId, chapterId: c1.id, content: '第一章正文。', expectedRevision: c1.revision })
  await rpc('update-chapter', { projectId, chapterId: c2.id, content: '第二章正文。', expectedRevision: c2.revision })
  await rpc('update-chapter', { projectId, chapterId: c3.id, content: '第三章正文。', expectedRevision: c3.revision })
  const { groups } = await rpc('range-summary-groups', { projectId, size: 2 })
  assert.equal(groups.length, 2)
  const target = groups[0]
  const callsBefore = llmCalls
  const result = await rpc('ai-summarize-ranges', { projectId, size: 2, rangeIds: [target.id] })
  assert.equal(result.total, 1)
  assert.equal(result.count, 1)
  assert.equal(result.staleCount, 1)
  assert.equal(result.freshCount, 0)
  assert.equal(result.summaries[0].rangeId, target.id)
  assert.equal(llmCalls - callsBefore, 1)
  const after = await rpc('range-summary-groups', { projectId, size: 2 })
  assert.equal(after.groups[0].hasSummary, true)
  assert.equal(after.groups[1].hasSummary, false)
  const missing = await rpc('ai-summarize-ranges', { projectId, size: 2, rangeIds: ['range-nope-nope'] })
  assert.equal(missing.error, 'RANGE_NOT_FOUND')
  await rpc('delete-project', { projectId })
})

test('SSE stream ai-summarize（chapters）收到 progress 与 done', async () => {
  const { project } = await rpc('create-project', { title: 'SSE章节流' })
  const projectId = project.id
  const { chapter } = await rpc('create-chapter', { projectId, title: 'SSE章一' })
  await rpc('update-chapter', { projectId, chapterId: chapter.id, content: '测试正文。', expectedRevision: chapter.revision })
  const result = await sse({ kind: 'chapters', projectId, chapterIds: [chapter.id] }, '/api/mofei/stream/ai-summarize')
  assert.match(result.headers['content-type'], /text\/event-stream/)
  assert.equal(result.ended, true)
  const frames = parseSse(result.writes)
  const progress = frames.filter((frame) => frame.event === 'progress')
  const done = frames.filter((frame) => frame.event === 'done')
  assert.equal(progress.length, 1)
  assert.equal(done.length, 1)
  assert.equal(progress[0].data.done, 0)
  assert.equal(progress[0].data.total, 1)
  assert.equal(progress[0].data.chapterId, chapter.id)
  assert.equal(progress[0].data.title, 'SSE章一')
  assert.equal(done[0].data.count, 1)
  assert.equal(done[0].data.total, 1)
  assert.equal(done[0].data.staleCount, 1)
  assert.equal(done[0].data.freshCount, 0)
  assert.ok(Array.isArray(done[0].data.fresh))
  assert.equal(done[0].data.summaries[0].summary, '摘要：测试正文。')
  const persisted = await rpc('chapter-summary', { projectId, chapterId: chapter.id })
  assert.equal(persisted.stale, false)
  assert.equal(persisted.entry.summary, '摘要：测试正文。')
  await rpc('delete-project', { projectId })
})

test('SSE stream ai-summarize（ranges）收到 progress 与 done', async () => {
  const { project } = await rpc('create-project', { title: 'SSE区间流' })
  const projectId = project.id
  const { chapter: c1 } = await rpc('create-chapter', { projectId, title: '区间流一' })
  const { chapter: c2 } = await rpc('create-chapter', { projectId, title: '区间流二' })
  await rpc('update-chapter', { projectId, chapterId: c1.id, content: '一。', expectedRevision: c1.revision })
  await rpc('update-chapter', { projectId, chapterId: c2.id, content: '二。', expectedRevision: c2.revision })
  const result = await sse({ kind: 'ranges', projectId, size: 2 }, '/api/openfic/stream/ai-summarize')
  assert.match(result.headers['content-type'], /text\/event-stream/)
  assert.equal(result.ended, true)
  const frames = parseSse(result.writes)
  const progress = frames.filter((frame) => frame.event === 'progress')
  const done = frames.filter((frame) => frame.event === 'done')
  assert.equal(progress.length, 1)
  assert.equal(done.length, 1)
  assert.ok(progress[0].data.rangeId)
  assert.ok(progress[0].data.title)
  assert.equal(done[0].data.count, 1)
  assert.equal(done[0].data.staleCount, 1)
  assert.equal(done[0].data.freshCount, 0)
  assert.equal(done[0].data.summaries[0].summary, '摘要：测试正文。')
  await rpc('delete-project', { projectId })
})

test('SSE stream ai-summarize 非法 kind 返回 INVALID_KIND', async () => {
  const { project } = await rpc('create-project', { title: 'SSE非法kind' })
  const projectId = project.id
  const result = await sse({ kind: 'bogus', projectId }, '/api/mofei/stream/ai-summarize')
  assert.equal(result.ended, true)
  const frames = parseSse(result.writes)
  assert.equal(frames.length, 1)
  assert.equal(frames[0].event, 'error')
  assert.equal(frames[0].data.code, 'INVALID_KIND')
  await rpc('delete-project', { projectId })
})

test('update-world-entries 批量开关并落盘', async () => {
  const { project } = await rpc('create-project', { title: '批量世界书' })
  const projectId = project.id
  const { entry: e1 } = await rpc('create-world-entry', { projectId, name: '批量条目一', content: 'c1' })
  const { entry: e2 } = await rpc('create-world-entry', { projectId, name: '批量条目二', content: 'c2' })
  const result = await rpc('update-world-entries', { projectId, entryIds: [e1.id, e2.id], patch: { isEnabled: false, constant: true } })
  assert.equal(result.entries.length, 2)
  assert.equal(result.entries[0].isEnabled, false)
  assert.equal(result.entries[0].constant, true)
  assert.equal(result.entries[1].isEnabled, false)
  assert.equal(result.entries[1].constant, true)
  const projectFile = path.posix.join(root, '.mofei-projects.json')
  const savedProject = JSON.parse(files.get(projectFile)).projects.find((p) => p.id === projectId)
  assert.equal(savedProject.worldEntries.find((e) => e.id === e1.id).isEnabled, false)
  assert.equal(savedProject.worldEntries.find((e) => e.id === e1.id).constant, true)
  const bad = await rpc('update-world-entries', { projectId, entryIds: [], patch: { isEnabled: true } })
  assert.equal(bad.error, 'INVALID_IDS')
  await rpc('delete-project', { projectId })
})

test('delete-world-entries 批量删除并重排 order', async () => {
  const { project } = await rpc('create-project', { title: '批量删除世界书' })
  const projectId = project.id
  const { entry: e1 } = await rpc('create-world-entry', { projectId, name: '待删一', content: 'x' })
  const { entry: e2 } = await rpc('create-world-entry', { projectId, name: '存活', content: 'y' })
  const { entry: e3 } = await rpc('create-world-entry', { projectId, name: '待删三', content: 'z' })
  const result = await rpc('delete-world-entries', { projectId, entryIds: [e1.id, e3.id] })
  assert.equal(result.deleted, true)
  assert.equal(result.count, 2)
  const projectFile = path.posix.join(root, '.mofei-projects.json')
  const savedProject = JSON.parse(files.get(projectFile)).projects.find((p) => p.id === projectId)
  assert.equal(savedProject.worldEntries.length, 1)
  assert.equal(savedProject.worldEntries[0].id, e2.id)
  assert.equal(savedProject.worldEntries[0].order, 0)
  const missing = await rpc('delete-world-entries', { projectId, entryIds: ['nope'] })
  assert.equal(missing.error, 'WORLD_ENTRY_NOT_FOUND')
  await rpc('delete-project', { projectId })
})

test('world-entry 名称唯一性（创建/更新，大小写与空白不敏感）', async () => {
  const { project } = await rpc('create-project', { title: '唯一性' })
  const projectId = project.id
  const { entry: a } = await rpc('create-world-entry', { projectId, name: 'Alpha Entry', content: 'x' })
  const dup1 = await rpc('create-world-entry', { projectId, name: 'ALPHA ENTRY', content: 'y' })
  assert.equal(dup1.error, 'DUPLICATE_WORLD_NAME')
  const dup2 = await rpc('create-world-entry', { projectId, name: '  alpha   entry  ', content: 'z' })
  assert.equal(dup2.error, 'DUPLICATE_WORLD_NAME')
  const { entry: b } = await rpc('create-world-entry', { projectId, name: 'Beta', content: 'w' })
  const updDup = await rpc('update-world-entry', { projectId, entryId: b.id, name: 'ALPHA ENTRY' })
  assert.equal(updDup.error, 'DUPLICATE_WORLD_NAME')
  const selfRename = await rpc('update-world-entry', { projectId, entryId: a.id, name: 'Alpha Entry' })
  assert.equal(selfRename.error, undefined)
  assert.equal(selfRename.entry.name, 'Alpha Entry')
  const updOk = await rpc('update-world-entry', { projectId, entryId: b.id, name: 'Gamma' })
  assert.equal(updOk.error, undefined)
  assert.equal(updOk.entry.name, 'Gamma')
  const blank = await rpc('create-world-entry', { projectId, name: '  ', content: 'blank' })
  assert.equal(blank.error, undefined)
  assert.equal(blank.entry.name, '未命名条目')
  await rpc('delete-project', { projectId })
})

test('ai-summarize-chapters force 重算不跳过未过期章节', async () => {
  const { project } = await rpc('create-project', { title: '强制重算' })
  const projectId = project.id
  const { chapter } = await rpc('create-chapter', { projectId, title: '强制章' })
  await rpc('update-chapter', { projectId, chapterId: chapter.id, content: '正文', expectedRevision: chapter.revision })
  await rpc('save-chapter-summary', { projectId, chapterId: chapter.id, summary: '旧摘要' })
  const freshRun = await rpc('ai-summarize-chapters', { projectId, chapterIds: [chapter.id] })
  assert.equal(freshRun.count, 0)
  const forced = await rpc('ai-summarize-chapters', { projectId, chapterIds: [chapter.id], force: true })
  assert.equal(forced.count, 1)
  assert.equal(forced.staleCount, 1)
  assert.equal(forced.freshCount, 0)
  assert.equal(forced.summaries[0].summary, '摘要：测试正文。')
  const view = await rpc('chapter-summary', { projectId, chapterId: chapter.id })
  assert.equal(view.entry.summary, '摘要：测试正文。')
  assert.equal(view.stale, false)
  await rpc('delete-project', { projectId })
})

test('实体快照：character 两次 update → history 与 rollback 恢复', async () => {
  const { project } = await rpc('create-project', { title: '实体快照角色' })
  const projectId = project.id
  const { character } = await rpc('create-character', { projectId, name: '初始名', description: '初始描述' })
  await rpc('update-character', { projectId, characterId: character.id, name: '第二名', description: '第二描述' })
  await rpc('update-character', { projectId, characterId: character.id, name: '第三名', description: '第三描述', isFavorited: true })
  const hist = await rpc('entity-history', { projectId, kind: 'character', entityId: character.id })
  assert.equal(hist.kind, 'character')
  assert.equal(hist.entityId, character.id)
  assert.equal(hist.history.length, 2)
  // 最新在前
  assert.equal(hist.history[0].revision, 2)
  assert.deepEqual(hist.history[0].snapshot, { name: '第二名', description: '第二描述', isFavorited: false })
  assert.equal(hist.history[1].revision, 1)
  assert.deepEqual(hist.history[1].snapshot, { name: '初始名', description: '初始描述', isFavorited: false })
  const rolled = await rpc('rollback-entity', { projectId, kind: 'character', entityId: character.id, toRevision: 1 })
  assert.equal(rolled.entity.name, '初始名')
  assert.equal(rolled.entity.description, '初始描述')
  assert.equal(rolled.entity.isFavorited, false)
  assert.equal(rolled.historyCount, 3)
  const after = await rpc('entity-history', { projectId, kind: 'character', entityId: character.id })
  assert.equal(after.history.length, 3)
  assert.equal(after.history[0].revision, 3)
  assert.deepEqual(after.history[0].snapshot, { name: '第三名', description: '第三描述', isFavorited: true })
  assert.equal(after.history[1].revision, 2)
  await rpc('delete-project', { projectId })
})

test('v0.10.3：Agent 工具写入的 history 条目带 source=agent（UI/RPC 无 source）', async () => {
  const { project } = await rpc('create-project', { title: '审计' })
  const projectId = project.id
  const { character } = await rpc('create-character', { projectId, name: '审计角色' })
  const tool = registeredTools.find((definition) => definition.name === 'mofei_write-character')
  assert.ok(tool, 'mofei_write-character registered')
  await tool.execute({ projectId, characterId: character.id, name: '审计角色改', description: '由 agent 工具写入' })
  const history = await rpc('entity-history', { projectId, kind: 'character', entityId: character.id })
  assert.equal(history.history[0].source, 'agent')
  await rpc('update-character', { projectId, characterId: character.id, name: '审计角色UI' })
  const history2 = await rpc('entity-history', { projectId, kind: 'character', entityId: character.id })
  assert.equal(history2.history[0].source, null)
  await rpc('delete-project', { projectId })
})

test('实体快照：note update + move-note → 历史与 rollback 恢复', async () => {
  const { project } = await rpc('create-project', { title: '实体快照笔记' })
  const projectId = project.id
  const { category: catA } = await rpc('create-note-category', { projectId, title: '分类A' })
  const { category: catB } = await rpc('create-note-category', { projectId, title: '分类B' })
  const { note } = await rpc('create-note', { projectId, title: '笔记', categoryId: catA.id })
  await rpc('update-note', { projectId, noteId: note.id, title: '笔记二', content: '内容二', isLocked: true })
  await rpc('move-note', { projectId, noteId: note.id, categoryId: catB.id })
  const hist = await rpc('entity-history', { projectId, kind: 'note', entityId: note.id })
  assert.equal(hist.history.length, 2)
  // 最新在前：move-note 产生的 categoryId=catA 快照
  assert.equal(hist.history[0].snapshot.categoryId, catA.id)
  assert.equal(hist.history[0].snapshot.content, '内容二')
  const rolled = await rpc('rollback-entity', { projectId, kind: 'note', entityId: note.id, toRevision: 1 })
  assert.equal(rolled.entity.categoryId, catA.id)
  assert.equal(rolled.entity.content, '')
  assert.equal(rolled.entity.title, '笔记')
  await rpc('delete-project', { projectId })
})

test('实体快照：world-entry update + 批量开关各自产生快照，rollback 恢复 name/keys/isEnabled', async () => {
  const { project } = await rpc('create-project', { title: '实体快照世界书' })
  const projectId = project.id
  const { entry: e1 } = await rpc('create-world-entry', { projectId, name: '甲', keys: ['甲', 'A'], content: 'c1' })
  const { entry: e2 } = await rpc('create-world-entry', { projectId, name: '乙', content: 'c2' })
  await rpc('update-world-entry', { projectId, entryId: e1.id, name: '甲改', keys: ['甲'], content: 'c1x' })
  await rpc('update-world-entries', { projectId, entryIds: [e1.id, e2.id], patch: { isEnabled: false, constant: true } })
  const hist1 = await rpc('entity-history', { projectId, kind: 'world-entry', entityId: e1.id })
  assert.equal(hist1.history.length, 2)
  assert.equal(hist1.history[0].snapshot.name, '甲改')
  assert.deepEqual(hist1.history[0].snapshot.keys, ['甲'])
  assert.equal(hist1.history[0].snapshot.isEnabled, true)
  assert.equal(hist1.history[0].snapshot.constant, false)
  const hist2 = await rpc('entity-history', { projectId, kind: 'world-entry', entityId: e2.id })
  assert.equal(hist2.history.length, 1)
  assert.equal(hist2.history[0].snapshot.isEnabled, true)
  const rolled = await rpc('rollback-entity', { projectId, kind: 'world-entry', entityId: e1.id, toRevision: 1 })
  assert.equal(rolled.entity.name, '甲')
  assert.deepEqual(rolled.entity.keys, ['甲', 'A'])
  assert.equal(rolled.entity.content, 'c1')
  assert.equal(rolled.entity.isEnabled, true)
  await rpc('delete-project', { projectId })
})

test('entity-history 最新在前 + INVALID_KIND/ENTITY_NOT_FOUND/REVISION_NOT_FOUND/PROJECT_NOT_FOUND', async () => {
  const { project } = await rpc('create-project', { title: '历史错误码' })
  const projectId = project.id
  const { character } = await rpc('create-character', { projectId, name: 'A' })
  await rpc('update-character', { projectId, characterId: character.id, name: 'B' })
  await rpc('update-character', { projectId, characterId: character.id, name: 'C' })
  const hist = await rpc('entity-history', { projectId, kind: 'character', entityId: character.id })
  assert.equal(hist.history.length, 2)
  assert.equal(hist.history[0].revision, 2)
  assert.equal(hist.history[1].revision, 1)
  assert.ok(hist.history[0].at >= hist.history[1].at)
  const badKind = await rpc('entity-history', { projectId, kind: 'bogus', entityId: character.id })
  assert.equal(badKind.error, 'INVALID_KIND')
  const missingEntity = await rpc('entity-history', { projectId, kind: 'character', entityId: 'nope' })
  assert.equal(missingEntity.error, 'ENTITY_NOT_FOUND')
  const missingRev = await rpc('rollback-entity', { projectId, kind: 'character', entityId: character.id, toRevision: 99 })
  assert.equal(missingRev.error, 'REVISION_NOT_FOUND')
  const missingProject = await rpc('entity-history', { projectId: 'nope', kind: 'character', entityId: character.id })
  assert.equal(missingProject.error, 'PROJECT_NOT_FOUND')
  await rpc('delete-project', { projectId })
})

test('实体快照：move-world-entry order 快照与 rollback 恢复 order', async () => {
  const { project } = await rpc('create-project', { title: '世界书顺序快照' })
  const projectId = project.id
  await rpc('create-world-entry', { projectId, name: '序一', content: 'x' })
  await rpc('create-world-entry', { projectId, name: '序二', content: 'y' })
  const { entry: third } = await rpc('create-world-entry', { projectId, name: '序三', content: 'z' })
  const before = await rpc('entity-history', { projectId, kind: 'world-entry', entityId: third.id })
  assert.equal(before.history.length, 0)
  await rpc('move-world-entry', { projectId, entryId: third.id, direction: 'up' })
  const after = await rpc('entity-history', { projectId, kind: 'world-entry', entityId: third.id })
  assert.equal(after.history.length, 1)
  assert.equal(after.history[0].snapshot.order, 2)
  await rpc('rollback-entity', { projectId, kind: 'world-entry', entityId: third.id, toRevision: 1 })
  const list = await rpc('list-projects', {})
  const restored = list.projects.find((p) => p.id === projectId).worldEntries.find((e) => e.id === third.id)
  assert.equal(restored.order, 2)
  await rpc('delete-project', { projectId })
})

test('v0.27 实体历史：JSON 抽离 + <id>.history.jsonl 落盘 + 第二实例回填 + revision 单调', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'mofei-entity-history-'))
  const workspaceFs = {
    async resolve(name, options) { return path.join(options && options.cwd || workspaceRoot, name) },
    async stat(target) { try { const info = await stat(target); return { size: info.size } } catch (error) { return undefined } },
    async readText(target) { return readFile(target, 'utf8') },
    async writeText(target, content) { await writeFile(target, content, 'utf8') },
  }
  const makeRoute = () => {
    const routes = {}
    plugin.apply({ fs: workspaceFs, sandboxPolicy: { workspaceRoot, resolve: () => ({}) }, webServer: { register: (definition) => { routes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
    const targetRoute = routes['/api/mofei']
    return async (method, args = {}) => {
      let body = ''
      let done = false
      const payload = JSON.stringify({ method, args })
      const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
      const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
      await targetRoute.handler(req, res)
      const parsed = JSON.parse(body)
      if (!parsed.ok) throw new Error(method + ': ' + JSON.stringify(parsed))
      return parsed.value
    }
  }
  const firstRpc = makeRoute()
  let projectId = ''
  try {
    const { project } = await firstRpc('create-project', { title: '实体历史' })
    projectId = project.id
    const { character } = await firstRpc('create-character', { projectId, name: '曾用名', description: '角色描述' })
    await firstRpc('update-character', { projectId, characterId: character.id, name: '现名' })
    // rollback 产生第二条快照：先把「现名」入史（revision 2），再恢复「曾用名」。
    await firstRpc('rollback-entity', { projectId, kind: 'character', entityId: character.id, toRevision: 1 })
    const { note } = await firstRpc('create-note', { projectId, title: '笔记一' })
    // create-note 不吃 content；两次 update 产生两条快照（变更前状态）。
    await firstRpc('update-note', { projectId, noteId: note.id, content: '内容一' })
    await firstRpc('update-note', { projectId, noteId: note.id, title: '笔记二', content: '内容二' })
    const { entry } = await firstRpc('create-world-entry', { projectId, name: '条目一', content: '世界一' })
    await firstRpc('update-world-entry', { projectId, entryId: entry.id, name: '条目二', content: '世界二' })

    // v0.27: JSON 索引不再含实体历史
    const projectsJson = JSON.parse(await readFile(path.join(workspaceRoot, '.mofei-projects.json'), 'utf8'))
    const stored = projectsJson.projects.find((item) => item.id === projectId)
    assert.ok(stored, '项目必须落盘到 .mofei-projects.json')
    for (const item of stored.characters) assert.equal(item.history, undefined, 'character.history 已抽离 JSON')
    for (const item of stored.notes) assert.equal(item.history, undefined, 'note.history 已抽离 JSON')
    for (const item of stored.worldEntries) assert.equal(item.history, undefined, 'worldEntry.history 已抽离 JSON')

    // 文件树 <id>.history.jsonl 落盘且快照正确
    const base = path.join(workspaceRoot, '.mofei', 'projects', projectId)
    const characterLines = (await readFile(path.join(base, 'characters', character.id + '.history.jsonl'), 'utf8')).split('\n').filter(Boolean)
    assert.equal(characterLines.length, 2, 'character 历史 2 条（update 快照 + rollback 快照）')
    assert.equal(JSON.parse(characterLines[0]).snapshot.name, '曾用名', '首条快照 = 更新前状态')
    assert.equal(JSON.parse(characterLines[1]).snapshot.name, '现名', 'rollback 前状态入史')
    assert.ok(JSON.parse(characterLines[0]).at > 0 && JSON.parse(characterLines[1]).at > 0, '历史条目带 at 时间戳')
    const noteLines = (await readFile(path.join(base, 'notes', note.id + '.history.jsonl'), 'utf8')).split('\n').filter(Boolean)
    assert.equal(noteLines.length, 2, 'note 历史 2 条（两次 update 各快照一次变更前状态）')
    // 历史条目快照的是「变更前」状态（pushEntityHistory 在应用修改前调用）。
    assert.equal(JSON.parse(noteLines[0]).snapshot.title, '笔记一')
    assert.equal(JSON.parse(noteLines[0]).snapshot.content, '')
    assert.equal(JSON.parse(noteLines[1]).snapshot.title, '笔记一')
    assert.equal(JSON.parse(noteLines[1]).snapshot.content, '内容一')
    const worldLines = (await readFile(path.join(base, 'world', entry.id + '.history.jsonl'), 'utf8')).split('\n').filter(Boolean)
    assert.equal(worldLines.length, 1)
    assert.equal(JSON.parse(worldLines[0]).snapshot.name, '条目一')
    assert.equal(JSON.parse(worldLines[0]).snapshot.content, '世界一')

    // 第二实例：从文件树回填实体历史
    const secondRpc = makeRoute()
    const characterHistory = await secondRpc('entity-history', { projectId, kind: 'character', entityId: character.id })
    assert.equal(characterHistory.history.length, 2, '第二实例从 .history.jsonl 回填 character 历史')
    assert.equal(characterHistory.history[1].snapshot.name, '曾用名')
    const noteHistory = await secondRpc('entity-history', { projectId, kind: 'note', entityId: note.id })
    assert.equal(noteHistory.history.length, 2, '第二实例回填 note 历史')
    assert.equal(noteHistory.history[1].snapshot.content, '', '首条快照 = 创建态（空正文）')
    const worldHistory = await secondRpc('entity-history', { projectId, kind: 'world-entry', entityId: entry.id })
    assert.equal(worldHistory.history.length, 1, '第二实例回填 world-entry 历史')

    // historySeq 单调：回填后继续更新 → 新 revision 必须大于文件树最后 revision
    await secondRpc('update-character', { projectId, characterId: character.id, description: '追加描述' })
    const after = await secondRpc('entity-history', { projectId, kind: 'character', entityId: character.id })
    assert.equal(after.history[0].revision, 3, '回填后 historySeq 单调递增（3 > 2）')
  } finally {
    if (projectId) { try { await firstRpc('delete-project', { projectId }) } catch (error) { /* noop */ } }
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('ENTITY_HISTORY_MAX：55 次 update-character 后历史长度≤50', async () => {
  const { project } = await rpc('create-project', { title: '历史上限' })
  const projectId = project.id
  const { character } = await rpc('create-character', { projectId, name: 'v0' })
  for (let i = 1; i <= 55; i += 1) await rpc('update-character', { projectId, characterId: character.id, description: '迭代 ' + i })
  const hist = await rpc('entity-history', { projectId, kind: 'character', entityId: character.id })
  assert.ok(hist.history.length <= 50)
  assert.equal(hist.history.length, 50)
  assert.equal(hist.history[0].revision, 55)
  assert.equal(new Set(hist.history.map((entry) => entry.revision)).size, 50)
  // 最新快照保留最后一次更新的描述
  assert.equal(hist.history[0].snapshot.description, '迭代 54')
  await rpc('delete-project', { projectId })
})

test('prompt chains：save 新建 upsert 与默认名回落', async () => {
  const chainsFile = path.posix.join(root, '.mofei-chains.json')
  const { project } = await rpc('create-project', { title: '链测试' })
  const projectId = project.id
  const { chain } = await rpc('save-prompt-chain', { projectId, name: '续写链', content: '续写《{{chapter}}》' })
  assert.equal(chain.name, '续写链')
  assert.equal(chain.content, '续写《{{chapter}}》')
  assert.ok(chain.id.startsWith('chain-'))
  assert.ok(chain.updatedAt > 0)
  const persisted = JSON.parse(files.get(chainsFile))
  assert.equal(persisted.version, 1)
  assert.equal(persisted.byProject[projectId].length, 1)
  const { chain: upserted } = await rpc('save-prompt-chain', { projectId, chainId: chain.id, content: '新的内容', name: '改名' })
  assert.equal(upserted.id, chain.id)
  assert.equal(upserted.content, '新的内容')
  assert.equal(upserted.name, '改名')
  const { chain: unnamed } = await rpc('save-prompt-chain', { projectId, content: '无名字' })
  assert.equal(unnamed.name, '未命名链')
  assert.ok(unnamed.id !== chain.id)
  assert.equal(JSON.parse(files.get(chainsFile)).byProject[projectId].length, 2)
  await rpc('delete-project', { projectId })
})

test('prompt chains：save 非字符串 content 返回 CHAIN_CONTENT_REQUIRED', async () => {
  const { project } = await rpc('create-project', { title: '链内容错误' })
  const projectId = project.id
  const result = await rpc('save-prompt-chain', { projectId, name: '坏链', content: 42 })
  assert.equal(result.error, 'CHAIN_CONTENT_REQUIRED')
  await rpc('delete-project', { projectId })
})

test('prompt chains：list/delete 与第二实例持久化可读', async () => {
  const chainsFile = path.posix.join(root, '.mofei-chains.json')
  const { project } = await rpc('create-project', { title: '链持久化' })
  const projectId = project.id
  const a = await rpc('save-prompt-chain', { projectId, name: '链A', content: '{{project}}' })
  const b = await rpc('save-prompt-chain', { projectId, name: '链B', content: '{{chapter}}' })
  const listed = await rpc('list-prompt-chains', { projectId })
  assert.deepEqual(listed.chains.map((c) => c.id).sort(), [a.chain.id, b.chain.id].sort())
  assert.ok(listed.chains.every((c) => 'name' in c && 'content' in c && 'updatedAt' in c))
  // 第二实例读取同一文件
  const routes2 = {}
  plugin.apply({ fs: mockFs, sandboxPolicy: { workspaceRoot: root, resolve: () => ({}) }, webServer: { register: (d) => { routes2[d.path] = d } }, get: () => undefined, effect: () => {} })
  const route2 = routes2['/api/mofei']
  let body = ''
  let done = false
  const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: JSON.stringify({ method: 'list-prompt-chains', args: { projectId } }), done: false }) } } }
  const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
  await route2.handler(req, res)
  const value = JSON.parse(body).value
  assert.equal(value.chains.length, 2)
  const deleted = await rpc('delete-prompt-chain', { projectId, chainId: a.chain.id })
  assert.equal(deleted.deleted, true)
  assert.equal(deleted.chainId, a.chain.id)
  const afterList = await rpc('list-prompt-chains', { projectId })
  assert.deepEqual(afterList.chains.map((c) => c.id), [b.chain.id])
  assert.equal(JSON.parse(files.get(chainsFile)).byProject[projectId].length, 1)
  await rpc('delete-project', { projectId })
})

test('prompt chains：compile 宏替换与上下文组装', async () => {
  const { project } = await rpc('create-project', { title: '汇编项目' })
  const projectId = project.id
  const { chapter } = await rpc('create-chapter', { projectId, title: '第一章' })
  await rpc('update-chapter', { projectId, chapterId: chapter.id, content: '真'.repeat(5000), expectedRevision: chapter.revision })
  await rpc('create-character', { projectId, name: '林轩', description: '主角' })
  await rpc('create-character', { projectId, name: '苏瑶', description: 'x'.repeat(300) })
  await rpc('create-world-entry', { projectId, name: '青城', content: '仙门', isEnabled: true })
  await rpc('create-world-entry', { projectId, name: '禁用', content: '不可见', isEnabled: false })
  const { note: noteA } = await rpc('create-note', { projectId, title: '笔记甲' })
  await rpc('update-note', { projectId, noteId: noteA.id, content: '机密内容' })
  const { note: hiddenNote } = await rpc('create-note', { projectId, title: '隐藏笔记' })
  await rpc('update-note', { projectId, noteId: hiddenNote.id, isHidden: true })
  const { chain } = await rpc('save-prompt-chain', { projectId, content: '{{project}}|{{chapter}}|{{selected}}|{{instruction}}|{{characters}}|{{world}}|{{notes}}|{{chapterText}}' })
  const compiled = await rpc('compile-prompt-chain', { projectId, chainId: chain.id, chapterId: chapter.id, selected: '选中文本', instruction: '润色' })
  assert.equal(typeof compiled.prompt, 'string')
  const parts = compiled.prompt.split('|')
  assert.equal(parts[0], '汇编项目')
  assert.equal(parts[1], '第一章')
  assert.equal(parts[2], '选中文本')
  assert.equal(parts[3], '润色')
  assert.match(parts[4], /林轩：主角/)
  assert.match(parts[4], /苏瑶：x{200}/)
  assert.equal(parts[4].includes('x'.repeat(201)), false)
  assert.match(parts[5], /青城：仙门/)
  assert.equal(parts[5].includes('禁用'), false)
  assert.match(parts[6], /笔记甲：机密内容/)
  assert.equal(parts[6].includes('隐藏笔记'), false)
  assert.equal(parts[7], '真'.repeat(5000))
  await rpc('delete-project', { projectId })
})

test('prompt chains：run-prompt-chain mock LLM 返回文本并持久化 AI 历史', async () => {
  const { project } = await rpc('create-project', { title: '链运行' })
  const projectId = project.id
  const { chapter } = await rpc('create-chapter', { projectId, title: '运行章' })
  await rpc('update-chapter', { projectId, chapterId: chapter.id, content: '正文', expectedRevision: chapter.revision })
  const { chain } = await rpc('save-prompt-chain', { projectId, content: '总结{{chapter}}' })
  const result = await rpc('run-prompt-chain', { projectId, chainId: chain.id, chapterId: chapter.id })
  assert.equal(result.text, '摘要：测试正文。')
  assert.match(result.prompt, /总结运行章/)
  assert.equal(result.historyCount, 2)
  const history = await rpc('ai-history', { projectId })
  assert.equal(history.messages.length, 2)
  assert.equal(history.messages[0].role, 'user')
  assert.equal(history.messages[0].mode, 'prompt-chain')
  assert.equal(history.messages[1].role, 'assistant')
  assert.equal(history.messages[1].content, '摘要：测试正文。')
  await rpc('delete-project', { projectId })
})

test('prompt chains：错误码 PROJECT_NOT_FOUND/CHAIN_NOT_FOUND/CHAPTER_NOT_FOUND/LLM_UNAVAILABLE', async () => {
  const noProject = await rpc('list-prompt-chains', { projectId: 'nope' })
  assert.equal(noProject.error, 'PROJECT_NOT_FOUND')
  const { project } = await rpc('create-project', { title: '链错误码' })
  const projectId = project.id
  const { chapter } = await rpc('create-chapter', { projectId, title: '章' })
  const noChainCompile = await rpc('compile-prompt-chain', { projectId, chainId: 'nope' })
  assert.equal(noChainCompile.error, 'CHAIN_NOT_FOUND')
  const noChainRun = await rpc('run-prompt-chain', { projectId, chainId: 'nope' })
  assert.equal(noChainRun.error, 'CHAIN_NOT_FOUND')
  const noChainDelete = await rpc('delete-prompt-chain', { projectId, chainId: 'nope' })
  assert.equal(noChainDelete.error, 'CHAIN_NOT_FOUND')
  const { chain } = await rpc('save-prompt-chain', { projectId, content: '{{chapterText}}' })
  const badChapterCompile = await rpc('compile-prompt-chain', { projectId, chainId: chain.id, chapterId: 'nope' })
  assert.equal(badChapterCompile.error, 'CHAPTER_NOT_FOUND')
  const badChapterRun = await rpc('run-prompt-chain', { projectId, chainId: chain.id, chapterId: 'nope' })
  assert.equal(badChapterRun.error, 'CHAPTER_NOT_FOUND')
  // 无 llm 实例 → LLM_UNAVAILABLE
  const noLlmRoutes = {}
  plugin.apply({ fs: mockFs, sandboxPolicy: { workspaceRoot: root, resolve: () => ({}) }, webServer: { register: (d) => { noLlmRoutes[d.path] = d } }, get: () => undefined, effect: () => {} })
  const noLlmRoute = noLlmRoutes['/api/mofei']
  let body = ''
  let done = false
  const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: JSON.stringify({ method: 'run-prompt-chain', args: { projectId, chainId: chain.id, chapterId: chapter.id } }), done: false }) } } }
  const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
  await noLlmRoute.handler(req, res)
  const value = JSON.parse(body).value
  assert.equal(value.error, 'LLM_UNAVAILABLE')
  assert.ok(chapter)
  await rpc('delete-project', { projectId })
})

test('prompt chains：delete-project 清理链数据', async () => {
  const chainsFile = path.posix.join(root, '.mofei-chains.json')
  const { project } = await rpc('create-project', { title: '链清理' })
  const projectId = project.id
  await rpc('save-prompt-chain', { projectId, name: 'A', content: 'x' })
  await rpc('save-prompt-chain', { projectId, name: 'B', content: 'y' })
  assert.equal(JSON.parse(files.get(chainsFile)).byProject[projectId].length, 2)
  await rpc('delete-project', { projectId })
  const persisted = JSON.parse(files.get(chainsFile))
  assert.equal(persisted.byProject[projectId], undefined)
})

test('内置子代理角色默认可见，项目覆盖可恢复且不会播种副本', async () => {
  const rolesFile = path.posix.join(root, '.mofei-roles.json')
  const { project } = await rpc('create-project', { title: '角色目录契约' })
  const projectId = project.id

  const initial = await rpc('list-roles', { projectId })
  assert.deepEqual(initial.roles.map((role) => role.id), ['writer', 'reviewer', 'analyzer', 'polisher'])
  assert.equal(initial.roles.every((role) => role.source === 'builtin' && role.isBuiltin && !role.isOverridden), true)
  const defaultWriter = await rpc('read-role', { projectId, roleId: 'writer' })
  assert.match(defaultWriter.role.entries[0].content, /你是 Writer/)
  assert.equal(defaultWriter.role.effort, 'high')

  const saved = await rpc('save-role', {
    projectId,
    roleId: 'writer',
    name: 'Writer（正文写作）',
    entries: [{ name: '项目覆盖', content: '只注入项目 Writer 规则', order: 0, isEnabled: true }],
    defaultInstructions: [{ instructionId: 'mofei-writing', order: 10, isEnabled: true }],
  })
  assert.equal(saved.role.source, 'project')
  assert.equal(saved.role.isBuiltin, true)
  assert.equal(saved.role.isOverridden, true)
  assert.equal(saved.role.canReset, true)
  assert.equal(saved.role.entries[0].content, '只注入项目 Writer 规则')

  const compiled = await ctx.mofei.compileRolePersona(projectId, 'writer')
  assert.equal(compiled.persona, '只注入项目 Writer 规则')
  assert.doesNotMatch(compiled.persona, /你是 Writer/)
  const instructions = await ctx.mofei.compileInstructionPersona(projectId, 'writer', [])
  assert.deepEqual(instructions.instructionIds, ['mofei-writing'])
  assert.ok(instructions.persona.length > 100)

  const persisted = JSON.parse(files.get(rolesFile))
  assert.deepEqual(persisted.byProject[projectId].map((role) => role.id), ['writer'])
  const entities = await rpc('list-entities', { projectId, kind: 'roles' })
  assert.deepEqual(entities.items.map((role) => role.id), initial.roles.map((role) => role.id))

  const reset = await rpc('delete-role', { projectId, roleId: 'writer' })
  assert.equal(reset.deleted, true)
  assert.equal(reset.resetToBuiltin, true)
  assert.equal(reset.role.source, 'builtin')
  const restored = await ctx.mofei.compileRolePersona(projectId, 'writer')
  assert.match(restored.persona, /你是 Writer/)
  assert.deepEqual(JSON.parse(files.get(rolesFile)).byProject[projectId], [])

  const noOpReset = await rpc('delete-role', { projectId, roleId: 'writer' })
  assert.equal(noOpReset.deleted, false)
  assert.equal(noOpReset.role.source, 'builtin')
  await rpc('delete-project', { projectId })
})

test('discover-workspace 无摘要变更时不重写 summaries JSON', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'mofei-discover-'))
  const summaryTarget = path.join(workspaceRoot, '.mofei-summaries.json')
  const chainsTarget = path.join(workspaceRoot, '.mofei-chains.json')
  const writeCounts = new Map()
  const workspaceFs = {
    async resolve(name, options) { return path.join(options && options.cwd || workspaceRoot, name) },
    async stat(target) { try { const info = await stat(target); return { size: info.size } } catch (error) { return undefined } },
    async readText(target) { return readFile(target, 'utf8') },
    async writeText(target, content) { writeCounts.set(target, (writeCounts.get(target) || 0) + 1); await writeFile(target, content, 'utf8') },
  }
  const routes = {}
  plugin.apply({ fs: workspaceFs, sandboxPolicy: { workspaceRoot, resolve: () => ({}) }, webServer: { register: (definition) => { routes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
  const workspaceRoute = routes['/api/mofei']
  const workspaceRpc = async (method, args) => {
    let body = ''
    let done = false
    const payload = JSON.stringify({ method, args })
    const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
    const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
    await workspaceRoute.handler(req, res)
    return JSON.parse(body).value
  }
  try {
    await mkdir(path.join(workspaceRoot, 'summaries', 'chapters'), { recursive: true })
    await mkdir(path.join(workspaceRoot, 'chains'), { recursive: true })
    await writeFile(path.join(workspaceRoot, 'project.yml'), '---\nid: "discover-project"\ntitle: "发现项目"\ndescription: ""\ngoal: 0\ncurrentStyle: "default"\nwriterSessionId: null\n---\n', 'utf8')
    await writeFile(path.join(workspaceRoot, 'summaries', 'chapters', 'chapter-1.md'), '---\nchapterId: "chapter-1"\nupdatedAt: 1700000000000\nchapterRevision: 1\n---\n稳定摘要', 'utf8')
    await writeFile(path.join(workspaceRoot, 'chains', 'chain-1.md'), '---\nid: "chain-1"\nname: "稳定链"\nupdatedAt: 1700000000000\n---\n{{chapterText}}', 'utf8')
    const initial = await workspaceRpc('discover-workspace', { workspaceRoot })
    assert.equal(initial.report.changed, true)
    writeCounts.set(summaryTarget, 0)
    writeCounts.set(chainsTarget, 0)

    const repeated = await workspaceRpc('discover-workspace', { workspaceRoot })
    assert.equal(repeated.report.changed, false)
    assert.equal(repeated.report.summaries.updated, 0)
    assert.equal(repeated.report.summaries.conflicts, 0)
    assert.equal(repeated.report.chains.updated, 0)
    assert.equal(repeated.report.chains.conflicts, 0)
    assert.equal(writeCounts.get(summaryTarget), 0)
    assert.equal(writeCounts.get(chainsTarget), 0)
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('真实文件树删除实体后镜像文件清理且 reload 不复活', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'mofei-delete-files-'))
  const workspaceFs = {
    async resolve(name, options) { return path.join(options && options.cwd || workspaceRoot, name) },
    async stat(target) { try { const info = await stat(target); return { size: info.size } } catch (error) { return undefined } },
    async readText(target) { return readFile(target, 'utf8') },
    async writeText(target, content) { await writeFile(target, content, 'utf8') },
  }
  const routes = {}
  plugin.apply({ fs: workspaceFs, sandboxPolicy: { workspaceRoot, resolve: () => ({}) }, webServer: { register: (definition) => { routes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
  const workspaceRoute = routes['/api/mofei']
  const workspaceRpc = async (method, args = {}) => {
    let body = ''
    let done = false
    const payload = JSON.stringify({ method, args })
    const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
    const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
    await workspaceRoute.handler(req, res)
    const parsed = JSON.parse(body)
    if (!parsed.ok) throw new Error(method + ': ' + JSON.stringify(parsed))
    return parsed.value
  }
  const missing = async (file, label) => {
    try {
      await stat(file)
      assert.fail(label + ' 镜像文件仍存在: ' + file)
    } catch (error) {
      if (error && error.name === 'AssertionError') throw error
      assert.equal(error && error.code, 'ENOENT', label + ' 删除后应为 ENOENT')
    }
  }
  let projectId = ''
  try {
    const created = await workspaceRpc('create-project', { title: '文件删除回归' })
    projectId = created.project.id
    const chapterResult = await workspaceRpc('create-chapter', { projectId, title: '待删章节' })
    const chapter = chapterResult.chapter
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: '待删正文', expectedRevision: chapter.revision })
    const character = (await workspaceRpc('create-character', { projectId, name: '待删角色' })).character
    const note = (await workspaceRpc('create-note', { projectId, title: '待删笔记' })).note
    const entry = (await workspaceRpc('create-world-entry', { projectId, name: '待删设定', content: '待删内容' })).entry
    await workspaceRpc('save-chapter-summary', { projectId, chapterId: chapter.id, summary: '待删摘要' })
    const groups = await workspaceRpc('range-summary-groups', { projectId })
    const range = groups.groups[0]
    await workspaceRpc('save-range-summary', { projectId, rangeId: range.id, chapterIds: range.chapterIds, summary: '待删区间摘要' })
    const chain = (await workspaceRpc('save-prompt-chain', { projectId, name: '待删链', content: '{{chapterText}}' })).chain

    const base = path.join(workspaceRoot, '.mofei', 'projects', projectId)
    const filesToCheck = {
      chapter: path.join(base, 'chapters', chapter.id + '.md'),
      character: path.join(base, 'characters', character.id + '.md'),
      note: path.join(base, 'notes', note.id + '.md'),
      world: path.join(base, 'world', entry.id + '.md'),
      chapterSummary: path.join(base, 'summaries', 'chapters', chapter.id + '.md'),
      rangeSummary: path.join(base, 'summaries', 'ranges', range.id + '.md'),
      chain: path.join(base, 'chains', chain.id + '.md'),
    }
    for (const [label, file] of Object.entries(filesToCheck)) await stat(file).catch(() => assert.fail(label + ' 创建后应有镜像文件: ' + file))

    // 手工 Markdown 不在 manifest 中，镜像对账不应误删（即使它带实体式 frontmatter）。
    const manualFile = path.join(base, 'notes', 'manual-reference.md')
    await mkdir(path.dirname(manualFile), { recursive: true })
    await writeFile(manualFile, '---\nid: "manual-reference"\ntitle: "手工参考"\n---\n外部内容\n', 'utf8')

    await workspaceRpc('delete-character', { projectId, characterId: character.id })
    await missing(filesToCheck.character, '角色')
    await workspaceRpc('reload-from-files')
    assert.equal((await workspaceRpc('list-projects')).projects.find((item) => item.id === projectId).characters.some((item) => item.id === character.id), false)

    await workspaceRpc('delete-note', { projectId, noteId: note.id })
    await missing(filesToCheck.note, '笔记')
    await workspaceRpc('reload-from-files')
    assert.equal((await workspaceRpc('list-projects')).projects.find((item) => item.id === projectId).notes.some((item) => item.id === note.id), false)

    await workspaceRpc('delete-world-entry', { projectId, entryId: entry.id })
    await missing(filesToCheck.world, '世界书')
    await workspaceRpc('reload-from-files')
    assert.equal((await workspaceRpc('list-projects')).projects.find((item) => item.id === projectId).worldEntries.some((item) => item.id === entry.id), false)

    await workspaceRpc('delete-prompt-chain', { projectId, chainId: chain.id })
    await missing(filesToCheck.chain, '提示词链')
    await stat(manualFile)

    await workspaceRpc('delete-chapter', { projectId, chapterId: chapter.id })
    await missing(filesToCheck.chapter, '章节')
    await missing(filesToCheck.chapterSummary, '章节摘要')
    await missing(filesToCheck.rangeSummary, '区间摘要')
    await workspaceRpc('reload-from-files')
    const reloaded = (await workspaceRpc('list-projects')).projects.find((item) => item.id === projectId)
    assert.ok(reloaded)
    assert.equal(reloaded.chapters.some((item) => item.id === chapter.id), false)
    assert.equal(reloaded.characters.some((item) => item.id === character.id), false)
    assert.equal(reloaded.notes.some((item) => item.id === note.id), false)
    assert.equal(reloaded.worldEntries.some((item) => item.id === entry.id), false)
    await stat(manualFile)
  } finally {
    if (projectId) { try { await workspaceRpc('delete-project', { projectId }) } catch (error) { /* noop */ } }
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('v0.26 文件优先：saveProjects 落盘后 .mofei-projects.json 不含 chapter.content/history/character.description/note.content/world.content', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'mofei-index-only-'))
  const workspaceFs = {
    async resolve(name, options) { return path.join(options && options.cwd || workspaceRoot, name) },
    async stat(target) { try { const info = await stat(target); return { size: info.size } } catch (error) { return undefined } },
    async readText(target) { return readFile(target, 'utf8') },
    async writeText(target, content) { await writeFile(target, content, 'utf8') },
  }
  const routes = {}
  plugin.apply({ fs: workspaceFs, sandboxPolicy: { workspaceRoot, resolve: () => ({}) }, webServer: { register: (definition) => { routes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
  const workspaceRoute = routes['/api/mofei']
  const workspaceRpc = async (method, args = {}) => {
    let body = ''
    let done = false
    const payload = JSON.stringify({ method, args })
    const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
    const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
    await workspaceRoute.handler(req, res)
    const parsed = JSON.parse(body)
    if (!parsed.ok) throw new Error(method + ': ' + JSON.stringify(parsed))
    return parsed.value
  }
  let projectId = ''
  try {
    const { project } = await workspaceRpc('create-project', { title: '文件优先' })
    projectId = project.id
    const { chapter } = await workspaceRpc('create-chapter', { projectId, title: '第一章' })
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: '落盘正文', expectedRevision: chapter.revision })
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: '落盘正文 2', expectedRevision: chapter.revision + 1 })
    const { character } = await workspaceRpc('create-character', { projectId, name: '主角', description: '主角描述' })
    await workspaceRpc('update-character', { projectId, characterId: character.id, name: '主角改名' })
    const { note } = await workspaceRpc('create-note', { projectId, title: '设定' })
    await workspaceRpc('update-note', { projectId, noteId: note.id, title: '设定改名', content: '笔记正文' })
    const { entry } = await workspaceRpc('create-world-entry', { projectId, name: '门派', content: '世界书正文' })
    await workspaceRpc('update-world-entry', { projectId, entryId: entry.id, name: '门派改名' })
    await workspaceRpc('save-prompt-chain', { projectId, name: '链', content: '链内容' })

    const projectsFile = path.join(workspaceRoot, '.mofei-projects.json')
    const chainsFile = path.join(workspaceRoot, '.mofei-chains.json')
    const projectsJson = JSON.parse(await readFile(projectsFile, 'utf8'))
    const projectsChain = JSON.parse(await readFile(chainsFile, 'utf8'))
    const stored = projectsJson.projects.find((item) => item.id === projectId)
    assert.ok(stored, '项目必须落盘到 .mofei-projects.json')
    // v0.26: JSON 不再含 content / history（文件树才是正文来源）。
    for (const chapterItem of stored.chapters) {
      assert.equal(chapterItem.content, undefined, 'chapter.content 已抽离 .mofei-projects.json')
      assert.equal(chapterItem.history, undefined, 'chapter.history 已抽离 .mofei-projects.json')
    }
    for (const characterItem of stored.characters) assert.equal(characterItem.description, undefined, 'character.description 已抽离')
    for (const noteItem of stored.notes) assert.equal(noteItem.content, undefined, 'note.content 已抽离')
    for (const entryItem of stored.worldEntries) assert.equal(entryItem.content, undefined, 'world.content 已抽离')
    // 链 store 同理
    const chainList = projectsChain.byProject && projectsChain.byProject[projectId]
    assert.ok(Array.isArray(chainList) && chainList.length)
    for (const chain of chainList) assert.equal(chain.content, undefined, 'chain.content 已抽离 .mofei-chains.json')

    // 镜像文件必须在工作区下存在并带正文
    const base = path.join(workspaceRoot, '.mofei', 'projects', projectId)
    const chapterFile = path.join(base, 'chapters', chapter.id + '.md')
    const chapterBody = await readFile(chapterFile, 'utf8')
    assert.ok(chapterBody.includes('落盘正文 2'), 'chapter 镜像 .md 含最新版正文')
    const chapterHistoryFile = path.join(base, 'chapters', chapter.id + '.history.jsonl')
    const historyText = await readFile(chapterHistoryFile, 'utf8')
    const historyLines = historyText.split('\n').filter(Boolean)
    // pushHistory 每次写之前先快照「上一版」：第一次 update-chapter 后历史 = 空 → 落盘正文 v2，
    // 第二次 update 后历史 = 空 + 落盘正文 → 落盘正文 2 v3。
    assert.equal(historyLines.length, 2, 'history.jsonl 含两次快照')
    const oldRevision = JSON.parse(historyLines[0])
    const newRevision = JSON.parse(historyLines[1])
    assert.equal(oldRevision.content, '', 'history.jsonl 首条记录「落盘正文」之前的旧正文（空）')
    assert.equal(newRevision.content, '落盘正文', 'history.jsonl 第二条记录「落盘正文 2」之前的旧正文')
    assert.ok(oldRevision.at > 0 && newRevision.at > 0, '历史条目带 at 时间戳')
    // 角色/笔记/世界书/链：正文写到对应的 .md
    const characterBody = await readFile(path.join(base, 'characters', character.id + '.md'), 'utf8')
    assert.ok(characterBody.includes('主角描述'))
    const noteBody = await readFile(path.join(base, 'notes', note.id + '.md'), 'utf8')
    assert.ok(noteBody.includes('笔记正文'))
    const worldBody = await readFile(path.join(base, 'world', entry.id + '.md'), 'utf8')
    assert.ok(worldBody.includes('世界书正文'))
  } finally {
    if (projectId) { try { await workspaceRpc('delete-project', { projectId }) } catch (error) { /* noop */ } }
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('v0.26 文件优先：第二实例从文件树回填 chapter.content/character.description/note.content/world.content', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'mofei-reload-'))
  const workspaceFs = {
    async resolve(name, options) { return path.join(options && options.cwd || workspaceRoot, name) },
    async stat(target) { try { const info = await stat(target); return { size: info.size } } catch (error) { return undefined } },
    async readText(target) { return readFile(target, 'utf8') },
    async writeText(target, content) { await writeFile(target, content, 'utf8') },
  }
  const routes = {}
  plugin.apply({ fs: workspaceFs, sandboxPolicy: { workspaceRoot, resolve: () => ({}) }, webServer: { register: (definition) => { routes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
  const workspaceRoute = routes['/api/mofei']
  const workspaceRpc = async (method, args = {}) => {
    let body = ''
    let done = false
    const payload = JSON.stringify({ method, args })
    const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
    const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
    await workspaceRoute.handler(req, res)
    const parsed = JSON.parse(body)
    if (!parsed.ok) throw new Error(method + ': ' + JSON.stringify(parsed))
    return parsed.value
  }
  let projectId = ''
  try {
    const { project } = await workspaceRpc('create-project', { title: '文件优先 reload' })
    projectId = project.id
    const { chapter } = await workspaceRpc('create-chapter', { projectId, title: '回填章节' })
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: '回填正文', expectedRevision: chapter.revision })
    const { character } = await workspaceRpc('create-character', { projectId, name: '回填角色', description: '回填描述' })
    const { note } = await workspaceRpc('create-note', { projectId, title: '回填笔记' })
    await workspaceRpc('update-note', { projectId, noteId: note.id, title: '回填笔记', content: '回填笔记正文' })
    const { entry } = await workspaceRpc('create-world-entry', { projectId, name: '回填条目', content: '回填条目正文' })

    // 落盘后 JSON 不应含 content；第二实例启动后从文件树回填。
    const projectsFile = path.join(workspaceRoot, '.mofei-projects.json')
    const projectsSnapshot = JSON.parse(await readFile(projectsFile, 'utf8'))
    const storedProject = projectsSnapshot.projects.find((item) => item.id === projectId)
    assert.ok(storedProject)
    for (const c of storedProject.chapters) assert.equal(c.content, undefined)
    for (const c of storedProject.characters) assert.equal(c.description, undefined)
    for (const n of storedProject.notes) assert.equal(n.content, undefined)
    for (const e of storedProject.worldEntries) assert.equal(e.content, undefined)

    // 第二实例：同样 fs 重启 plugin，触发 importFileTree 从 .mofei/projects/** 重建。
    const secondRoutes = {}
    plugin.apply({ fs: workspaceFs, sandboxPolicy: { workspaceRoot, resolve: () => ({}) }, webServer: { register: (definition) => { secondRoutes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
    const secondRoute = secondRoutes['/api/mofei']
    const secondRpc = async (method, args = {}) => {
      let body = ''
      let done = false
      const payload = JSON.stringify({ method, args })
      const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
      const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
      await secondRoute.handler(req, res)
      const parsed = JSON.parse(body)
      if (!parsed.ok) throw new Error(method + ': ' + JSON.stringify(parsed))
      return parsed.value
    }
    const reloaded = await secondRpc('read-chapter', { projectId, chapterId: chapter.id })
    assert.equal(reloaded.chapter.content, '回填正文', '第二实例从 .md 恢复 chapter.content')

    const listed = await secondRpc('list-projects')
    const reloadedProject = listed.projects.find((item) => item.id === projectId)
    assert.ok(reloadedProject)
    const reloadedCharacter = reloadedProject.characters.find((item) => item.id === character.id)
    assert.equal(reloadedCharacter.description, '回填描述')
    const reloadedNote = reloadedProject.notes.find((item) => item.id === note.id)
    assert.equal(reloadedNote.content, '回填笔记正文')
    const reloadedEntry = reloadedProject.worldEntries.find((item) => item.id === entry.id)
    assert.equal(reloadedEntry.content, '回填条目正文')
  } finally {
    if (projectId) { try { await workspaceRpc('delete-project', { projectId }) } catch (error) { /* noop */ } }
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('v0.26 文件优先：delete-chapter 同步清理 .history.jsonl；reload 不复活历史', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'mofei-delete-history-'))
  const workspaceFs = {
    async resolve(name, options) { return path.join(options && options.cwd || workspaceRoot, name) },
    async stat(target) { try { const info = await stat(target); return { size: info.size } } catch (error) { return undefined } },
    async readText(target) { return readFile(target, 'utf8') },
    async writeText(target, content) { await writeFile(target, content, 'utf8') },
  }
  const routes = {}
  plugin.apply({ fs: workspaceFs, sandboxPolicy: { workspaceRoot, resolve: () => ({}) }, webServer: { register: (definition) => { routes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
  const workspaceRoute = routes['/api/mofei']
  const workspaceRpc = async (method, args = {}) => {
    let body = ''
    let done = false
    const payload = JSON.stringify({ method, args })
    const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
    const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
    await workspaceRoute.handler(req, res)
    const parsed = JSON.parse(body)
    if (!parsed.ok) throw new Error(method + ': ' + JSON.stringify(parsed))
    return parsed.value
  }
  const missing = async (file, label) => {
    try {
      await stat(file)
      assert.fail(label + ' 镜像文件仍存在: ' + file)
    } catch (error) {
      if (error && error.name === 'AssertionError') throw error
      assert.equal(error && error.code, 'ENOENT', label + ' 删除后应为 ENOENT')
    }
  }
  let projectId = ''
  try {
    const created = await workspaceRpc('create-project', { title: '文件优先 删除' })
    projectId = created.project.id
    const { chapter } = await workspaceRpc('create-chapter', { projectId, title: '待删' })
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: '内容 v1', expectedRevision: chapter.revision })
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: '内容 v2', expectedRevision: chapter.revision + 1 })
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: '内容 v3', expectedRevision: chapter.revision + 2 })
    const base = path.join(workspaceRoot, '.mofei', 'projects', projectId)
    const chapterFile = path.join(base, 'chapters', chapter.id + '.md')
    const chapterHistoryFile = path.join(base, 'chapters', chapter.id + '.history.jsonl')
    await stat(chapterFile)
    await stat(chapterHistoryFile)
    const historyBefore = (await readFile(chapterHistoryFile, 'utf8')).split('\n').filter(Boolean)
    assert.ok(historyBefore.length >= 1, '至少有一条历史快照')

    await workspaceRpc('delete-chapter', { projectId, chapterId: chapter.id })
    await missing(chapterFile, '章节 .md')
    await missing(chapterHistoryFile, '章节 .history.jsonl')

    await workspaceRpc('reload-from-files')
    const list = await workspaceRpc('list-projects')
    const reloaded = list.projects.find((item) => item.id === projectId)
    assert.ok(reloaded)
    assert.equal(reloaded.chapters.some((item) => item.id === chapter.id), false, 'reload-from-files 后章节不复活')
  } finally {
    if (projectId) { try { await workspaceRpc('delete-project', { projectId }) } catch (error) { /* noop */ } }
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('Windows ReplaceFileW 1175 短暂冲突会重试持久化写入', async () => {
  const retryRoot = 'virtual-root-retry'
  const retryFiles = new Map()
  let projectWrites = 0
  const retryFs = {
    async resolve(name, options) { return path.posix.join(options && options.cwd || retryRoot, name) },
    async stat(target) { return retryFiles.has(target) ? { size: retryFiles.get(target).length } : undefined },
    async readText(target) { if (!retryFiles.has(target)) throw new Error('ENOENT'); return retryFiles.get(target) },
    async writeText(target, content) {
      if (target.endsWith('.mofei-projects.json') && projectWrites++ === 0) throw new Error('ReplaceFileW EIO (Win32 1175): ' + target)
      retryFiles.set(target, content)
    },
  }
  const routes = {}
  plugin.apply({ fs: retryFs, sandboxPolicy: { workspaceRoot: retryRoot, resolve: () => ({}) }, webServer: { register: (definition) => { routes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
  const retryRoute = routes['/api/mofei']
  let body = ''
  let done = false
  const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: JSON.stringify({ method: 'create-project', args: { title: '重试项目' } }), done: false }) } } }
  const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
  await retryRoute.handler(req, res)
  const result = JSON.parse(body).value
  assert.ok(result.project)
  assert.equal(projectWrites, 2)
})

test('v0.27 回收站：删除章节/角色/笔记/世界书 → 镜像与历史移入 .mofei/trash 而非删除；reload 不复活', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'mofei-trash-'))
  const workspaceFs = {
    async resolve(name, options) { return path.join(options && options.cwd || workspaceRoot, name) },
    async stat(target) { try { const info = await stat(target); return { size: info.size } } catch (error) { return undefined } },
    async readText(target) { return readFile(target, 'utf8') },
    async writeText(target, content) { await writeFile(target, content, 'utf8') },
  }
  const routes = {}
  plugin.apply({ fs: workspaceFs, sandboxPolicy: { workspaceRoot, resolve: () => ({}) }, webServer: { register: (definition) => { routes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
  const workspaceRoute = routes['/api/mofei']
  const workspaceRpc = async (method, args = {}) => {
    let body = ''
    let done = false
    const payload = JSON.stringify({ method, args })
    const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
    const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
    await workspaceRoute.handler(req, res)
    const parsed = JSON.parse(body)
    if (!parsed.ok) throw new Error(method + ': ' + JSON.stringify(parsed))
    return parsed.value
  }
  const missing = async (file, label) => {
    try {
      await stat(file)
      assert.fail(label + ' 镜像文件仍存在: ' + file)
    } catch (error) {
      if (error && error.name === 'AssertionError') throw error
      assert.equal(error && error.code, 'ENOENT', label + ' 原位置应为 ENOENT（已移入回收站）')
    }
  }
  const trashContains = async (projectId, relative) => {
    // 回收站布局 = trash/<projectId>/<stamp>/<原相对路径>，因此用后缀匹配即可
    // （stamp 目录名含实体 id，完整相对路径从 trashBase 算起会带 stamp 前缀）。
    const trashBase = path.join(workspaceRoot, '.mofei', 'trash', projectId)
    const suffix = path.sep + relative.split('/').join(path.sep)
    let found = false
    const walk = async (dir) => {
      let entries = []
      try { entries = await readdir(dir, { withFileTypes: true }) } catch (error) { return }
      for (const entry of entries) {
        const child = path.join(dir, entry.name)
        if (entry.isDirectory()) await walk(child)
        else if (child.endsWith(suffix)) found = true
      }
    }
    await walk(trashBase)
    return found
  }
  let projectId = ''
  try {
    const created = await workspaceRpc('create-project', { title: '回收站' })
    projectId = created.project.id
    const { chapter } = await workspaceRpc('create-chapter', { projectId, title: '待删章节' })
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: 'v1', expectedRevision: chapter.revision })
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: 'v2', expectedRevision: chapter.revision + 1 })
    const { character } = await workspaceRpc('create-character', { projectId, name: '待删角色', description: '角色描述' })
    await workspaceRpc('update-character', { projectId, characterId: character.id, name: '改名角色' })
    const { note } = await workspaceRpc('create-note', { projectId, title: '待删笔记', content: '笔记内容' })
    await workspaceRpc('update-note', { projectId, noteId: note.id, content: '笔记内容 2' })
    const { entry } = await workspaceRpc('create-world-entry', { projectId, name: '待删条目', content: '世界内容' })
    await workspaceRpc('update-world-entry', { projectId, entryId: entry.id, content: '世界内容 2' })

    const base = path.join(workspaceRoot, '.mofei', 'projects', projectId)
    const chapterFile = path.join(base, 'chapters', chapter.id + '.md')
    const chapterHistoryFile = path.join(base, 'chapters', chapter.id + '.history.jsonl')
    const characterFile = path.join(base, 'characters', character.id + '.md')
    const characterHistoryFile = path.join(base, 'characters', character.id + '.history.jsonl')
    const noteFile = path.join(base, 'notes', note.id + '.md')
    const noteHistoryFile = path.join(base, 'notes', note.id + '.history.jsonl')
    const worldFile = path.join(base, 'world', entry.id + '.md')
    const worldHistoryFile = path.join(base, 'world', entry.id + '.history.jsonl')
    // 删除前镜像与历史都在
    await stat(chapterFile); await stat(chapterHistoryFile)
    await stat(characterFile); await stat(characterHistoryFile)
    await stat(noteFile); await stat(noteHistoryFile)
    await stat(worldFile); await stat(worldHistoryFile)

    await workspaceRpc('delete-chapter', { projectId, chapterId: chapter.id })
    await workspaceRpc('delete-character', { projectId, characterId: character.id })
    await workspaceRpc('delete-note', { projectId, noteId: note.id })
    await workspaceRpc('delete-world-entry', { projectId, entryId: entry.id })

    // 原位置全部消失（.md + .history.jsonl）
    await missing(chapterFile, '章节 .md')
    await missing(chapterHistoryFile, '章节 .history.jsonl')
    await missing(characterFile, '角色 .md')
    await missing(characterHistoryFile, '角色 .history.jsonl')
    await missing(noteFile, '笔记 .md')
    await missing(noteHistoryFile, '笔记 .history.jsonl')
    await missing(worldFile, '世界书 .md')
    await missing(worldHistoryFile, '世界书 .history.jsonl')

    // 回收站里能找回每个实体的 .md 与 .history.jsonl（同批次目录）
    assert.ok(await trashContains(projectId, 'chapters/' + chapter.id + '.md'), '章节 .md 在回收站')
    assert.ok(await trashContains(projectId, 'chapters/' + chapter.id + '.history.jsonl'), '章节历史在回收站')
    assert.ok(await trashContains(projectId, 'characters/' + character.id + '.md'), '角色 .md 在回收站')
    assert.ok(await trashContains(projectId, 'characters/' + character.id + '.history.jsonl'), '角色历史在回收站')
    assert.ok(await trashContains(projectId, 'notes/' + note.id + '.md'), '笔记 .md 在回收站')
    assert.ok(await trashContains(projectId, 'notes/' + note.id + '.history.jsonl'), '笔记历史在回收站')
    assert.ok(await trashContains(projectId, 'world/' + entry.id + '.md'), '世界书 .md 在回收站')
    assert.ok(await trashContains(projectId, 'world/' + entry.id + '.history.jsonl'), '世界书历史在回收站')

    // trash-list RPC 可见且按批次分组
    const trash = await workspaceRpc('trash-list')
    const myItems = trash.items.filter((item) => item.projectId === projectId)
    assert.equal(myItems.length, 4, '4 个删除批次（章节/角色/笔记/世界书）')
    const allFiles = myItems.flatMap((item) => item.files)
    assert.ok(allFiles.includes('chapters/' + chapter.id + '.history.jsonl'), 'trash-list 含章节历史')
    assert.ok(allFiles.includes('characters/' + character.id + '.history.jsonl'), 'trash-list 含角色历史')
    assert.ok(allFiles.includes('notes/' + note.id + '.history.jsonl'), 'trash-list 含笔记历史')
    assert.ok(allFiles.includes('world/' + entry.id + '.history.jsonl'), 'trash-list 含世界书历史')
    assert.ok(myItems.every((item) => item.at > 0), '批次带 at 时间戳')

    // reload-from-files 不复活
    await workspaceRpc('reload-from-files')
    const list = await workspaceRpc('list-projects')
    const reloaded = list.projects.find((item) => item.id === projectId)
    assert.ok(reloaded)
    assert.equal(reloaded.chapters.some((item) => item.id === chapter.id), false, 'reload 后章节不复活')
    assert.equal(reloaded.characters.some((item) => item.id === character.id), false, 'reload 后角色不复活')
    assert.equal(reloaded.notes.some((item) => item.id === note.id), false, 'reload 后笔记不复活')
    assert.equal(reloaded.worldEntries.some((item) => item.id === entry.id), false, 'reload 后世界书不复活')
    // 回收站内容不受 reload 影响（仍在 trash 中）
    assert.ok(await trashContains(projectId, 'chapters/' + chapter.id + '.history.jsonl'), 'reload 后回收站文件仍在')
  } finally {
    if (projectId) { try { await workspaceRpc('delete-project', { projectId }) } catch (error) { /* noop */ } }
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('v0.28 RAG 索引重建：fileTreeBodyLoader 接入后 rag-build-index / search-rag 链路正常', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'mofei-rag-filetree-'))
  const workspaceFs = {
    async resolve(name, options) { return path.join(options && options.cwd || workspaceRoot, name) },
    async stat(target) { try { const info = await stat(target); return { size: info.size } } catch (error) { return undefined } },
    async readText(target) { return readFile(target, 'utf8') },
    async writeText(target, content) { await writeFile(target, content, 'utf8') },
  }
  const routes = {}
  plugin.apply({ fs: workspaceFs, sandboxPolicy: { workspaceRoot, resolve: () => ({}) }, webServer: { register: (definition) => { routes[definition.path] = definition } }, get: () => undefined, effect: () => {} })
  const workspaceRoute = routes['/api/mofei']
  const workspaceRpc = async (method, args = {}) => {
    let body = ''
    let done = false
    const payload = JSON.stringify({ method, args })
    const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
    const res = { setHeader: () => {}, end: (chunk) => { body = String(chunk) } }
    await workspaceRoute.handler(req, res)
    const parsed = JSON.parse(body)
    if (!parsed.ok) throw new Error(method + ': ' + JSON.stringify(parsed))
    return parsed.value
  }
  let projectId = ''
  try {
    const created = await workspaceRpc('create-project', { title: 'RAG 文件树' })
    projectId = created.project.id
    const { chapter } = await workspaceRpc('create-chapter', { projectId, title: '剑冢' })
    await workspaceRpc('update-chapter', { projectId, chapterId: chapter.id, content: '青锋剑出鞘，剑气纵横三万里。', expectedRevision: chapter.revision })
    // 文件树镜像必须含最新正文（loader 的输入源）
    const base = path.join(workspaceRoot, '.mofei', 'projects', projectId)
    const chapterFile = await readFile(path.join(base, 'chapters', chapter.id + '.md'), 'utf8')
    assert.ok(chapterFile.includes('青锋剑出鞘'), '镜像 .md 含最新正文')

    // 重建索引（v0.28：readContent = fileTreeBodyLoader 直读文件树）
    const built = await workspaceRpc('rag-build-index', { projectId })
    assert.ok(built.builtAt > 0, '索引已构建')
    assert.ok(built.indexedChunks >= 1)
    assert.equal(built.status, 'fresh', '构建后索引与源数据一致')

    // 检索命中正文（loader 与内存一致路径）
    const found = await workspaceRpc('search-rag', { projectId, query: '青锋剑', force: true })
    assert.ok(found.results.length >= 1, '命中正文 chunk')
    const hit = found.results.find((item) => item.text.includes('青锋剑出鞘'))
    assert.ok(hit, 'chunk 正文来自文件树 .md')
    assert.equal(hit.entityType, 'chapter')
    assert.equal(hit.entityId, chapter.id)
    // rag-status 反映索引状态
    const status = await workspaceRpc('rag-status', { projectId })
    assert.equal(status.status, 'fresh')
    assert.ok(status.indexedChunks >= 1)
  } finally {
    if (projectId) { try { await workspaceRpc('delete-project', { projectId }) } catch (error) { /* noop */ } }
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

let failed = 0
for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS ' + name) } catch (error) { failed += 1; console.error('FAIL ' + name); console.error(error && error.stack || error) }
}
console.log(failed === 0 ? '== ALL ' + tests.length + ' PASS ==' : '== ' + failed + ' FAILURES ==')
process.exitCode = failed === 0 ? 0 : 1
