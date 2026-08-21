// 从 OpenFic-main 的 skills/*.yaml 生成 plugin/lib/skills.js（DSH runtime skills）
// 用法：node tools/migrate-skills.mjs
// 生成物完全可复现；源 YAML 更新后重跑即可。不依赖第三方包：按缩进解析 content 块。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.dirname(toolsDir)
const sourceDir = path.join(projectDir, '..', 'OpenFic-main', 'OpenFic-main', 'backend', 'app', 'skills')
const targetFile = path.join(projectDir, 'plugin', 'lib', 'skills.js')
const existingWriting = path.join(projectDir, 'skills', 'openfic-writing.md')

function parseYamlSkill(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const name = (text.match(/^name:\s*(.+?)\s*$/m) || [])[1]?.trim() || ''
  const summary = (text.match(/^summary:\s*(.+?)\s*$/m) || [])[1]?.trim() || ''
  const lines = text.split(/\r?\n/)
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const match = lines[i].match(/^(\s*)content:\s*\|-?\s*$/)
    if (!match) { i += 1; continue }
    const keyIndent = match[1].length
    const bodyIndent = keyIndent + 2
    let j = i + 1
    while (j < lines.length) {
      const line = lines[j]
      if (line.trim() === '') { j += 1; continue }
      const indent = line.match(/^\s*/)[0].length
      if (indent > keyIndent) j += 1
      else break
    }
    const body = lines.slice(i + 1, j).map((line) => {
      const indent = line.match(/^\s*/)[0].length
      return indent >= bodyIndent ? line.slice(bodyIndent) : line.replace(/^\s*/, '')
    })
    while (body.length && body[0].trim() === '') body.shift()
    while (body.length && body[body.length - 1].trim() === '') body.pop()
    blocks.push(body.join('\n'))
    i = j
  }
  if (!blocks.length) throw new Error('no content blocks: ' + file)
  const content = blocks.map((block, index) => index === 0 ? block : '## 参考材料 ' + String(index) + '\n\n' + block).join('\n\n').trimEnd() + '\n'
  return { name, summary, content }
}

function parseMarkdownSkill(file) {
  const text = fs.readFileSync(file, 'utf8')
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) throw new Error('bad markdown skill: ' + file)
  const front = match[1]
  const name = (front.match(/^name:\s*(.+?)\s*$/m) || [])[1]?.trim() || 'openfic-writing'
  const description = (front.match(/^description:\s*(.+?)\s*$/m) || [])[1]?.trim() || 'OpenFic 小说写作技能。'
  return { name, description, whenToUse: description, content: match[2].trimEnd() + '\n' }
}

const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.yaml')).sort()
if (files.length !== 16) throw new Error('expected 16 yaml skills, got ' + files.length)

const skills = files.map((file) => {
  const parsed = parseYamlSkill(path.join(sourceDir, file))
  if (!parsed.name || !parsed.summary || !parsed.content.trim()) throw new Error('parse failed: ' + file)
  const base = file.replace(/\.yaml$/, '')
  return {
    name: 'openfic-' + base,
    description: parsed.summary,
    whenToUse: '当用户要求「' + parsed.name + '」（' + parsed.summary + '）时加载并遵循该技能。',
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'openfic-dsh',
    content: parsed.content,
  }
})

skills.push(parseMarkdownSkill(existingWriting))

const lines = [
  '// 由 tools/migrate-skills.mjs 自动生成，勿手改。',
  '// 来源：OpenFic-main/backend/app/skills/*.yaml（Apache-2.0，保留署名）。',
  'export const openficSkills = [',
]
for (const skill of skills) {
  lines.push('  {')
  lines.push('    name: ' + JSON.stringify(skill.name) + ',')
  lines.push('    description: ' + JSON.stringify(skill.description) + ',')
  lines.push('    whenToUse: ' + JSON.stringify(skill.whenToUse) + ',')
  lines.push('    invocation: { modelInvocable: true, userInvocable: true },')
  lines.push('    provider: \'openfic-dsh\',')
  lines.push('    content: ' + JSON.stringify(skill.content) + ',')
  lines.push('  },')
}
lines.push(']')
fs.writeFileSync(targetFile, lines.join('\n') + '\n', 'utf8')
console.log('generated', targetFile, 'with', skills.length, 'skills')
for (const skill of skills) console.log('-', skill.name, skill.content.length, 'chars')
