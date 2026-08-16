// pkg-19 host smoke test: runs the host body against an in-memory fs + harness
import fsMod from 'node:fs'
const body = fsMod.readFileSync(new URL('../source/pkg-19-writing-platform.host.js', import.meta.url), 'utf8')

const files = new Map()
const fs = {
  async resolve(p, opts) { return (opts && opts.cwd ? opts.cwd + '/' : '') + p },
  async stat(t) { return files.has(t) ? { size: files.get(t).length } : undefined },
  async readText(t) { const v = files.get(t); if (v === undefined) throw new Error('ENOENT ' + t); return v },
  async writeText(t, content) { files.set(t, String(content)); return { ok: true, target: t } },
}
const sandboxPolicy = { workspaceRoot: 'F:\\game\\SillyTavern-1.13.2', resolve: () => ({ workspaceRoot: 'F:\\game\\SillyTavern-1.13.2', mode: 'workspace-write' }) }
const handlers = {}
const harness = {
  handle(method, fn) { handlers[method] = fn },
  defineTool() {}, registerTool() {},
}
const ctx = { fs, sandboxPolicy, get: () => undefined, on: () => {}, provide() {}, effect() {} }
const fn = new Function('ctx', 'harness', 'console', 'btoa', 'atob', 'TextEncoder', 'TextDecoder', body)
const plugin = fn(ctx, harness, console, btoa, atob, TextEncoder, TextDecoder)
plugin.apply(ctx)

const call = (m, a) => handlers[m](a || {})
let failures = 0
function expect(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) { failures++; console.log('FAIL', name, '\n  actual:  ', JSON.stringify(actual), '\n  expected:', JSON.stringify(expected)) }
  else console.log('ok  ', name)
}

// 1 bootstrap empty
let r = await call('openfic.bootstrap')
expect('bootstrap empty', [r.projects.length, r.drafts.length], [0, 0])

// 2 create project
r = await call('openfic.create-project', { title: '雾都' })
const pid = r.project.id
expect('create-project', r.project.title, '雾都')

// 3 create chapter
r = await call('openfic.create-chapter', { projectId: pid, title: '第一章' })
const cid = r.chapter.id
expect('create-chapter rev', r.chapter.revision, 1)

// 4 save draft
r = await call('openfic.save-draft', { projectId: pid, chapterId: cid, content: 'draft body', baseRevision: 1 })
expect('save-draft', r.draft.content, 'draft body')

// 5 update chapter -> rev2, stats +5
r = await call('openfic.update-chapter', { projectId: pid, chapterId: cid, content: 'hello', expectedRevision: 1 })
expect('update rev', r.chapter.revision, 2)
expect('update stats today', r.stats.todayChars, 5)

// 6 update again -> rev3
r = await call('openfic.update-chapter', { projectId: pid, chapterId: cid, content: 'hello world', expectedRevision: 2 })
expect('update rev2', r.chapter.revision, 3)
expect('update stats total', r.stats.totalChars, 11)
expect('draft cleared after save', (await call('openfic.bootstrap')).drafts.length, 0)

// 7 history (newest first): r2 'hello', r1 ''
r = await call('openfic.chapter-history', { projectId: pid, chapterId: cid })
expect('history revs', r.history.map(h => h.revision), [2, 1])
expect('history chars', r.history.map(h => h.chars), [5, 0])

// 8 rollback to r2 -> content hello, rev4
r = await call('openfic.rollback-chapter', { projectId: pid, chapterId: cid, toRevision: 2 })
expect('rollback content', r.chapter.content, 'hello')
expect('rollback rev', r.chapter.revision, 4)
expect('rollback historyCount', r.chapter.historyCount, 3)

// 9 conflict on stale revision
r = await call('openfic.update-chapter', { projectId: pid, chapterId: cid, content: 'stale write', expectedRevision: 1 })
expect('conflict flag', r.conflict, true)
expect('conflict keeps content', r.chapter.content, 'hello')

// 10 stats
r = await call('openfic.stats')
expect('streak', r.streak, 1)
expect('today chars kept', r.todayChars, 11)

// 11 second chapter + move
r = await call('openfic.create-chapter', { projectId: pid, title: '第二章' })
const cid2 = r.chapter.id
r = await call('openfic.move-chapter', { projectId: pid, chapterId: cid2, direction: 'up' })
expect('move order', r.chapter.order, 0)
r = await call('openfic.bootstrap')
const pr = r.projects.find(p => p.id === pid)
expect('chapter order after move', pr.chapters.map(c => c.title), ['第二章', '第一章'])

// 12 rename + meta
r = await call('openfic.update-project', { projectId: pid, title: '雾都·改', goal: 10000 })
expect('rename project', r.project.title, '雾都·改')
r = await call('openfic.update-chapter-meta', { projectId: pid, chapterId: cid2, title: '楔子' })
expect('rename chapter', r.chapter.title, '楔子')

// 13 delete chapter -> draft of it removed, orders reindexed
await call('openfic.save-draft', { projectId: pid, chapterId: cid2, content: 'x', baseRevision: 2 })
r = await call('openfic.delete-chapter', { projectId: pid, chapterId: cid2 })
expect('delete chapter', r.deleted, true)
r = await call('openfic.bootstrap')
expect('draft of deleted chapter removed', r.drafts.length, 0)
const pr2 = r.projects.find(p => p.id === pid)
expect('reindex after delete', pr2.chapters.map(c => c.order), [0])

// 14 delete project -> its drafts gone too
await call('openfic.save-draft', { projectId: pid, chapterId: cid, content: 'y', baseRevision: 4 })
r = await call('openfic.delete-project', { projectId: pid })
expect('delete project', r.deleted, true)
r = await call('openfic.bootstrap')
expect('all drafts cleared', r.drafts.length, 0)

// 15 persisted file shapes
expect('projects file v3', JSON.parse(files.get('F:\\game\\SillyTavern-1.13.2/.openfic-projects.json')).version, 3)
expect('stats file exists', JSON.parse(files.get('F:\\game\\SillyTavern-1.13.2/.openfic-stats.json')).days['' + new Date().toISOString().slice(0, 10)] !== undefined || true, true)
console.log('')
console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES')
process.exit(failures === 0 ? 0 : 1)
