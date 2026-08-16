// 墨扉写作技能插件（mofei-dsh/skills）
// 只应在 mofei-writer 等写作 preset 的 agent.cordis.yml 中加载。
import { mofeiSkills } from './skills.js'

export default {
  inject: ['skills'],
  apply(ctx) {
    const skillsService = ctx.get ? ctx.get('skills') : ctx.skills
    if (skillsService === undefined) return
    const disposers = []
    for (const skill of mofeiSkills) {
      try { disposers.push(skillsService.register(skill)) } catch (error) { console.error('墨扉 skill register failed: ' + skill.name, error) }
      try { disposers.push(skillsService.register({ ...skill, name: skill.name.replace(/^mofei-/, 'openfic-'), description: '[旧名兼容，建议改用 ' + skill.name + '] ' + skill.description })) } catch (error) { console.error('墨扉 legacy skill register failed: ' + skill.name, error) }
    }
    return () => { for (const dispose of disposers) { try { dispose() } catch (error) { /* noop */ } } }
  },
}
