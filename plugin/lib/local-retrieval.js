import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'

const execFileAsync = promisify(execFile)
const dynamicImport = new Function('specifier', 'return import(specifier)')
let rerankRuntime = null
// v0.24: 本机路径 env 可覆盖（MOFEI_PYTHON_PATH / MOFEI_EMBED_CACHE_DIR / MOFEI_EMBED_MODEL /
// MOFEI_EMBED_DIMENSIONS / MOFEI_RERANK_MODEL / MOFEI_RERANK_MODEL_PATH），缺省 = 原硬编码值，行为不变。
const envString = (name, fallback) => { const value = process.env[name]; return typeof value === 'string' && value.trim() ? value.trim() : fallback }
const envNumber = (name, fallback) => { const value = Number(process.env[name]); return Number.isFinite(value) && value > 0 ? value : fallback }
export const DEFAULT_LOCAL_RETRIEVAL = {
  mode: 'local',
  pythonPath: envString('MOFEI_PYTHON_PATH', 'C:/Users/zhao/AppData/Roaming/openfic-desktop/runtime/venv/Scripts/python.exe'),
  cacheDir: envString('MOFEI_EMBED_CACHE_DIR', 'C:/Users/zhao/AppData/Roaming/openfic-desktop/fastembed_cache'),
  embeddingModel: envString('MOFEI_EMBED_MODEL', 'BAAI/bge-small-zh-v1.5'),
  embeddingDimensions: envNumber('MOFEI_EMBED_DIMENSIONS', 512),
  rerankModel: envString('MOFEI_RERANK_MODEL', 'Xenova/ms-marco-MiniLM-L-6-v2'),
  rerankModelPath: envString('MOFEI_RERANK_MODEL_PATH', 'C:/Users/zhao/.cache/modelscope/models/Xenova--ms-marco-MiniLM-L-6-v2/snapshots/master'),
}

const PY_EMBED = String.raw`import os
os.environ['HF_HUB_OFFLINE']='1'
import json, sys
payload=json.load(open(sys.argv[1], encoding='utf8'))
from fastembed import TextEmbedding
model=TextEmbedding(model_name=payload['model'], cache_dir=payload['cache_dir'])
values=list(model.embed(payload['texts']))
json.dump({'vectors':[list(map(float, value)) for value in values]}, open(sys.argv[2], 'w', encoding='utf8'))`;

async function pythonJson(script, payload, config, timeoutMs = 300000) {
  const dir = path.join(os.tmpdir(), 'mofei-retrieval-' + Math.random().toString(36).slice(2)); await mkdir(dir, { recursive: true })
  const input = path.join(dir, 'input.json'); const output = path.join(dir, 'output.json')
  try { await writeFile(input, JSON.stringify(payload), 'utf8'); await execFileAsync(config.pythonPath, ['-c', script, input, output], { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }); return JSON.parse(await readFile(output, 'utf8')) }
  finally { await rm(dir, { recursive: true, force: true }) }
}

export async function embedTexts(texts, inputConfig = {}) {
  const config = { ...DEFAULT_LOCAL_RETRIEVAL, ...inputConfig }; if (!Array.isArray(texts) || !texts.length) return []
  const result = await pythonJson(PY_EMBED, { model: config.embeddingModel, cache_dir: config.cacheDir, texts }, config)
  return Array.isArray(result.vectors) ? result.vectors : []
}

async function getRerankRuntime(modelPath) {
  if (rerankRuntime && rerankRuntime.modelPath === modelPath) return rerankRuntime
  const transformers = await dynamicImport('@huggingface/transformers')
  const tokenizer = await transformers.AutoTokenizer.from_pretrained(modelPath, { local_files_only: true })
  const model = await transformers.AutoModelForSequenceClassification.from_pretrained(modelPath, { local_files_only: true })
  rerankRuntime = { modelPath, tokenizer, model }; return rerankRuntime
}

export async function rerankTexts(query, documents, inputConfig = {}) {
  const config = { ...DEFAULT_LOCAL_RETRIEVAL, ...inputConfig }; if (!Array.isArray(documents) || !documents.length) return []
  const runtime = await getRerankRuntime(config.rerankModelPath)
  const features = runtime.tokenizer(Array(documents.length).fill(String(query || '')), { text_pair: documents, padding: true, truncation: true })
  const output = await runtime.model(features); const data = output && output.logits && output.logits.data ? Array.from(output.logits.data) : []
  const dims = output && output.logits && Array.isArray(output.logits.dims) ? output.logits.dims : [documents.length, 1]; const columns = dims.length > 1 ? dims[dims.length - 1] : 1
  return documents.map((_, index) => { if (columns <= 1) return Number(data[index] || 0); const negative = Number(data[index * columns] || 0); const positive = Number(data[index * columns + columns - 1] || 0); return positive - negative })
}

export async function rerankResultItems(query, items, inputConfig = {}, limit = 5) {
  if (!Array.isArray(items) || !items.length) return { items: [], ready: false, error: '' }
  const config = { ...DEFAULT_LOCAL_RETRIEVAL, ...inputConfig }; const isChinese = /[\u3400-\u9fff\uf900-\ufaff]/.test(String(query || '')); const isEnglishOnly = /ms-marco|minilm/i.test(String(config.rerankModel || '') + ' ' + String(config.rerankModelPath || ''));
  if (isChinese && isEnglishOnly) return { items: items.slice(0, limit), ready: false, error: 'RERANK_MODEL_LANGUAGE_MISMATCH' }
  try {
    const scores = await rerankTexts(query, items.map((item) => item.text), inputConfig)
    const ranked = items.map((item, index) => ({ ...item, rerankScore: Number(scores[index] || 0) })).sort((a, b) => b.rerankScore - a.rerankScore || b.score - a.score).slice(0, limit)
    return { items: ranked, ready: true, error: '' }
  } catch (error) { return { items: items.slice(0, limit), ready: false, error: String(error && error.message || error) } }
}

export async function localRetrievalStatus(inputConfig = {}) {
  const config = { ...DEFAULT_LOCAL_RETRIEVAL, ...inputConfig }; const status = { mode: config.mode, pythonPath: config.pythonPath, cacheDir: config.cacheDir, embeddingModel: config.embeddingModel, rerankModel: config.rerankModel, rerankModelPath: config.rerankModelPath, embeddingReady: false, rerankReady: false }
  try { const values = await embedTexts(['本地模型检测'], config); status.embeddingReady = values.length === 1 && Array.isArray(values[0]) && values[0].length > 0; status.embeddingDimensions = status.embeddingReady ? values[0].length : 0 } catch (error) { status.embeddingError = String(error && error.message || error) }
  try { await readFile(path.join(config.rerankModelPath, 'config.json'), 'utf8'); status.rerankCachePresent = true; const values = await rerankTexts('本地模型检测', ['本地模型检测'], config); status.rerankReady = values.length === 1 } catch (error) { status.rerankCachePresent = false; status.rerankError = String(error && error.message || error) }
  return status
}
