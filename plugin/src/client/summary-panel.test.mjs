// summary-panel.test.mjs —— 纯 node 测试（不依赖 React，只测纯函数导出）。
import {
  previewSummary,
  chapterSummaryStats,
  rangeSummaryStats,
  progressPercent,
} from './summary-panel.js'

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

// ===== previewSummary =====
// 1. 空值 / 非字符串输入安全
eq('preview empty string', previewSummary(''), '')
eq('preview undefined -> empty', previewSummary(undefined), '')
eq('preview null -> empty', previewSummary(null), '')
eq('preview non-string number -> stringified', previewSummary(12345), '12345')
eq('preview non-string object -> stringified', previewSummary({ a: 1 }), '[object Object]')

// 2. trim 首尾空白、保留内部空白
eq('preview trims edges, keeps inner spaces', previewSummary('  a  b  '), 'a  b')

// 3. 长文本按码点截断到默认 120
eq('preview truncates long text to 120 code points', Array.from(previewSummary('x'.repeat(300))).length, 120)

// 4. 自定义 max 截断
eq('preview respects custom max', previewSummary('abcdef'.repeat(50), 10), 'abcdefabcd')

// 5. 码点截断不拆散代理对（emoji）
const emoji160 = '🙂'.repeat(160)
eq('preview emoji truncates to 120 code points (no broken surrogate)', Array.from(previewSummary(emoji160)).length, 120)
const mixed = ('🙂'.repeat(70)) + ('a'.repeat(70)) // 140 码点 -> 截到 120，边界不拆散 emoji
const mixedPre = previewSummary(mixed, 120)
check('preview mixed emoji boundary intact', Array.from(mixedPre).length === 120 && !mixedPre.includes('\uFFFD'),
  '结果尾部：' + JSON.stringify(mixedPre.slice(-4)))

// 6. 非法 max 回退默认（非正 / 非有限 / 非数字）
eq('preview invalid max 0 falls back to 120', Array.from(previewSummary('y'.repeat(200), 0)).length, 120)
eq('preview invalid max NaN falls back to 120', Array.from(previewSummary('z'.repeat(200), NaN)).length, 120)
eq('preview invalid max string falls back to 120', Array.from(previewSummary('z'.repeat(200), 'abc')).length, 120)

// ===== chapterSummaryStats =====
// 7. 组合场景：模拟 rows
const rows = [
  { chapterId: 'c1', title: '一', order: 0, entry: { summary: '  一句话  ' }, stale: false },
  { chapterId: 'c2', title: '二', order: 1, entry: null, stale: true },
  { chapterId: 'c3', title: '三', order: 2, entry: { summary: '' }, stale: false },
  { chapterId: 'c4', title: '四', order: 3, entry: { summary: '已有' }, stale: true },
]
const cs = chapterSummaryStats(rows)
eq('chapterStats total', cs.total, 4)
eq('chapterStats hasSummary (non-empty summary only)', cs.hasSummary, 2)
eq('chapterStats stale count', cs.stale, 2)

// 8. 脏输入安全
const dirty = chapterSummaryStats(undefined)
eq('chapterStats undefined -> zeros', dirty.total === 0 && dirty.hasSummary === 0 && dirty.stale === 0, true)
const dirty2 = chapterSummaryStats('nope')
eq('chapterStats non-array -> zeros', dirty2.total === 0 && dirty2.hasSummary === 0 && dirty2.stale === 0, true)
const withNulls = chapterSummaryStats([null, undefined, 42, { chapterId: 'x', entry: { summary: 'ok' }, stale: true }])
eq('chapterStats skips non-object rows', withNulls.total === 4 && withNulls.hasSummary === 1 && withNulls.stale === 1, true)

// 9. stale 仅按 === true 计数（truthy 字符串不算）
const staleTruthy = chapterSummaryStats([{ entry: {}, stale: 'yes' }])
eq('chapterStats stale only strict true', staleTruthy.stale === 0, true)

// ===== rangeSummaryStats =====
// 10. 组合场景（hasSummary 标志 或 summary 有内容均计）
const ranges = [
  { id: 'r1', title: '一', summary: '内容', hasSummary: false },
  { id: 'r2', title: '二', summary: '', hasSummary: true },
  { id: 'r3', title: '三', summary: null, hasSummary: false },
  { id: 'r4', title: '四', summary: '' },
]
const rs = rangeSummaryStats(ranges)
eq('rangeStats total', rs.total, 4)
eq('rangeStats hasSummary (flag OR content)', rs.hasSummary, 2)

// 11. 脏输入 / 空 summary 不计
const rd = rangeSummaryStats(null)
eq('rangeStats null -> zeros', rd.total === 0 && rd.hasSummary === 0, true)
const rs2 = rangeSummaryStats([{ id: 'x', summary: '   ' }])
eq('rangeStats whitespace-only summary not counted', rs2.hasSummary === 0, true)

// ===== progressPercent =====
// 12. 0 / 完整 / 中间
eq('progressPercent 0%', progressPercent({ done: 0, total: 10 }), 0)
eq('progressPercent full 100%', progressPercent({ done: 10, total: 10 }), 100)
eq('progressPercent half rounds', progressPercent({ done: 1, total: 2 }), 50)
eq('progressPercent rounds to integer', progressPercent({ done: 1, total: 3 }), 33)

// 13. 非法安全 -> null
eq('progressPercent null -> null', progressPercent(null), null)
eq('progressPercent undefined -> null', progressPercent(undefined), null)
eq('progressPercent non-object -> null', progressPercent('x'), null)
eq('progressPercent zero total -> null', progressPercent({ done: 1, total: 0 }), null)
eq('progressPercent negative total -> null', progressPercent({ done: 1, total: -1 }), null)
eq('progressPercent NaN done -> null', progressPercent({ done: NaN, total: 5 }), null)
eq('progressPercent string values -> null', progressPercent({ done: '1', total: '5' }), null)

// 14. 越界夹取
eq('progressPercent clamps over 100 (done>total)', progressPercent({ done: 12, total: 10 }), 100)

// 15. 纯函数组合场景：rows -> stats + preview 链路（模拟面板渲染前的数据准备）
function simulatePanelPrep(rowList, rangeList) {
  return {
    chapters: chapterSummaryStats(rowList),
    ranges: rangeSummaryStats(rangeList),
    firstChapterPreview: rowList.length ? previewSummary(rowList[0].entry ? rowList[0].entry.summary : '') : '',
  }
}
const composed = simulatePanelPrep(rows, ranges)
eq('composed: chapter totals flow through', composed.chapters.total, 4)
eq('composed: chapter hasSummary', composed.chapters.hasSummary, 2)
eq('composed: range hasSummary', composed.ranges.hasSummary, 2)
eq('composed: first chapter preview trimmed', composed.firstChapterPreview, '一句话')

// 结果汇总
console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exit(1)
else console.log('ALL TESTS PASSED')
