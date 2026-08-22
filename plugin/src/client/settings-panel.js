// 墨扉设置入口：把低频配置集中管理，避免工作区侧栏平铺过多按钮。
let binding = null
let resolved = false
function react() {
  if (resolved) return binding
  resolved = true
  const g = typeof globalThis !== 'undefined' ? globalThis : null
  const R = (g && g.React) || (typeof window !== 'undefined' && window.React) || (g && g.__mofeiReact)
  binding = R && typeof R.createElement === 'function' ? { h: R.createElement } : null
  return binding
}

export const SETTINGS_PANEL_CSS = [
  '.mf-settings-overlay{position:fixed;inset:0;z-index:136;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.44);transform:none!important;backdrop-filter:blur(4px)}',
  '.mf-settings{width:min(880px,calc(100vw - 32px));height:min(680px,calc(100vh - 48px));display:grid;grid-template-rows:56px minmax(0,1fr);overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 28px 92px rgba(0,0,0,.48)}',
  '.mf-settings-head{display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-settings-head strong{font-size:15px;letter-spacing:.02em}.mf-settings-head small{color:var(--dsw-alias-label-secondary);font-size:11px;flex:1}',
  '.mf-settings-body{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:0}.mf-settings-nav{padding:12px 10px;border-right:1px solid var(--dsw-alias-border-l1);overflow:auto;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base))}.mf-settings-group{padding:10px 10px 5px;font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--dsw-alias-label-tertiary);text-transform:uppercase}.mf-settings-nav button{display:flex;width:100%;align-items:center;gap:10px;box-sizing:border-box;min-height:46px;padding:9px 11px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:left;font-size:12px;line-height:1.35;position:relative;transition:background .12s ease,color .12s ease}.mf-settings-nav button::before{content:\'\';position:absolute;left:0;top:50%;width:3px;height:0;transform:translateY(-50%);border-radius:0 4px 4px 0;background:var(--dsw-alias-state-business-primary);transition:height .12s ease}.mf-settings-nav button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-settings-nav button.on{background:var(--dsw-alias-state-business-tertiary,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-primary)}.mf-settings-nav button.on::before{height:22px}.mf-settings-nav button>span{display:block;min-width:0;line-height:1.35}.mf-settings-nav button strong{display:block;color:inherit;font-size:12px;font-weight:600;line-height:1.35;white-space:normal}.mf-settings-nav button small{display:block;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1.35;margin-top:3px;white-space:normal}',
  '.mf-settings-content{padding:26px;overflow:auto}.mf-settings-content h3{margin:0 0 10px;font-size:17px;letter-spacing:.01em}.mf-settings-content p{margin:0 0 20px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.75}.mf-settings-card{padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));margin-bottom:12px;box-shadow:0 1px 0 rgba(255,255,255,.02) inset}.mf-settings-card strong{display:block;font-size:13px}.mf-settings-card small{display:block;margin-top:6px;color:var(--dsw-alias-label-secondary);line-height:1.6}.mf-settings-action{margin-top:16px;padding:9px 14px;border:0;border-radius:12px;background:var(--dsw-alias-state-business-primary);color:#fff;cursor:pointer;font-size:12px;line-height:1.2;box-shadow:0 6px 18px rgba(37,99,235,.22)}.mf-settings-action:disabled{opacity:.55;cursor:wait}',
  '.mf-settings-status{display:grid;gap:8px;margin-top:14px}.mf-settings-status-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-settings-status-row strong{color:var(--dsw-alias-state-error-primary);font-weight:600;text-align:right;word-break:break-word}.mf-settings-status-row strong.ok{color:var(--dsw-alias-state-success-primary)}.mf-settings-error{display:block;color:var(--dsw-alias-state-error-primary);line-height:1.5;word-break:break-word}',
].join('\n')

export function SettingsPanel(props) {
  const r = react()
  if (!r) return null
  const h = r.h
  const active = props && props.active ? props.active : 'agents'
  const select = (id) => { if (props && props.onSelect) props.onSelect(id) }
  const close = () => { if (props && props.onClose) props.onClose() }
  const open = (name) => { if (props && props[name]) props[name]() }

  const groups = [
    { label: '写作与模型', items: [
      ['agents', '子代理', '模板与调度入口'],
      ['models', '子代理模型', '专用模型与通用模型'],
      ['roles', '子代理提示词', '身份、职责与输出契约'],
      ['instructions', '私有写作指令', '默认注入与专项指令'],
    ] },
    { label: '内容与检索', items: [
      ['summary', '摘要', '章节与区间摘要'],
      ['chains', '提示词链', '可复用提示词流程'],
      ['styles', '写作风格', '项目文风与样式'],
      ['retrieval', '检索模型', '本地 Embedding 与 Rerank'],
    ] },
  ]
  const items = groups.flatMap((group) => group.items)
  const activeMeta = items.find((item) => item[0] === active)

  let content
    if (active === 'retrieval') {
      const status = props && props.retrievalStatus
      const line = (label, value, good) => h('div', { className: 'mf-settings-status-row', key: label }, h('span', null, label), h('strong', { className: good ? 'ok' : '' }, value))
      content = h('div', null,
        h('h3', null, '检索模型'),
        h('p', null, '检索模型独立于 DSH 聊天模型。墨扉先用本地 Embedding 召回，再用本地 Rerank 重排；未就绪时会保留词法检索结果。'),
        h('div', { className: 'mf-settings-card' },
          h('strong', null, '本地运行状态'),
          status ? h('div', { className: 'mf-settings-status' },
            line('Embedding', status.embeddingReady ? ((status.embeddingModel || '本地模型') + ' · ' + (status.embeddingDimensions || '?') + ' 维') : '未就绪', !!status.embeddingReady),
            line('Rerank', status.rerankReady ? (status.rerankModel || '本地模型') : status.rerankCachePresent === false ? '模型缓存未找到' : '未就绪', !!status.rerankReady),
            status.embeddingError ? h('small', { className: 'mf-settings-error' }, 'Embedding：' + status.embeddingError) : null,
            status.rerankError ? h('small', { className: 'mf-settings-error' }, 'Rerank：' + status.rerankError) : null
          ) : h('small', null, props && props.retrievalBusy ? '检测本地模型中…' : '尚未检测'),
          h('button', { className: 'mf-settings-action', type: 'button', disabled: !!(props && props.retrievalBusy), onClick: () => props && props.onRefreshRetrieval && props.onRefreshRetrieval() }, props && props.retrievalBusy ? '检测中…' : '刷新本地模型状态')
        ),
        props.ragIndexStatus ? h('div', { className: 'mf-settings-card' },
          h('strong', null, '当前项目索引' + (props.projectTitle ? ' · ' + props.projectTitle : '')),
          h('div', { className: 'mf-settings-status' },
            line('状态', props.ragIndexStatus.status === 'fresh' ? '可用 · ' + (props.ragIndexStatus.indexedChunks || 0) + ' 块' : props.ragIndexStatus.status === 'stale' ? '已过期 · ' + (props.ragIndexStatus.indexedChunks || 0) + ' 块' : '尚未建立', props.ragIndexStatus.status === 'fresh'),
            line('召回', '本地 Embedding', true),
            line('重排', '本地 Rerank（失败回退词法）', !!(props && props.retrievalStatus && props.retrievalStatus.rerankReady))
          ),
          h('small', null, '在「检索」标签中首次搜索会自动建立/更新索引；Agent 也可通过 mofei_search-rag 使用该索引。')
        ) : null
      )
  } else if (active === 'models') {
    content = h('div', null,
      h('h3', null, '子代理模型'),
      h('p', null, '为不同专业子代理配置专用模型；未指定专用模型时使用通用模型。模型配置由墨扉统一管理，不由中控临时决定。'),
      h('div', { className: 'mf-settings-card' },
        h('strong', null, '模型配置入口'),
        h('small', null, '模型绑定将按子代理模板保存。当前可从子代理模板进入配置；这里作为统一设置入口保留。'),
        h('button', { className: 'mf-settings-action', type: 'button', onClick: () => open('onOpenModels') }, '打开模型配置')))
  } else if (active === 'agents') {
    content = h('div', null,
      h('h3', null, '子代理'),
      h('p', null, '管理子代理模板、模型、默认写作指令和本次任务的调度方式。'),
      h('div', { className: 'mf-settings-card' },
        h('strong', null, '子代理提示词'),
        h('small', null, '模板决定子代理身份与职责；中控只能为当前任务追加指令，不能移除模板默认指令。'),
        h('button', { className: 'mf-settings-action', type: 'button', onClick: () => open('onOpenRoles') }, '管理子代理提示词')))
  } else {
    const title = activeMeta ? activeMeta[1] : '墨扉设置'
    const description = activeMeta ? activeMeta[2] : '集中管理墨扉写作配置。'
    const openName = active === 'roles' ? 'onOpenRoles' : active === 'instructions' ? 'onOpenInstructions' : active === 'summary' ? 'onOpenSummary' : active === 'chains' ? 'onOpenChains' : active === 'styles' ? 'onOpenStyles' : 'onOpenRoles'
    content = h('div', null, h('h3', null, title), h('p', null, description), h('button', { className: 'mf-settings-action', type: 'button', onClick: () => open(openName) }, '打开此设置'))
  }

  return h('div', { className: 'mf-settings-overlay', onMouseDown: (event) => { if (event.target === event.currentTarget) close() } },
    h('div', { className: 'mf-settings', role: 'dialog', 'aria-label': '墨扉设置' },
      h('header', { className: 'mf-settings-head' },
        h('strong', null, '墨扉设置'),
        h('small', null, '集中管理子代理、指令、摘要与写作配置'),
        h('button', { className: 'mf-action-icon', type: 'button', title: '关闭', onClick: close }, '×')),
      h('div', { className: 'mf-settings-body' },
        h('nav', { className: 'mf-settings-nav' },
          groups.map((group) => [
            h('div', { key: 'group-' + group.label, className: 'mf-settings-group' }, group.label),
            ...group.items.map((item) => h('button', { key: item[0], type: 'button', className: active === item[0] ? 'on' : '', onClick: () => select(item[0]) },
              h('span', null, h('strong', null, item[1]), h('small', null, item[2])))),
          ])),
        h('main', { className: 'mf-settings-content' }, content))))
}
