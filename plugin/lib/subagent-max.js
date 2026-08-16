// 墨扉子代理辅助插件（mofei-dsh/subagent-max）
// 注册 subagent_with_model：每次调用由 Agent 指定子代理的 model / provider / effort（推理强度）/ context（装配上下文）。
// 只应在 mofei-writer 等写作 preset 的 agent.cordis.yml 中加载（隔离：standard 会话不可见）。
// 零外部依赖：工具定义、settleRun、maxDepth 校验均为内联实现，行为与官方 dsh-subagent / dsh-tool-subagent 一致。
// 说明：本模块由 @aaravarr/dsh-subagent-max v0.1.1 的 host 半区改造而来（新增 effort/context 参数），
// 现已直接并入 mofei-dsh 打包（v0.16.1），不再依赖独立第三方包。

function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : {}
  const subagentProvider = typeof source.subagentProvider === 'string' && source.subagentProvider ? source.subagentProvider : 'spawn'
  const toolName = typeof source.toolName === 'string' && /^[a-zA-Z0-9_-]+$/.test(source.toolName) ? source.toolName : 'subagent_with_model'
  const backgroundMode = source.backgroundMode === 'one-shot' ? 'one-shot' : 'continuable'
  const maxDepth = Number.isSafeInteger(source.maxDepth) && source.maxDepth >= 0 ? source.maxDepth : 3
  return { subagentProvider, toolName, backgroundMode, maxDepth }
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

export default {
  inject: ['tools', 'subagents'],
  apply(ctx, config) {
    const toolsService = ctx.get ? ctx.get('tools') : ctx.tools
    const subagents = ctx.get ? ctx.get('subagents') : ctx.subagents
    if (toolsService === undefined || subagents === undefined) return
    const normalized = normalizeConfig(config)
    assertSubagentMaxDepth(normalized.maxDepth)
    const continuable = normalized.backgroundMode === 'continuable'
    const toolName = normalized.toolName
    let disposeTool

    const mount = (provider) => {
      if (continuable && typeof provider.prepareContinuable !== 'function') {
        throw new Error(`mofei-dsh/subagent-max: provider ${provider.name} does not support backgroundMode: continuable`)
      }
      const definition = {
        name: toolName,
        description:
          'Delegate a task to a subagent and explicitly choose its model. The child runs on the same native subagent engine as the regular subagent tool; model (and optionally provider) select that child\'s model for this one delegation. ' +
          'Optional effort selects the child\'s reasoning strength (off | high | max); optional context injects context you assembled yourself, prefixed to the child\'s prompt. ' +
          (continuable
            ? 'Runs in the background by default and returns a durable subagent id; set run_in_background to false to wait for the result.'
            : 'Waits for the result by default; set run_in_background to true to return a background job id you collect with job_output / stop with job_kill.'),
        // 标准 OpenAI JSON Schema：required 必须是顶层数组（属性级 required 会被 DeepSeek API 拒绝）。
        parameters: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              description: 'The model id the child subagent must use (e.g. deepseek-v4-pro, deepseek-v4-flash, k3-256k).',
            },
            provider: {
              type: 'string',
              description: 'Optional LLM provider route for the child. Omit to inherit the parent\'s provider.',
            },
            effort: {
              type: 'string',
              description: 'Optional reasoning effort for the child: off | high | max. Omit to inherit the parent\'s setting.',
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
          required: ['model', 'description', 'prompt'],
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
          const agentOptions = {
            ...(args.provider !== undefined ? { provider: args.provider } : {}),
            ...(args.model !== undefined ? { model: args.model } : {}),
            // v0.16: 推理强度 off|high|max → 原生 AgentOptions.reasoningEffort → wire reasoning_effort
            ...(args.effort !== undefined ? { reasoningEffort: args.effort } : {}),
          }
          // v0.16: 主模型手动装配的上下文，前置注入子代理 prompt
          const assembledPrompt = args.context !== undefined && String(args.context).length > 0
            ? '【主模型装配的上下文】\n' + String(args.context) + '\n\n【任务】\n' + args.prompt
            : args.prompt
          const request = {
            prompt: [{ type: 'text', text: assembledPrompt }],
            parent,
            agentOptions,
            maxDepth: normalized.maxDepth,
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
