const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/
const LATIN_RE = /[A-Za-z0-9]/
export const RAG_INDEX_VERSION = 1
export const DEFAULT_RAG_CONFIG = { chunkSize: 800, chunkOverlap: 100, candidateLimit: 40, resultLimit: 5, confidenceThreshold: 0.005 }

export function tokenize(value) {
  const tokens = []
  const source = String(value || '')
  let run = ''
  const flush = () => { if (run) { tokens.push(run.toLowerCase()); run = '' } }
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (CJK_RE.test(ch)) { flush(); if (i + 1 < source.length && CJK_RE.test(source[i + 1])) tokens.push(ch + source[i + 1]); tokens.push(ch) }
    else if (LATIN_RE.test(ch)) run += ch
    else flush()
  }
  flush()
  return tokens
}

function paragraphs(text) { return String(text || '').trim().split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean) }
function sentences(text) { return String(text || '').split(/(?<=[。！？!?…\n])/).map((item) => item.trim()).filter(Boolean) }
function hardSplit(text, size) { const out = []; for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size)); return out }
function splitLong(text, size) {
  const out = []; let buffer = ''
  for (const sentence of sentences(text)) {
    if (sentence.length > size) { if (buffer) { out.push(buffer); buffer = '' }; out.push(...hardSplit(sentence, size)); continue }
    const candidate = buffer ? buffer + sentence : sentence
    if (candidate.length <= size) buffer = candidate
    else { if (buffer) out.push(buffer); buffer = sentence }
  }
  if (buffer) out.push(buffer)
  return out
}
export function chunkText(text, size = DEFAULT_RAG_CONFIG.chunkSize, overlap = DEFAULT_RAG_CONFIG.chunkOverlap) {
  const normalized = String(text || '').trim(); if (!normalized) return []
  const chunkSize = Math.max(1, Math.floor(size)); const chunkOverlap = Math.max(0, Math.min(Math.floor(overlap), chunkSize - 1))
  if (normalized.length <= chunkSize) return [normalized]
  const out = []; let buffer = ''
  for (const paragraph of paragraphs(normalized)) {
    if (paragraph.length > chunkSize) { if (buffer) { out.push(buffer); buffer = '' }; out.push(...splitLong(paragraph, chunkSize)); continue }
    const candidate = buffer ? buffer + '\n\n' + paragraph : paragraph
    if (candidate.length <= chunkSize) buffer = candidate
    else { if (buffer) out.push(buffer); const tail = chunkOverlap && out.length ? out[out.length - 1].slice(-chunkOverlap) : ''; buffer = tail + paragraph }
  }
  if (buffer) out.push(buffer)
  return out.filter(Boolean)
}

function sourceSignature(project, summaries, contentOf) {
  const parts = []
  // v0.28: contentOf 优先（文件树加载器缓存）；无加载器时回退内存字段，行为与旧版一致。
  const content = (kind, item) => {
    if (contentOf) { const value = contentOf(kind, item); if (typeof value === 'string') return value }
    return item && typeof item.content === 'string' ? item.content : ''
  }
  for (const chapter of project && project.chapters || []) parts.push('c:' + chapter.id + ':' + (chapter.revision || 0) + ':' + String(content('chapter', chapter)).length)
  for (const item of project && project.characters || []) parts.push('r:' + item.id + ':' + String(item.name || '') + ':' + String(content('character', item)).length)
  for (const item of project && project.notes || []) parts.push('n:' + item.id + ':' + String(item.title || '') + ':' + String(content('note', item)).length)
  for (const item of project && project.worldEntries || []) parts.push('w:' + item.id + ':' + String(item.name || '') + ':' + String(content('world', item)).length)
  for (const id of Object.keys(summaries || {}).sort()) parts.push('s:' + id + ':' + String(summaries[id] && summaries[id].updatedAt || 0))
  return parts.join('|')
}
function addChunks(out, entityType, entityId, title, content, meta, config) {
  const pieces = chunkText(content, config.chunkSize, config.chunkOverlap)
  pieces.forEach((text, index) => out.push({ id: entityType + ':' + entityId + ':' + index, entityType, entityId, title, chunkIndex: index, text, tokens: tokenize(text), ...meta }))
}
// v0.28: buildIndex 支持异步 readContent(kind, entityId) => Promise<string|null>——
// file-first 后正文唯一来源是 .md 文件树，加载器直读文件；读不到或未提供时回退内存字段。
// 变为 async 是兼容性升级：调用方须 await（旧同步用法不传 options 时行为不变）。
export async function buildIndex(project, summaries, inputConfig = {}, options = {}) {
  const config = { ...DEFAULT_RAG_CONFIG, ...inputConfig }; const chunks = []
  const readContent = options && typeof options.readContent === 'function' ? options.readContent : null
  const contentCache = new Map()
  const resolveContent = async (kind, entity, fallback) => {
    const key = kind + ':' + entity.id
    if (contentCache.has(key)) return contentCache.get(key)
    let value = fallback
    if (readContent) {
      try {
        const loaded = await readContent(kind, entity.id)
        if (typeof loaded === 'string' && loaded) value = loaded
      } catch (error) { /* 文件树读取失败时回退内存字段 */ }
    }
    contentCache.set(key, value)
    return value
  }
  // 签名与 chunks 共用同一份加载结果，保证 indexStatus 的 fresh/stale 判定一致。
  const contentOf = (kind, entity) => contentCache.get(kind + ':' + entity.id) || ''
  for (const chapter of project && project.chapters || []) addChunks(chunks, 'chapter', chapter.id, chapter.title, chapter.title + '\n' + await resolveContent('chapter', chapter, chapter.content), { volumeId: chapter.volumeId || null }, config)
  for (const item of project && project.characters || []) addChunks(chunks, 'character', item.id, item.name, item.name + '\n' + await resolveContent('character', item, item.description), {}, config)
  for (const item of project && project.notes || []) if (!item.isHidden) addChunks(chunks, 'note', item.id, item.title, item.title + '\n' + await resolveContent('note', item, item.content), {}, config)
  for (const item of project && project.worldEntries || []) if (item.isEnabled !== false) addChunks(chunks, 'world', item.id, item.name, item.name + '\n' + await resolveContent('world', item, item.content), {}, config)
  for (const id of Object.keys(summaries || {})) { const item = summaries[id]; if (item && item.summary) addChunks(chunks, 'summary', id, '摘要·' + id, item.summary, {}, config) }
  return { version: RAG_INDEX_VERSION, projectId: project && project.id, signature: sourceSignature(project, summaries, contentOf), config, builtAt: Date.now(), chunks }
}
function bm25(queryTokens, chunk, df, total, avgLength) {
  const counts = new Map(); for (const token of chunk.tokens) counts.set(token, (counts.get(token) || 0) + 1)
  const k1 = 1.2; const b = 0.75; const length = Math.max(1, chunk.tokens.length); let score = 0
  for (const token of queryTokens) { const tf = counts.get(token) || 0; if (!tf) continue; const idf = Math.log(1 + (total - (df.get(token) || 0) + 0.5) / ((df.get(token) || 0) + 0.5)); score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * length / Math.max(1, avgLength)))) }
  return score
}
function cosine(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return 0
  let dot = 0; let leftNorm = 0; let rightNorm = 0
  for (let i = 0; i < left.length; i += 1) { const a = Number(left[i]) || 0; const b = Number(right[i]) || 0; dot += a * b; leftNorm += a * a; rightNorm += b * b }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0
}
export function queryIndex(index, query, options = {}) {
  const config = { ...DEFAULT_RAG_CONFIG, ...(index && index.config || {}), ...options }; const queryTokens = tokenize(query); if (!index || !queryTokens.length) return { query, results: [], mode: 'hybrid-lexical' }
  const chunks = Array.isArray(index.chunks) ? index.chunks : []; const df = new Map()
  for (const chunk of chunks) for (const token of new Set(chunk.tokens || [])) df.set(token, (df.get(token) || 0) + 1)
  const avg = chunks.reduce((sum, chunk) => sum + (chunk.tokens || []).length, 0) / Math.max(1, chunks.length)
  const bm25Rows = chunks.map((chunk) => ({ chunk, score: bm25(queryTokens, chunk, df, chunks.length, avg) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.chunkIndex - b.chunk.chunkIndex).slice(0, config.candidateLimit)
  const uniqueQuery = [...new Set(queryTokens)]; const queryText = String(query || '').toLowerCase()
  const phraseRows = chunks.map((chunk) => { const text = String(chunk.text || '').toLowerCase(); const hits = uniqueQuery.reduce((count, token) => count + (text.includes(token) ? 1 : 0), 0); const phraseBonus = queryText.length > 1 && text.includes(queryText) ? 1 : 0; return { chunk, score: uniqueQuery.length ? hits / uniqueQuery.length + phraseBonus : 0 } }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.chunkIndex - b.chunk.chunkIndex).slice(0, config.candidateLimit)
  const vectorRows = Array.isArray(config.queryVector) ? chunks.map((chunk) => ({ chunk, score: cosine(config.queryVector, chunk.vector) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.chunkIndex - b.chunk.chunkIndex).slice(0, config.candidateLimit) : []
  const merged = new Map(); const rrfK = 60; const add = (row, rank, weight) => { const id = row.chunk.id; const current = merged.get(id) || { ...row.chunk, bm25Score: 0, phraseScore: 0, vectorScore: 0, rrfScore: 0 }; current.rrfScore += weight / (rrfK + rank); merged.set(id, current) }
  bm25Rows.forEach((row, index) => { const current = merged.get(row.chunk.id) || { ...row.chunk, bm25Score: 0, phraseScore: 0, vectorScore: 0, rrfScore: 0 }; current.bm25Score = row.score; merged.set(row.chunk.id, current); add({ chunk: current }, index + 1, vectorRows.length ? 0.2 : 0.7) })
  phraseRows.forEach((row, index) => { const current = merged.get(row.chunk.id) || { ...row.chunk, bm25Score: 0, phraseScore: 0, vectorScore: 0, rrfScore: 0 }; current.phraseScore = row.score; merged.set(row.chunk.id, current); add({ chunk: current }, index + 1, vectorRows.length ? 0.1 : 0.3) })
  vectorRows.forEach((row, index) => { const current = merged.get(row.chunk.id) || { ...row.chunk, bm25Score: 0, phraseScore: 0, vectorScore: 0, rrfScore: 0 }; current.vectorScore = row.score; merged.set(row.chunk.id, current); add({ chunk: current }, index + 1, 0.7) })
  const ranked = [...merged.values()].sort((a, b) => b.rrfScore - a.rrfScore || b.vectorScore - a.vectorScore || b.bm25Score - a.bm25Score).filter((item) => item.rrfScore >= config.confidenceThreshold).slice(0, config.resultLimit); const max = ranked[0] ? ranked[0].rrfScore : 0
  const mode = vectorRows.length ? 'hybrid-vector' : 'hybrid-lexical'
  return { query, mode, results: ranked.map((item) => ({ id: item.id, entityType: item.entityType, entityId: item.entityId, title: item.title, chunkIndex: item.chunkIndex, text: item.text, score: max ? Math.min(1, item.rrfScore / max) : 0, rawScore: item.rrfScore, bm25Score: item.bm25Score, phraseScore: item.phraseScore, vectorScore: item.vectorScore || null, matchedBy: vectorRows.length ? 'hybrid-vector' : item.bm25Score > 0 && item.phraseScore > 0 ? 'hybrid' : item.bm25Score > 0 ? 'bm25' : 'phrase', volumeId: item.volumeId || null })) }
}

export function indexStatus(index, project, summaries, config = {}) {
  if (!index) return { status: 'no_index', indexedChunks: 0 }
  const signature = sourceSignature(project, summaries); const requestedSize = config && config.chunkSize != null ? config.chunkSize : index.config && index.config.chunkSize; const requestedOverlap = config && config.chunkOverlap != null ? config.chunkOverlap : index.config && index.config.chunkOverlap; const same = index.signature === signature && index.config && index.config.chunkSize === requestedSize && index.config.chunkOverlap === requestedOverlap
  return { status: same ? 'fresh' : 'stale', indexedChunks: Array.isArray(index.chunks) ? index.chunks.length : 0, builtAt: index.builtAt || 0 }
}
