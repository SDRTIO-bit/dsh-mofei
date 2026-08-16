// 墨扉工作区三栏布局纯逻辑：normalize / next / load / save。
// 纯函数，无 DOM、无 react 依赖，可被 node 直接 import 测试。
// bundler（esbuild）会把它打进 client bundle；不允许顶层 import 'react'。

export const LAYOUT_DEFAULTS = { left: 210, middle: 250 }
export const LAYOUT_MIN = { left: 180, middle: 180 }
export const LAYOUT_MAX = { left: 420, middle: 640 }
export const EDITOR_MIN = 320

const FALLBACK_CONTAINER_WIDTH = 1240
const DEFAULT_STORAGE_KEY = 'mofei.layout'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// 字段值规整：合法（有限且 >= 0 的数字，或可解析为有限非负数字的字符串）→ 数字；
// 其余（负数 / NaN / Infinity / 非数字字符串 / 缺失）→ 回退值。
function toFieldValue(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value)
    if (Number.isFinite(num) && num >= 0) return num
  }
  return fallback
}

function toContainerWidth(containerWidth) {
  if (typeof containerWidth === 'number' && Number.isFinite(containerWidth) && containerWidth > 0) return containerWidth
  if (typeof containerWidth === 'string' && containerWidth.trim() !== '') {
    const num = Number(containerWidth)
    if (Number.isFinite(num) && num > 0) return num
  }
  return FALLBACK_CONTAINER_WIDTH
}

// 返回合法 { left, middle }：
//   1) input 非对象或缺字段时用 LAYOUT_DEFAULTS；
//   2) 逐字段 clamp 到 [LAYOUT_MIN, LAYOUT_MAX]；
//   3) left+middle <= containerWidth-EDITOR_MIN 时原样，否则按比例压缩，
//      使 left+middle 尽量等于 containerWidth-EDITOR_MIN（各字段仍不低于 min）。
// 始终返回新对象。
export function normalizeLayout(input, containerWidth) {
  const width = toContainerWidth(containerWidth)
  let left = LAYOUT_DEFAULTS.left
  let middle = LAYOUT_DEFAULTS.middle
  if (input !== null && input !== undefined && typeof input === 'object' && !Array.isArray(input)) {
    left = toFieldValue(input.left, left)
    middle = toFieldValue(input.middle, middle)
  }
  left = clamp(left, LAYOUT_MIN.left, LAYOUT_MAX.left)
  middle = clamp(middle, LAYOUT_MIN.middle, LAYOUT_MAX.middle)

  const available = width - EDITOR_MIN
  if (left + middle > available) {
    const total = left + middle
    if (total > 0 && available > 0) {
      const scale = available / total
      left = clamp(Math.round(left * scale), LAYOUT_MIN.left, LAYOUT_MAX.left)
      middle = clamp(available - left, LAYOUT_MIN.middle, LAYOUT_MAX.middle)
    }
  }
  return { left, middle }
}

// 拖拽一步：axis 'left'|'middle'，delta 像素，containerWidth 面板可用宽度。
// 返回新对象（不可变）。非法 delta 视为 0。
//   拖动 left：left 吃掉 middle/编辑器空间，但 middle 不低于 min、编辑器保留 EDITOR_MIN；
//   拖动 middle：同理，编辑器保留 EDITOR_MIN。
export function nextLayout(current, axis, delta, containerWidth) {
  const base = normalizeLayout(current, containerWidth)
  const width = toContainerWidth(containerWidth)
  const d = (typeof delta === 'number' && Number.isFinite(delta)) ? delta : 0
  if (axis === 'left') {
    let left = base.left + d
    left = clamp(left, LAYOUT_MIN.left, LAYOUT_MAX.left)
    // middle 不得低于 min：left 最多吃到 containerWidth - EDITOR_MIN - middle，
    // 若连 min 都保不住则退回到 min（middle 优先保底）。
    const cap = width - EDITOR_MIN - base.middle
    if (cap >= LAYOUT_MIN.left) left = Math.min(left, cap)
    else left = LAYOUT_MIN.left
    return { left, middle: base.middle }
  }
  if (axis === 'middle') {
    let middle = base.middle + d
    middle = clamp(middle, LAYOUT_MIN.middle, LAYOUT_MAX.middle)
    const cap = width - EDITOR_MIN - base.left
    if (cap >= LAYOUT_MIN.middle) middle = Math.min(middle, cap)
    else middle = LAYOUT_MIN.middle
    return { left: base.left, middle }
  }
  // 未知 axis：原样返回合法基础值。
  return base
}

// storage 可能为 undefined / 抛错；key 默认 'mofei.layout'。
// 解析失败或任何异常都安全返回 LAYOUT_DEFAULTS 的副本。
export function loadLayout(storage, key) {
  const storageKey = key || DEFAULT_STORAGE_KEY
  try {
    if (storage && typeof storage.getItem === 'function') {
      const raw = storage.getItem(storageKey)
      if (raw !== null && raw !== undefined) return normalizeLayout(JSON.parse(raw))
    }
  } catch (error) { /* 解析失败回落默认 */ }
  return { left: LAYOUT_DEFAULTS.left, middle: LAYOUT_DEFAULTS.middle }
}

// 保存（先 normalize 保证落盘数据合法）。任何异常返回 false，成功返回 true。
export function saveLayout(storage, key, layout) {
  const storageKey = key || DEFAULT_STORAGE_KEY
  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(storageKey, JSON.stringify(normalizeLayout(layout)))
      return true
    }
    return false
  } catch (error) { return false }
}
