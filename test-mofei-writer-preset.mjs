import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { MOFEI_BUILTIN_ROLES } from './plugin/lib/roles.js'

const preset = await readFile(new URL('./presets/mofei-writer/agent.cordis.yml', import.meta.url), 'utf8')
const roles = Object.fromEntries(MOFEI_BUILTIN_ROLES.map((role) => [role.id, role]))

assert.match(preset, /childPreset: minimal/)
assert.doesNotMatch(preset, /childPreset: minimal-v3/)
assert.match(preset, /roleCatalog: mofei-writing/)
assert.doesNotMatch(preset, /^\s+roles:/m)
assert.match(roles.writer.persona, /每章至少让目标、风险、关系、信息、资源或认知中的一项发生可见变化/)
assert.match(roles.writer.persona, /冲突必须来自人物各自想要什么及其阻力/)
assert.match(roles.writer.persona, /对话每次至少推进信息、关系、博弈或行动之一/)
assert.match(roles.writer.persona, /这些是商业连载机制，不得模仿任何参考书的人物、情节、句子或独特口吻/)
assert.match(roles.reviewer.persona, /样本只用于判断连载机制，不因题材、字数、文风或没有强制悬崖结尾而判错/)
assert.match(preset, /【事实包】派单前只取完成任务必需的事实/)
assert.match(preset, /【编辑职责】你不是机械转发器/)
assert.match(preset, /本书写给谁、承诺什么阅读体验/)
assert.match(preset, /【编辑总纲】先守住本书的读者契约和核心卖点/)
assert.match(preset, /目标 → 阻力 → 选择或行动 → 反馈或代价 → 状态变化 → 新期待/)
assert.match(preset, /节奏是压力与释放的波形，不是全程高压/)
assert.match(preset, /【适用边界】作者对本次任务的明确裁定最高/)
assert.match(preset, /固定字数、章数、比例、钩子密度、题材或性别公式只能作为有条件的参考/)
assert.match(preset, /【结果裁决】子代理结果是待验收的专业意见/)
assert.match(preset, /不因已有 PASS 而停止判断/)
assert.match(preset, /【写作闭环】续写或改写：先 Writer，再 Reviewer/)
assert.match(roles.analyzer.persona, /你是 Analyzer，只做设定、时间线、角色认知和因果链分析/)
assert.match(roles.analyzer.persona, /把关键事件拆为“已知事实 → 人物获知的信息 → 选择\/行动 → 直接结果 → 后续影响”/)
assert.match(roles.polisher.persona, /你是 Polisher，只改善语言、节奏、画面和可读性/)
assert.match(roles.polisher.persona, /不新增设定、伏笔、反转、心理结论、能力或因果/)
assert.equal(MOFEI_BUILTIN_ROLES.every((role) => role.effort === 'high'), true)

console.log('== MOFEI WRITER PRESET CONTRACT PASS ==')
