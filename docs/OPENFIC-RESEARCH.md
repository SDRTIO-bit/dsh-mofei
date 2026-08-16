# OpenFic 摘要与检索/RAG 调研（v0.10.1）

> 调研日期：2026-08。源码：`F:\game\SillyTavern-1.13.2\OpenFic-main\OpenFic-main\backend\app`（Python/FastAPI）。
> 用途：为墨扉后续版本提供借鉴清单。原则：只借鉴写作域产品设计，不移植 Python/LangChain/SQLite 运行时。

## 一、摘要体系（两级，无更高层）

- **章摘要 + 区间摘要（long_term）=「摘要的摘要」**：固定窗 `LONG_TERM_SUMMARY_INTERVAL=10`，攒够 10 条 READY 的章摘要后聚合一条 400-600 字区间摘要（`memory/chapter/summary_generator.py`、`prompts/memory/range-summary.yaml`）。
- **过期判定**：章摘要 = 正文去空白去标点后字符差 > 100 即 stale（`summary_service.py`，`SUMMARY_STALE_DIFF_THRESHOLD=100`）；区间摘要 = 对每条源章摘要做 `chapter_summary_signature`（内容+人物+地点+时间 SHA256），任一变化即级联失效。
- **存储内容**：要点（200-300 字）+ characters/locations/start/end/token_count，不存正文冗余。
- **分级注入上下文**（`memory/chapter/context_builder.py`）：
  `latest=当前章全文 → near=前 9 章全文 → mid=前 10~19 章章摘要 → far=更早区间摘要 → chapter_list=目录`。
- **调度**：统一后台批任务（summary_batch），逐条生成→存→推进度。

## 二、检索/RAG（chunk 级 + 混合）

- **索引粒度**：`RecursiveCharacterChunker`，`chunk_size=800 / overlap=100`；每个 chunk 注入章前缀「第X章 标题」（`retrieval/chapter_index.py`）。
- **混合检索**（`retrieval/internal/query/builder.py` + `ranking.py`）：向量 top40 + BM25 FTS top40 → **RRF 融合**（alpha=0.7, k=60）→ 归一化 0~1 → 阈值裁剪。
- **中文 FTS**：ngram bigram(2,2)、关英文 stem/停用词（`DEFAULT_FTS_INDEX_PARAMS`）。
- **新鲜度 guard**（`search_chapters.py`）：索引 stale 时先提示 update_index 或 force=true，避免返回过期结果。
- **增量索引**：每章 `source_hash` + 状态机（not_indexed/queued/indexing/ready/stale/needs_rebuild/failed）；内容哈希变→stale，模型/维度变→needs_rebuild；批任务分批 embed（50 chunk/批）并推进度。
- **embedding 选型**：builtin(fastembed 本地)/openai/google/mistral/cohere/nvidia 统一入口，HF 不可达转 GCS。

## 三、墨扉可借鉴能力点（P-next 候选）

| # | 能力 | OpenFic 做法 | 墨扉落地建议 |
| --- | --- | --- | --- |
| 1 | 摘要签名链 | 章摘要内容+人物+地点 SHA256，区间摘要存源签名，级联失效 | 墨扉区间 stale 已按 chapterRevision 判定；可加内容哈希兜底外部编辑不 bump revision 的情况 |
| 2 | 分级注入 | latest/near 全文 → mid 章摘要 → far 区间摘要 → 目录 | `buildChapterContext` 已做近/中/远；补充 mid/far 段位配置化 |
| 3 | 章节前缀入索引 | 每个 chunk 前注入「第X章 标题」 | 墨扉 retrieve 已把 chapter.title 并入索引行，等价 |
| 4 | 中文 ngram FTS | bigram(2,2) | 墨扉倒排已用中文 bigram + 单字，等价 |
| 5 | RRF 混合 | 向量+BM25 → RRF → 阈值 | `mofei_retrieve` 接口预留；未来接 DSH 向量生态时实现 RRF 层 |
| 6 | 索引新鲜度 guard | 检索前查 freshness | 墨扉索引按 revision 签名实时失效，无需 guard |
| 7 | source_hash 增量 | 内容哈希→stale→只重建脏章 | 墨扉每查询签名比对，等价且更简单 |

## 四、明确不做

- 不引入 LanceDB/SQLite 向量库存储层（墨扉 Markdown 树优先，自建倒排 + 接口预留）。
- 不移植 LangChain Embeddings 抽象 / BackgroundJob 任务系统 / langgraph agent_runtime / 审计事件流（DSH 已有等价能力）。
- 不存正文归一化冗余列（墨扉正文就是文件，直接 hash/diff）。
