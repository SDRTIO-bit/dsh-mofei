// 墨韵皮肤气泡/输入卡对比度快查（WCAG 相对亮度，纯计算，无依赖）
// 用法：node verify-shots/skin-contrast.cjs
function lum(hex) {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
function row(label, fg, bg) {
  const r = ratio(fg, bg)
  const verdict = r >= 4.5 ? 'PASS' : r >= 3 ? 'WARN' : 'FAIL'
  console.log(`${label.padEnd(46)} ${fg} on ${bg} → ${r.toFixed(2)} : 1  [${verdict}]`)
}

console.log('=== 墨（MOFEI_INK, dark）===')
row('用户气泡 #fff (硬编码) on bubble #2f2b26', '#ffffff', '#2f2b26')
row('官方用户气泡 label-primary #efe9df on bubble', '#efe9df', '#2f2b26')
row('输入卡 label-primary #efe9df on input-major #26231f', '#efe9df', '#26231f')
row('composer placeholder label-tertiary #8d8476 on input-major', '#8d8476', '#26231f')
row('composer placeholder label-caption #6f675a on input-major', '#6f675a', '#26231f')
row('助手气泡 label-primary on interactive-hover(≈#2b2a27)', '#efe9df', '#2b2a27')
row('输入卡边框 l2-darkmode-thin on input-major', '#ffffff12', '#26231f')

console.log('=== 宣纸（MOFEI_PAPER, light）===')
row('用户气泡 #fff (硬编码!) on bubble #e7dfcc', '#ffffff', '#e7dfcc')
row('官方用户气泡 label-primary #3b342a on bubble', '#3b342a', '#e7dfcc')
row('输入卡 label-primary #3b342a on input-major #efe8d8', '#3b342a', '#efe8d8')
row('composer placeholder label-tertiary #8a8070 on input-major', '#8a8070', '#efe8d8')
row('助手气泡 label-primary on interactive-hover(≈#eeeadf)', '#3b342a', '#eeeadf')