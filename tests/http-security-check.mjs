import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

// Run a production build locally. Never probe mutation routes on a live service.
const port = 4318
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] })
let logs = ''
server.stdout.on('data', chunk => { logs = (logs + chunk).slice(-8000) })
server.stderr.on('data', chunk => { logs = (logs + chunk).slice(-8000) })
try {
  let ready = false
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`Local server exited: ${logs}`)
    try { if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break } } catch {}
    await delay(500)
  }
  assert.ok(ready, 'Local production server did not start')
  const files = await readdir('app/api', { recursive: true })
  let checks = 0
  const failures = []
  for (const file of files.filter(file => file.endsWith('route.ts'))) {
    const source = await readFile(`app/api/${file}`, 'utf8')
    if (!/requireUser|requireAdmin|requireSchedulerOrAdmin|verifyIdToken/.test(source)) continue
    const methods = [...source.matchAll(/export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PATCH|DELETE)\b/g)].map(match => match[1])
    const path = '/api/' + file.replace(/\/?route\.ts$/, '')
    for (const method of methods) {
      if (path === '/api/ai-chat' && method === 'GET') continue // public capability flag
      for (const token of [null, 'not-a-valid-session-token']) {
        const response = await fetch(base + path, {
          method,
          headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
          ...(method === 'GET' ? {} : { body: '{}' }),
          redirect: 'manual',
          signal: AbortSignal.timeout(5000),
        })
        if (![401, 403].includes(response.status)) failures.push(`${method} ${path} (${token ? 'invalid' : 'missing'} token): ${response.status}`)
        checks++
      }
    }
  }
  assert.deepEqual(failures, [], 'Protected endpoints must reject invalid sessions')
  assert.ok(checks >= 80, 'Route discovery missed protected endpoints')
  console.log(`${checks} missing/invalid-token HTTP authorization checks passed.`)
} finally {
  server.kill('SIGTERM')
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve) })
}
