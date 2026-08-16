import { WRITING_SKILLS_CSS, filterWritingSkills, writingSkillLabel } from './skills-library.js'

let passed = 0
let failed = 0

function check(name, condition, detail) {
  if (condition) {
    passed++
    console.log('PASS ' + name)
  } else {
    failed++
    console.log('FAIL ' + name + (detail ? ' -- ' + detail : ''))
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
}

eq('maps built-in skill to Chinese product name', writingSkillLabel('mofei-character-design'), '角色设计')
eq('maps legacy prefix to Chinese product name', writingSkillLabel('openfic-story-quality'), '故事质量')
eq('maps unprefixed built-in skill', writingSkillLabel('writing'), '墨扉写作')
eq('handles empty name', writingSkillLabel(null), '')

const skills = [
  { name: 'mofei-character-design', description: 'Design characters', whenToUse: 'Create a protagonist' },
  { name: 'mofei-story-quality', description: 'Check story quality', whenToUse: 'Review a chapter' },
]
eq('empty query returns all skills', filterWritingSkills(skills, '').length, 2)
eq('searches names', filterWritingSkills(skills, 'quality')[0].name, 'mofei-story-quality')
eq('searches descriptions case-insensitively', filterWritingSkills(skills, 'CHARACTERS')[0].name, 'mofei-character-design')
eq('searches use cases', filterWritingSkills(skills, 'review')[0].name, 'mofei-story-quality')
eq('invalid skills input is safe', filterWritingSkills(null, 'story').length, 0)
check('CSS includes overlay', WRITING_SKILLS_CSS.includes('.mf-sk-overlay'))
check('CSS includes skills list', WRITING_SKILLS_CSS.includes('.mf-sk-list'))
check('CSS includes responsive treatment', WRITING_SKILLS_CSS.includes('@media(max-width:760px)'))

console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed) process.exit(1)
console.log('ALL TESTS PASSED')
