import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterWorldEntries,
  worldNameConflict,
  toggleAllSelection,
  buildBulkTogglePlan,
  buildBulkDeletePlan,
} from './worldbook-tools.js'

const entry = (id, name, keys, extra = {}) => ({ id, name, keys, content: '', ...extra })

const FIXTURES = [
  entry('a', '魔法学院', ['魔法', '学院'], { isEnabled: true, constant: false }),
  entry('b', '禁忌术式', ['禁忌', '咒术'], { isEnabled: false, constant: true }),
  entry('c', '边境王国', ['边境'], { isEnabled: true }),
  entry('d', '无名', [], { isEnabled: false }),
]

// ---------- filterWorldEntries ----------

test('filter：query 命中 name（大小写不敏感）', () => {
  const latin = [entry('u', 'Alchemy Lab', ['alchemy']), entry('v', 'Rune', ['禁术'])]
  assert.deepEqual(filterWorldEntries(latin, 'ALCHEMY').map((e) => e.id), ['u'])
  assert.deepEqual(filterWorldEntries(FIXTURES, '魔法'), [FIXTURES[0]])
  assert.deepEqual(filterWorldEntries(FIXTURES, '学院'), [FIXTURES[0]])
})

test('filter：query 命中 keys 任一 key', () => {
  assert.deepEqual(filterWorldEntries(FIXTURES, '边境'), [FIXTURES[2]])
  assert.deepEqual(filterWorldEntries(FIXTURES, '咒术').map((e) => e.id), ['b'])
  assert.deepEqual(filterWorldEntries(FIXTURES, '咒').map((e) => e.id), ['b'])
})

test('filter：大小写不敏感命中 name 与 key', () => {
  const latin = [entry('u', 'Alchemy Lab', ['alchemy'])]
  assert.deepEqual(filterWorldEntries(latin, 'ALCHEMY').map((e) => e.id), ['u'])
  assert.deepEqual(filterWorldEntries(FIXTURES, '魔法学院').map((e) => e.id), ['a'])
  assert.deepEqual(filterWorldEntries(FIXTURES, '边').map((e) => e.id), ['c'])
})

test('filter：空 query 返回副本且不改变原数组', () => {
  const out = filterWorldEntries(FIXTURES, '')
  assert.deepEqual(out, FIXTURES)
  assert.notEqual(out, FIXTURES)
  assert.deepEqual(filterWorldEntries(FIXTURES, '   '), FIXTURES)
  assert.deepEqual(filterWorldEntries(FIXTURES, null), FIXTURES)
})

test('filter：非法 / 脏输入安全', () => {
  assert.deepEqual(filterWorldEntries(null, 'x'), [])
  assert.deepEqual(filterWorldEntries(undefined, 'x'), [])
  assert.deepEqual(filterWorldEntries('not-array', 'x'), [])
  assert.deepEqual(filterWorldEntries(42, 'x'), [])
  const dirty = [{ id: 'a', name: '法术', keys: [null, '法术'] }, null, 'junk', { keys: ['x'] }, { name: 123, keys: '法术' }]
  assert.deepEqual(filterWorldEntries(dirty, '法术').map((e) => e.id), ['a'])
})

// ---------- worldNameConflict ----------

test('conflict：同名与大小写不敏感冲突', () => {
  const entries = [entry('1', ' 魔法学院 '), entry('2', 'MAGIC')]
  assert.equal(worldNameConflict(entries, '魔法学院'), entries[0])
  assert.equal(worldNameConflict(entries, ' 魔法学院  '), entries[0])
  assert.equal(worldNameConflict(entries, 'magic'), entries[1])
  assert.equal(worldNameConflict(entries, 'MAGIC'), entries[1])
})

test('conflict：excludeId 跳过自身，编辑时不误报', () => {
  const entries = [entry('1', '魔法学院'), entry('2', '禁忌')]
  assert.equal(worldNameConflict(entries, '魔法学院', '1'), null)
  assert.equal(worldNameConflict(entries, '魔法学院', '2'), entries[0])
})

test('conflict：不存在的名字 / 空名 / 脏输入返回 null', () => {
  assert.equal(worldNameConflict(FIXTURES, '不存在的名字'), null)
  assert.equal(worldNameConflict(FIXTURES, ''), null)
  assert.equal(worldNameConflict(FIXTURES, '   '), null)
  assert.equal(worldNameConflict(FIXTURES, null), null)
  assert.equal(worldNameConflict(null, '魔法学院'), null)
  assert.equal(worldNameConflict(null, '魔法学院', 'n'), null)
  const dirty = [null, 42, { id: 'm', keys: ['x'] }, { id: 'n', name: '魔法学院' }]
  assert.deepEqual(worldNameConflict(dirty, '魔法学院'), { id: 'n', name: '魔法学院' })
})

// ---------- toggleAllSelection ----------

test('toggleAll：全部可见已选 → 清空；否则并集可见 id', () => {
  const entries = FIXTURES
  assert.deepEqual(toggleAllSelection(entries, ['a', 'b'], ['a', 'b']), [])
  assert.deepEqual(toggleAllSelection(entries, new Set(['a', 'b']), ['a', 'b']), [])
  assert.deepEqual(toggleAllSelection(entries, ['a'], ['a', 'b']), ['a', 'b'])
})

test('toggleAll：并集保留已选且去重保序（entries 顺序）', () => {
  const entries = FIXTURES
  assert.deepEqual(toggleAllSelection(entries, ['c', 'a'], ['b']), ['a', 'b', 'c'])
  assert.deepEqual(toggleAllSelection(entries, ['a'], ['a', 'a', 'b', 'b']), ['a', 'b'])
})

test('toggleAll：可见为空时不误清空，返回并集（可保留既有选择）', () => {
  const entries = FIXTURES
  assert.deepEqual(toggleAllSelection(entries, ['a'], []), ['a'])
  assert.deepEqual(toggleAllSelection(entries, [], []), [])
})

test('toggleAll：脏输入安全且返回新数组（不修改入参）', () => {
  const selected = ['a']
  assert.deepEqual(toggleAllSelection(FIXTURES, null, null), [])
  assert.deepEqual(toggleAllSelection(FIXTURES, 'junk', ['x']), [])
  assert.deepEqual(toggleAllSelection(FIXTURES, ['a'], 'junk'), ['a'])
  const fromNull = toggleAllSelection(null, selected, ['b'])
  assert.deepEqual(fromNull, ['a']) // entries 为空：不存在的可见 id 不选中，保留已选
  assert.deepEqual(selected, ['a']) // 入参未被修改
})

// ---------- buildBulkTogglePlan ----------

test('bulkToggle：已同值跳过，只返回需变化条目', () => {
  const entries = [entry('a', 'x', [], { isEnabled: true }), entry('b', 'y', [], { isEnabled: false })]
  assert.deepEqual(buildBulkTogglePlan(entries, ['a', 'b'], true), { entryIds: ['b'], changed: 1 })
  assert.deepEqual(buildBulkTogglePlan(entries, ['a', 'b'], false), { entryIds: ['a'], changed: 1 })
  assert.deepEqual(buildBulkTogglePlan(entries, ['a'], true), { entryIds: [], changed: 0 })
})

test('bulkToggle：undefined isEnabled 视为启用，与目标比较', () => {
  const entries = [entry('a', 'x', [])]
  assert.deepEqual(buildBulkTogglePlan(entries, ['a'], false), { entryIds: ['a'], changed: 1 })
  assert.deepEqual(buildBulkTogglePlan(entries, ['a'], true), { entryIds: [], changed: 0 })
})

test('bulkToggle：去重、跳过不存在 id、保序', () => {
  const entries = [entry('a', 'x', [], { isEnabled: true }), entry('b', 'y', [], { isEnabled: false })]
  assert.deepEqual(buildBulkTogglePlan(entries, ['a', 'a', 'ghost', 'b'], true), { entryIds: ['b'], changed: 1 })
})

test('bulkToggle：脏输入安全返回空计划', () => {
  assert.deepEqual(buildBulkTogglePlan(null, ['a'], true), { entryIds: [], changed: 0 })
  assert.deepEqual(buildBulkTogglePlan([entry('a', 'x', [])], null, true), { entryIds: [], changed: 0 })
  assert.deepEqual(buildBulkTogglePlan([entry('a', 'x', [])], 42, true), { entryIds: [], changed: 0 })
})

// ---------- buildBulkDeletePlan ----------

test('bulkDelete：去重保序、只包含存在 id', () => {
  const entries = [entry('a', 'x', []), entry('b', 'y', [])]
  assert.deepEqual(buildBulkDeletePlan(entries, ['b', 'a', 'a', 'ghost']), { entryIds: ['b', 'a'], count: 2 })
})

test('bulkDelete：支持 Set 输入与条目对象输入', () => {
  const entries = FIXTURES
  assert.deepEqual(buildBulkDeletePlan(entries, new Set(['c', 'b', 'b'])), { entryIds: ['c', 'b'], count: 2 })
  assert.deepEqual(buildBulkDeletePlan(entries, [entry('a', 'x', []), 'd']), { entryIds: ['a', 'd'], count: 2 })
})

test('bulkDelete：全部不存在 → 空计划；脏输入安全', () => {
  assert.deepEqual(buildBulkDeletePlan(FIXTURES, ['ghost1', 'ghost2']), { entryIds: [], count: 0 })
  assert.deepEqual(buildBulkDeletePlan(null, ['a']), { entryIds: [], count: 0 })
  assert.deepEqual(buildBulkDeletePlan(FIXTURES, null), { entryIds: [], count: 0 })
  assert.deepEqual(buildBulkDeletePlan(FIXTURES, 'junk'), { entryIds: [], count: 0 })
})

// ---------- 组合场景 ----------

test('组合：filter → toggle 全选 → bulkToggle 计划', () => {
  const visible = filterWorldEntries(FIXTURES, '法术') // 无命中（FIXTURES 无「法术」）
  assert.deepEqual(visible, [])
  const maybe = filterWorldEntries(FIXTURES, '学院')
  const selected = toggleAllSelection(FIXTURES, [], maybe)
  assert.deepEqual(selected, ['a'])
  const plan = buildBulkTogglePlan(FIXTURES, selected, false)
  assert.deepEqual(plan, { entryIds: ['a'], changed: 1 })
})

test('组合：全选后再次 toggle 清空，删除计划保序', () => {
  const all = toggleAllSelection(FIXTURES, [], FIXTURES.map((e) => e.id))
  assert.deepEqual(all, ['a', 'b', 'c', 'd'])
  assert.deepEqual(toggleAllSelection(FIXTURES, all, ['a', 'c']), []) // 全部可见已选 → 清空
  const plan = buildBulkDeletePlan(FIXTURES, ['d', 'c', 'b', 'a', 'd'])
  assert.deepEqual(plan, { entryIds: ['d', 'c', 'b', 'a'], count: 4 })
})
