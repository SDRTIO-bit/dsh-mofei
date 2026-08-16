/**
 * editor-limits.js 的纯 node 单元测试。
 *
 * 运行：node plugin/src/client/editor-limits.test.mjs
 * 依赖：node:assert/strict（无第三方、无 DOM）。
 */

import assert from "node:assert/strict";
import {
  getEditorContentLimit,
  formatContentLimitError,
  MAX_EDITOR_CONTENT_CHARACTERS,
  MAX_EDITOR_CONTENT_LINES,
} from "./editor-limits.js";

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test("空字符串：0 行、0 字、通过", () => {
  const r = getEditorContentLimit("");
  assert.equal(r.lineCount, 0);
  assert.equal(r.characterCount, 0);
  assert.equal(r.isWithinLimit, true);
});

test("无换行文本：1 行", () => {
  const r = getEditorContentLimit("abc");
  assert.equal(r.lineCount, 1);
  assert.equal(r.characterCount, 3);
});

test("单个 \\n：2 行", () => {
  const r = getEditorContentLimit("a\nb");
  assert.equal(r.lineCount, 2);
  assert.equal(r.characterCount, 3);
});

test("CRLF 只算一个换行", () => {
  const r = getEditorContentLimit("a\r\nb");
  assert.equal(r.lineCount, 2);
  assert.equal(r.characterCount, 4);
});

test("单独 \\r 算换行", () => {
  const r = getEditorContentLimit("a\rb");
  assert.equal(r.lineCount, 2);
});

test("尾部换行不额外计行", () => {
  assert.equal(getEditorContentLimit("a\n").lineCount, 1);
  assert.equal(getEditorContentLimit("a\r\n").lineCount, 1);
  assert.equal(getEditorContentLimit("a\nb\n").lineCount, 2);
});

test("混合 Unicode 行分隔符", () => {
  // \u000B \u000C \u001C \u001D \u001E \u0085 \u2028 \u2029
  const content = "a\u000Bb\u000Cc\u001Cd\u001De\u001Ef\u0085g\u2028h\u2029i";
  assert.equal(getEditorContentLimit(content).lineCount, 9);
});

test("CRLF 与空行组合", () => {
  assert.equal(getEditorContentLimit("a\r\n\r\nb").lineCount, 3);
});

test("emoji 按 Unicode 码点计数", () => {
  // "😀" 为单个码点，""（👍🏽）为 2 个码点
  assert.equal(getEditorContentLimit("😀").characterCount, 1);
  assert.equal(getEditorContentLimit("👍🏽").characterCount, 2);
});

test("恰好 100000 字通过", () => {
  const content = "a".repeat(MAX_EDITOR_CONTENT_CHARACTERS);
  const r = getEditorContentLimit(content);
  assert.equal(r.characterCount, 100000);
  assert.equal(r.isWithinLimit, true);
});

test("100001 字拒绝", () => {
  const content = "a".repeat(MAX_EDITOR_CONTENT_CHARACTERS + 1);
  const r = getEditorContentLimit(content);
  assert.equal(r.characterCount, 100001);
  assert.equal(r.isWithinLimit, false);
});

test("恰好 2000 行通过", () => {
  const content = Array(MAX_EDITOR_CONTENT_LINES).fill("x").join("\n");
  const r = getEditorContentLimit(content);
  assert.equal(r.lineCount, 2000);
  assert.equal(r.isWithinLimit, true);
});

test("2001 行拒绝", () => {
  const content = Array(MAX_EDITOR_CONTENT_LINES + 1).fill("x").join("\n");
  const r = getEditorContentLimit(content);
  assert.equal(r.lineCount, 2001);
  assert.equal(r.isWithinLimit, false);
});

test("formatContentLimitError 正常输出", () => {
  const msg = formatContentLimitError({ lineCount: 2001, characterCount: 100001 });
  assert.match(msg, /100001/);
  assert.match(msg, /100000/);
  assert.match(msg, /2001/);
  assert.match(msg, /2000/);
  assert.match(msg, /请拆分章节后再保存/);
});

test("formatContentLimitError 字段缺失兜底 0", () => {
  const msg = formatContentLimitError({});
  assert.match(msg, /当前 0 字/);
  assert.match(msg, /0 行 \/ 2000 行/);
  assert.equal(formatContentLimitError(null), formatContentLimitError({}));
});

test("null / undefined 输入安全", () => {
  const r = getEditorContentLimit(null);
  assert.equal(r.lineCount, 0);
  assert.equal(r.characterCount, 0);
  assert.equal(r.isWithinLimit, true);
  assert.equal(getEditorContentLimit(undefined).lineCount, 0);
});

console.log(`\n${passed} 项测试全部 PASS`);
