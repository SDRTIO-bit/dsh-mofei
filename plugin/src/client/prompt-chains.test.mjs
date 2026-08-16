// prompt-chains.test.mjs —— 纯 node 测试（不依赖 React，只测纯函数导出）。
import {
  PROMPT_CHAINS_CSS,
  ensurePromptChainsStyles,
  normalizeChainName,
  chainTemplateVars,
} from './prompt-chains.js'

let passed = 0
let failed = 0

function check(name, condition, detail) {
  if (condition) {
    passed++
    console.log('PASS ' + name)
  } else {
    failed++
    console.log('FAIL ' + name + (detail ? ' —— ' + detail : ''))
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
}

// ===== normalizeChainName =====
// 1. 正常字符串原样保留
eq('normalize normal string', normalizeChainName('第一章提纲链'), '第一章提纲链')

// 2. 首尾空白 trim
eq('normalize trims edges', normalizeChainName('  世界书生成链  '), '世界书生成链')

// 3. 空字符串回退「未命名链」
eq('normalize empty -> fallback', normalizeChainName(''), '未命名链')
eq('normalize whitespace-only -> fallback', normalizeChainName('   '), '未命名链')

// 4. null / undefined 回退「未命名链」
eq('normalize null -> fallback', normalizeChainName(null), '未命名链')
eq('normalize undefined -> fallback', normalizeChainName(undefined), '未命名链')

// 5. 非字符串输入 String 兜底
eq('normalize number -> string', normalizeChainName(12345), '12345')
eq('normalize object -> string', normalizeChainName({ a: 1 }), '[object Object]')

// 6. 长名称按码点截断到 40
const longName = '链'.repeat(100)
eq('normalize truncates to 40 code points', Array.from(normalizeChainName(longName)).length, 40)
eq('normalize truncates prefix preserved', normalizeChainName('一二三四五'.repeat(20)), '一二三四五'.repeat(8))

// 7. 码点截断不拆散代理对（emoji，2 个 UTF-16 单元 = 1 码点）
const emojiName = '🙂'.repeat(50)
const emojiNorm = normalizeChainName(emojiName)
eq('normalize emoji truncates to 40 code points', Array.from(emojiNorm).length, 40)
check('normalize emoji no broken surrogate', emojiNorm.length === 80 && !emojiNorm.includes('\uFFFD'),
  '结果 UTF-16 长度：' + emojiNorm.length)

// 8. 截到 40 之后又 trim 掉空白也不为空（边界：恰好 40 码点）
eq('normalize exactly 40 code points kept', Array.from(normalizeChainName('a'.repeat(40))).length, 40)

// ===== chainTemplateVars =====
// 9. 提取受支持的 8 个宏，按首次出现顺序
const allMacros = chainTemplateVars('{{project}} {{chapter}} {{chapterText}} {{selected}} {{characters}} {{world}} {{notes}} {{instruction}}')
eq('templateVars extracts all 8 supported macros in order',
  allMacros.join(','),
  'project,chapter,chapterText,selected,characters,world,notes,instruction')

// 10. 未知宏忽略
eq('templateVars ignores unknown macros',
  JSON.stringify(chainTemplateVars('{{project}} {{foo}} {{bar}} {{chapter}}')),
  JSON.stringify(['project', 'chapter']))

// 11. 去重（重复出现只保留一次，且保首次位置）
eq('templateVars dedupes',
  JSON.stringify(chainTemplateVars('{{project}} {{chapter}} {{project}} {{notes}} {{chapter}}')),
  JSON.stringify(['project', 'chapter', 'notes']))

// 12. 顺序按首次出现而非宏表顺序
eq('templateVars preserves first-occurrence order',
  JSON.stringify(chainTemplateVars('{{world}} {{project}} {{world}} {{chapter}}')),
  JSON.stringify(['world', 'project', 'chapter']))

// 13. 无匹配返回空数组
eq('templateVars no match -> []', JSON.stringify(chainTemplateVars('没有宏的模板')), '[]')
eq('templateVars empty -> []', JSON.stringify(chainTemplateVars('')), '[]')

// 14. 脏输入（非字符串）返回空数组
eq('templateVars null -> []', JSON.stringify(chainTemplateVars(null)), '[]')
eq('templateVars undefined -> []', JSON.stringify(chainTemplateVars(undefined)), '[]')
eq('templateVars number -> []', JSON.stringify(chainTemplateVars(42)), '[]')

// 15. 宏名两侧空白容错（{{ project }} 也算）
eq('templateVars tolerates spaces inside braces',
  JSON.stringify(chainTemplateVars('{{ project }} {{  chapter  }}')),
  JSON.stringify(['project', 'chapter']))

// 16. 大小写不匹配（宏名区分大小写，Chapter 不是受支持宏）
eq('templateVars case-sensitive',
  JSON.stringify(chainTemplateVars('{{Chapter}} {{chapter}}')),
  JSON.stringify(['chapter']))

// ===== PROMPT_CHAINS_CSS =====
// 17. 非空字符串，且含 mf-ch- 类与卡片尺寸关键字
check('CSS is non-empty string', typeof PROMPT_CHAINS_CSS === 'string' && PROMPT_CHAINS_CSS.length > 0)
check('CSS contains mf-ch-overlay', PROMPT_CHAINS_CSS.includes('.mf-ch-overlay'))
check('CSS contains mf-ch-list', PROMPT_CHAINS_CSS.includes('.mf-ch-list'))
check('CSS contains mf-ch-name', PROMPT_CHAINS_CSS.includes('.mf-ch-name'))
check('CSS contains mf-ch-content', PROMPT_CHAINS_CSS.includes('.mf-ch-content'))
check('CSS card uses min(860px,92vw)', PROMPT_CHAINS_CSS.includes('min(860px,92vw)'))
check('CSS card height 76vh', PROMPT_CHAINS_CSS.includes('76vh'))

// ===== ensurePromptChainsStyles（无 DOM 环境安全）=====
// 18. node 环境（无 document）调用不抛错
let threw = false
try { ensurePromptChainsStyles() } catch (e) { threw = true }
check('ensureStyles noop without document', threw === false)

// 19. 提供伪 document 时注入去重（data-mf-chains）
function runEnsureWithFakeDocument(existing) {
  let appendedAttr = null
  const fakeDoc = {
    querySelector(sel) {
      return existing ? { match: sel } : null
    },
    createElement() {
      return {
        attrs: {},
        textContent: '',
        setAttribute(k, v) { this.attrs[k] = v },
      }
    },
    head: { appended: null, appendChild(node) { this.appended = node } },
  }
  const saved = globalThis.document
  globalThis.document = fakeDoc
  let threw = false
  try { ensurePromptChainsStyles() } catch (e) { threw = true }
  globalThis.document = saved
  return { threw, fakeDoc }
}

const inject1 = runEnsureWithFakeDocument(false)
check('ensureStyles injects with data-mf-chains', inject1.threw === false && inject1.fakeDoc.head.appended && inject1.fakeDoc.head.appended.attrs['data-mf-chains'] === '')
check('ensureStyles injects CSS text', inject1.fakeDoc.head.appended && inject1.fakeDoc.head.appended.textContent === PROMPT_CHAINS_CSS)

const inject2 = runEnsureWithFakeDocument(true)
check('ensureStyles dedupes when existing style', inject2.threw === false && inject2.fakeDoc.head.appended === null)

// 结果汇总
console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exit(1)
else console.log('ALL TESTS PASSED')
