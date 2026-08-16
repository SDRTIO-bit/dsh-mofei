// 墨扉写作技能目录。技能仍由 mofei-writer preset 在隔离 realm 内注册；
// 此组件只提供作者可见的产品层，不会把技能泄漏进标准 DSH 会话。

let reactBinding = null
let reactResolved = false

const WRITING_SKILL_LABELS = {
  'character-design': '角色设计',
  'character-relationship': '角色关系',
  'deslop-lexicon': '去套话词库',
  'deslop-writing': '去模板化写作',
  'dialogue-design': '对白设计',
  'emotional-arc': '情感弧线',
  'opening-design': '开篇设计',
  'prose-format': '行文格式',
  'reader-contract': '读者契约',
  'reversal-design': '反转设计',
  'short-submission': '短篇投稿',
  'story-deconstruction': '故事拆解',
  'story-hooks': '故事钩子',
  'story-quality': '故事质量',
  'story-state-tracking': '状态追踪',
  'villain-reveal': '反派揭示',
  writing: '墨扉写作',
}

function resolveReact() {
  if (reactResolved) return reactBinding
  reactResolved = true
  const g = typeof globalThis !== 'undefined' ? globalThis : null
  let React = g && g.React
  if (!React && typeof window !== 'undefined') React = window.React
  if (!React) {
    try {
      const req = typeof require === 'function' ? require : (g && g.__mfRequire)
      if (req) React = req('react')
    } catch (error) { /* React is resolved by the host at render time. */ }
  }
  if (!React && g && g.__mofeiReact) React = g.__mofeiReact
  reactBinding = React && typeof React.createElement === 'function'
    ? { h: React.createElement, useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo }
    : null
  return reactBinding
}

export function writingSkillLabel(name) {
  const normalized = String(name || '').replace(/^(mofei|openfic)-/, '')
  return WRITING_SKILL_LABELS[normalized] || normalized.replace(/-/g, ' ')
}

export function filterWritingSkills(skills, query) {
  const term = String(query || '').trim().toLowerCase()
  const list = Array.isArray(skills) ? skills : []
  if (!term) return list
  return list.filter((skill) => [skill && skill.name, skill && skill.description, skill && skill.whenToUse].join(' ').toLowerCase().includes(term))
}

export const WRITING_SKILLS_CSS = [
  '.mf-sk-overlay{position:fixed;inset:0;z-index:132;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.46)}',
  '.mf-sk{width:min(920px,calc(100vw - 48px));height:min(720px,calc(100vh - 72px));display:grid;grid-template-rows:56px minmax(0,1fr);overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 22px 64px rgba(0,0,0,.4)}',
  '.mf-sk-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-sk-title{display:flex;align-items:baseline;gap:8px;min-width:0}.mf-sk-title strong{font-size:14px;font-weight:650}.mf-sk-title small{font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-sk-head-actions{display:flex;align-items:center;gap:4px}.mf-sk-link{border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 8px;cursor:pointer;font:12px/1.2 sans-serif}.mf-sk-link:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.mf-sk-close{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:18px/1 sans-serif}.mf-sk-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.mf-sk-body{display:grid;grid-template-columns:278px minmax(0,1fr);min-height:0}.mf-sk-list{min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1);padding:10px}.mf-sk-search{box-sizing:border-box;width:100%;height:32px;margin:0 0 8px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1 sans-serif;outline:0}.mf-sk-search:focus{border-color:var(--dsw-alias-state-business-primary)}',
  '.mf-sk-item{display:block;width:100%;padding:9px 10px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}.mf-sk-item:hover{background:var(--dsw-alias-interactive-bg-hover)}.mf-sk-item.on{background:var(--dsw-alias-state-business-tertiary)}.mf-sk-item strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;text-transform:none}.mf-sk-item small{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:10.5px}',
  '.mf-sk-detail{min-width:0;min-height:0;overflow:auto;padding:26px 30px}.mf-sk-empty{display:grid;place-items:center;height:100%;color:var(--dsw-alias-label-secondary);font-size:12px}.mf-sk-kicker{font-size:11px;color:var(--dsw-alias-state-success-primary);font-weight:600}.mf-sk-detail h2{margin:7px 0 8px;font-size:20px;line-height:1.3;font-weight:680;text-transform:none}.mf-sk-desc{max-width:660px;margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.7}.mf-sk-rule{height:1px;margin:22px 0;background:var(--dsw-alias-border-l1)}.mf-sk-section-label{margin:0 0 7px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:650}.mf-sk-when{margin:0;white-space:pre-wrap;font-size:13px;line-height:1.75}.mf-sk-content{margin:18px 0 0;padding:14px 16px;border-left:2px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-elevated));white-space:pre-wrap;font:12px/1.72 ui-monospace,Consolas,monospace;max-height:280px;overflow:auto;color:var(--dsw-alias-label-secondary)}',
  '@media(max-width:760px){.mf-sk{width:100vw;height:100vh;border:0;border-radius:0}.mf-sk-body{grid-template-columns:1fr}.mf-sk-list{max-height:40vh;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-sk-detail{padding:20px}.mf-sk-content{max-height:180px}}',
].join('\n')

function ensureStyles() {
  if (typeof document === 'undefined' || document.querySelector('style[data-mf-writing-skills]')) return
  const style = document.createElement('style')
  style.setAttribute('data-mf-writing-skills', '')
  style.textContent = WRITING_SKILLS_CSS
  document.head.appendChild(style)
}

export function WritingSkillsPanel(props) {
  ensureStyles()
  const resolved = resolveReact()
  if (!resolved) throw new Error('墨扉 WritingSkillsPanel 无法解析 React')
  const { h, useState, useEffect, useMemo } = resolved
  const open = !!(props && props.open)
  const skills = Array.isArray(props && props.skills) ? props.skills : []
  const loading = !!(props && props.loading)
  const error = props && props.error ? String(props.error) : ''
  const onClose = props && props.onClose
  const onOpenChains = props && props.onOpenChains
  const [query, setQuery] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const filtered = useMemo(() => filterWritingSkills(skills, query), [skills, query])
  const selected = filtered.find((skill) => skill && skill.name === selectedName) || filtered[0] || null

  useEffect(() => {
    if (!open) return
    if (!selectedName && skills[0]) setSelectedName(skills[0].name)
  }, [open, selectedName, skills])

  if (!open) return null
  const list = loading
    ? h('div', { className: 'mf-sk-empty' }, '正在读取写作技能…')
    : error
      ? h('div', { className: 'mf-sk-empty' }, error)
      : filtered.length
        ? filtered.map((skill) => h('button', { key: skill.name, className: 'mf-sk-item' + (selected && selected.name === skill.name ? ' on' : ''), type: 'button', onClick: () => setSelectedName(skill.name) }, h('strong', null, writingSkillLabel(skill.name)), h('small', null, skill.description || '写作技能')))
        : h('div', { className: 'mf-sk-empty' }, '没有匹配的写作技能')

  const detail = selected
    ? h('article', { className: 'mf-sk-detail' },
      h('div', { className: 'mf-sk-kicker' }, '已加载至 mofei-writer 写作助手'),
      h('h2', null, writingSkillLabel(selected.name)),
      h('p', { className: 'mf-sk-desc' }, selected.description || ''),
      h('div', { className: 'mf-sk-rule' }),
      h('p', { className: 'mf-sk-section-label' }, '适用场景'),
      h('p', { className: 'mf-sk-when' }, selected.whenToUse || '写作助手会在相关任务中按需加载。'),
      selected.content ? h('pre', { className: 'mf-sk-content' }, selected.content) : null)
    : h('div', { className: 'mf-sk-empty' }, loading ? '正在读取写作技能…' : '选择一项技能查看详情')

  return h('div', { className: 'mf-sk-overlay', role: 'presentation', onClick: () => { if (onClose) onClose() } },
    h('section', { className: 'mf-sk', role: 'dialog', 'aria-label': '墨扉写作技能', onClick: (event) => event.stopPropagation() },
      h('header', { className: 'mf-sk-head' }, h('div', { className: 'mf-sk-title' }, h('strong', null, '写作技能'), h('small', null, String(skills.length) + ' 项已启用能力')), h('div', { className: 'mf-sk-head-actions' }, onOpenChains ? h('button', { className: 'mf-sk-link', type: 'button', onClick: onOpenChains }, '提示词链') : null, h('button', { className: 'mf-sk-close', type: 'button', title: '关闭写作技能', onClick: () => { if (onClose) onClose() } }, '×'))),
      h('div', { className: 'mf-sk-body' }, h('aside', { className: 'mf-sk-list' }, h('input', { className: 'mf-sk-search', value: query, placeholder: '搜索技能…', onChange: (event) => setQuery(event.target.value) }), list), detail)))
}
