// 后台循环：等 agent 空闲后把 blank 的 mofei-writer 会话切回 router-standard（最多跑 20 分钟）
const BASE = 'http://127.0.0.1:3088'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function call(method, payload) {
  const r = await fetch(BASE + '/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'mofei-switchback-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), method, payload }) })
  return r.json()
}
;(async () => {
  const deadline = Date.now() + 20 * 60 * 1000
  let attempts = 0
  while (Date.now() < deadline) {
    attempts++
    try {
      const list = await call('session.list', {})
      const items = ((list.result && list.result.value) || list).items || []
      const targets = items.filter((s) => s.agentPreset === 'mofei-writer' && s.blank)
      if (!targets.length) { console.log('ALL CLEAR: no blank mofei-writer sessions left (attempts=' + attempts + ')'); process.exit(0) }
      let switched = 0
      for (const s of targets) {
        const r = await call('agentPreset.select', { sessionId: s.sessionId, agentPreset: 'router-standard' })
        const v = (r.result && r.result.value) || r
        if (v && v.agentPreset === 'router-standard') { switched++; console.log('switched ' + s.sessionId.slice(0, 12)) }
      }
      if (switched === targets.length) { console.log('ALL CLEAR after ' + attempts + ' attempts'); process.exit(0) }
    } catch (e) { /* 服务重启窗口，忽略 */ }
    await sleep(20000)
  }
  console.log('TIMEOUT: gave up after 20min')
  process.exit(1)
})()
