// 墨扉TXT 解析/导出纯逻辑（无 DSH 依赖，可独立单元测试）
export function importTitle(value, fallback) {
  const title = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  return title.slice(0, 120) || fallback
}

export function parseTxt(content) {
  const source = typeof content === 'string' ? content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') : ''
  if (!source.trim()) return { error: 'EMPTY_TEXT' }
  if (source.length > 8 * 1024 * 1024) return { error: 'TEXT_TOO_LARGE' }
  const volumes = []
  let currentVolume = null
  let currentChapter = null
  const volumePattern = /^\s*(?:第\s*[0-9一二三四五六七八九十百千零〇两]+\s*卷|卷\s*[0-9一二三四五六七八九十百千零〇两]+)(?:\s*[:：、.\-]\s*|\s+)?(.{0,100})\s*$/
  const chapterPattern = /^\s*(?:第\s*[0-9一二三四五六七八九十百千零〇两]+\s*[章节回部]|(?:chapter|chap\.)\s*\d+)(?:\s*[:：、.\-]\s*|\s+)?(.{0,100})\s*$/i
  const addChapter = (title) => {
    currentChapter = { title: importTitle(title, '未命名章节'), content: '' }
    if (currentVolume) currentVolume.chapters.push(currentChapter)
    else {
      const loose = volumes[volumes.length - 1]
      if (loose && loose.title === null) loose.chapters.push(currentChapter)
      else volumes.push({ title: null, chapters: [currentChapter] })
    }
  }
  const lines = source.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  lines.forEach((line) => {
    const volume = line.match(volumePattern)
    const chapter = line.match(chapterPattern)
    if (volume) {
      currentVolume = { title: importTitle(volume[0], '未命名卷'), chapters: [] }
      volumes.push(currentVolume)
      currentChapter = null
    } else if (chapter) addChapter(chapter[0])
    else {
      if (!currentChapter) addChapter('正文')
      currentChapter.content += (currentChapter.content ? '\n' : '') + line
    }
  })
  const populated = volumes.map((volume) => ({ title: volume.title, chapters: volume.chapters.filter((chapter) => chapter.content.trim() || chapter.title !== '正文') })).filter((volume) => volume.chapters.length)
  const chapterCount = populated.reduce((sum, volume) => sum + volume.chapters.length, 0)
  const chars = populated.reduce((sum, volume) => sum + volume.chapters.reduce((inner, chapter) => inner + chapter.content.length, 0), 0)
  return { volumes: populated, chapterCount, chars }
}

export function exportProject(project, args) {
  const wantedVolumes = Array.isArray(args && args.volumeIds) ? args.volumeIds : null
  const wantedChapters = Array.isArray(args && args.chapterIds) ? args.chapterIds : null
  const include = (chapter) => (!wantedVolumes || !wantedVolumes.length || wantedVolumes.includes(chapter.volumeId || '')) && (!wantedChapters || !wantedChapters.length || wantedChapters.includes(chapter.id))
  const rows = [project.title, project.description || '']
  const append = (chapter) => { if (include(chapter)) rows.push(chapter.title, '', chapter.content, '') }
  project.chapters.filter((chapter) => !chapter.volumeId).slice().sort((a, b) => a.order - b.order).forEach(append)
  project.volumes.slice().sort((a, b) => a.order - b.order).forEach((volume) => {
    const chapters = project.chapters.filter((chapter) => chapter.volumeId === volume.id).slice().sort((a, b) => a.order - b.order).filter(include)
    if (chapters.length) { rows.push(volume.title, ''); chapters.forEach(append) }
  })
  return { filename: importTitle(project.title, '墨扉') + '.txt', content: rows.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n' }
}
