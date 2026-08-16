// project-page.test.mjs —— 纯 node 测试（不依赖 React，只测纯函数导出）。
import { normalizeDescription, isDescriptionDirty } from './project-page.js'

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

function eq(name, actual, expected) {
  check(name, actual === expected, '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
}

// 1. normalizeDescription：空值 / 非字符串输入安全
eq('normalize empty string', normalizeDescription(''), '')
eq('normalize undefined', normalizeDescription(undefined), '')
eq('normalize null', normalizeDescription(null), '')
eq('normalize non-string input (number)', normalizeDescription(123), '123')

// 2. normalizeDescription：去首尾空白
eq('normalize trims leading/trailing whitespace', normalizeDescription('  一句话简介  '), '一句话简介')
eq('normalize trims only edges, keeps inner spaces', normalizeDescription('  a  b  '), 'a  b')

// 3. normalizeDescription：恰好 500 码点不截断
eq('normalize exactly 500 code points unchanged', normalizeDescription('x'.repeat(500)).length, 500)

// 4. normalizeDescription：超过 500 码点截断到 500
eq('normalize truncates over 500 code points', normalizeDescription('y'.repeat(501)).length, 500)

// 5. normalizeDescription：emoji 多码点按码点截断（不拆散代理对）
const emojiOver = '🙂'.repeat(600)
eq('normalize emoji-only truncates to 500 code points', Array.from(normalizeDescription(emojiOver)).length, 500)
const emojiMixed = ('🙂'.repeat(260)) + ('a'.repeat(260))
const emojiNormalized = normalizeDescription(emojiMixed)
eq('normalize mixed emoji+ascii keeps 500 code points', Array.from(emojiNormalized).length, 500)
check('normalize mixed emoji+ascii does not split surrogate pair (ends with ascii or full emoji)',
  emojiNormalized.endsWith('a') || emojiNormalized.endsWith('🙂'), '结果尾部：' + JSON.stringify(emojiNormalized.slice(-4)))

// 6. isDescriptionDirty：同值不脏
eq('dirty false for identical values', isDescriptionDirty({ description: 'hello' }, 'hello'), false)
eq('dirty false when only whitespace differs', isDescriptionDirty({ description: ' hello ' }, 'hello'), false)

// 7. isDescriptionDirty：不同值脏
eq('dirty true for different values', isDescriptionDirty({ description: 'a' }, 'b'), true)
eq('dirty true when draft adds trailing whitespace around new text', isDescriptionDirty({ description: 'a' }, '  a2 '), true)

// 8. isDescriptionDirty：undefined project 安全（视为空简介）
eq('dirty true when project undefined and draft non-empty', isDescriptionDirty(undefined, 'draft'), true)
eq('dirty false when project undefined and draft empty', isDescriptionDirty(undefined, ''), false)
eq('dirty true when project null and draft non-empty', isDescriptionDirty(null, 'x'), true)

// 9. isDescriptionDirty：project 缺 description 字段视为空简介
eq('dirty true when project lacks description and draft non-empty', isDescriptionDirty({}, 'text'), true)
eq('dirty false when project lacks description and draft empty', isDescriptionDirty({}, '  '), false)

// 10. isDescriptionDirty：非字符串 draft 输入安全
eq('dirty safe with non-string draft (number)', isDescriptionDirty({ description: '123' }, 123), false)
eq('dirty safe with null draft', isDescriptionDirty({ description: '' }, null), false)
eq('dirty safe with undefined draft', isDescriptionDirty({ description: '' }, undefined), false)

// 结果汇总
console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exit(1)
else console.log('ALL TESTS PASSED')
