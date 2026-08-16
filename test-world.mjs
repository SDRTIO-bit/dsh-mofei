import assert from 'node:assert/strict'
import { cleanText, normalizeKeys, normalizeWorldEntry, parseWorldInfoJson, selectWorldEntries, buildChapterContext } from './plugin/lib/world.js'

const tests = []

function test(name, fn) { tests.push([name, fn]) }

test('cleanText 清理并截断', () => {
  assert.equal(cleanText('  首都  ·  王都  ', 'x'), '首都 · 王都')
  assert.equal(cleanText('', 'fallback'), 'fallback')
  assert.equal(cleanText(123, 'x'), 'x')
})

test('normalizeKeys 支持数组/分隔字符串/去重', () => {
  assert.deepEqual(normalizeKeys(['林轩', '林轩', '']), ['林轩'])
  assert.deepEqual(normalizeKeys('林轩，苏月、林轩\n青城'), ['林轩', '苏月', '青城'])
  assert.deepEqual(normalizeKeys(null), [])
})

test('normalizeWorldEntry 填充缺省字段', () => {
  const entry = normalizeWorldEntry({ name: ' 青城 ' }, 'world-1', 3)
  assert.equal(entry.id, 'world-1')
  assert.equal(entry.name, '青城')
  assert.deepEqual(entry.keys, [])
  assert.equal(entry.isEnabled, true)
  assert.equal(entry.constant, false)
  assert.equal(entry.order, 3)
})

test('parseWorldInfoJson 解析 ST entries 对象', () => {
  const json = JSON.stringify({
    entries: {
      0: { uid: 0, comment: '林轩', keys: ['林轩', '小轩'], secondary_keys: ['主角'], content: '主角，青城修士。', constant: false, disable: false, order: 1 },
      2: { uid: 2, comment: '青城设定', keys: ['青城'], content: '青城为天下第一仙门。', constant: true, disable: false, order: 0 },
      9: { uid: 9, comment: '禁用条目', content: '不可见。', disable: true, order: 3 },
    },
  })
  const parsed = parseWorldInfoJson(json)
  assert.ok(parsed.entries)
  assert.equal(parsed.entries.length, 3)
  assert.equal(parsed.entries[0].name, '青城设定')
  assert.equal(parsed.entries[0].constant, true)
  assert.deepEqual(parsed.entries[1].keys, ['林轩', '小轩', '主角'])
  assert.equal(parsed.entries[2].isEnabled, false)
})

test('parseWorldInfoJson 拒绝非法输入', () => {
  assert.equal(parseWorldInfoJson('').error, 'EMPTY_TEXT')
  assert.equal(parseWorldInfoJson('{bad').error, 'JSON_PARSE_ERROR')
  assert.equal(parseWorldInfoJson('{"foo":1}').error, 'INVALID_WORLD_INFO')
  assert.equal(parseWorldInfoJson('{"entries":{}}').error, 'EMPTY_ENTRIES')
})

test('selectWorldEntries 按 constant/keys/enabled 激活并限制容量', () => {
  const entries = [
    { id: 'w1', name: '常驻设定', keys: [], content: '常驻内容', isEnabled: true, constant: true, order: 0 },
    { id: 'w2', name: '林轩', keys: ['林轩', '小轩'], content: '主角', isEnabled: true, constant: false, order: 1 },
    { id: 'w3', name: '苏月', keys: ['苏月'], content: '女二', isEnabled: true, constant: false, order: 2 },
    { id: 'w4', name: '禁用', keys: ['林轩'], content: '不可见', isEnabled: false, constant: false, order: 3 },
  ]
  const selected = selectWorldEntries(entries, '林轩来到青城。', { maxEntries: 10, maxChars: 1000 })
  assert.deepEqual(selected.map((e) => e.id), ['w1', 'w2'])
  assert.equal(selected[1].matchedKeys[0], '林轩')
  const capped = selectWorldEntries([{ id: 'w1', name: 'x', keys: [], content: 'a'.repeat(5000), isEnabled: true, constant: true }], '', { maxChars: 100, maxEntryChars: 500 })
  assert.equal(capped[0].content.length, 500)
})

test('buildChapterContext 组装项目/角色/笔记/世界书/前情/章节尾', () => {
  const project = {
    id: 'p1', title: '仙路', description: '青城山', goal: 1000,
    characters: [{ id: 'c1', name: '林轩', description: '主角' }],
    notes: [{ id: 'n1', title: '世界观', content: '青城第一', isLocked: true, isHidden: false }, { id: 'n2', title: '废案', content: '隐藏', isLocked: false, isHidden: true }],
    worldEntries: [{ id: 'w1', name: '林轩', keys: ['林轩'], content: '主角设定', isEnabled: true, constant: false, order: 0 }],
    chapters: [
      { id: 'ch1', title: '第一章', content: '林轩拜师。', order: 0 },
      { id: 'ch2', title: '第二章', content: '林轩下山。'.repeat(1000), order: 1 },
    ],
  }
  const context = buildChapterContext(project, project.chapters[1], { tailChars: 120 })
  assert.equal(context.characters.length, 1)
  assert.equal(context.notes.length, 1)
  assert.equal(context.worldEntries.length, 1)
  assert.equal(context.previousChapters.length, 1)
  assert.ok(context.chapter.content.length <= 200)
  assert.match(context.contextText, /世界书/)
  assert.match(context.contextText, /林轩下山/)
})

let failed = 0
for (const [name, fn] of tests) {
  try { fn(); console.log('PASS ' + name) } catch (error) { failed += 1; console.error('FAIL ' + name); console.error(error) }
}
console.log(failed === 0 ? '== ALL ' + tests.length + ' PASS ==' : '== ' + failed + ' FAILURES ==')
process.exitCode = failed === 0 ? 0 : 1
