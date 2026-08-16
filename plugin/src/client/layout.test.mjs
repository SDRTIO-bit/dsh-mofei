import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LAYOUT_DEFAULTS,
  LAYOUT_MIN,
  LAYOUT_MAX,
  EDITOR_MIN,
  normalizeLayout,
  nextLayout,
  loadLayout,
  saveLayout,
} from './layout.js'

test('默认值：undefined 输入返回默认布局', () => {
  assert.deepEqual(normalizeLayout(undefined), { ...LAYOUT_DEFAULTS })
  assert.deepEqual(normalizeLayout(null), { ...LAYOUT_DEFAULTS })
  assert.deepEqual(normalizeLayout(undefined, 1240), { ...LAYOUT_DEFAULTS })
})

test('脏输入（非对象）安全返回默认', () => {
  assert.deepEqual(normalizeLayout(42), { ...LAYOUT_DEFAULTS })
  assert.deepEqual(normalizeLayout('hello'), { ...LAYOUT_DEFAULTS })
  assert.deepEqual(normalizeLayout([210, 250]), { ...LAYOUT_DEFAULTS })
  assert.deepEqual(normalizeLayout(() => {}), { ...LAYOUT_DEFAULTS })
})

test('脏输入（NaN / Infinity / 负数 / 非数字字符串）逐字段回落默认', () => {
  assert.deepEqual(normalizeLayout({ left: NaN, middle: 300 }), { left: 210, middle: 300 })
  assert.deepEqual(normalizeLayout({ left: Infinity, middle: -5 }), { left: 210, middle: 250 })
  assert.deepEqual(normalizeLayout({ left: 'abc', middle: 'xyz' }), { ...LAYOUT_DEFAULTS })
})

test('字符串数字被接受为数字', () => {
  assert.deepEqual(normalizeLayout({ left: '260', middle: '300' }), { left: 260, middle: 300 })
})

test('单字段 clamp 到 min/max', () => {
  assert.deepEqual(normalizeLayout({ left: 10, middle: 250 }), { left: LAYOUT_MIN.left, middle: 250 })
  assert.deepEqual(normalizeLayout({ left: 99999, middle: 250 }, 2000), { left: LAYOUT_MAX.left, middle: 250 })
  assert.deepEqual(normalizeLayout({ left: 210, middle: 1 }, 2000), { left: 210, middle: LAYOUT_MIN.middle })
})

test('containerWidth 非法时兜底 1240', () => {
  const out = normalizeLayout({ left: 9999, middle: 9999 }, null)
  assert.deepEqual(out, normalizeLayout({ left: 9999, middle: 9999 }, 1240))
  // 字段先 clamp 到 max，再按比例压缩到 1240 - EDITOR_MIN
  assert.deepEqual(out, { left: 365, middle: 555 })
})

test('组合超宽时按比例压缩使和为 containerWidth - EDITOR_MIN', () => {
  const containerWidth = 800
  const out = normalizeLayout({ left: 410, middle: 540 }, containerWidth)
  assert.equal(out.left + out.middle, containerWidth - EDITOR_MIN)
  // 比例压缩方向正确：left 更大则压缩后仍更大
  assert.ok(out.left < 410 && out.middle < 540)
  assert.ok(out.left >= LAYOUT_MIN.left && out.middle >= LAYOUT_MIN.middle)
})

test('组合不超宽时原样保留', () => {
  const containerWidth = 1240
  assert.deepEqual(normalizeLayout({ left: 260, middle: 340 }, containerWidth), { left: 260, middle: 340 })
})

test('nextLayout 拖 left 向右（增大）吃掉编辑器空间', () => {
  const out = nextLayout({ left: 210, middle: 250 }, 'left', +80, 1240)
  assert.deepEqual(out, { left: 290, middle: 250 })
})

test('nextLayout 拖 left 向左（减小）不得低于 min', () => {
  const out = nextLayout({ left: 210, middle: 250 }, 'left', -9999, 1240)
  assert.equal(out.left, LAYOUT_MIN.left)
  assert.equal(out.middle, 250)
})

test('nextLayout 拖 left 到极限时编辑器保留 EDITOR_MIN 且 middle 不低于 min', () => {
  const containerWidth = 1000
  const out = nextLayout({ left: 210, middle: 250 }, 'left', 99999, containerWidth)
  assert.equal(out.middle, 250)
  // left 受 LAYOUT_MAX.left=420 上限约束
  assert.equal(out.left, LAYOUT_MAX.left)
  assert.ok(out.left + out.middle + EDITOR_MIN <= containerWidth)
  assert.ok(containerWidth - (out.left + out.middle) >= EDITOR_MIN)
})

test('nextLayout 拖 middle 增大且编辑器保留 EDITOR_MIN', () => {
  const containerWidth = 1000
  const out = nextLayout({ left: 210, middle: 250 }, 'middle', 99999, containerWidth)
  assert.equal(out.left, 210)
  assert.equal(out.left + out.middle + EDITOR_MIN, containerWidth)
})

test('nextLayout 拖 middle 减小不得低于 min，且违反 mmax 不超限', () => {
  const down = nextLayout({ left: 210, middle: 250 }, 'middle', -99999, 1240)
  assert.equal(down.middle, LAYOUT_MIN.middle)
  const up = nextLayout({ left: 210, middle: 250 }, 'middle', 99999, 1240)
  assert.ok(up.middle <= LAYOUT_MAX.middle)
})

test('nextLayout 不可变：不修改传入对象', () => {
  const current = { left: 210, middle: 250 }
  const out = nextLayout(current, 'left', 30, 1240)
  assert.deepEqual(current, { left: 210, middle: 250 })
  assert.notEqual(out, current)
})

test('load/save roundtrip', () => {
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  }
  assert.equal(saveLayout(storage, 'mofei.layout', { left: 310, middle: 390 }), true)
  assert.deepEqual(loadLayout(storage, 'mofei.layout'), { left: 310, middle: 390 })
})

test('loadLayout：无 storage / JSON 解析失败 / 非法值 安全回落', () => {
  assert.deepEqual(loadLayout(undefined), { ...LAYOUT_DEFAULTS })
  assert.deepEqual(loadLayout(null), { ...LAYOUT_DEFAULTS })
  const badStorage = { getItem: () => '{not json' }
  assert.deepEqual(loadLayout(badStorage, 'mofei.layout'), { ...LAYOUT_DEFAULTS })
  const arrStorage = { getItem: () => '[1,2,3]' }
  assert.deepEqual(loadLayout(arrStorage, 'mofei.layout'), { ...LAYOUT_DEFAULTS })
})

test('storage 抛错安全（getItem / setItem / JSON）', () => {
  const throwingGet = { getItem: () => { throw new Error('boom') } }
  assert.deepEqual(loadLayout(throwingGet, 'mofei.layout'), { ...LAYOUT_DEFAULTS })
  const throwingSet = { setItem: () => { throw new Error('boom') } }
  assert.equal(saveLayout(throwingSet, 'mofei.layout', { left: 220, middle: 260 }), false)
  const circular = {}
  circular.self = circular
  // JSON.stringify 循环引用会抛错，saveLayout 应安全返回 false
  const realStorage = { setItem: () => { throw new TypeError('quota') } }
  assert.equal(saveLayout(realStorage, 'mofei.layout', circular), false)
})

test('saveLayout：无 storage 时返回 false 不抛错', () => {
  assert.equal(saveLayout(undefined, 'mofei.layout', { left: 210, middle: 250 }), false)
  assert.equal(saveLayout(null, 'mofei.layout', { left: 210, middle: 250 }), false)
})

test('key 默认与自定义', () => {
  const store = {}
  const storage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v },
  }
  saveLayout(storage, undefined, { left: 288, middle: 300 })
  assert.deepEqual(loadLayout(storage, undefined), { left: 288, middle: 300 })
  assert.ok('mofei.layout' in store)
  saveLayout(storage, 'custom.key', { left: 300, middle: 400 })
  assert.deepEqual(loadLayout(storage, 'custom.key'), { left: 300, middle: 400 })
})
