/**
 * @提及桥接纯函数（工作包 B）。
 *
 * 只做文案构建：不 fetch、不发 prompt、无 DOM、无第三方依赖。
 * 纯 ESM，可在 node / 浏览器中直接使用。
 */

/**
 * 提及摘要（excerpt / selected）的最大长度，按 Unicode 码点计。
 */
export const MENTION_MAX_EXCERPT = 4000;

function toText(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * String 化 / trim / 按码点截断到 max。
 * - null / undefined -> ""
 * - 非字符串 -> String(value)
 * - 长度按 Unicode 码点（而非 UTF-16 code unit）计，避免拆散代理对
 */
export function truncateMention(text, max = MENTION_MAX_EXCERPT) {
  const s = toText(text).trim();
  const limit = typeof max === "number" && Number.isFinite(max) ? max : MENTION_MAX_EXCERPT;
  if (limit <= 0) return "";
  const points = Array.from(s);
  if (points.length <= limit) return s;
  return points.slice(0, limit).join("");
}

/** 缺失（undefined / null / 空串）视为不存在，不输出该行。 */
function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function headerLine(projectTitle, chapterTitle) {
  const title = toText(projectTitle).trim() || "未命名项目";
  const chapter = toText(chapterTitle).trim() || "未命名章节";
  return `【墨扉 · 项目《${title}》 · 章节《${chapter}》】`;
}

function idLines(input, chapter) {
  const lines = [];
  if (hasValue(input.projectId)) lines.push(`projectId: ${input.projectId}`);
  if (hasValue(chapter.id)) lines.push(`chapterId: ${chapter.id}`);
  return lines;
}

const CHUNK_BOUNDARY = "---";

const FULL_FOOTER = "请用 mofei_read-chapter 读取该章节完整内容后，继续写作任务。";
const SELECTION_FOOTER = "请针对上面选中文本处理（润色/改写/续写，由任务决定），并用 mofei_read-chapter 核对全文一致性。";
const RANGE_FOOTER = "请针对上面的行区间处理，并用 mofei_read-chapter 核对全文一致性。";

function numberOrFallback(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 整章提及。
 * input: { projectTitle, projectId?, chapter: { id?, title, content }, excerpt? }
 */
export function buildChapterMention(input) {
  const source = input == null ? {} : input;
  const chapter = source.chapter ?? {};
  const excerpt = hasValue(source.excerpt) ? source.excerpt : chapter.content;
  return [
    headerLine(source.projectTitle, chapter.title),
    ...idLines(source, chapter),
    "范围: 整章",
    CHUNK_BOUNDARY,
    truncateMention(excerpt),
    CHUNK_BOUNDARY,
    FULL_FOOTER,
  ].join("\n");
}

/**
 * 选中文本提及。
 * input: { projectTitle, projectId?, chapter: { id?, title, content? }, selected }
 * selected 为空 -> 空串（组件层应阻止空发送）。
 */
export function buildSelectionMention(input) {
  const source = input == null ? {} : input;
  const chapter = source.chapter ?? {};
  return [
    headerLine(source.projectTitle, chapter.title),
    ...idLines(source, chapter),
    "范围: 选中文本",
    CHUNK_BOUNDARY,
    truncateMention(source.selected),
    CHUNK_BOUNDARY,
    SELECTION_FOOTER,
  ].join("\n");
}

/**
 * 行区间提及。
 * input: { projectTitle, projectId?, chapter: { id?, title }, startLine, endLine, lines: string[] }
 * lines 非数组或越界安全（slice 后逐行 L{n}: {text}）。
 */
export function buildRangeMention(input) {
  const source = input == null ? {} : input;
  const chapter = source.chapter ?? {};
  const start = numberOrFallback(source.startLine, 1);
  const end = numberOrFallback(source.endLine, start);

  const lines = Array.isArray(source.lines) ? source.lines : [];
  const begin = Math.max(0, start - 1);
  const sliced = lines.slice(begin, end);
  const body = sliced.map((text, i) => `L${start + i}: ${toText(text)}`).join("\n");

  return [
    headerLine(source.projectTitle, chapter.title),
    ...idLines(source, chapter),
    `范围: L${start}-L${end}`,
    CHUNK_BOUNDARY,
    body,
    CHUNK_BOUNDARY,
    RANGE_FOOTER,
  ].join("\n");
}

const WRITER_HEADER = "【墨扉 Writer 任务】请作为 Writer 处理本章：先 mofei_read-chapter 读取（拿 revision），"
  + "遵守 mofei-writing 技能红线（不换皮、信息差、一致性、冲突保护），完成后用 mofei_update-chapter 提交并传 expectedRevision。";
const REVIEWER_HEADER = "【墨扉 Reviewer 任务】请作为 Reviewer 审阅本章：用 mofei_read-chapter 读取，"
  + "用 mofei_search-chapters 核对设定一致性。输出问题清单（严重度 + 位置 + 建议），不要直接改正文；若无问题输出「PASS」。";

/**
 * Writer 快捷指令提及：整章提及 + Writer 任务头。
 */
export function buildWriterMention(input) {
  const source = input == null ? {} : input;
  return [WRITER_HEADER, "", buildChapterMention(source)].join("\n");
}

/**
 * Reviewer 快捷指令提及：整章提及 + Reviewer 任务头。
 */
export function buildReviewerMention(input) {
  const source = input == null ? {} : input;
  return [REVIEWER_HEADER, "", buildChapterMention(source)].join("\n");
}
