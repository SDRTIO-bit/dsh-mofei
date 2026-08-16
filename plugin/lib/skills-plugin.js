// 墨扉写作技能插件（mofei-dsh/skills）
// 只应在 mofei-writer 等写作 preset 的 agent.cordis.yml 中加载。
// v0.17: 注册前读取 Host 技能开关（mofei.listSkillSettings），禁用的技能不注册（AI 不可见）。
import { mofeiSkills } from './skills.js'

export default {
  inject: ['skills', 'mofei'],
  apply(ctx) {
    const skillsService = ctx.get ? ctx.get('skills') : ctx.skills
    if (skillsService === undefined) return
    const mofei = ctx.get ? ctx.get('mofei') : ctx.mofei
    const disposers = []
    const registerSkill = (skill) => {
      try { disposers.push(skillsService.register(skill)) } catch (error) { console.error('墨扉 skill register failed: ' + skill.name, error) }
      try { disposers.push(skillsService.register({ ...skill, name: skill.name.replace(/^mofei-/, 'openfic-'), description: '[旧名兼容，建议改用 ' + skill.name + '] ' + skill.description })) } catch (error) { console.error('墨扉 legacy skill register failed: ' + skill.name, error) }
    }
    const registerAll = (skills) => { for (const skill of skills) registerSkill(skill) }
    if (mofei !== undefined && typeof mofei.listSkillSettings === 'function') {
      mofei.listSkillSettings().then((settings) => {
        const disabled = new Set((settings && Array.isArray(settings.disabledSkills)) ? settings.disabledSkills : [])
        registerAll(mofeiSkills.filter((skill) => !disabled.has(skill.name)))
      }).catch((error) => { console.error('墨扉 skill settings 读取失败，全部注册：' + String((error && error.message) || error)); registerAll(mofeiSkills) })
    } else registerAll(mofeiSkills)
    return () => { for (const dispose of disposers) { try { dispose() } catch (error) { /* noop */ } } }
  },
}
