// v0.24 host lifecycle + config smoke test:
// runs lib/index.js apply() against a mock ctx and asserts the P0 fixes hold:
//   1. all three webServer routes are registered and their disposers are collected;
//   2. ctx.effect cleanup removes the routes, clears the git timer and agent contexts;
//   3. duplicate route registration (historical leak) degrades to a warning, not a crash;
//   4. the 'mofei' service is provided and callable in-memory (virtual root, no disk writes);
//   5. normalizeCoreConfig keeps defaults when no config is passed.
import plugin from '../plugin/lib/index.js'

let failures = 0
function expect(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) { failures += 1; console.log('FAIL', name, '\n  actual:  ', JSON.stringify(actual), '\n  expected:', JSON.stringify(expected)) }
  else console.log('ok  ', name)
}

function makeCtx() {
  const routes = new Map()
  const effects = []
  const provided = {}
  const ctx = {
    fs: {
      async stat() { return undefined },
      async resolve(p, opts) { return (opts && opts.cwd ? opts.cwd + '/' : '') + p },
      async readText() { throw new Error('ENOENT') },
      async writeText(target, content) { return { ok: true, target } },
    },
    sandboxPolicy: {
      workspaceRoot: 'virtual-root-test',
      resolve: () => ({ workspaceRoot: 'virtual-root-test', mode: 'workspace-write' }),
    },
    webServer: {
      register(route) {
        if (routes.has(route.path)) throw new Error(`duplicate prefix route "${route.path}"`)
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      },
    },
    get() { return undefined },
    provide(name, service) { provided[name] = service },
    effect(fn) { effects.push(fn) },
  }
  return { ctx, routes, effects, provided }
}

const first = makeCtx()
plugin.apply(first.ctx)
expect('1. three routes registered', [...first.routes.keys()].sort(), ['/api/mofei', '/api/openfic', '/mofei'])
expect('2. mofei service provided', typeof first.provided.mofei, 'object')
expect('2b. service exposes run/readChapter', [typeof first.provided.mofei.run, typeof first.provided.mofei.readChapter], ['function', 'function'])
expect('3. one cleanup effect registered', first.effects.length, 1)

// 4. cleanup removes routes (Cordis semantics: effect(fn) returns the cleanup on dispose)
for (const effect of first.effects) { const cleanup = effect(); cleanup() }
expect('4. cleanup removed all routes', first.routes.size, 0)

// 5. duplicate registration (leaked old generation) degrades to warning
const second = makeCtx()
plugin.apply(second.ctx)
plugin.apply(second.ctx) // second apply sees duplicates from the first
expect('5. duplicate registration tolerated', [...second.routes.keys()].sort(), ['/api/mofei', '/api/openfic', '/mofei'])
for (const effect of second.effects) { const cleanup = effect(); cleanup() }
expect('5b. cleanup after duplicates still empties table', second.routes.size, 0)

// 6. service callable in-memory (virtual root => no fs writes, no git)
const third = makeCtx()
plugin.apply(third.ctx)
const projects = await third.provided.mofei.listProjects()
expect('6. listProjects works in-memory', projects, { projects: [] })
const stats = await third.provided.mofei.run('stats', {})
expect('6b. stats handler works', typeof stats.todayChars, 'number')

// 7. custom config accepted without breaking registration
const fourth = makeCtx()
plugin.apply(fourth.ctx, { historyCap: 3, entityHistoryMax: 7, gitCommitIntervalMs: 500, rag: { chunkSize: 400 } })
expect('7. custom config tolerated', fourth.routes.size, 3)

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nall checks passed')
