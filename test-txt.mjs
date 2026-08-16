// 墨扉 TXT 解析/导出单元测试（不依赖 DSH 重启，纯逻辑验证）
import { parseTxt, exportProject, importTitle } from './plugin/lib/txt.js'
import { strict as assert } from 'node:assert'

let passed = 0
function ok(name, fn) {
  fn()
  passed += 1
  console.log('PASS ' + name)
}

// --- parseTxt ---
const sample = [
  '第一卷 风起',
  '',
  '第一章 初雪',
  '雪落无声。',
  '他推开门。',
  '',
  '第二章 夜行',
  '夜色深沉。',
  '',
  '第二卷 云涌',
  '',
  '第三章 密会',
  '烛火摇曳。',
  '',
  '尾声',
  '全书终。',
].join('\n')

ok('parseTxt 识别卷/章/正文', () => {
  const r = parseTxt(sample)
  assert.equal(r.error, undefined)
  assert.equal(r.volumeCount === undefined ? r.volumes.length : r.volumes.length, 2)
  assert.equal(r.chapterCount, 3)
  assert.ok(r.chars > 0)
  assert.equal(r.volumes[0].title, '第一卷 风起')
  assert.equal(r.volumes[0].chapters.length, 2)
  assert.equal(r.volumes[0].chapters[0].title, '第一章 初雪')
  assert.ok(r.volumes[0].chapters[0].content.includes('雪落无声'))
  assert.equal(r.volumes[1].title, '第二卷 云涌')
  assert.equal(r.volumes[1].chapters[0].title, '第三章 密会')
})

ok('parseTxt 无卷直接章', () => {
  const r = parseTxt('第一章 甲\n正文甲。\n第二章 乙\n正文乙。')
  assert.equal(r.volumes.length, 1)
  assert.equal(r.volumes[0].title, null)
  assert.equal(r.chapterCount, 2)
  assert.equal(r.volumes[0].chapters[1].title, '第二章 乙')
})

ok('parseTxt 无标题纯文本', () => {
  const r = parseTxt('第一行文字。\n第二行文字。')
  assert.equal(r.chapterCount, 1)
  assert.equal(r.volumes[0].chapters[0].title, '正文')
  assert.ok(r.volumes[0].chapters[0].content.includes('第二行'))
})

ok('parseTxt 空文本报错', () => {
  const r = parseTxt('   \n ')
  assert.equal(r.error, 'EMPTY_TEXT')
})

ok('parseTxt CRLF 与 BOM 兼容', () => {
  const r = parseTxt('\uFEFF第一章 甲\r\n正文甲。\r\n')
  assert.equal(r.chapterCount, 1)
  assert.equal(r.volumes[0].chapters[0].content, '正文甲。')
})

// --- exportProject ---
const project = {
  title: '测试书',
  description: '简介',
  chapters: [
    { id: 'c1', title: '第一章 甲', content: '正文甲。', order: 0, volumeId: null },
    { id: 'c2', title: '第二章 乙', content: '正文乙。', order: 0, volumeId: 'v1' },
    { id: 'c3', title: '第三章 丙', content: '正文丙。', order: 1, volumeId: 'v1' },
  ],
  volumes: [
    { id: 'v1', title: '第一卷', order: 0 },
  ],
}

ok('exportProject 完整导出', () => {
  const r = exportProject(project, {})
  assert.equal(r.filename, '测试书.txt')
  assert.ok(r.content.includes('测试书'))
  assert.ok(r.content.includes('简介'))
  assert.ok(r.content.includes('第一章 甲'))
  assert.ok(r.content.includes('正文甲。'))
  assert.ok(r.content.includes('第一卷'))
  assert.ok(r.content.includes('正文乙。'))
})

ok('exportProject 按卷过滤', () => {
  const r = exportProject(project, { volumeIds: ['v1'] })
  assert.ok(!r.content.includes('第一章 甲'))
  assert.ok(r.content.includes('第一卷'))
  assert.ok(r.content.includes('正文乙。'))
})

ok('exportProject 按章过滤', () => {
  const r = exportProject(project, { chapterIds: ['c1'] })
  assert.ok(r.content.includes('第一章 甲'))
  assert.ok(!r.content.includes('正文乙。'))
  assert.ok(!r.content.includes('第一卷'))
})

ok('importTitle 清洗', () => {
  assert.equal(importTitle('  第一章   标题  ', 'x'), '第一章 标题')
  assert.equal(importTitle('', 'x'), 'x')
})

console.log('\n== ALL ' + passed + ' PASS ==')
