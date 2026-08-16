import assert from 'node:assert/strict'
import { fmtTime, dateKey, countWords } from './workspace-utils.js'

const tests = []
function test(name, fn) { tests.push([name, fn]) }

test('countWords 中文与空白处理', () => {
  assert.equal(countWords('你好世界'), 4)
  assert.equal(countWords(' 你 好 \n世界\t'), 4)
  assert.equal(countWords(''), 0)
  assert.equal(countWords(null), 4) // String(null)='null'（保持 legacy 原行为）
  assert.equal(countWords(123), 3)
})

test('dateKey 补零', () => {
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(dateKey(new Date(2026, 11, 31)), '2026-12-31')
})

test('fmtTime 非法输入安全（不抛错）', () => {
  assert.ok(fmtTime(null).length > 0)
  assert.ok(fmtTime(undefined).length > 0)
  assert.ok(fmtTime(Date.now()).length > 0)
})

let failed = 0
for (const [name, fn] of tests) {
  try { fn(); console.log('PASS ' + name) } catch (error) { failed += 1; console.error('FAIL ' + name); console.error(error && error.stack || error) }
}
console.log(failed === 0 ? '== ALL ' + tests.length + ' PASS ==' : '== ' + failed + ' FAILURES ==')
process.exitCode = failed === 0 ? 0 : 1
