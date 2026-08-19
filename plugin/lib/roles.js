// 墨扉角色定义纯逻辑（无 DSH 依赖、无 DOM，可独立单元测试）。
// 数据模型（version 1）：
//   store = {
//     version: 1,
//     byProject: {
//       [projectId]: [
//         {
//           id: "writer",
//           name: "正文写作者",
//           entries: [
//             { name: "角色定义", content: "...", order: 0, isEnabled: true },
//             { name: "格式要求", content: "...", order: 1, isEnabled: true },
//             ...
//           ],
//           defaultInstructions: [{ instructionId: "mofei-writing", order: 100, isEnabled: true }],
//           updatedAt: 1234567890
//         }
//       ]
//     }
//   }
// 角色可人工修改、组装（开关 entry、排序、增删 entry），使用时按 order 拼 enabled entries → persona 字符串。
// 本模块只做纯数据层：store 规范化、entry 规范化、persona 拼接、角色视图。

export const MOFEI_ROLE_CATALOG_ID = 'mofei-writing'

// 内置角色是运行时与前端共同使用的唯一事实来源。项目文件只保存同 id 覆盖项，
// 因而默认提示词升级后，未覆盖的项目会自动使用新版本。
export const MOFEI_BUILTIN_ROLES = Object.freeze([
  Object.freeze({
    id: 'writer',
    name: 'Writer（正文写作）',
    effort: 'high',
    persona: [
      '你是 Writer，负责续写或改写正文。涉及小说内容时先读当前章节和相关设定，再执行任务；写入必须提交完整正文并携带最新 expectedRevision。',
      '【连载正文标准】先在心里确定本章的主角目标、阻力、选择和代价，再写成场景。每章至少让目标、风险、关系、信息、资源或认知中的一项发生可见变化；没有变化的闲聊、说明和景物不占正文。开头直接接住上一章留下的压力，或尽快给出当前场景的具体目标与异常；不要用泛泛回顾替代剧情。',
      '冲突必须来自人物各自想要什么及其阻力，不靠误会拖延或角色降智。需要爽点、反转、暧昧或胜利时，先在前文建立对象、障碍和期待，再用主角主动选择兑现，并保留一个自然的新问题、代价或下一步行动。对话每次至少推进信息、关系、博弈或行动之一；角色说话要符合身份和当前情绪，避免所有人同一种机智口吻。',
      '段落随动作、视角、信息或情绪转换自然断开；紧张场景优先动作、感受和短句，缓和场景才按需加入环境、人物和心理。删去空泛评价、重复解释、模板化排比和假深刻收束，使用具体行动、物件、反应和可核对的细节。保持原作题材、分级、叙事视角与文风；这些是商业连载机制，不得模仿任何参考书的人物、情节、句子或独特口吻。',
      '若任务要求写入，完成后只返回一行 JSON：{"status":"done","revision":<修订号>}；若只要求草稿，则只输出纯正文。不要输出自我介绍、过程说明或未要求的建议。',
    ].join('\n'),
  }),
  Object.freeze({
    id: 'reviewer',
    name: 'Reviewer（审稿核查）',
    effort: 'high',
    persona: [
      '你是 Reviewer，只做审稿和核查，不修改任何正文或设定。先读取目标章节，按任务要求检索设定词、角色和世界书。',
      '【审稿标准】逐项检查：事实、称谓、时间线和角色认知是否与材料一致；本章是否有明确目标或即时压力，且正文结束时至少有一项剧情状态发生变化；冲突是否具有目标、阻力、选择或代价，而非角色降智或信息硬塞；关键兑现前是否已有必要铺垫；对话是否改变信息、关系、博弈或行动；紧张段是否被无关说明拖慢；是否存在空泛评价、重复解释、整齐排比或用抽象感悟替代场景。',
      '样本只用于判断连载机制，不因题材、字数、文风或没有强制悬崖结尾而判错；只报告影响阅读、设定或任务要求的真实问题。最终只返回一行 JSON：无问题为 {"verdict":"PASS","issues":[]}；有问题为 {"verdict":"ISSUES","issues":[{"severity":"高|中|低","location":"位置","problem":"问题","suggestion":"建议"}]}。不要输出前言或长篇复述。',
    ].join('\n'),
  }),
  Object.freeze({
    id: 'analyzer',
    name: 'Analyzer（设定分析）',
    effort: 'high',
    persona: [
      '你是 Analyzer，只做设定、时间线、角色认知和因果链分析，不修改正文或设定。先读取目标章节和任务所需的角色、笔记、世界书、前情；按需用 mofei_search-chapters 核查，不能把猜测当作设定。',
      '【核查方法】把关键事件拆为“已知事实 → 人物获知的信息 → 选择/行动 → 直接结果 → 后续影响”。检查时间先后、地点移动、称谓、人物动机与认知边界、能力或资源消耗、伏笔和回收是否可追溯。发现矛盾时说明是哪两条材料冲突；材料不足时输出待确认，不以常识或个人偏好补全。',
      '最终只输出一行 JSON：{"verdict":"PASS|ISSUES|NEEDS_CONTEXT","issues":[{"severity":"高|中|低","location":"位置","evidence":"冲突的两条事实或缺口","problem":"问题","suggestion":"最小修复建议"}],"openQuestions":["待确认项"]}。问题按严重度排序；没有问题时 issues 和 openQuestions 均为空。不要输出前言、正文改写或工作流程说明。',
    ].join('\n'),
  }),
  Object.freeze({
    id: 'polisher',
    name: 'Polisher（语言润色）',
    effort: 'high',
    persona: [
      '你是 Polisher，只改善语言、节奏、画面和可读性，不改变剧情、事实、人物关系、人物认知、叙事视角、时态、分级或章节结果。开始前先读原文和相关事实；原文含糊处保留其含糊，不新增设定、伏笔、反转、心理结论、能力或因果。',
      '【润色标准】保留每一段的动作与信息功能，优先删去重复解释、抽象评价、堆砌形容词、模板化比喻和同义词替换；用能被动作、物件、感官或反应支撑的表达提升画面。对话保持角色原有身份、情绪和目的，不把所有角色改成同一种腔调。紧张处压缩句子和说明，缓和处再按需增加细节；不能为了“文采”拖慢正在推进的冲突。',
      '交稿前逐段核对：人物做了什么、知道什么、关系和章节结局是否与原文完全一致。任务要求润色时输出完整纯正文，不加标题、解释、批注或 Markdown；未要求写入时不要调用写入工具。若任务明确要求写回，读取最新 revision 后再提交完整正文。',
    ].join('\n'),
  }),
])

// 脏数据安全：string 原样返回，非字符串一律空串。
function toText(value) {
  return typeof value === 'string' ? value : ''
}

function toTimestamp(value) {
  const number = typeof value === 'number' && isFinite(value) ? value : 0
  if (!number) return 0
  return number > 0 && number < 9e15 ? Math.floor(number) : 0
}

function toId(value) {
  return typeof value === 'string' && value ? value : ''
}

function toOrder(value) {
  const number = typeof value === 'number' && isFinite(value) ? value : 0
  return Math.floor(number)
}

// 规范化单个 entry：只保留合法字段，content 强制 string，isEnabled 默认 true。
function normalizeEntry(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    name: toText(source.name),
    content: toText(source.content),
    order: toOrder(source.order),
    isEnabled: source.isEnabled !== false,
  }
}

// 规范化模板绑定：只保存指令 ID、顺序和启用状态，不复制指令正文。
function normalizeInstructionBindings(value) {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    return {
      instructionId: toId(source.instructionId),
      order: toOrder(source.order),
      isEnabled: source.isEnabled !== false,
    }
  }).filter((item) => item.instructionId)
}

// 规范化单个角色：只保留合法字段，entries 强制数组。
function normalizeRole(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const entries = Array.isArray(source.entries) ? source.entries.map(normalizeEntry) : []
  return {
    id: toId(source.id),
    name: toText(source.name),
    entries,
    defaultInstructions: normalizeInstructionBindings(source.defaultInstructions),
    updatedAt: toTimestamp(source.updatedAt),
  }
}

export function builtinRoleConfig() {
  const result = {}
  for (const definition of MOFEI_BUILTIN_ROLES) {
    result[definition.id] = { persona: definition.persona, effort: definition.effort }
  }
  return result
}

function builtinRoleRecord(definition) {
  return {
    id: definition.id,
    name: definition.name,
    entries: [{ name: '角色专属提示词', content: definition.persona, order: 0, isEnabled: true, source: 'builtin' }],
    defaultInstructions: [],
    updatedAt: 0,
    effort: definition.effort,
    source: 'builtin',
    isBuiltin: true,
    isOverridden: false,
    canReset: false,
  }
}

export function isBuiltinRoleId(roleId) {
  return MOFEI_BUILTIN_ROLES.some((definition) => definition.id === roleId)
}

// 合并只发生在读取层：同 id 项目角色完整覆盖内置角色，自定义角色排在内置角色之后。
// 输入会被重新规范化，返回值不会引用或修改持久化数组。
export function mergeEffectiveRoles(overrides) {
  const list = Array.isArray(overrides) ? overrides.map(normalizeRole).filter((role) => role.id) : []
  const byId = new Map(list.map((role) => [role.id, role]))
  const effective = MOFEI_BUILTIN_ROLES.map((definition) => {
    const override = byId.get(definition.id)
    if (!override) return builtinRoleRecord(definition)
    byId.delete(definition.id)
    return {
      ...override,
      name: override.name || definition.name,
      entries: override.entries.map((entry) => ({ ...entry, source: 'project' })),
      effort: definition.effort,
      source: 'project',
      isBuiltin: true,
      isOverridden: true,
      canReset: true,
    }
  })
  for (const role of byId.values()) {
    effective.push({
      ...role,
      entries: role.entries.map((entry) => ({ ...entry, source: 'project' })),
      source: 'project',
      isBuiltin: false,
      isOverridden: false,
      canReset: false,
    })
  }
  return effective
}

export function findEffectiveRole(overrides, roleId) {
  return mergeEffectiveRoles(overrides).find((role) => role.id === roleId) || null
}

// 输入任意持久化 JSON 或 undefined，输出规范化 store；任意脏数据都不抛异常。
export function normalizeRoleStore(input) {
  const store = { version: 1, byProject: {} }
  if (!input || typeof input !== 'object') return store
  const byProject = input.byProject && typeof input.byProject === 'object' && !Array.isArray(input.byProject) ? input.byProject : {}
  Object.keys(byProject).forEach((projectId) => {
    if (projectId === '__proto__' || projectId === 'constructor' || projectId === 'prototype') return
    const rawList = byProject[projectId]
    if (!Array.isArray(rawList)) return
    const byId = new Map()
    rawList.forEach((raw) => {
      const role = normalizeRole(raw)
      if (!role.id) return
      // 持久化冲突时保留最后一条，避免 find() 命中旧角色。
      byId.set(role.id, role)
    })
    const list = Array.from(byId.values())
    Object.defineProperty(store.byProject, projectId, { value: list, enumerable: true, writable: true, configurable: true })
  })
  return store
}

// 拼接角色 persona：取 enabled entries，按 order 排序，content 用双换行拼接。
// 返回字符串（可能为空串）；调用方按需判断。
export function compileRolePersona(role) {
  const normalized = normalizeRole(role)
  const enabled = normalized.entries.filter((entry) => entry.isEnabled)
  enabled.sort((a, b) => a.order - b.order)
  return enabled.map((entry) => entry.content).filter((content) => content.length > 0).join('\n\n')
}

// 角色视图：只暴露 { id, name, entries, updatedAt }，entries 含 name/order/isEnabled（不含 content，供列表用）。
export function roleSummaryView(role) {
  const normalized = normalizeRole(role)
  return {
    id: normalized.id,
    name: normalized.name,
    entryCount: normalized.entries.length,
    enabledCount: normalized.entries.filter((entry) => entry.isEnabled).length,
    instructionCount: normalized.defaultInstructions.length,
    enabledInstructionCount: normalized.defaultInstructions.filter((item) => item.isEnabled).length,
    defaultInstructions: normalized.defaultInstructions,
    updatedAt: normalized.updatedAt,
    effort: typeof (role && role.effort) === 'string' ? role.effort : '',
    source: role && role.source === 'builtin' ? 'builtin' : 'project',
    isBuiltin: !!(role && role.isBuiltin),
    isOverridden: !!(role && role.isOverridden),
    canReset: !!(role && role.canReset),
  }
}

// 角色完整视图：含 entries 全部字段（含 content），供读取详情用。
export function roleDetailView(role) {
  const normalized = normalizeRole(role)
  return {
    id: normalized.id,
    name: normalized.name,
    entries: normalized.entries.map((entry, index) => ({
      ...entry,
      source: role && role.entries && role.entries[index] && role.entries[index].source === 'builtin' ? 'builtin' : 'project',
    })),
    defaultInstructions: normalized.defaultInstructions,
    updatedAt: normalized.updatedAt,
    effort: typeof (role && role.effort) === 'string' ? role.effort : '',
    source: role && role.source === 'builtin' ? 'builtin' : 'project',
    isBuiltin: !!(role && role.isBuiltin),
    isOverridden: !!(role && role.isOverridden),
    canReset: !!(role && role.canReset),
  }
}
