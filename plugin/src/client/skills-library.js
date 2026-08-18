// 墨扉写作指令目录（v0.17：技能开关 + 自创技能入口）。
// 技能由 mofei-writer preset 在隔离 realm 内注册（可按开关过滤）；自创技能写入
// ~/.dsh/skills/（DSH skill-filesystem 自动发现），此组件提供作者可见的产品层。

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
  '.mf-sk{width:min(980px,calc(100vw - 48px));height:min(760px,calc(100vh - 72px));display:grid;grid-template-rows:56px minmax(0,1fr);overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 22px 64px rgba(0,0,0,.4)}',
  '.mf-sk-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-sk-title{display:flex;align-items:baseline;gap:8px;min-width:0}.mf-sk-title strong{font-size:14px;font-weight:650}.mf-sk-title small{font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-sk-head-actions{display:flex;align-items:center;gap:4px}.mf-sk-link{border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 8px;cursor:pointer;font:12px/1.2 sans-serif}.mf-sk-link:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-sk-link.primary{color:var(--dsw-alias-state-business-primary)}.mf-sk-close{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:18px/1 sans-serif}.mf-sk-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.mf-sk-body{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:0}.mf-sk-list{min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1);padding:10px}.mf-sk-search{box-sizing:border-box;width:100%;height:32px;margin:0 0 8px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1 sans-serif;outline:0}.mf-sk-search:focus{border-color:var(--dsw-alias-state-business-primary)}',
  '.mf-sk-item{display:block;width:100%;padding:8px 10px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}.mf-sk-item:hover{background:var(--dsw-alias-interactive-bg-hover)}.mf-sk-item.on{background:var(--dsw-alias-state-business-tertiary)}.mf-sk-item strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;text-transform:none}.mf-sk-item small{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:10.5px}.mf-sk-item-off{opacity:.45}',
  '.mf-sk-toggle{display:inline-flex;align-items:center;gap:5px;margin-top:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);padding:2px 9px;cursor:pointer;font:11px/1.3 sans-serif}.mf-sk-toggle:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}.mf-sk-toggle.on{color:var(--dsw-alias-state-success-primary);border-color:rgba(74,222,128,.35);background:var(--dsw-alias-state-success-tertiary)}.mf-sk-toggle.off{color:var(--dsw-alias-label-tertiary)}',
  '.mf-sk-section{margin:12px 2px 6px;color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-weight:650;letter-spacing:.4px}',
  '.mf-sk-detail{min-width:0;min-height:0;overflow:auto;padding:26px 30px}.mf-sk-empty{display:grid;place-items:center;height:100%;color:var(--dsw-alias-label-secondary);font-size:12px}.mf-sk-kicker{font-size:11px;color:var(--dsw-alias-state-success-primary);font-weight:600}.mf-sk-kicker.off{color:var(--dsw-alias-label-tertiary)}.mf-sk-detail h2{margin:7px 0 8px;font-size:20px;line-height:1.3;font-weight:680;text-transform:none}.mf-sk-desc{max-width:660px;margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.7}.mf-sk-rule{height:1px;margin:22px 0;background:var(--dsw-alias-border-l1)}.mf-sk-section-label{margin:0 0 7px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:650}.mf-sk-when{margin:0;white-space:pre-wrap;font-size:13px;line-height:1.75}.mf-sk-content{margin:18px 0 0;padding:14px 16px;border-left:2px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-elevated));white-space:pre-wrap;font:12px/1.72 ui-monospace,Consolas,monospace;max-height:280px;overflow:auto;color:var(--dsw-alias-label-secondary)}',
  '.mf-sk-form{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.52)}.mf-sk-form-card{width:min(620px,calc(100vw - 40px));max-height:84vh;overflow:auto;display:grid;gap:10px;padding:20px 22px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 24px 70px rgba(0,0,0,.45)}.mf-sk-form-card h3{margin:0;font-size:14px}.mf-sk-form-card label{display:grid;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-sk-form-card input,.mf-sk-form-card textarea{box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1.6 sans-serif;outline:0}.mf-sk-form-card input:focus,.mf-sk-form-card textarea:focus{border-color:var(--dsw-alias-state-business-primary)}.mf-sk-form-card textarea{min-height:130px;resize:vertical;font:12px/1.7 ui-monospace,Consolas,monospace}.mf-sk-form-actions{display:flex;gap:8px;justify-content:flex-end}.mf-sk-form-msg{font-size:11px;color:var(--dsw-alias-state-warn-primary)}',
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
  const onToggle = props && props.onToggle
  const onCreateSkill = props && props.onCreateSkill
  const onDeleteCustom = props && props.onDeleteCustom
  const settings = (props && props.settings) || null
  const disabled = new Set((settings && Array.isArray(settings.disabledSkills)) ? settings.disabledSkills : [])
  const custom = Array.isArray(settings && settings.custom) ? settings.custom : []
  const [query, setQuery] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formWhen, setFormWhen] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [formMsg, setFormMsg] = useState('')
  const filtered = useMemo(() => filterWritingSkills(skills, query), [skills, query])
  const selected = filtered.find((skill) => skill && skill.name === selectedName) || filtered[0] || null

  useEffect(() => {
    if (!open) return
    if (!selectedName && skills[0]) setSelectedName(skills[0].name)
  }, [open, selectedName, skills])

  if (!open) return null

  const toggleFor = (name) => {
    if (typeof onToggle !== 'function') return null
    const enabled = !disabled.has(name)
    return h('button', { className: 'mf-sk-toggle' + (enabled ? ' on' : ' off'), type: 'button', title: enabled ? '点击禁用（下次新建写作会话生效）' : '点击启用（下次新建写作会话生效）', onClick: (event) => { event.stopPropagation(); onToggle(name, !enabled) } }, enabled ? '✓ 已启用' : '○ 已禁用')
  }

  const list = loading
    ? h('div', { className: 'mf-sk-empty' }, '正在读取写作指令…')
    : error
      ? h('div', { className: 'mf-sk-empty' }, error)
      : filtered.length
        ? filtered.map((skill) => {
          const off = disabled.has(skill.name)
          return h('button', { key: skill.name, className: 'mf-sk-item' + (selected && selected.name === skill.name ? ' on' : '') + (off ? ' mf-sk-item-off' : ''), type: 'button', onClick: () => setSelectedName(skill.name) },
            h('strong', null, writingSkillLabel(skill.name)),
            h('small', null, skill.description || '写作指令'),
            toggleFor(skill.name))
        })
        : h('div', { className: 'mf-sk-empty' }, '没有匹配的写作指令')

  const detail = selected
    ? h('article', { className: 'mf-sk-detail' },
      h('div', { className: 'mf-sk-kicker' + (disabled.has(selected.name) ? ' off' : '') }, disabled.has(selected.name) ? '已禁用（新建写作会话后 AI 不可见）' : '已加载至 mofei-writer 写作助手'),
      h('h2', null, writingSkillLabel(selected.name)),
      h('p', { className: 'mf-sk-desc' }, selected.description || ''),
      h('div', { className: 'mf-sk-rule' }),
      h('p', { className: 'mf-sk-section-label' }, '适用场景'),
      h('p', { className: 'mf-sk-when' }, selected.whenToUse || '写作助手会在相关任务中按需加载。'),
      selected.content ? h('pre', { className: 'mf-sk-content' }, selected.content) : null,
      toggleFor(selected.name))
    : h('div', { className: 'mf-sk-empty' }, loading ? '正在读取写作指令…' : '选择一项技能查看详情')

  const customBlock = custom.length
    ? h('div', null,
      h('div', { className: 'mf-sk-section' }, '自创技能（墨扉私有指令库）'),
      custom.map((item) => h('div', { key: item.name, className: 'mf-sk-item' + (selected && selected.name === item.name ? ' on' : '') },
        h('strong', null, item.name),
        h('small', null, item.description || ''),
        h('span', { className: 'mf-sk-toggle off', style: { pointerEvents: 'none' } }, '自创')))
      )
    : null

  const submitForm = () => {
    if (!formName.trim() || !formDesc.trim()) { setFormMsg('名称与描述必填'); return }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formName.trim())) { setFormMsg('指令名须为小写 kebab-case（如 my-style-check）'); return }
    setFormBusy(true); setFormMsg('')
    const result = onCreateSkill({ name: formName.trim(), description: formDesc.trim(), whenToUse: formWhen.trim(), content: formContent })
    if (result && typeof result.then === 'function') {
      result.then((value) => {
        setFormBusy(false)
        if (value && value.error) { setFormMsg(String(value.error)) }
        else { setFormOpen(false); setFormName(''); setFormDesc(''); setFormWhen(''); setFormContent(''); if (props && props.onRefresh) props.onRefresh() }
      }).catch((failure) => { setFormBusy(false); setFormMsg('创建失败：' + String((failure && failure.message) || failure)) })
    } else { setFormBusy(false); setFormOpen(false); setFormName(''); setFormDesc(''); setFormWhen(''); setFormContent(''); if (props && props.onRefresh) props.onRefresh() }
  }

  const form = formOpen ? h('div', { className: 'mf-sk-form', role: 'presentation', onClick: () => { if (!formBusy) setFormOpen(false) } },
    h('div', { className: 'mf-sk-form-card', role: 'dialog', 'aria-label': '新建写作指令', onClick: (event) => event.stopPropagation() },
      h('h3', null, '新建写作指令（写入 ~/.dsh/skills/，仅保存在墨扉项目数据中）'),
      h('label', null, '指令名（小写 kebab-case，如 my-style-check）', h('input', { value: formName, placeholder: 'my-style-check', onChange: (event) => setFormName(event.target.value) })),
      h('label', null, '描述（必填）', h('input', { value: formDesc, placeholder: '一句话说明这个技能做什么', onChange: (event) => setFormDesc(event.target.value) })),
      h('label', null, '适用场景（whenToUse）', h('input', { value: formWhen, placeholder: '何时使用（如：审稿时检查…）', onChange: (event) => setFormWhen(event.target.value) })),
      h('label', null, '指令正文（子代理被选中后强制注入的规则）', h('textarea', { value: formContent, placeholder: '写技能规则/红线/步骤…', onChange: (event) => setFormContent(event.target.value) })),
      formMsg ? h('div', { className: 'mf-sk-form-msg' }, formMsg) : null,
      h('div', { className: 'mf-sk-form-actions' }, h('button', { className: 'mf-sk-link', type: 'button', onClick: () => setFormOpen(false) }, '取消'), h('button', { className: 'mf-sk-link primary', type: 'button', disabled: formBusy, onClick: submitForm }, formBusy ? '创建中…' : '创建指令'))))
    : null

  return h('div', { className: 'mf-sk-overlay', role: 'presentation', onClick: () => { if (onClose) onClose() } },
    h('section', { className: 'mf-sk', role: 'dialog', 'aria-label': '墨扉写作指令', onClick: (event) => event.stopPropagation() },
      h('header', { className: 'mf-sk-head' }, h('div', { className: 'mf-sk-title' }, h('strong', null, '写作指令'), h('small', null, String(skills.length) + ' 项内置能力 · ' + String(custom.length) + ' 项自创')), h('div', { className: 'mf-sk-head-actions' }, onOpenChains ? h('button', { className: 'mf-sk-link', type: 'button', onClick: onOpenChains }, '提示词链') : null, h('button', { className: 'mf-sk-link primary', type: 'button', onClick: () => { setFormOpen(true); setFormMsg('') } }, '＋ 新建技能'), h('button', { className: 'mf-sk-close', type: 'button', title: '关闭写作指令', onClick: () => { if (onClose) onClose() } }, '×'))),
      h('div', { className: 'mf-sk-body' }, h('aside', { className: 'mf-sk-list' }, h('input', { className: 'mf-sk-search', value: query, placeholder: '搜索技能…', onChange: (event) => setQuery(event.target.value) }), list, customBlock), detail),
      form))
}
