/**
 * 编辑器内容上限（编辑器正文的字数 / 行数上限校验）。
 *
 * 来源：原版 OpenFic-main/OpenFic-main/frontend/src/lib/editor-content-limits.ts
 * 许可：Apache-2.0（Copyright © OpenFic 原作者）
 *
 * 本文件为纯 ESM 逻辑模块：无 DOM、无第三方依赖、无顶层 React import。
 * 行为与原版逐字符一致，仅将 TypeScript 改写为 JavaScript 并本地化为中文。
 */

export const MAX_EDITOR_CONTENT_LINES = 2_000;
export const MAX_EDITOR_CONTENT_CHARACTERS = 100_000;

const LINE_SEPARATORS = new Set([
  "\n",
  "\r",
  "\u000B",
  "\u000C",
  "\u001C",
  "\u001D",
  "\u001E",
  "\u0085",
  "\u2028",
  "\u2029",
]);

function countEditorContentLines(content) {
  if (content === "") return 0;

  let separatorCount = 0;
  let endsWithSeparator = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    if (!LINE_SEPARATORS.has(character)) {
      endsWithSeparator = false;
      continue;
    }

    separatorCount += 1;
    if (character === "\r" && content[index + 1] === "\n") index += 1;
    endsWithSeparator = index === content.length - 1;
  }

  return endsWithSeparator ? separatorCount : separatorCount + 1;
}

/**
 * 计算编辑器正文的行数与字数，并给出是否在上限内。
 *
 * @param {string} content 编辑器正文（非字符串输入按原版语义处理为不匹配任何分隔符的空串）。
 * @returns {{ lineCount: number, characterCount: number, isWithinLimit: boolean }}
 */
export function getEditorContentLimit(content) {
  const lineCount = countEditorContentLines(String(content ?? ""));
  const characterCount = Array.from(content ?? "").length;

  return {
    lineCount,
    characterCount,
    isWithinLimit:
      lineCount <= MAX_EDITOR_CONTENT_LINES && characterCount <= MAX_EDITOR_CONTENT_CHARACTERS,
  };
}

/**
 * 将上限校验结果格式化为中文错误文案。
 *
 * @param {{ lineCount?: number, characterCount?: number }} limit getEditorContentLimit 的返回值。
 * @returns {string} 中文错误文案；字段缺失时按 0 兜底。
 */
export function formatContentLimitError(limit) {
  const characterCount = Number(limit?.characterCount) || 0;
  const lineCount = Number(limit?.lineCount) || 0;

  return (
    `正文超出上限：当前 ${characterCount} 字 / ${MAX_EDITOR_CONTENT_CHARACTERS} 字，` +
    `${lineCount} 行 / ${MAX_EDITOR_CONTENT_LINES} 行。请拆分章节后再保存。`
  );
}
