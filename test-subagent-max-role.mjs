import assert from 'node:assert/strict'
import subagentMax from './plugin/lib/subagent-max.js'

const requests = []
const role = { id: 'role-8234', name: 'writer', entries: [], defaultInstructions: [] }
const provider = { name: 'spawn' }
const subagents = {
  getProvider: () => provider,
  start: async (_name, request) => {
    requests.push(request)
    return {
      id: 'run-1',
      result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'ok' }] }),
      dispose: async () => {},
    }
  },
}
const mofei = {
  readRole: async (_projectId, roleId) => {
    if (roleId === role.id) return role
    throw new Error('ROLE_NOT_FOUND')
  },
  listRoles: async () => ({ roles: [role] }),
  compileRolePersona: async (_projectId, roleId) => ({ persona: roleId === role.id ? 'project persona' : '' }),
  compileInstructionPersona: async (_projectId, roleId) => ({ persona: roleId === role.id ? 'instruction persona' : '' }),
  resolveSubagentModel: async (_projectId, roleId) => ({ model: roleId === role.id ? 'project-model' : '' }),
}
const registered = {}
const ctx = {
  get(name) {
    if (name === 'tools') return { register(definition) { registered.definition = definition; return () => {} } }
    if (name === 'subagents') return subagents
    if (name === 'mofei') return mofei
    return undefined
  },
  on() {},
}

subagentMax.apply(ctx, { backgroundMode: 'one-shot', roles: { builtin: { persona: 'builtin persona' } } })
const exec = { agent: { id: 'parent', options: {}, session: { header: {} } } }

await registered.definition.execute({ role: 'writer', projectId: 'project-8181', description: 'test', prompt: 'hello', model: 'call-model' }, exec)
assert.equal(requests[0].persona, 'project persona\n\ninstruction persona')
assert.equal(requests[0].agentOptions.model, 'call-model')
assert.match(requests[0].prompt[0].text, /【本次任务｜唯一执行目标】\nhello/)
assert.doesNotMatch(requests[0].prompt[0].text, /【项目上下文｜事实资料】/)

await registered.definition.execute({ role: 'writer', projectId: 'project-8181', description: 'test', context: '章节事实', prompt: '续写一段' }, exec)
assert.match(requests[1].prompt[0].text, /【项目上下文｜事实资料】\n以下内容由中控从墨扉项目读取[\s\S]*章节事实/)
assert.match(requests[1].prompt[0].text, /【本次任务｜唯一执行目标】\n续写一段/)

await registered.definition.execute({ role: 'role-8234', projectId: 'project-8181', description: 'test', prompt: 'hello' }, exec)
assert.equal(requests[2].persona, 'project persona\n\ninstruction persona')
assert.equal(requests[2].agentOptions.model, 'project-model')

await assert.rejects(
  () => registered.definition.execute({ role: 'missing', projectId: 'project-8181', description: 'test', prompt: 'hello' }, exec),
  /unknown role/,
)
await assert.rejects(
  () => registered.definition.execute({ role: 'writer', projectId: 'project-8181', description: 'test', prompt: '  ' }, exec),
  /prompt must not be empty/,
)

console.log('== SUBAGENT ROLE RESOLUTION PASS ==')
