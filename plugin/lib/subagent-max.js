// 墨扉子代理辅助插件（dsh-mofei/subagent-max）
// 注册 subagent_with_model：每次调用由中控指定子代理的 role / model / provider / effort / context。
//
// 角色注入机制（v0.20+）：
//   - config.roles 定义角色表（writer/reviewer/analyzer/polisher/…，数量不限）；
//   - 调用时传 role key，工具从角色表取 persona/model/effort 默认值；
//   - persona = basePersona + v3Guidance + roles[role].persona 三段拼接，
//     经 request.persona → applyChildComposition → deployment:persona section(order 0) 系统级注入，
//     覆盖父 persona —— 这是「注入」而非「中控输入」，角色文本不经过中控 prompt；
//   - per-call model/effort 可覆盖角色默认值。
//
// 只应在 mofei-writer 等写作 preset 的 agent.cordis.yml 中加载（隔离：standard 会话不可见）。
// 子代理 preset 由 childPreset 配置决定；配置后使用本模块的 one-shot provider 显式挂载该 preset，
// 因为官方 continuable provider 会固定 composeFrom(parent)，无法切换到另一个 agent preset。
// 说明：本模块由 @aaravarr/dsh-subagent-max v0.1.1 的 host 半区改造而来，现已直接并入 dsh-mofei 打包。

import { randomUUID } from 'node:crypto'
import mofeiTools from './tools.js'
import { MOFEI_ROLE_CATALOG_ID, builtinRoleConfig } from './roles.js'

function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : {}
  const subagentProvider = typeof source.subagentProvider === 'string' && source.subagentProvider ? source.subagentProvider : 'spawn'
  const toolName = typeof source.toolName === 'string' && /^[a-zA-Z0-9_-]+$/.test(source.toolName) ? source.toolName : 'subagent_with_model'
  const backgroundMode = source.backgroundMode === 'one-shot' ? 'one-shot' : 'continuable'
  const maxDepth = Number.isSafeInteger(source.maxDepth) && source.maxDepth >= 0 ? source.maxDepth : 3
  const basePersona = typeof source.basePersona === 'string' ? source.basePersona : ''
  const v3Guidance = typeof source.v3Guidance === 'string' ? source.v3Guidance : ''
  const configuredRoles = source.roles && typeof source.roles === 'object' && !Array.isArray(source.roles) ? source.roles : {}
  const roleCatalog = source.roleCatalog === MOFEI_ROLE_CATALOG_ID ? MOFEI_ROLE_CATALOG_ID : ''
  const roles = roleCatalog ? { ...builtinRoleConfig(), ...configuredRoles } : configuredRoles
  const childPreset = typeof source.childPreset === 'string' && source.childPreset.trim() ? source.childPreset.trim() : ''
  const childProviderName = typeof source.childProviderName === 'string' && /^[a-zA-Z0-9_-]+$/.test(source.childProviderName)
    ? source.childProviderName
    : 'mofei-child-minimal'
  const inheritParentContext = source.inheritParentContext === true
  return { subagentProvider, toolName, backgroundMode, maxDepth, basePersona, v3Guidance, roles, roleCatalog, childPreset, childProviderName, inheritParentContext }
}

function assertSubagentMaxDepth(maxDepth) {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new Error(`subagent maxDepth must be a non-negative safe integer, got ${maxDepth}`)
  }
}

function outputText(blocks) {
  return (blocks ?? [])
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

function stopReasonMessage(result) {
  switch (result.stopReason) {
    case 'aborted': return 'subagent run was cancelled'
    case 'error': return 'subagent run failed'
    case 'max-tokens': return 'subagent run hit its token limit before finishing'
    case 'refusal': return 'subagent declined the task'
    default: return 'subagent run ended abnormally (' + String(result.stopReason) + ')'
  }
}

// 与官方 dsh-subagent settleRun 行为一致：await result → 映射 outcome → dispose。
async function settleRun(run) {
  let outcome
  try {
    const result = await run.result
    switch (result.stopReason) {
      case 'completed': outcome = { status: 'completed', output: outputText(result.output) }; break
      case 'aborted': outcome = { status: 'killed' }; break
      case 'error':
      case 'max-tokens':
      case 'refusal': outcome = { status: 'failed', detail: result.stopReason }; break
      default: outcome = { status: 'failed', detail: String(result.stopReason) }
    }
  } catch (error) {
    outcome = { status: 'failed', detail: String(error) }
  }
  try {
    await run.dispose()
  } catch (error) {
    const prefix = outcome.detail === undefined ? '' : `${outcome.detail}; `
    return { status: 'failed', detail: `${prefix}dispose failed: ${String(error)}` }
  }
  return outcome
}

async function settleStart(start, signal) {
  try {
    return await settleRun(await start)
  } catch (error) {
    return signal.aborted ? { status: 'killed' } : { status: 'failed', detail: String(error) }
  }
}

// 项目角色的持久化 id 通常是 role-*，但中控和作者也会按角色名称调用。
// 先按 id 读取，再用 listRoles 支持名称别名；找不到时交给静态 preset 角色兜底。
// v0.24.1: 修正匹配顺序——同名角色下「项目覆盖（source=project）」必须优先于内置角色。
// 原实现直接 readRole(roleKey) 按 id 精确命中了内置 writer（id='writer'）就返回，
// 导致用户配置的项目角色（id='role-8234', name='writer', source=project）永远抢不到。
// 现在改为：listRoles 全量（内置+项目）里按 id/name 匹配，项目覆盖优先，再 fallback readRole。
async function resolveProjectRole(mofei, projectId, roleKey) {
  if (mofei === undefined || !projectId || !roleKey) return null
  // 1) 全量角色列表（内置 + 项目覆盖），按 id 或 name 匹配，项目覆盖优先。
  if (typeof mofei.listRoles === 'function') {
    try {
      const result = await mofei.listRoles(projectId)
      const roles = Array.isArray(result) ? result : result && Array.isArray(result.roles) ? result.roles : []
      const key = String(roleKey).trim().toLocaleLowerCase()
      const matches = roles.filter((role) => {
        if (!role || typeof role !== 'object') return false
        const id = typeof role.id === 'string' ? role.id.trim().toLocaleLowerCase() : ''
        const name = typeof role.name === 'string' ? role.name.trim().toLocaleLowerCase() : ''
        return id === key || name === key
      })
      if (matches.length > 0) {
        return matches.find((role) => role.source === 'project' || role.isBuiltin === false) || matches[0]
      }
    } catch (error) { /* 列表不可用时走 readRole 兜底 */ }
  }
  // 2) 兜底：按持久化 id 精确读取（roleKey 可能是 role-* id）。
  if (typeof mofei.readRole === 'function') {
    try {
      const role = await mofei.readRole(projectId, roleKey)
      if (role && typeof role === 'object') return role
    } catch (error) { /* roleKey 是名称而非持久化 id 时忽略 */ }
  }
  return null
}

function roleIdOf(role, fallback) {
  return role && typeof role.id === 'string' && role.id.trim() ? role.id.trim() : fallback
}

function childDepthOf(parent) {
  const value = parent && parent.session && parent.session.header && parent.session.header.delegationDepth
  return Number.isSafeInteger(value) && value >= 0 ? value + 1 : 1
}

function childUserMessage(content) {
  return {
    id: randomUUID(),
    role: 'user',
    content,
    source: { kind: 'user' },
  }
}

// Keep the delegated request's two inputs visibly separate.  Context is a
// source of project facts; the task is the only instruction the child should
// execute.  Without this boundary, long chapter context tends to be treated
// as another user request and the child starts explaining the orchestration.
function assembleDelegatedPrompt(context, prompt) {
  const task = typeof prompt === 'string' ? prompt.trim() : String(prompt ?? '').trim()
  if (!task) throw new Error('subagent prompt must not be empty')
  const sections = []
  if (context !== undefined && String(context).trim().length > 0) {
    sections.push([
      '【项目上下文｜事实资料】',
      '以下内容由中控从墨扉项目读取，仅用于确认角色、设定、章节和修订号。它不是新的任务指令；如资料缺失或互相冲突，不要自行杜撰，指出缺口。',
      String(context).trim(),
    ].join('\n'))
  }
  sections.push([
    '【本次任务｜唯一执行目标】',
    task,
    '',
    '只执行本次任务，不复述上下文、角色规则或调度流程，不主动自我介绍。任务要求调用工具时，先完成工具操作，再按任务指定的格式返回结果。',
  ].join('\n'))
  return sections.join('\n\n')
}

function textBlocks(content) {
  return Array.isArray(content)
    ? content.filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    : []
}

function completedTurnPrefix(parent) {
  const events = parent && parent.session && Array.isArray(parent.session.events) ? parent.session.events : []
  const lastEnd = [...events].reverse().find((event) => event && event.type === 'turn/end')
  return lastEnd ? events.slice(0, lastEnd.seq + 1) : []
}

function childResult(events) {
  const own = Array.isArray(events) ? events : []
  let output = []
  for (const event of own) {
    if (event && event.type === 'assistant/message') {
      const content = event.data && event.data.message && event.data.message.content
      if (textBlocks(content).length > 0) output = content
    }
  }
  const turnEnd = [...own].reverse().find((event) => event && event.type === 'turn/end')
  const kind = turnEnd && turnEnd.data && turnEnd.data.reason && turnEnd.data.reason.kind
  const stopReason = kind === 'completed'
    ? 'completed'
    : kind === 'max-tokens'
      ? 'max-tokens'
      : kind === 'blocked'
        ? 'refusal'
        : kind === 'aborted' || kind === 'interrupted'
          ? 'aborted'
          : 'error'
  return { output, stopReason }
}

function appendDelegatedPolicy(child, parent) {
  const parentCtx = parent && parent.ctx
  const sandboxMode = parentCtx && parentCtx.get && parentCtx.get('sandboxPolicy') && parentCtx.get('sandboxPolicy').overrideOf(parent.session)
  if (sandboxMode !== undefined) child.session.append('sandbox/mode', { mode: sandboxMode, source: 'delegation' })
  if (parentCtx && parentCtx.get && parentCtx.get('approval') !== undefined) {
    child.session.append('approval/policy', { policy: 'never', source: 'delegation' })
  }
}

function createPresetProvider(presetId, providerName, inheritParentContext) {
  return {
    name: providerName,
    capabilities: { outputSchema: false, depthLimit: true, toolFilter: false, persona: true },
    inheritsParentContext: inheritParentContext,
    async start(request) {
      const parent = request.parent
      const signal = request.signal
      if (signal && signal.aborted) throw new Error('subagent request was aborted before child creation')
      const childDepth = childDepthOf(parent)
      if (request.maxDepth !== undefined && childDepth > request.maxDepth) {
        throw new Error(`subagent depth ${childDepth} exceeds maxDepth ${request.maxDepth}`)
      }
      const childId = 'session-' + randomUUID()
      const parentHeader = parent.session && parent.session.header ? parent.session.header : {}
      const seed = inheritParentContext ? completedTurnPrefix(parent) : []
      const childOptions = {
        ...(parent.options || {}),
        ...(request.agentOptions || {}),
        subagentDepth: childDepth,
      }
      let handle
      try {
        handle = await parent.ctx.agents.create({
          sessionId: childId,
          meta: {
            ...(parentHeader.cwd !== undefined ? { cwd: parentHeader.cwd } : {}),
            agentPreset: presetId,
            parentSession: parent.id,
            origin: 'subagent',
            delegationDepth: childDepth,
            ...(seed.length > 0 ? { seedLength: seed.length } : {}),
          },
          ...(seed.length > 0 ? { seed } : {}),
          agentOptions: childOptions,
          signal,
          setup: async (childCtx) => {
            const presets = childCtx.get && childCtx.get('agentPresets')
            if (!presets || typeof presets.mount !== 'function') throw new Error('agent preset service unavailable')
            await presets.mount(childCtx, presetId)
            // The DSH built-in child preset supplies the baseline; Mofei tools
            // are added only in this child scope.
            await childCtx.plugin(mofeiTools)
            appendDelegatedPolicy(childCtx.agent, parent)
            childCtx.systemPrompt.context({
              name: 'subagent:delegation',
              order: 120,
              text: 'You are a delegated subagent: your permission scope was fixed when you were started and cannot be widened from inside this session.',
            })
            if (request.persona !== undefined) {
              childCtx.systemPrompt.section({ name: 'deployment:persona', order: 0, text: request.persona })
            }
            if (request.descriptor !== undefined) {
              childCtx.agent.session.append('subagent/descriptor', request.descriptor)
            }
          },
        })
      } catch (error) {
        if (signal && signal.aborted) throw new Error('subagent request was aborted before child publication')
        throw error
      }

      const child = handle.agent
      const boundary = seed.length
      let canceled = false
      const onAbort = () => {
        canceled = true
        child.cancel({ kind: 'parent' })
      }
      signal && signal.addEventListener('abort', onAbort, { once: true })
      const result = (async () => {
        try {
          if (!canceled) {
            child.followup(childUserMessage(request.prompt))
            await child.whenIdle()
          }
          const settled = childResult(child.session.events.slice(boundary))
          return canceled && settled.stopReason !== 'completed' ? { ...settled, stopReason: 'aborted' } : settled
        } finally {
          signal && signal.removeEventListener('abort', onAbort)
        }
      })()
      return {
        id: child.id,
        localAgent: child,
        result,
        async dispose() {
          canceled = true
          child.cancel({ kind: 'parent' })
          await Promise.allSettled([result])
          await handle.dispose()
        },
      }
    },
  }
}

// 拼接角色 persona：基础规则 + 项目有效角色；Host 不可用时回退 preset 角色。
// 项目同 id 角色是完整覆盖而非追加，保证前端所见与实际注入一致；空 persona 也是有效覆盖。
async function assemblePersona(normalized, roleKey, roleDef, mofei, projectId) {
  const parts = []
  if (normalized.basePersona) parts.push(normalized.basePersona)
  if (normalized.v3Guidance) parts.push(normalized.v3Guidance)
  let resolved = false
  let rolePersona = ''
  if (mofei !== undefined && typeof mofei.compileRolePersona === 'function' && typeof projectId === 'string' && projectId && roleKey) {
    try {
      const result = await mofei.compileRolePersona(projectId, roleKey)
      if (result && typeof result.persona === 'string') {
        resolved = true
        rolePersona = result.persona
      }
    } catch (error) { /* Host 不可用或项目没有该角色时保留 preset 角色 */ }
  }
  if (!resolved && roleDef && typeof roleDef.persona === 'string') rolePersona = roleDef.persona
  if (rolePersona) parts.push(rolePersona)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

// per-call model/provider/effort 优先，角色默认值兜底，都无则继承父代理。
// 空字符串不算覆盖；provider/model 只有有效字符串才进入 DSH 请求，避免半配置污染父路由。
// reasoningEffort 例外：调用与角色都未指定时固定 'high'，不继承父会话的 effort——
// 父会话 UI 可选 'max'，但部分上游 API 只接受 low/medium/high/xhigh，继承 'max' 会 400 失败。
function resolveAgentOptions(args, roleDef) {
  const opts = {}
  const argProvider = typeof args.provider === 'string' ? args.provider.trim() : ''
  const roleProvider = roleDef && typeof roleDef.provider === 'string' ? roleDef.provider.trim() : ''
  const argModel = typeof args.model === 'string' ? args.model.trim() : ''
  const roleModel = roleDef && typeof roleDef.model === 'string' ? roleDef.model.trim() : ''
  const provider = argProvider || roleProvider
  const model = argModel || roleModel
  if (provider) opts.provider = provider
  if (model) opts.model = model
  const effort = args.effort !== undefined ? args.effort : roleDef && roleDef.effort
  if (effort === 'off' || effort === 'high' || effort === 'max') opts.reasoningEffort = effort
  else opts.reasoningEffort = 'high'
  return opts
}

export default {
  inject: ['tools', 'subagents'],
  apply(ctx, config) {
    const toolsService = ctx.get ? ctx.get('tools') : ctx.tools
    const subagents = ctx.get ? ctx.get('subagents') : ctx.subagents
    let mofei = ctx.get ? ctx.get('mofei') : ctx.mofei
    if (toolsService === undefined || subagents === undefined) return
    const normalized = normalizeConfig(config)
    assertSubagentMaxDepth(normalized.maxDepth)
    const childPresetMode = normalized.childPreset !== ''
    const continuable = normalized.backgroundMode === 'continuable' && !childPresetMode
    const toolName = normalized.toolName
    const availableRoles = Object.keys(normalized.roles)
    const providerName = childPresetMode ? normalized.childProviderName : normalized.subagentProvider
    let disposeTool

    const mount = (provider) => {
      if (continuable && typeof provider.prepareContinuable !== 'function') {
        throw new Error(`dsh-mofei/subagent-max: provider ${provider.name} does not support backgroundMode: continuable`)
      }
      const definition = {
        name: toolName,
        description:
          'Delegate one self-contained writing task to a child agent. The child runs on the native subagent engine; model/provider/effort select its LLM. ' +
          'Pass role=writer/reviewer/analyzer/polisher so the system injects the role contract; do not paste role instructions into prompt. ' +
          'When projectId is provided, the effective project role persona and default instructions are resolved by id or name. ' +
          'context is factual project material and prompt is the only task to execute. ' +
          'Without explicit model/provider, the child inherits the parent\'s model route. ' +
          (availableRoles.length > 0 ? `Available roles: ${availableRoles.join(', ')}. ` : '') +
          (continuable
            ? 'Runs in the background by default and returns a durable subagent id; set run_in_background to false to wait for the result.'
            : 'Waits for the result by default; set run_in_background to true to return a background job id you collect with job_output / stop with job_kill.'),
        // 标准 OpenAI JSON Schema：required 必须是顶层数组（属性级 required 会被 DeepSeek API 拒绝）。
        parameters: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              description: 'Role key that selects a persona. The role persona is system-injected (not part of your prompt). Built-in roles are listed in the tool description; project overrides and custom roles are resolved by id or name when projectId is provided. Use mofei_list-roles to inspect the effective catalog.',
            },
            projectId: {
              type: 'string',
              description: 'Required for project-scoped role/model resolution: the current mofei project id. Pass it whenever role is provided so project persona, instructions, and model settings are selected. Get it from mofei_get-active-context.',
            },additionalInstructions: {
               type: 'array',
               items: { type: 'string' },
               description: 'Optional private Mofei writing-instruction ids to append for this task. Default template instructions cannot be removed.',
             },
             model: {
              type: 'string',
              description: 'The model id the child subagent must use. Omit to use the role default or inherit the parent\'s model.',
            },
            provider: {
              type: 'string',
              description: 'Optional LLM provider route for the child. Omit to use the role default or inherit the parent\'s provider.',
            },
            effort: {
              type: 'string',
              description: 'Optional reasoning effort for the child: off | high | max. Omit to use the role default or inherit the parent\'s setting.',
            },
            context: {
              type: 'string',
              description: 'Optional factual project material (chapter, characters, notes, worldbook). It is labeled as context and is not an instruction; keep the actual objective in prompt.',
            },
            description: {
              type: 'string',
              description: 'A short (3-5 word) description of the delegated task, for display.',
            },
            prompt: {
              type: 'string',
              description: 'The one complete task to execute. Include project/chapter ids, required tool calls, acceptance checks, and exact output format. Do not include persona text or a second task.',
            },
            run_in_background: {
              type: 'boolean',
              description: continuable
                ? 'Whether to run in the background and return a durable subagent id immediately. Defaults to true. Set false to wait for the result.'
                : 'Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill.',
            },
          },
          required: ['description', 'prompt'],
          additionalProperties: false,
        },
        output: {
          // 严格 JSON Schema（tools.register 校验；'json' 是 schemastery 方言，手写版不可用）
          schema: { type: 'object' },
          render: (_args, value) => [{
            type: 'text',
            text: value && value.kind === 'background'
              ? 'started background subagent task ' + value.jobId
              : value && value.kind === 'continuable'
                ? 'started subagent ' + value.subagentId
                : outputText(value && value.output),
          }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          const parent = exec.agent
          if (!parent) throw new Error('subagent tool requires a calling agent (exec.agent was undefined)')
          // 解析角色
          const roleKey = typeof args.role === 'string' && args.role.trim() ? args.role.trim() : null
          if (roleKey !== null && (typeof args.projectId !== 'string' || !args.projectId.trim())) {
            throw new Error('subagent_with_model: projectId is required when role is provided; use mofei_get-active-context to obtain it')
          }
          // 服务可能在工具 mount 之后才出现；角色校验前重新读取最新引用。
          mofei = (ctx.get ? ctx.get('mofei') : ctx.mofei) || mofei
          // 项目角色是动态数据，不能只用 mount 时从 preset 读到的 roles 校验。
          const projectRole = roleKey !== null
            ? await resolveProjectRole(mofei, args.projectId.trim(), roleKey)
            : null
          const hasPresetRole = roleKey !== null && Object.prototype.hasOwnProperty.call(normalized.roles, roleKey)
          const roleDef = roleKey !== null
            ? (hasPresetRole ? normalized.roles[roleKey] : (projectRole ? {} : undefined))
            : undefined
          if (roleKey !== null && roleDef === undefined) {
            throw new Error(`subagent_with_model: unknown role "${roleKey}". Available preset roles: ${availableRoles.join(', ') || '(none)'}; project roles: use mofei_list-roles with projectId`)
          }
          const projectRoleId = roleIdOf(projectRole, roleKey)
          // 三段拼接 persona → 系统级注入（覆盖父 persona）；优先从 mofei 项目角色文件读取
          let injectedPersona = await assemblePersona(normalized, projectRoleId, roleDef, mofei, args.projectId)
          if (mofei !== undefined && typeof mofei.compileInstructionPersona === 'function' && roleKey && typeof args.projectId === 'string' && args.projectId) {
            const compiled = await mofei.compileInstructionPersona(args.projectId, projectRoleId, args.additionalInstructions).catch(() => null)
            if (compiled && compiled.persona) injectedPersona = [injectedPersona, compiled.persona].filter(Boolean).join('\n\n')
          }
          // model/provider/effort：per-call > role 默认 > 继承父
          // model/provider/effort：per-call > 墨扉模板专用/通用模型 > preset 角色默认 > 继承父
          let configuredModel = null
          if (mofei !== undefined && typeof mofei.resolveSubagentModel === 'function') {
            try { configuredModel = await mofei.resolveSubagentModel(typeof args.projectId === 'string' ? args.projectId : '', projectRoleId || '') } catch (error) { /* 模型配置不可用时继续使用 preset / DSH 默认路由 */ }
          }
          const configuredDefaults = configuredModel && typeof configuredModel.model === 'string' && configuredModel.model.trim()
            ? {
                model: configuredModel.model.trim(),
                ...(typeof configuredModel.provider === 'string' && configuredModel.provider.trim()
                  ? { provider: configuredModel.provider.trim() }
                  : {}),
              }
            : {}
          const optionRole = { ...(roleDef || {}), ...configuredDefaults }
          const agentOptions = resolveAgentOptions(args, optionRole)
          // 中控装配的上下文与任务分栏，避免章节正文被模型误当作指令。
          const assembledPrompt = assembleDelegatedPrompt(args.context, args.prompt)
          const request = {
            prompt: [{ type: 'text', text: assembledPrompt }],
            parent,
            agentOptions,
            maxDepth: normalized.maxDepth,
            ...(injectedPersona !== undefined ? { persona: injectedPersona } : {}),
          }
          const runInBackground = args.run_in_background !== undefined ? !!args.run_in_background : continuable
          if (runInBackground) {
            if (continuable) {
              const { childId } = await subagents.startContinuable({
                provider: providerName,
                label: args.description,
                request,
                signal: exec.signal,
              })
              return { kind: 'continuable', subagentId: childId }
            }
            const jobs = ctx.get('jobs')
            if (!jobs) throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
            return {
              kind: 'background',
              jobId: jobs.start({
                kind: 'subagent',
                label: args.description,
                owner: parent,
                run: () => {
                  const controller = new AbortController()
                  return {
                    cancel: (reason) => controller.abort(reason ?? 'background subagent task killed'),
                    done: settleStart(
                      subagents.start(providerName, { ...request, label: args.description, signal: controller.signal }),
                      controller.signal,
                    ),
                  }
                },
              }),
            }
          }
          const run = await subagents.start(providerName, { ...request, label: args.description, signal: exec.signal })
          try {
            const result = await run.result
            if (result.stopReason !== 'completed') {
              const message = stopReasonMessage(result)
              const partial = outputText(result.output ?? [])
              throw new Error(partial ? message + '\nPartial output before the run ended:\n' + partial : message)
            }
            return { kind: 'foreground', runId: run.id, output: result.output }
          } finally {
            await run.dispose()
          }
        },
      }
      disposeTool = toolsService.register(definition)
    }

    if (typeof ctx.on === 'function') {
      ctx.on('subagent/provider-added', (provider) => {
        if (provider && provider.name === providerName && disposeTool === undefined) mount(provider)
      })
      ctx.on('subagent/provider-removed', (name) => {
        if (name === providerName && disposeTool !== undefined) {
          try { disposeTool() } catch (error) { /* noop */ }
          disposeTool = undefined
        }
      })
    }
    const present = subagents.getProvider(providerName)
    if (present !== undefined) mount(present)
    else if (childPresetMode) {
      const childProvider = createPresetProvider(normalized.childPreset, providerName, normalized.inheritParentContext)
      subagents.registerProvider(childProvider)
      if (disposeTool === undefined) mount(childProvider)
    } else console.warn(`墨扉 subagent provider ${providerName} 未注册，subagent_with_model 将在其出现时注册`)
  },
}
