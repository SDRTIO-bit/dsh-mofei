import assert from 'node:assert/strict'
import {
  normalizeSummaryStore,
  chapterSummaryView,
  isChapterSummaryStale,
  applyChapterSummary,
  buildRangeGroups,
  applyRangeSummary,
  planSummaryBatch,
} from './plugin/lib/summary.js'

const tests = []
function test(name, fn) { tests.push([name, fn]) }

// 第 1 项：normalizeSummaryStore（null / 脏数据）得到安全空 store
test('normalizeSummaryStore null/脏数据 -> 安全空 store', () => {
  const fromNull = normalizeSummaryStore(null)
  assert.deepEqual(fromNull, { version: 1, chapters: {}, ranges: [] })
  const fromUndefined = normalizeSummaryStore(undefined)
  assert.deepEqual(fromUndefined, { version: 1, chapters: {}, ranges: [] })
  // 非法值：字符串/数字/数组/null 原型等一律回落为空 store
  assert.deepEqual(normalizeSummaryStore('junk'), { version: 1, chapters: {}, ranges: [] })
  assert.deepEqual(normalizeSummaryStore(42), { version: 1, chapters: {}, ranges: [] })

  // 脏数据：错误类型字段应被修正而非抛异常或泄漏垃圾字段
  const dirty = normalizeSummaryStore({
    version: 99,
    chapters: {
      ok: { summary: 123, chapterRevision: '2', updatedAt: 'x' },
      ['__proto__']: { summary: 'pollute', chapterRevision: 1, updatedAt: 1 },
      'bad!': { summary: 'x', chapterRevision: 1, updatedAt: 1 },
      arr: undefined,
    },
    ranges: [{ id: 'r1', title: '区间一', chapterIds: ['c1', 2, 'c1'], summary: 5, updatedAt: 'y' }, { id: '', title: 'junk', chapterIds: [] }],
  })
  assert.equal(dirty.version, 1)
  assert.equal(typeof dirty.chapters, 'object')
  // __proto__/constructor 及其它非法键/非对象值一律不入库（检查自有键，而非原型链）
  assert.ok(!Object.prototype.hasOwnProperty.call(dirty.chapters, '__proto__'))
  assert.ok(!Object.prototype.hasOwnProperty.call(dirty.chapters, 'constructor'))
  assert.ok(!Object.prototype.hasOwnProperty.call(dirty.chapters, 'prototype'))
  assert.ok(!Object.prototype.hasOwnProperty.call(dirty.chapters, 'bad!'))
  // undefined 值仍作为合法键被规范化为空条目（不崩溃，字段齐全）
  assert.deepEqual(dirty.chapters['arr'], { summary: '', chapterRevision: 0, updatedAt: 0 })
  // 合法条目被规范化：summary 强制 string，非数字 revision 归 0，时间戳归 0（防御性，落后即过期）
  assert.deepEqual(dirty.chapters['ok'], { summary: '123', chapterRevision: 0, updatedAt: 0 })
  // ranges 只保留 id 非空且字段齐全的条目
  assert.equal(dirty.ranges.length, 1)
  assert.deepEqual(dirty.ranges[0], { id: 'r1', title: '区间一', chapterIds: ['c1'], summary: '5', updatedAt: 0 })
  // 无 prototype 污染的恶意 JSON
  const evil = normalizeSummaryStore(JSON.parse('{"chapters":{"__proto__":{"polluted":true}}}'))
  assert.deepEqual(evil, { version: 1, chapters: {}, ranges: [] })
  assert.equal({}.polluted, undefined)
})

// 第 3 项：isChapterSummaryStale 四个分支
test('isChapterSummaryStale 缺条目/revision 不匹配/超期/新鲜', () => {
  const chapter = { id: 'c1', revision: 3 }
  assert.equal(isChapterSummaryStale(null, chapter), true)
  assert.equal(isChapterSummaryStale(undefined, chapter), true)
  assert.equal(isChapterSummaryStale({ summary: 's', chapterRevision: 2, updatedAt: Date.now() }, chapter), true)
  assert.equal(isChapterSummaryStale({ summary: 's', chapterRevision: 3, updatedAt: Date.now() - 31 * 86400e3 - 1 }, chapter), true)
  assert.equal(isChapterSummaryStale({ summary: 's', chapterRevision: 3, updatedAt: Date.now() }, chapter), false)
  // 自定义 maxAgeDays
  assert.equal(isChapterSummaryStale({ summary: 's', chapterRevision: 3, updatedAt: Date.now() - 2 * 86400e3 }, chapter, { maxAgeDays: 1 }), true)
  assert.equal(isChapterSummaryStale({ summary: 's', chapterRevision: 3, updatedAt: Date.now() - 2 * 86400e3 }, chapter, { maxAgeDays: 5 }), false)
})

// 第 2 项：applyChapterSummary 不可变写入
test('applyChapterSummary 不可变 + 嵌套对象不被修改', () => {
  const original = normalizeSummaryStore({ chapters: { c1: { summary: 'old', chapterRevision: 1, updatedAt: 1000 } }, ranges: [{ id: 'r1', title: 'T', chapterIds: ['c1'], summary: 'rs', updatedAt: 9 }] })
  const snapshot = JSON.parse(JSON.stringify(original))
  const result = applyChapterSummary(original, 'c2', 5, '  new  ')
  // 原 store 未被改动（含嵌套 chapters 与其条目、ranges 数组及其条目）
  assert.deepEqual(original, snapshot)
  assert.equal(original.chapters.c1.summary, 'old')
  assert.equal(original.chapters.c1.chapterRevision, 1)
  // 返回新 store，引用不同，且保留了旧条目
  assert.notEqual(result, original)
  assert.notEqual(result.chapters, original.chapters)
  assert.notEqual(result.ranges, original.ranges)
  assert.deepEqual(result.chapters.c1, { summary: 'old', chapterRevision: 1, updatedAt: 1000 })
  assert.equal(result.chapters.c2.summary, '  new  ')
  assert.equal(result.chapters.c2.chapterRevision, 5)
  assert.ok(result.chapters.c2.updatedAt >= Date.now() - 1000)
  // ranges 同样深拷贝，原嵌套对象不受后续修改影响
  result.chapters.c1.summary = 'mutated'
  result.ranges[0].title = 'mutated'
  assert.equal(original.chapters.c1.summary, 'old')
  assert.equal(original.ranges[0].title, 'T')
})

// 第 2.1 项（回归）：applyChapterSummary 必须能覆盖已有章节条目
test('applyChapterSummary 覆盖已有条目并更新 chapterRevision/updatedAt', () => {
  const original = normalizeSummaryStore({ chapters: { c1: { summary: 'old', chapterRevision: 1, updatedAt: 1000 } } })
  const result = applyChapterSummary(original, 'c1', 2, 'new')
  assert.equal(result.chapters.c1.summary, 'new')
  assert.equal(result.chapters.c1.chapterRevision, 2)
  assert.ok(result.chapters.c1.updatedAt > 1000)
  // 原对象仍保持不变
  assert.equal(original.chapters.c1.summary, 'old')
  assert.equal(original.chapters.c1.chapterRevision, 1)
})

// 第 4 项：buildRangeGroups 分组/排序/空数组/单章
test('buildRangeGroups 3 章 size=2 -> [2,1] 两组且按 order 排序', () => {
  const chapters = [{ id: 'c1', order: 0 }, { id: 'c2', order: 1 }, { id: 'c3', order: 2 }]
  const groups = buildRangeGroups(chapters, 2)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].id, 'range-c1-c2')
  assert.equal(groups[0].title, '第1-2章')
  assert.deepEqual(groups[0].chapterIds, ['c1', 'c2'])
  assert.equal(groups[1].id, 'range-c3-c3')
  assert.equal(groups[1].title, '第3-3章')
  assert.deepEqual(groups[1].chapterIds, ['c3'])
})

test('buildRangeGroups 乱序输入先排序 / 空数组 -> [] / 单章', () => {
  const shuffled = [{ id: 'c3', order: 2 }, { id: 'c1', order: 0 }, { id: 'c2', order: 1 }]
  const groups = buildRangeGroups(shuffled, 2)
  assert.deepEqual(groups.map((g) => g.chapterIds), [['c1', 'c2'], ['c3']])
  assert.deepEqual(groups.map((g) => g.title), ['第1-2章', '第3-3章'])
  // 原始数组不被改写（不就地排序）
  assert.equal(shuffled[0].id, 'c3')

  assert.deepEqual(buildRangeGroups([], 2), [])
  assert.deepEqual(buildRangeGroups(null, 2), [])

  const single = [{ id: 'only', order: 4 }]
  const oneGroup = buildRangeGroups(single, 10)
  assert.equal(oneGroup.length, 1)
  assert.equal(oneGroup[0].id, 'range-only-only')
  assert.equal(oneGroup[0].title, '第5-5章') // 首尾同号是预期行为

  // 缺 order 视为 0 且保持稳定
  const missing = [{ id: 'a' }, { id: 'b', order: 0 }, { id: 'c', order: 1 }]
  assert.deepEqual(buildRangeGroups(missing, 10).map((g) => g.chapterIds), [['a', 'b', 'c']])
})

// 第 5 项：applyRangeSummary upsert 与 updatedAt
test('applyRangeSummary upsert + updatedAt 更新 + 不可变', () => {
  const store = normalizeSummaryStore({ ranges: [{ id: 'range-c1-c2', title: '第1-2章', chapterIds: ['c1', 'c2'], summary: 'r0', updatedAt: 100 }] })
  const snapshot = JSON.parse(JSON.stringify(store))
  const before = Date.now()
  const updated = applyRangeSummary(store, 'range-c1-c2', ['c1', 'c2', 'c3'], 'r1')
  assert.equal(updated.ranges.length, 1)
  assert.equal(updated.ranges[0].summary, 'r1')
  assert.equal(updated.ranges[0].title, '第1-2章')
  assert.deepEqual(updated.ranges[0].chapterIds, ['c1', 'c2', 'c3'])
  assert.ok(updated.ranges[0].updatedAt >= before && updated.ranges[0].updatedAt <= Date.now())
  // 原 store 未变
  assert.deepEqual(store, snapshot)
  assert.equal(store.ranges[0].summary, 'r0')

  const added = applyRangeSummary(updated, 'range-c3-c4', ['c4', 'c4', 'c5'], 'r2')
  assert.equal(added.ranges.length, 2)
  const fresh = added.ranges.find((r) => r.id === 'range-c3-c4')
  assert.ok(fresh)
  assert.equal(fresh.title, 'range-c3-c4')
  assert.equal(fresh.summary, 'r2')
  assert.deepEqual(fresh.chapterIds, ['c4', 'c5']) // 去重
})

// 第 6 项：planSummaryBatch 正确分 stale/fresh 且按 order
test('planSummaryBatch 分 stale/fresh 且保持 order 排序', () => {
  const now = Date.now()
  const chapters = [
    { id: 'c4', order: 3, revision: 1 },
    { id: 'c2', order: 1, revision: 1 }, // fresh
    { id: 'c1', order: 0, revision: 1 }, // fresh
    { id: 'c3', order: 2, revision: 2 }, // revision 不匹配
    { id: 'c5', order: 4, revision: 1 }, // 缺条目
    { id: 'c6', order: 5, revision: 1 }, // fresh
  ]
  const store = normalizeSummaryStore({
    chapters: {
      c1: { summary: 'a', chapterRevision: 1, updatedAt: now },
      c2: { summary: 'b', chapterRevision: 1, updatedAt: now },
      c3: { summary: 'old', chapterRevision: 1, updatedAt: now },
      c6: { summary: 'f', chapterRevision: 1, updatedAt: now },
      c7: { summary: 'orphan', chapterRevision: 1, updatedAt: now },
    },
  })
  const plan = planSummaryBatch(chapters, store)
  assert.equal(plan.total, 6)
  assert.deepEqual(plan.stale.map((c) => c.id), ['c3', 'c4', 'c5'])
  assert.deepEqual(plan.fresh.map((c) => c.id), ['c1', 'c2', 'c6'])
  // 原数组不被改写
  assert.equal(chapters[0].id, 'c4')
})

// 第 7 项：性能 1000 章 planSummaryBatch < 200ms
test('planSummaryBatch 1000 章 < 200ms', () => {
  const now = Date.now()
  const chapters = []
  const chaptersMap = {}
  for (let i = 0; i < 1000; i++) {
    chapters.push({ id: 'c' + i, order: 999 - i, revision: 7 })
    chaptersMap['c' + i] = { summary: 's', chapterRevision: 7, updatedAt: now }
  }
  const store = { version: 1, chapters: chaptersMap, ranges: [] }
  const start = performance.now()
  const plan = planSummaryBatch(chapters, store)
  const elapsed = performance.now() - start
  assert.equal(plan.total, 1000)
  assert.equal(plan.stale.length, 0)
  assert.equal(plan.fresh.length, 1000)
  assert.ok(elapsed < 200, 'elapsed ' + elapsed + 'ms should be < 200ms')
})

// 第 1 项补充：chapterSummaryView 行为
test('chapterSummaryView 返回条目或 null', () => {
  const store = normalizeSummaryStore({ chapters: { c1: { summary: 's', chapterRevision: 1, updatedAt: 5 } } })
  assert.deepEqual(chapterSummaryView(store, 'c1'), { summary: 's', chapterRevision: 1, updatedAt: 5 })
  assert.equal(chapterSummaryView(store, 'missing'), null)
  assert.equal(chapterSummaryView(null, 'c1'), null)
})

let failed = 0
for (const [name, fn] of tests) {
  try { fn(); console.log('PASS ' + name) } catch (error) { failed += 1; console.error('FAIL ' + name); console.error(error) }
}
console.log(failed === 0 ? '== ALL ' + tests.length + ' PASS ==' : '== ' + failed + ' FAILURES ==')
process.exitCode = failed === 0 ? 0 : 1
