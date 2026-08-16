// project-grid.test.mjs —— 纯 node 测试（不依赖 React，只测纯函数导出）。
import { filterProjects, sortProjects } from './project-grid.js'

let passed = 0
let failed = 0

function check(name, condition, detail) {
  if (condition) {
    passed++
    console.log('PASS ' + name)
  } else {
    failed++
    console.log('FAIL ' + name + (detail ? ' —— ' + detail : ''))
  }
}

function assertIds(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  check(name, a === e, '期望 ' + e + '，实际 ' + a)
}

// 参考实现：直接用 localeCompare('zh-Hans-CN') 排序，用于校验实现确实用了中文 locale
function zhReference(projects) {
  return projects.slice().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN')).map((p) => p.id)
}

// 测试数据
const A = { id: 'a', title: '剑来', description: '少年持剑，走出骊珠洞天', goal: 100, chapters: [], updated: 300, created: 100 }
const B = { id: 'b', title: 'Beta 写作集', description: 'a fuzzy project about writing', goal: 0, chapters: [], updated: '', created: '' }
const C = { id: 'c', title: '长安古意', description: '盛世之下暗流涌动', goal: 50, chapters: [], updated: 200, created: '' }
const D = { id: 'd', title: '阿尔法', description: '' }

// 1. 标题过滤：大小写不敏感子串
assertIds('filter by title (中文)', filterProjects([A, B, C, D], '剑').map((p) => p.id), ['a'])
assertIds('filter by title case-insensitive', filterProjects([A, B, C, D], 'bEtA').map((p) => p.id), ['b'])

// 2. 简介过滤 + 大小写不敏感
assertIds('filter by description', filterProjects([A, B, C, D], 'writing').map((p) => p.id), ['b'])
assertIds('filter by description case-insensitive', filterProjects([A, B, C, D], 'WRITING').map((p) => p.id), ['b'])

// 3. 模糊（子序列）匹配：查询字符无需连续出现
assertIds('fuzzy subsequence match (latin title)', filterProjects([{ id: 'f', title: 'JianLai', description: 'novel' }], 'jla').map((p) => p.id), ['f'])
assertIds('fuzzy subsequence match (中文 description)', filterProjects([A], '少剑').map((p) => p.id), ['a']) // 少…剑 顺序命中「少年持剑」

// 4. 空 query / 空输入 / 非法输入不抛错
assertIds('empty query returns full copy', filterProjects([A, B], '').map((p) => p.id), ['a', 'b'])
assertIds('whitespace query returns full copy', filterProjects([A, B], '   ').map((p) => p.id), ['a', 'b'])
assertIds('filter undefined input', filterProjects(undefined, 'x').map((p) => p.id), [])
assertIds('filter null input', filterProjects(null, 'x').map((p) => p.id), [])
assertIds('filter non-array input', filterProjects({}, 'x').map((p) => p.id), [])
assertIds('filter null query returns full copy', filterProjects([A, B], null).map((p) => p.id), ['a', 'b'])
assertIds('filter empty array input', filterProjects([], 'x').map((p) => p.id), [])

// 5. 标题排序：与 localeCompare('zh-Hans-CN') 参考实现一致（证明用了中文 locale）
assertIds('sort by title matches zh-Hans-CN locale', sortProjects([C, A, D, B], 'title').map((p) => p.id), zhReference([C, A, D, B]))

// 6. updated 排序：数值降序（最近在前）
assertIds('sort by updated desc (both present)', sortProjects([C, A], 'updated').map((p) => p.id), ['a', 'c'])

// 7. updated 字段缺失 → 该对回退为按标题排序
assertIds('sort by updated missing fallback to title (both missing)', sortProjects([C, D], 'updated').map((p) => p.id), zhReference([C, D]))

// 8. created 排序 + 未知 key 回退标题排序
assertIds('sort by created desc (both present)', sortProjects([A, { id: 'x', title: '测试', created: 500 }], 'created').map((p) => p.id), ['x', 'a'])
assertIds('sort unknown key falls back to title', sortProjects([C, A, D], 'bogus').map((p) => p.id), zhReference([C, A, D]))

// 9. 排序不修改入参；空输入不抛错
const original = [C, A]
sortProjects(original, 'title')
assertIds('sort does not mutate input', original.map((p) => p.id), ['c', 'a'])
assertIds('sort undefined input', sortProjects(undefined, 'title').map((p) => p.id), [])
assertIds('sort null input', sortProjects(null, 'updated').map((p) => p.id), [])
assertIds('sort non-array input', sortProjects('x', 'title').map((p) => p.id), [])

// 结果汇总
console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exit(1)
else console.log('ALL TESTS PASSED')
