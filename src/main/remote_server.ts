// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The remote web UI: the same pages in a browser on the local network, behind a token (Settings -> Remote access).
//
// A browser has no preload bridge (window.vk), so this tiny HTTP server mirrors it: the renderer's generic call()
// becomes POST /ipc, its on() becomes a Server-Sent-Events stream (/events), and files behind the app's own
// vk-file:// scheme are served from /file. Everything needs the token. Only the plain, window-independent handlers
// are reachable; native things (file dialogs, importing a model) stay on the Mac. No dependency: Node's http is enough.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createServer as createTlsServer } from 'node:https'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { timingSafeEqual } from 'node:crypto'

export interface RemoteDeps {
  /** the current access token; '' means remote access is off and every request is refused */
  token(): string
  /** invoke a bridge handler by channel; rejects for an unknown or not-remotely-allowed channel */
  call(channel: string, args: unknown[]): Promise<unknown>
  /** subscribe to the events the main process sends to its pages; returns an unsubscribe */
  subscribe(fn: (channel: string, args: unknown[]) => void): () => void
  /** an absolute path the app is allowed to serve (file_access), or null to refuse */
  filePath(path: string): string | null
  /** the folder of the built renderer to serve, or null (development) */
  staticDir(): string | null
  /** log a line (same sink as the rest of the app) */
  log(line: string): void
  /** the certificate to serve HTTPS with (and the authority that signed it, for the devices to install), or null: HTTP */
  tls?(): { key: string; cert: string; ca: string } | null
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.map': 'application/json; charset=utf-8',
}
const typeOf = (p: string): string => TYPES[extname(p).toLowerCase()] || 'application/octet-stream'

const MAX_BODY = 8 * 1024 * 1024  // a job is small; a picture reaches the server as a file, not in a call

/** Constant-time token check: the given token (header or query) against the current one. */
function allowed(deps: RemoteDeps, req: IncomingMessage, url: URL): boolean {
  const want = deps.token()
  if (!want) return false
  const auth = req.headers.authorization
  const given = (auth && auth.startsWith('Bearer ') ? auth.slice(7) : null) ?? url.searchParams.get('t') ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk
      if (data.length > MAX_BODY) {
        reject(new Error('too large'))
        req.destroy()  // stop reading, or the limit would not cap the memory
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const json = (res: ServerResponse, code: number, body: unknown): void => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Serve one static file from the built renderer, never outside it (no path traversal), SPA fallback to index.html. */
function serveStatic(deps: RemoteDeps, res: ServerResponse, pathname: string): void {
  const root = deps.staticDir()
  if (!root) return json(res, 404, { error: 'no build' })
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, '')
  let file = join(root, rel)
  if (!file.startsWith(root + sep) && file !== root) file = join(root, 'index.html')
  let stat
  try {
    stat = statSync(file)
  } catch {
    file = join(root, 'index.html')  // SPA route: hand back the shell
    try {
      stat = statSync(file)
    } catch {
      return json(res, 404, { error: 'not found' })
    }
  }
  if (stat.isDirectory()) {
    file = join(file, 'index.html')
    try {
      statSync(file)
    } catch {
      return json(res, 404, { error: 'not found' })
    }
  }
  res.writeHead(200, { 'content-type': typeOf(file), 'cache-control': 'no-cache' })
  stream(file, res)
}

/** A file to the response; a read error ends the response instead of reaching the main process as an exception. */
function stream(file: string, res: ServerResponse): void {
  createReadStream(file).on('error', () => res.destroy()).pipe(res)
}

/** Serve a file the app is allowed to hand out (a result, a pose picture), by its real path. */
function serveFile(deps: RemoteDeps, req: IncomingMessage, res: ServerResponse, path: string): void {
  const real = deps.filePath(path)
  if (!real) return json(res, 403, { error: 'not allowed' })
  let stat
  try {
    stat = statSync(real)
  } catch {
    return json(res, 404, { error: 'gone' })
  }
  const head = { 'content-type': typeOf(real), 'accept-ranges': 'bytes', 'cache-control': 'no-cache' }
  // Safari plays a video only from a server that answers byte ranges
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  if (range && stat.size > 0 && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]))
    let end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'content-range': `bytes */${stat.size}` })
      return void res.end()
    }
    start = Math.max(0, start)
    end = Math.max(start, end)
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': String(end - start + 1) })
    return void createReadStream(real, { start, end }).on('error', () => res.destroy()).pipe(res)
  }
  res.writeHead(200, { ...head, 'content-length': String(stat.size) })
  stream(real, res)
}

/** The event stream: every channel the main process sends to its pages, as Server-Sent Events. */
function serveEvents(deps: RemoteDeps, res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  res.write(': open\n\n')
  // a device that sleeps with its connection half open takes nothing: skip until it drains (the next change brings
  // the whole state again) instead of piling the stream up in memory
  const off = deps.subscribe((channel, args) => {
    if (!res.writableNeedDrain) res.write(`data: ${JSON.stringify({ channel, args })}\n\n`)
  })
  const beat = setInterval(() => res.write(': beat\n\n'), 25000)
  res.on('close', () => {
    clearInterval(beat)
    off()
  })
}

async function serveIpc(deps: RemoteDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { channel?: unknown; args?: unknown }
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    return json(res, 400, { error: 'bad body' })
  }
  if (typeof body.channel !== 'string' || (body.args !== undefined && !Array.isArray(body.args))) {
    return json(res, 400, { error: 'bad call' })
  }
  try {
    const result = await deps.call(body.channel, (body.args as unknown[]) ?? [])
    json(res, 200, { result })
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) })
  }
}

const FREE_PORT_TRIES = 20

/** The remote web UI server. start() listens (on the port asked for or the next free one), stop() closes; both are
 *  safe to call more than once. */
export function createRemoteServer(deps: RemoteDeps): { start(port: number): Promise<void>; stop(): Promise<void>; port(): number | null } {
  let server: Server | undefined

  // 0.0.0.0: reachable from other devices on the local network, which is the whole point
  const listen = (p: number): Promise<Server> => new Promise((resolve, reject) => {
    const tls = deps.tls?.() ?? null
    const s = tls ? createTlsServer({ key: tls.key, cert: tls.cert }, route) : createServer(route)
    s.once('error', reject)
    s.listen(p, '0.0.0.0', () => {
      s.off('error', reject)
      s.on('error', (err) => deps.log(`[remote] ${err.message}`))
      resolve(s)
    })
  })

  function route(req: IncomingMessage, res: ServerResponse): void {
    // on every answer: no type guessing, never inside a frame of another page, no address (with a token) as referrer
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('x-frame-options', 'DENY')
    res.setHeader('content-security-policy', "frame-ancestors 'none'")
    res.setHeader('referrer-policy', 'no-referrer')
    try {
      answer(req, res)
    } catch {
      // a malformed request (a broken %-escape in the path) must not become an error of the main process
      if (!res.headersSent) json(res, 400, { error: 'bad request' })
      else res.destroy()
    }
  }

  function answer(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://localhost')
    // the authority's certificate, for a device to install once: public by nature, so no token
    const ca = deps.tls?.()?.ca
    if (ca && req.method === 'GET' && url.pathname === '/vulkara-ca.crt') {
      res.writeHead(200, { 'content-type': 'application/x-x509-ca-cert', 'content-disposition': 'attachment; filename="VulKara.crt"' })
      return void res.end(ca)
    }
    if (!allowed(deps, req, url)) {
      // the page itself may be fetched without a token so the browser can show the login; the data paths may not
      if (req.method === 'GET' && !['/ipc', '/events', '/file'].includes(url.pathname)) return serveStatic(deps, res, url.pathname)
      return json(res, 401, { error: 'token required' })
    }
    if (url.pathname === '/ipc' && req.method === 'POST') return void serveIpc(deps, req, res)
    if (url.pathname === '/events' && req.method === 'GET') return serveEvents(deps, res)
    if (url.pathname === '/file' && req.method === 'GET') return serveFile(deps, req, res, url.searchParams.get('path') ?? '')
    if (req.method === 'GET') return serveStatic(deps, res, url.pathname)
    json(res, 404, { error: 'not found' })
  }

  return {
    async start(port: number): Promise<void> {
      if (server) return
      // the port asked for, else the next free one: another app (or a second VulKara) may hold it
      for (let p = port, tries = 0; tries < FREE_PORT_TRIES; p = port === 0 ? 0 : p + 1, tries++) {
        try {
          server = await listen(p)
          deps.log(`[remote] serving on port ${(server.address() as { port: number }).port}`)
          return
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || port === 0) {
            deps.log(`[remote] ${err instanceof Error ? err.message : String(err)}`)
            throw err
          }
        }
      }
      deps.log(`[remote] no free port from ${port} to ${port + FREE_PORT_TRIES - 1}`)
      throw new Error('no free port')
    },
    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (!server) return resolve()
        const s = server
        server = undefined
        s.close(() => resolve())
        s.closeAllConnections?.()
      })
    },
    port(): number | null {
      const addr = server?.address()
      return addr && typeof addr === 'object' ? addr.port : null
    },
  }
}
