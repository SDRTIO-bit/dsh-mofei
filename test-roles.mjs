import assert from 'node:assert/strict'
import {
  MOFEI_BUILTIN_ROLES,
  builtinRoleConfig,
  compileRolePersona,
  findEffectiveRole,
  mergeEffectiveRoles,
  roleDetailView,
  roleSummaryView,
} from './plugin/lib/roles.js'

const defaults = mergeEffectiveRoles([])
assert.deepEqual(defaults.map((role) => role.id), ['writer', 'reviewer', 'analyzer', 'polisher'])
assert.equal(defaults.every((role) => role.source === 'builtin' && role.isBuiltin && !role.isOverridden), true)
assert.equal(defaults.every((role) => role.effort === 'high'), true)
assert.match(compileRolePersona(defaults[0]), /你是 Writer/)

const source = [{
  id: 'writer',
  name: '项目 Writer',
  entries: [{ name: '覆盖', content: '只使用项目覆盖', order: 0, isEnabled: true }],
  defaultInstructions: [{ instructionId: 'mofei-writing', order: 10, isEnabled: true }],
  updatedAt: 123,
}, {
  id: 'fact-checker',
  name: '事实核对',
  entries: [{ name: '核对', content: '核对事实', order: 0, isEnabled: true }],
  defaultInstructions: [],
  updatedAt: 456,
}]
const before = JSON.stringify(source)
const merged = mergeEffectiveRoles(source)
assert.equal(JSON.stringify(source), before, '合并不得修改持久化输入')
assert.deepEqual(merged.map((role) => role.id), ['writer', 'reviewer', 'analyzer', 'polisher', 'fact-checker'])

const writer = findEffectiveRole(source, 'writer')
assert.equal(compileRolePersona(writer), '只使用项目覆盖')
assert.doesNotMatch(compileRolePersona(writer), /你是 Writer/)
assert.deepEqual(
  { source: writer.source, isBuiltin: writer.isBuiltin, isOverridden: writer.isOverridden, canReset: writer.canReset },
  { source: 'project', isBuiltin: true, isOverridden: true, canReset: true },
)
assert.equal(findEffectiveRole(source, 'reviewer').source, 'builtin')
assert.equal(findEffectiveRole(source, 'fact-checker').isBuiltin, false)

const disabledOverride = findEffectiveRole([{ id: 'writer', name: 'Writer', entries: [{ name: '关闭', content: '不应注入', order: 0, isEnabled: false }] }], 'writer')
assert.equal(compileRolePersona(disabledOverride), '', '空覆盖不能回退内置 persona')

const summary = roleSummaryView(writer)
const detail = roleDetailView(writer)
assert.equal(summary.source, 'project')
assert.equal(summary.isOverridden, true)
assert.equal(detail.entries[0].source, 'project')
assert.equal(detail.canReset, true)

const runtime = builtinRoleConfig()
assert.deepEqual(Object.keys(runtime), MOFEI_BUILTIN_ROLES.map((role) => role.id))
assert.equal(runtime.writer.persona, MOFEI_BUILTIN_ROLES[0].persona)

console.log('== ROLE CATALOG PASS ==')
