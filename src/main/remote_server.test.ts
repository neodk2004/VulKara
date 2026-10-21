// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRemoteServer, type RemoteDeps } from './remote_server'

const TOKEN = 'secret-token'

function harness(over: Partial<RemoteDeps> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vk-remote-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>VulKara</title>')
  const allowed = join(dir, 'result.png')
  writeFileSync(allowed, 'PNGDATA')
  const deps: RemoteDeps = {
    token: () => TOKEN,
    call: async (channel, args) => {
      if (channel === 'boom') throw new Error('nope')
      if (channel === 'native:choose') throw new Error('not allowed')
      return { channel, args }
    },
    subscribe: () => () => {},
    filePath: (p) => (p === allowed ? allowed : null),
    staticDir: () => dir,
    log: () => {},
    ...over,
  }
  const server = createRemoteServer(deps)
  return { server, dir, allowed }
}

let running: { stop(): Promise<void> } | undefined
afterEach(async () => {
  await running?.stop()
  running = undefined
})
async function start(h: ReturnType<typeof harness>): Promise<string> {
  running = h.server
  await h.server.start(0)
  return `http://127.0.0.1:${h.server.port()}`
}
const bearer = { authorization: `Bearer ${TOKEN}` }

describe('the remote web UI server', () => {
  it('answers byte ranges for a file, as Safari needs for a video', async () => {
    const h = harness()
    const base = await start(h)
    const url = `${base}/file?path=${encodeURIComponent(h.allowed)}`
    const part = await fetch(url, { headers: { ...bearer, range: 'bytes=2-4' } })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 2-4/7')
    expect(await part.text()).toBe('GDA')
    const tail = await fetch(url, { headers: { ...bearer, range: 'bytes=-3' } })
    expect(await tail.text()).toBe('ATA')
    expect((await fetch(url, { headers: { ...bearer, range: 'bytes=9-' } })).status).toBe(416)
    const whole = await fetch(url, { headers: bearer })
    expect(whole.status).toBe(200)
    expect(whole.headers.get('accept-ranges')).toBe('bytes')
  })

  it('answers a malformed or odd request without an error in the main process, with protective headers', async () => {
    const h = harness()
    mkdirSync(join(h.dir, 'assets'))
    const base = await start(h)
    const bad = await fetch(`${base}/%zz`)
    expect(bad.status).toBe(400)
    expect((await fetch(`${base}/assets/`)).status).toBe(404)
    const res = await fetch(`${base}/`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    // and it still serves afterwards
    expect((await fetch(`${base}/`)).status).toBe(200)
  })

  it('refuses the data paths without the token, with the wrong token, and when it is off', async () => {
    const base = await start(harness())
    expect((await fetch(`${base}/ipc`, { method: 'POST', body: '{}' })).status).toBe(401)
    expect((await fetch(`${base}/ipc`, { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: '{}' })).status).toBe(401)
    const off = harness({ token: () => '' })
    const offBase = await start(off)
    expect((await fetch(`${offBase}/ipc`, { method: 'POST', headers: bearer, body: '{}' })).status).toBe(401)
    await off.server.stop()
  })

  it('serves the page shell without a token so the browser can ask for one', async () => {
    const base = await start(harness())
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('VulKara')
    // an unknown route is the SPA shell too (vue-router handles it in the browser)
    expect((await fetch(`${base}/text`)).status).toBe(200)
  })

  it('mirrors a bridge call and passes its arguments', async () => {
    const base = await start(harness())
    const res = await fetch(`${base}/ipc`, { method: 'POST', headers: bearer, body: JSON.stringify({ channel: 'queue:snapshot', args: [1, 2] }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: { channel: 'queue:snapshot', args: [1, 2] } })
  })

  it('reports a handler error (an unknown or native channel) as 400, not a crash', async () => {
    const base = await start(harness())
    const res = await fetch(`${base}/ipc`, { method: 'POST', headers: bearer, body: JSON.stringify({ channel: 'native:choose' }) })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe("not allowed")
  })

  it('serves an allowed file and refuses one the app did not grant', async () => {
    const h = harness()
    const base = await start(h)
    const ok = await fetch(`${base}/file?path=${encodeURIComponent(h.allowed)}&t=${TOKEN}`)
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('PNGDATA')
    expect((await fetch(`${base}/file?path=/etc/passwd&t=${TOKEN}`)).status).toBe(403)
  })

  it('streams the events the main process sends to its pages', async () => {
    let push: ((c: string, a: unknown[]) => void) | undefined
    const base = await start(harness({ subscribe: (fn) => { push = fn; return () => { push = undefined } } }))
    const res = await fetch(`${base}/events?t=${TOKEN}`)
    const reader = res.body!.getReader()
    await new Promise((r) => setTimeout(r, 20))
    push!('queue:change', [{ jobs: [] }])
    let text = ''
    while (!text.includes('queue:change')) {
      const { value } = await reader.read()
      text += new TextDecoder().decode(value)
    }
    expect(text).toContain('"channel":"queue:change"')
    await reader.cancel()
  })
})

describe('the port', () => {
  it('takes the next free port when the one asked for is taken', async () => {
    const first = harness()
    await first.server.start(0)
    const taken = first.server.port()!
    const second = harness()
    await second.server.start(taken)
    expect(second.server.port()).not.toBe(taken)
    expect(second.server.port()).toBeGreaterThan(taken)
    expect((await fetch(`http://127.0.0.1:${second.server.port()}/`)).status).toBe(200)
    await second.server.stop()
    await first.server.stop()
  })
})

describe('HTTPS', () => {
  it('serves over TLS with the Mac\'s own certificate, hands out its authority, and still wants the token', async () => {
    const { ensureTls } = await import('./remote_tls')
    const { request } = await import('node:https')
    const tls = ensureTls(mkdtempSync(join(tmpdir(), 'vk-remote-tls-')), { ips: ['127.0.0.1'], hosts: ['localhost'] }, 'Test')
    const h = harness({ tls: () => tls })
    running = h.server
    await h.server.start(0)
    const get = (path: string, ca?: string): Promise<{ status: number; body: string }> => new Promise((ok, fail) => {
      const req = request({ host: '127.0.0.1', port: h.server.port()!, path, ca }, (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => ok({ status: res.statusCode ?? 0, body }))
      })
      req.on('error', fail)
      req.end()
    })
    // trusted only with the authority: without it the TLS handshake is refused
    await expect(get('/')).rejects.toThrow(/self[- ]signed|unable to verify|certificate/i)
    expect((await get('/', tls.ca)).status).toBe(200)
    const ca = await get('/vulkara-ca.crt', tls.ca)
    expect(ca.status).toBe(200)
    expect(ca.body).toBe(tls.ca)
    expect((await get('/ipc', tls.ca)).status).toBe(401)
  })
})
