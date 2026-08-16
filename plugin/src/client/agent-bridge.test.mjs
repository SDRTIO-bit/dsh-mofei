/**
 * agent-bridge.js 的纯 node 单元测试（工作包 B）。
 *
 * 运行：node plugin/src/client/agent-bridge.test.mjs
 * 依赖：node:assert/strict（无第三方、无 DOM）。
 */

import assert from "node:assert/strict";
import {
  MENTION_MAX_EXCERPT,
  truncateMention,
  buildChapterMention,
  buildSelectionMention,
  buildRangeMention,
  buildWriterMention,
  buildReviewerMention,
} from "./agent-bridge.js";

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const HEADER_NAMED = "【墨扉 · 项目《P》 · 章节《T》】";
const FULL_FOOTER = "请用 mofei_read-chapter 读取该章节完整内容后，继续写作任务。";
const SELECTION_FOOTER = "请针对上面选中文本处理（润色/改写/续写，由任务决定），并用 mofei_read-chapter 核对全文一致性。";
const RANGE_FOOTER = "请针对上面的行区间处理，并用 mofei_read-chapter 核对全文一致性。";

/* ---------- truncateMention ---------- */

test("truncateMention：空字符串返回空串", () => {
  assert.equal(truncateMention(""), "");
});

test("truncateMention：null / undefined 安全返回空串", () => {
  assert.equal(truncateMention(null), "");
  assert.equal(truncateMention(undefined), "");
});

test("truncateMention：非字符串 String 化", () => {
  assert.equal(truncateMention(123), "123");
  assert.equal(truncateMention(true), "true");
});

test("truncateMention：trim 前后空白", () => {
  assert.equal(truncateMention("  abc  "), "abc");
});

test("truncateMention：不超过上限原样返回", () => {
  const s = "hello";
  assert.equal(truncateMention(s, 10), s);
  assert.equal(truncateMention(s), s);
});

test("truncateMention：超过上限按码点截断", () => {
  assert.equal(truncateMention("abcdef", 3), "abc");
});

test("truncateMention：码点不拆代理对（emoji）", () => {
  const big = "😀".repeat(MENTION_MAX_EXCERPT + 5);
  const r = truncateMention(big);
  assert.equal([...r].length, MENTION_MAX_EXCERPT);
  // 每个 emoji 恰为一个码点，截断后应仍是完整 emoji
  assert.equal(/[\uD800-\uDBFF]$/.test(r.slice(-1)), false);
  assert.ok(!r.includes("\uFFFD"));
});

test("truncateMention：4000 码点长文本截断且正好 4000", () => {
  const long = "a".repeat(5000);
  const r = truncateMention(long);
  assert.equal([...r].length, MENTION_MAX_EXCERPT);
  assert.equal(r.length, MENTION_MAX_EXCERPT);
});

test("truncateMention：max <= 0 返回空串", () => {
  assert.equal(truncateMention("abc", 0), "");
});

/* ---------- buildChapterMention ---------- */

test("buildChapterMention：完整文案逐行精确", () => {
  const out = buildChapterMention({
    projectTitle: "P",
    projectId: "PID",
    chapter: { id: "CID", title: "T", content: "第一段内容" },
  });
  assert.equal(
    out,
    [
      HEADER_NAMED,
      "projectId: PID",
      "chapterId: CID",
      "范围: 整章",
      "---",
      "第一段内容",
      "---",
      FULL_FOOTER,
    ].join("\n")
  );
});

test("buildChapterMention：excerpt 默认取 chapter.content", () => {
  const out = buildChapterMention({
    projectTitle: "P",
    chapter: { id: "C", title: "T", content: "正文" },
  });
  assert.ok(out.includes("正文"));
});

test("buildChapterMention：显式 excerpt 优先于 content", () => {
  const out = buildChapterMention({
    projectTitle: "P",
    chapter: { id: "C", title: "T", content: "正文" },
    excerpt: "摘要",
  });
  assert.ok(out.includes("摘要"));
  assert.ok(!out.includes("正文"));
});

test("buildChapterMention：内容经 truncateMention 截断 4000", () => {
  const long = "x".repeat(6000);
  const out = buildChapterMention({
    projectTitle: "P",
    chapter: { id: "C", title: "T", content: long },
  });
  const block = out.split("---")[1].trim();
  assert.equal([...block].length, MENTION_MAX_EXCERPT);
});

test("buildChapterMention：projectId/chapterId 缺失不输出该行", () => {
  const out = buildChapterMention({ projectTitle: "P", chapter: { title: "T", content: "c" } });
  assert.ok(!out.includes("projectId:"));
  assert.ok(!out.includes("chapterId:"));
});

/* ---------- buildSelectionMention ---------- */

test("buildSelectionMention：完整文案逐行精确", () => {
  const out = buildSelectionMention({
    projectTitle: "P",
    projectId: "PID",
    chapter: { id: "CID", title: "T", content: "unused" },
    selected: "选中的句子",
  });
  assert.equal(
    out,
    [
      HEADER_NAMED,
      "projectId: PID",
      "chapterId: CID",
      "范围: 选中文本",
      "---",
      "选中的句子",
      "---",
      SELECTION_FOOTER,
    ].join("\n")
  );
});

test("buildSelectionMention：selected 为空 -> 空串内容", () => {
  const out = buildSelectionMention({
    projectTitle: "P",
    chapter: { id: "C", title: "T" },
    selected: "",
  });
  assert.equal(out.split("---")[1].trim(), "");
});

test("buildSelectionMention：selected 截断 4000", () => {
  const long = "y".repeat(6000);
  const out = buildSelectionMention({
    projectTitle: "P",
    chapter: { id: "C", title: "T" },
    selected: long,
  });
  assert.equal([...out.split("---")[1].trim()].length, MENTION_MAX_EXCERPT);
});

/* ---------- buildRangeMention ---------- */

test("buildRangeMention：完整文案逐行精确", () => {
  const out = buildRangeMention({
    projectTitle: "P",
    projectId: "PID",
    chapter: { id: "CID", title: "T" },
    startLine: 2,
    endLine: 4,
    lines: ["l1", "l2", "l3", "l4", "l5"],
  });
  assert.equal(
    out,
    [
      HEADER_NAMED,
      "projectId: PID",
      "chapterId: CID",
      "范围: L2-L4",
      "---",
      "L2: l2",
      "L3: l3",
      "L4: l4",
      "---",
      RANGE_FOOTER,
    ].join("\n")
  );
});

test("buildRangeMention：行拼接为 L{n}: {text}", () => {
  const out = buildRangeMention({
    projectTitle: "P",
    chapter: { title: "T" },
    startLine: 1,
    endLine: 2,
    lines: ["甲", "乙"],
  });
  assert.ok(out.includes("L1: 甲"));
  assert.ok(out.includes("L2: 乙"));
});

test("buildRangeMention：lines 非数组安全（空行区间）", () => {
  const out = buildRangeMention({
    projectTitle: "P",
    chapter: { title: "T" },
    startLine: 1,
    endLine: 2,
    lines: "not-array",
  });
  assert.equal(out.split("---")[1].trim(), "");
});

test("buildRangeMention：start 越界 -> 空区间不抛异常", () => {
  const out = buildRangeMention({
    projectTitle: "P",
    chapter: { title: "T" },
    startLine: 99,
    endLine: 100,
    lines: ["a", "b"],
  });
  assert.equal(out.split("---")[1].trim(), "");
});

test("buildRangeMention：end 越界 -> 只取可用行", () => {
  const out = buildRangeMention({
    projectTitle: "P",
    chapter: { title: "T" },
    startLine: 2,
    endLine: 99,
    lines: ["a", "b", "c"],
  });
  const body = out.split("---")[1].trim();
  assert.equal(body, "L2: b\nL3: c");
});

test("buildRangeMention：startLine/endLine 缺失兜底", () => {
  const out = buildRangeMention({
    projectTitle: "P",
    chapter: { title: "T" },
    lines: ["a", "b"],
  });
  assert.ok(out.includes("范围: L1-L1"));
  assert.equal(out.split("---")[1].trim(), "L1: a");
});

/* ---------- 兜底与通用 ---------- */

test("空 projectTitle -> 未命名项目；空 chapter.title -> 未命名章节", () => {
  const out = buildChapterMention({ chapter: { id: "C", content: "c" } });
  assert.ok(out.startsWith("【墨扉 · 项目《未命名项目》 · 章节《未命名章节》】"));
});

test("input 为 null/undefined 安全", () => {
  const out = buildChapterMention(null);
  assert.ok(out.includes("范围: 整章"));
  assert.ok(out.includes("未命名项目"));
  assert.equal(typeof buildSelectionMention(undefined), "string");
  assert.equal(typeof buildRangeMention(null), "string");
});

test("export 常量 MENTION_MAX_EXCERPT = 4000", () => {
  assert.equal(MENTION_MAX_EXCERPT, 4000);
});

/* ---------- v0.10.1 Writer / Reviewer 快捷指令提及 ---------- */

test("buildWriterMention：任务头 + 整章提及（含 projectId/chapterId 与脚注）", () => {
  const out = buildWriterMention({
    projectTitle: "P",
    projectId: "project-1",
    chapter: { id: "chapter-2", title: "T", content: "正文。" },
  });
  assert.ok(out.startsWith("【墨扉 Writer 任务】"));
  assert.ok(out.includes("mofei_read-chapter"));
  assert.ok(out.includes("expectedRevision"));
  assert.ok(out.includes("projectId: project-1"));
  assert.ok(out.includes("chapterId: chapter-2"));
  assert.ok(out.includes(FULL_FOOTER));
});

test("buildReviewerMention：任务头 + 整章提及 + PASS 输出约定", () => {
  const out = buildReviewerMention({
    projectTitle: "P",
    projectId: "project-1",
    chapter: { id: "chapter-2", title: "T", content: "正文。" },
  });
  assert.ok(out.startsWith("【墨扉 Reviewer 任务】"));
  assert.ok(out.includes("mofei_search-chapters"));
  assert.ok(out.includes("「PASS」"));
  assert.ok(out.includes("projectId: project-1"));
  assert.ok(out.includes(FULL_FOOTER));
});

test("Writer/Reviewer 提及 null 安全", () => {
  assert.equal(typeof buildWriterMention(null), "string");
  assert.equal(typeof buildReviewerMention(undefined), "string");
});

console.log(`\n${passed} 项测试全部 PASS`);
