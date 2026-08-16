// writing-dashboard.test.mjs —— 纯 node 测试（不依赖 React，只测纯函数导出）。
import {
  weekdayName,
  dailyRows,
  defaultRange,
  rangeStats,
  WRITING_DASHBOARD_CSS,
  ensureWritingDashboardStyles,
} from './writing-dashboard.js'

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
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
}

// ===== weekdayName：中文映射（日一二三四五六）=====
// 1. 0..6 完整映射
eq('weekdayName full map', [0, 1, 2, 3, 4, 5, 6].map(weekdayName), ['日', '一', '二', '三', '四', '五', '六'])

// 2. 非法输入回退空串
eq('weekdayName invalid -> ""', [weekdayName(-1), weekdayName(7), weekdayName(1.5), weekdayName(NaN), weekdayName('2'), weekdayName(null), weekdayName(undefined)].every((v) => v === ''), true)

// ===== dailyRows =====
// 3. 按日期升序排序
const unsorted = { '2024-03-05': { chars: 30 }, '2024-03-01': { chars: 10 }, '2024-03-03': { chars: 20 } }
eq('dailyRows sorts ascending', dailyRows(unsorted).map((r) => r.date), ['2024-03-01', '2024-03-03', '2024-03-05'])

// 4. 值形态兼容：number / {chars} / 缺 chars / 缺字段
const mixed = {
  '2024-01-01': 100,
  '2024-01-02': { chars: 200 },
  '2024-01-03': {},
  '2024-01-04': null,
}
eq('dailyRows value shapes coerced', dailyRows(mixed).map((r) => r.chars), [100, 200, 0, 0])

// 5. 范围过滤（闭区间，含边界）
const ranged = {
  '2024-02-01': { chars: 1 },
  '2024-02-10': { chars: 10 },
  '2024-02-11': { chars: 11 },
  '2024-02-20': { chars: 20 },
}
eq('dailyRows range filter inclusive', dailyRows(ranged, '2024-02-10', '2024-02-11').map((r) => r.date), ['2024-02-10', '2024-02-11'])
eq('dailyRows range start-only', dailyRows(ranged, '2024-02-11').map((r) => r.date), ['2024-02-11', '2024-02-20'])
eq('dailyRows range end-only', dailyRows(ranged, '', '2024-02-01').map((r) => r.date), ['2024-02-01'])

// 6. weekday 由日期推导
const wd = dailyRows({ '2024-03-04': { chars: 500 } }) // 2024-03-04 是周一
eq('dailyRows weekday from date', wd[0].weekday, '一')

// 7. 非法 days -> 空数组（脏数据安全）
eq('dailyRows undefined -> []', dailyRows(undefined), [])
eq('dailyRows null -> []', dailyRows(null), [])
eq('dailyRows string -> []', dailyRows('nope'), [])
eq('dailyRows array -> []', dailyRows(['2024-01-01']), [])
eq('dailyRows number -> []', dailyRows(42), [])

// 8. 负数字 chars 钳为 0
eq('dailyRows negative chars clamp 0', dailyRows({ '2024-03-02': { chars: -5 } })[0].chars, 0)

// 9. 非法日期键保留但 weekday 空串
const weird = dailyRows({ 'not-a-date': 3 })
eq('dailyRows bad key weekday empty', weird[0].weekday, '')
eq('dailyRows bad key keeps date', weird[0].date, 'not-a-date')

// ===== defaultRange =====
// 10. 无数据 -> {start:'', end:''}
eq('defaultRange empty object', defaultRange({}), { start: '', end: '' })
eq('defaultRange undefined', defaultRange(undefined), { start: '', end: '' })
eq('defaultRange no valid keys', defaultRange({ 'bad-key': 1 }), { start: '', end: '' })

// 11. 默认 30 天：含 end 共 30 天（start = end - 29 天）
eq('defaultRange 30 days', defaultRange({ '2024-03-31': { chars: 1 }, '2024-01-01': { chars: 9 } }), { start: '2024-03-02', end: '2024-03-31' })

// 12. 自定义 daysBack=7（近 7 天）
eq('defaultRange 7 days', defaultRange({ '2024-03-31': { chars: 1 } }, 7), { start: '2024-03-25', end: '2024-03-31' })

// 13. 单日数据
eq('defaultRange single day', defaultRange({ '2024-02-15': { chars: 1 } }, 30), { start: '2024-01-17', end: '2024-02-15' })

// 14. 跨月/跨年平移
eq('defaultRange crosses month', defaultRange({ '2024-03-05': { chars: 1 } }, 7), { start: '2024-02-28', end: '2024-03-05' })
eq('defaultRange crosses year', defaultRange({ '2024-01-03': { chars: 1 } }, 7), { start: '2023-12-28', end: '2024-01-03' })

// 15. daysBack 脏值回退 30
eq('defaultRange invalid daysBack -> 30', defaultRange({ '2024-03-31': { chars: 1 } }, 0).start, '2024-03-02')
eq('defaultRange daysBack NaN -> 30', defaultRange({ '2024-03-31': { chars: 1 } }, NaN).start, '2024-03-02')

// ===== rangeStats =====
// 16. 求和 / 天数
eq('rangeStats sum and days', rangeStats([{ date: 'a', chars: 10 }, { date: 'b', chars: 20 }, { date: 'c', chars: 30 }]), { days: 3, totalChars: 60, average: 20 })

// 17. 均值四舍五入取整
eq('rangeStats round average', rangeStats([{ chars: 10 }, { chars: 20 }, { chars: 20 }]).average, 17)

// 18. 空 / 脏输入 -> 零
eq('rangeStats empty -> zeros', rangeStats([]), { days: 0, totalChars: 0, average: 0 })
eq('rangeStats non-array -> zeros', rangeStats(null), { days: 0, totalChars: 0, average: 0 })
eq('rangeStats skips non-object rows', rangeStats([null, undefined, 42, {}, { chars: 5 }]), { days: 2, totalChars: 5, average: 3 })

// 19. 脏 chars（NaN / 负 / 字符串）不计入求和
eq('rangeStats dirty chars', rangeStats([{ chars: NaN }, { chars: -3 }, { chars: '9' }, { chars: 4 }]).totalChars, 4)

// ===== CSS / ensure =====
// 20. CSS 类选择器全部为 mf-dash-* 前缀
const cssClassTokens = Array.from(new Set((WRITING_DASHBOARD_CSS.match(/\.[a-zA-Z_][a-zA-Z0-9_-]*/g) || []).map((t) => t.slice(1))))
check('CSS all classes prefixed mf-dash-',
  cssClassTokens.length > 0 && cssClassTokens.every((t) => /^mf-dash-/.test(t)),
  '非 mf-dash- 前缀类：' + cssClassTokens.filter((t) => !/^mf-dash-/.test(t)).join(','))

// 21. ensure 无 document 时安全（纯 node 环境不抛错）
let threw = false
try { ensureWritingDashboardStyles() } catch (error) { threw = true }
check('ensure styles safe without document', !threw)

// 结果汇总
console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exit(1)
else console.log('ALL TESTS PASSED')
