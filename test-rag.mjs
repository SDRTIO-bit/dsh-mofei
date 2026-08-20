// 墨扉 RAG 索引单元测试（v0.28：buildIndex 支持文件树 readContent 加载器，不依赖 DSH 重启）
import { buildIndex, queryIndex, indexStatus, chunkText, tokenize, DEFAULT_RAG_CONFIG } from './plugin/lib/rag.js'
import { strict as assert } from 'node:assert'

const tests = []
function test(name, fn) { tests.push([name, fn]) }

const project = () => ({
  id: 'project-1',
  chapters: [{ id: 'chapter-1', title: '第一章', content: '内存章节正文 旧版', revision: 3, volumeId: null }],
  characters: [{ id: 'character-1', name: '主角', description: '内存角色描述' }],
  notes: [{ id: 'note-1', title: '设定', content: '内存笔记正文', isHidden: false }],
  worldEntries: [{ id: 'world-1', name: '门派', content: '内存世界书正文', isEnabled: true, order: 0 }],
})
const summaries = () => ({ 'chapter-1': { updatedAt: 100, summary: '内存章节摘要' } })

test('buildIndex（无加载器）异步调用仍用内存字段，行为与旧版一致', async () => {
  const index = await buildIndex(project(), summaries())
  assert.equal(index.chunks.length, 5, '章节 + 角色 + 笔记 + 世界书 + 摘要 = 5 chunks')
  const chapterChunk = index.chunks.find((item) => item.entityType === 'chapter')
  assert.ok(chapterChunk.text.includes('内存章节正文 旧版'), '正文来自内存 content')
  assert.ok(index.signature.includes('内存章节正文 旧版'.length), '签名基于内存正文长度')
})

test('buildIndex 加载器优先：文件树正文覆盖内存正文', async () => {
  const loader = async (kind, entityId) => {
    const bodies = {
      'chapter:chapter-1': '文件树章节正文 新版',
      'character:character-1': '文件树角色描述',
      'note:note-1': '文件树笔记正文',
      'world:world-1': '文件树世界书正文',
    }
    return bodies[kind + ':' + entityId] || null
  }
  const index = await buildIndex(project(), summaries(), {}, { readContent: loader })
  const chapterChunk = index.chunks.find((item) => item.entityType === 'chapter')
  assert.ok(chapterChunk.text.includes('文件树章节正文 新版'), 'chunk 正文来自文件树加载器')
  assert.ok(!chapterChunk.text.includes('内存章节正文 旧版'), '内存正文被覆盖')
  assert.ok(index.signature.includes('文件树章节正文 新版'.length), '签名基于加载器正文长度')
  // 摘要不经过加载器，保持内存
  const summaryChunk = index.chunks.find((item) => item.entityType === 'summary')
  assert.ok(summaryChunk.text.includes('内存章节摘要'))
})

test('buildIndex 加载器返回 null 时回退内存字段', async () => {
  const loader = async () => null
  const index = await buildIndex(project(), summaries(), {}, { readContent: loader })
  const chapterChunk = index.chunks.find((item) => item.entityType === 'chapter')
  assert.ok(chapterChunk.text.includes('内存章节正文 旧版'), '加载器无结果时回退内存')
})

test('buildIndex 加载器抛错时回退内存字段且不中断', async () => {
  const loader = async () => { throw new Error('文件树不可用') }
  const index = await buildIndex(project(), summaries(), {}, { readContent: loader })
  assert.equal(index.chunks.length, 5, '加载器抛错不影响索引构建')
  const worldChunk = index.chunks.find((item) => item.entityType === 'world')
  assert.ok(worldChunk.text.includes('内存世界书正文'))
})

test('索引签名随加载器内容变化（stale 判定依据）', async () => {
  const base = project()
  const loaderA = async () => '正文版本A'
  const loaderB = async () => '正文版本B 更长的内容'
  const indexA = await buildIndex(base, summaries(), {}, { readContent: loaderA })
  const indexB = await buildIndex(base, summaries(), {}, { readContent: loaderB })
  assert.notEqual(indexA.signature, indexB.signature, '内容长度变化 → 签名变化')
  const status = indexStatus(indexA, base, summaries())
  assert.ok(status.status === 'fresh' || status.status === 'stale', 'indexStatus 可判定')
})

test('queryIndex 对加载器构建的索引正常检索', async () => {
  const loader = async (kind, entityId) => (kind + ':' + entityId === 'chapter:chapter-1' ? '青锋剑出鞘，剑气纵横三万里。' : null)
  const index = await buildIndex(project(), summaries(), {}, { readContent: loader })
  const found = queryIndex(index, '青锋剑')
  assert.ok(found.results.length >= 1, '命中加载器正文 chunk')
  assert.ok(found.results[0].text.includes('青锋剑出鞘'))
  assert.equal(found.results[0].entityType, 'chapter')
})

test('签名回退路径按 kind 取字段（角色=description，其余=content），防 stale 误判', async () => {
  // 无加载器：角色长度必须来自 description（v0.28 曾因统一取 item.content 而恒 0 → 永久 stale）
  const index = await buildIndex(project(), summaries())
  assert.ok(index.signature.includes('r:character-1:主角:' + '内存角色描述'.length), '角色签名长度来自 description')
  assert.ok(index.signature.includes('n:note-1:设定:' + '内存笔记正文'.length), '笔记签名长度来自 content')
  assert.ok(index.signature.includes('w:world-1:门派:' + '内存世界书正文'.length), '世界书签名长度来自 content')
  assert.ok(index.signature.includes('c:chapter-1:3:' + '内存章节正文 旧版'.length), '章节签名长度来自 content')
  // 有加载器：签名用加载器值（角色 loader 与内存 description 不同 → 签名随之变化）
  const loader = async (kind, entityId) => (kind === 'character' && entityId === 'character-1' ? '文件树角色描述更长的版本' : null)
  const index2 = await buildIndex(project(), summaries(), {}, { readContent: loader })
  assert.ok(index2.signature.includes('r:character-1:主角:' + '文件树角色描述更长的版本'.length), '加载器角色正文长度进入签名')
  assert.notEqual(index2.signature, index.signature, '角色正文变化 → 签名变化')
  // indexStatus 与 index.signature 一致 → fresh
  const status = indexStatus(index, project(), summaries())
  assert.equal(status.status, 'fresh', '无加载器构建后判定 fresh')
  // 加载器内容与内存不同 → 判定 stale（提示重建；重建后以文件树为准，正常路径二者一致）
  const status2 = indexStatus(index2, project(), summaries())
  assert.equal(status2.status, 'stale', '加载器与内存分歧时判 stale 提示重建')
})

test('chunkText / tokenize 回归', () => {
  const chunks = chunkText('第一段。\n\n第二段，第二段比较长，超过了分块上限需要切开。', 10, 3)
  assert.ok(chunks.length >= 2)
  assert.ok(chunks.every((chunk) => chunk.length <= 10))
  assert.ok(tokenize('青锋剑 出鞘').length >= 2)
  assert.ok(DEFAULT_RAG_CONFIG.chunkSize > 0)
})

let failed = 0
for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS ' + name) } catch (error) { failed += 1; console.error('FAIL ' + name); console.error(error && error.stack || error) }
}
console.log(failed === 0 ? '== ALL ' + tests.length + ' PASS ==' : '== ' + failed + ' FAILURES ==')
process.exitCode = failed === 0 ? 0 : 1
