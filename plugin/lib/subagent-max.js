// 墨扉子代理辅助插件（mofei-dsh/subagent-max）
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
// 零外部依赖：工具定义、settleRun、maxDepth 校验均为内联实现，行为与官方 dsh-subagent / dsh-tool-subagent 一致。
// 说明：本模块由 @aaravarr/dsh-subagent-max v0.1.1 的 host 半区改造而来，现已直接并入 mofei-dsh 打包。

function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : {}
  const subagentProvider = typeof source.subagentProvider === 'string' && source.subagentProvider ? source.subagentProvider : 'spawn'
  const toolName = typeof source.toolName === 'string' && /^[a-zA-Z0-9_-]+$/.test(source.toolName) ? source.toolName : 'subagent_with_model'
  const backgroundMode = source.backgroundMode === 'one-shot' ? 'one-shot' : 'continuable'
  const maxDepth = Number.isSafeInteger(source.maxDepth) && source.maxDepth >= 0 ? source.maxDepth : 3
  const basePersona = typeof source.basePersona === 'string' ? source.basePersona : ''
  const v3Guidance = typeof source.v3Guidance === 'string' ? source.v3Guidance : ''
  const roles = source.roles && typeof source.roles === 'object' && !Array.isArray(source.roles) ? source.roles : {}
  return { subagentProvider, toolName, backgroundMode, maxDepth, basePersona, v3Guidance, roles }
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

// 三段拼接角色 persona：basePersona + v3Guidance + role persona → 系统级注入。
// role persona 优先从 mofei 服务（项目级角色文件 .mofei-roles.json）读取，找不到则用 config.roles 兜底。
async function assemblePersona(normalized, roleKey, roleDef, mofei, projectId) {
  const parts = []
  if (normalized.basePersona) parts.push(normalized.basePersona)
  if (normalized.v3Guidance) parts.push(normalized.v3Guidance)
  // 尝试从 mofei 服务读取项目级角色 persona
  let rolePersona = undefined
  if (mofei !== undefined && typeof mofei.compileRolePersona === 'function' && typeof projectId === 'string' && projectId && roleKey) {
    try {
      const result = await mofei.compileRolePersona(projectId, roleKey)
      if (result && typeof result.persona === 'string' && result.persona) rolePersona = result.persona
    } catch (error) { /* 角色文件中无此角色，走兜底 */ }
  }
  // 兜底：config.roles 中的内置角色 persona
  if (rolePersona === undefined && roleDef && typeof roleDef.persona === 'string' && roleDef.persona) rolePersona = roleDef.persona
  if (rolePersona) parts.push(rolePersona)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

// per-call model/provider/effort 优先，角色默认值兜底，都无则继承父代理。
function resolveAgentOptions(args, roleDef) {
  const opts = {}
  if (args.provider !== undefined) opts.provider = args.provider
  else if (roleDef && roleDef.provider) opts.provider = roleDef.provider
  if (args.model !== undefined) opts.model = args.model
  else if (roleDef && roleDef.model) opts.model = roleDef.model
  if (args.effort !== undefined) opts.reasoningEffort = args.effort
  else if (roleDef && roleDef.effort) opts.reasoningEffort = roleDef.effort
  return opts
}

export default {
  inject: ['tools', 'subagents'],
  apply(ctx, config) {
    const toolsService = ctx.get ? ctx.get('tools') : ctx.tools
    const subagents = ctx.get ? ctx.get('subagents') : ctx.subagents
    const mofei = ctx.get ? ctx.get('mofei') : ctx.mofei
    if (toolsService === undefined || subagents === undefined) return
    const normalized = normalizeConfig(config)
    assertSubagentMaxDepth(normalized.maxDepth)
    const continuable = normalized.backgroundMode === 'continuable'
    const toolName = normalized.toolName
    const availableRoles = Object.keys(normalized.roles)
    let disposeTool

    const mount = (provider) => {
      if (continuable && typeof provider.prepareContinuable !== 'function') {
        throw new Error(`mofei-dsh/subagent-max: provider ${provider.name} does not support backgroundMode: continuable`)
      }
      const definition = {
        name: toolName,
        description:
          'Delegate a task to a subagent and choose its model and role. The child runs on the same native subagent engine; model/provider/effort select the child\'s LLM for this delegation. ' +
          'Pass a role key to system-inject a role persona (writer/reviewer/analyzer/…); the role persona is injected by the system, not part of your prompt. ' +
          'Without explicit model/provider, the child inherits the parent\'s model route (the dsh default). ' +
          'Optional context injects context you assembled, prefixed to the child\'s prompt. ' +
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
              description: 'Role key that selects a persona. The role persona is system-injected (not part of your prompt). If the project has a role definition file (.mofei-roles.json), the role persona is read from there; otherwise the preset builtin is used. Pass projectId to enable project-level role lookup.',
            },
            projectId: {
              type: 'string',
              description: 'Optional: the current mofei project id. When provided with a role, the role persona is read from the project\'s role definitions (.mofei-roles.json) instead of the preset builtin. Get it from mofei_get-active-context.',
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
              description: 'Optional context you assembled for the child (e.g. the current chapter, characters, worldbook notes). It is prefixed to the child\'s prompt before the task itself.',
            },
            description: {
              type: 'string',
              description: 'A short (3-5 word) description of the delegated task, for display.',
            },
            prompt: {
              type: 'string',
              description: 'The complete, self-contained task for the subagent. It does not share this conversation\'s context, so include everything it needs.',
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
          const roleKey = typeof args.role === 'string' && args.role ? args.role : null
          const roleDef = roleKey !== null ? normalized.roles[roleKey] : undefined
          if (roleKey !== null && roleDef === undefined) {
            throw new Error(`subagent_with_model: unknown role "${roleKey}". Available roles: ${availableRoles.join(', ') || '(none)'}`)
          }
          // 三段拼接 persona → 系统级注入（覆盖父 persona）；优先从 mofei 项目角色文件读取
          let injectedPersona = await assemblePersona(normalized, roleKey, roleDef, mofei, args.projectId)
           if (mofei !== undefined && typeof mofei.compileInstructionPersona === 'function' && roleKey && typeof args.projectId === 'string' && args.projectId) {
             const compiled = await mofei.compileInstructionPersona(args.projectId, roleKey, args.additionalInstructions)
             if (compiled && compiled.persona) injectedPersona = [injectedPersona, compiled.persona].filter(Boolean).join('\n\n')
           }
          // model/provider/effort：per-call > role 默认 > 继承父
           // model/provider/effort：per-call > 墨扉模板专用/通用模型 > preset 角色默认 > 继承父
           let configuredModel = null
           if (mofei !== undefined && typeof mofei.resolveSubagentModel === 'function') {
             try { configuredModel = await mofei.resolveSubagentModel(typeof args.projectId === 'string' ? args.projectId : '', roleKey || '') } catch (error) { /* 模型配置不可用时继续使用 preset / DSH 默认路由 */ }
           }
           const optionRole = configuredModel && configuredModel.model ? { ...(roleDef || {}), model: configuredModel.model, provider: configuredModel.provider || (roleDef && roleDef.provider) } : roleDef
           const agentOptions = resolveAgentOptions(args, optionRole)
          // 中控装配的上下文，前置注入子代理 prompt
          const assembledPrompt = args.context !== undefined && String(args.context).length > 0
            ? '【主模型装配的上下文】\n' + String(args.context) + '\n\n【任务】\n' + args.prompt
            : args.prompt
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
                provider: normalized.subagentProvider,
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
                      subagents.start(normalized.subagentProvider, { ...request, label: args.description, signal: controller.signal }),
                      controller.signal,
                    ),
                  }
                },
              }),
            }
          }
          const run = await subagents.start(normalized.subagentProvider, { ...request, label: args.description, signal: exec.signal })
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

    const providerName = normalized.subagentProvider
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
    else console.warn(`墨扉 subagent provider ${providerName} 未注册，subagent_with_model 将在其出现时注册`)
  },
}
