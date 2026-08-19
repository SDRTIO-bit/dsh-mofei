import assert from 'node:assert/strict'
import plugin from './plugin/lib/index.js'

const root = 'virtual-role-host'
const files = new Map()
const ctx = {
  fs: {
    async resolve(name, options) { return (options && options.cwd ? options.cwd : root) + '/' + name },
    async stat(target) { return files.has(target) ? { size: files.get(target).length } : undefined },
    async readText(target) { if (!files.has(target)) throw new Error('ENOENT'); return files.get(target) },
    async writeText(target, content) { files.set(target, content) },
  },
  sandboxPolicy: { workspaceRoot: root, resolve: () => ({}) },
  webServer: { register(route) { if (route.path === '/api/mofei') this.route = route; return () => {} } },
  get() { return undefined },
  provide(name, service) { this[name] = service },
  effect() {},
}
plugin.apply(ctx)
const route = ctx.webServer.route
async function rpc(method, args = {}) {
  const payload = JSON.stringify({ method, args })
  let done = false
  let body = ''
  const req = { method: 'POST', [Symbol.asyncIterator]() { return { next: async () => done ? { done: true } : (done = true, { value: payload, done: false }) } } }
  const res = { setHeader() {}, end(value) { body = String(value) } }
  await route.handler(req, res)
  const parsed = JSON.parse(body)
  if (parsed.ok === false) throw new Error(parsed.error)
  return parsed.value
}

const { project } = await rpc('create-project', { title: '角色 Host' })
const initial = await rpc('list-roles', { projectId: project.id })
assert.deepEqual(initial.roles.map((role) => role.id), ['writer', 'reviewer', 'analyzer', 'polisher'])
assert.match((await rpc('read-role', { projectId: project.id, roleId: 'writer' })).role.entries[0].content, /你是 Writer/)
await rpc('save-role', { projectId: project.id, roleId: 'writer', name: 'Writer', entries: [{ name: '覆盖', content: '覆盖正文', order: 0, isEnabled: true }] })
assert.equal((await rpc('read-role', { projectId: project.id, roleId: 'writer' })).role.entries[0].content, '覆盖正文')
assert.equal((await ctx.mofei.compileRolePersona(project.id, 'writer')).persona, '覆盖正文')
assert.deepEqual(JSON.parse(files.get(root + '/.mofei-roles.json')).byProject[project.id].map((role) => role.id), ['writer'])
const reset = await rpc('delete-role', { projectId: project.id, roleId: 'writer' })
assert.equal(reset.resetToBuiltin, true)
assert.match((await ctx.mofei.compileRolePersona(project.id, 'writer')).persona, /你是 Writer/)
console.log('== ROLE HOST PASS ==')
