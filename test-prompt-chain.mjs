import assert from 'node:assert/strict'
import { normalizeChainStore, compilePromptChain, promptChainView } from './plugin/lib/prompt-chain.js'

const tests = []
function test(name, fn) { tests.push([name, fn]) }

test('normalizeChainStore 非对象/undefined 归一为空 store', () => {
  const empty = normalizeChainStore(undefined)
  assert.deepEqual(empty, { version: 1, byProject: {} })
  assert.deepEqual(normalizeChainStore(null), { version: 1, byProject: {} })
  assert.deepEqual(normalizeChainStore('bogus'), { version: 1, byProject: {} })
  assert.deepEqual(normalizeChainStore(42), { version: 1, byProject: {} })
})

test('normalizeChainStore byProject 非对象时归一为空', () => {
  assert.deepEqual(normalizeChainStore({ byProject: 'x' }), { version: 1, byProject: {} })
  assert.deepEqual(normalizeChainStore({ byProject: [1, 2] }), { version: 1, byProject: {} })
})

test('normalizeChainStore 链列表非数组被丢弃', () => {
  const store = normalizeChainStore({ byProject: { p1: 'not-an-array', p2: [{ id: 'c1', name: '链', content: '正文' }] } })
  assert.deepEqual(Object.keys(store.byProject), ['p2'])
  assert.equal(store.byProject.p2.length, 1)
})

test('normalizeChainStore 条目脏字段修复（缺字段/非法类型）', () => {
  const store = normalizeChainStore({
    byProject: {
      p1: [
        { id: 'c1', name: 42, content: { a: 1 }, updatedAt: 'now' },
        { name: '无id', content: '应被丢弃' },
        { id: 'c2', name: '正常', content: '正文', updatedAt: 1700000000000, extra: 'ignored' },
      ],
    },
  })
  assert.equal(store.byProject.p1.length, 2)
  assert.deepEqual(store.byProject.p1[0], { id: 'c1', name: '', content: '', updatedAt: 0 })
  assert.deepEqual(store.byProject.p1[1], { id: 'c2', name: '正常', content: '正文', updatedAt: 1700000000000 })
  assert.equal(store.byProject.p1[1].extra, undefined)
})

test('normalizeChainStore 拒绝原型污染键', () => {
  const store = normalizeChainStore({ byProject: { __proto__: [], constructor: [], prototype: [{ id: 'p' }] } })
  assert.deepEqual(store, { version: 1, byProject: {} })
  assert.equal(({}).polluted, undefined)
})

test('normalizeChainStore 非法 updatedAt 归 0（负数/超界）', () => {
  const store = normalizeChainStore({ byProject: { p1: [{ id: 'a', updatedAt: -5 }, { id: 'b', updatedAt: 1e16 }] } })
  assert.equal(store.byProject.p1[0].updatedAt, 0)
  assert.equal(store.byProject.p1[1].updatedAt, 0)
})

test('compilePromptChain 非字符串模板返回空串', () => {
  assert.equal(compilePromptChain(null), '')
  assert.equal(compilePromptChain(123), '')
  assert.equal(compilePromptChain({}), '')
  assert.equal(compilePromptChain(undefined, {}), '')
})

test('compilePromptChain 单个宏替换', () => {
  assert.equal(compilePromptChain('项目：{{project}}', { project: '墨扉' }), '项目：墨扉')
})

test('compilePromptChain 全部 8 个宏按顺序替换（含重复出现）', () => {
  const template = '{{project}}|{{chapter}}|{{chapterText}}|{{selected}}|{{characters}}|{{world}}|{{notes}}|{{instruction}}|再来一次 {{project}}'
  const context = { project: 'P', chapter: 'C', chapterText: 'T', selected: 'S', characters: 'R', world: 'W', notes: 'N', instruction: 'I' }
  assert.equal(compilePromptChain(template, context), 'P|C|T|S|R|W|N|I|再来一次 P')
})

test('compilePromptChain 未提供变量用空串', () => {
  // 受支持的 8 个宏未在 context 提供时替换为空串
  assert.equal(compilePromptChain('A{{project}}B{{chapter}}C{{world}}D', {}), 'ABCD')
  assert.equal(compilePromptChain('{{project}}', {}), '')
  assert.equal(compilePromptChain('{{instruction}}{{notes}}', {}), '')
})

test('compilePromptChain 未知宏（不在 8 个内）原样保留', () => {
  assert.equal(compilePromptChain('{{project}}{{bogus}}', { project: 'P' }), 'P{{bogus}}')
})

test('compilePromptChain 上下文非对象按空处理', () => {
  assert.equal(compilePromptChain('{{project}}', null), '')
  assert.equal(compilePromptChain('{{project}}x', 'str'), 'x')
})

test('compilePromptChain 长文本与相邻宏', () => {
  const long = '字'.repeat(10000)
  const out = compilePromptChain('{{chapterText}}', { chapterText: long })
  assert.equal(out, long)
  assert.equal(compilePromptChain('{{project}}{{chapter}}', { project: '甲', chapter: '乙' }), '甲乙')
})

test('promptChainView 只返回四个字段', () => {
  const view = promptChainView({ id: 'c1', name: '链名', content: '正文', updatedAt: 5, extra: true })
  assert.deepEqual(view, { id: 'c1', name: '链名', content: '正文', updatedAt: 5 })
})

test('promptChainView 脏输入归一化', () => {
  assert.deepEqual(promptChainView(null), { id: '', name: '', content: '', updatedAt: 0 })
  assert.deepEqual(promptChainView({ id: 'x', name: 7 }), { id: 'x', name: '', content: '', updatedAt: 0 })
})

let failed = 0
for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS ' + name) } catch (error) { failed += 1; console.error('FAIL ' + name); console.error(error && error.stack || error) }
}
console.log(failed === 0 ? '== ALL ' + tests.length + ' PASS ==' : '== ' + failed + ' FAILURES ==')
process.exitCode = failed === 0 ? 0 : 1
