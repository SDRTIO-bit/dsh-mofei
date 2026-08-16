// 墨扉客户端通用纯函数：格式化与字数统计。
// 无 DOM、无 react 依赖，可 node 直接 import 测试。
export function fmtTime(at) {
  try { return new Date(at).toLocaleString() } catch (error) { return String(at) }
}

export function dateKey(date) {
  return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

/** 中文口径字数：去所有空白字符后按 UTF-16 code unit 计数（与编辑页脚一致）。 */
export function countWords(text) {
  return String(text).replace(/\s+/g, '').length
}
