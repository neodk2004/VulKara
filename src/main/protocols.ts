// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Two schemes of the app:
//   vk-app://bundle/…                the pages of the packaged app
//   vk-file://local/<encoded path>   local pictures and videos (results, inputs, previews); the pages run with
//                                    web security on and can not load file:// URLs

import { net, protocol } from 'electron'
import { closeSync, existsSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isInside } from './paths'
import type { FileAccess } from './file_access'

const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'])
const VIDEO_TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm' }
const CORS = { 'Access-Control-Allow-Origin': '*' }  // pictures are drawn into canvases, which must stay readable

/**
 * A picture or video, the only files the pages may load or save elsewhere. They can be anywhere (inputs come from
 * any folder), so nothing else is served: no manifests, settings, tokens or logs.
 */
export function isMedia(path: string): boolean {
  const ext = extname(path).toLowerCase()
  return IMAGE_TYPES.has(ext) || Object.hasOwn(VIDEO_TYPES, ext)
}

/** Before the app is ready. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'vk-app', privileges: { secure: true, standard: true, supportFetchAPI: true } },
    { scheme: 'vk-file', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ])
}

async function serveFile(path: string, headers: Record<string, string> = {}): Promise<Response> {
  if (!existsSync(path)) return new Response('not found', { status: 404 })
  const res = await net.fetch(pathToFileURL(path).toString())
  const all = new Headers(res.headers)
  for (const [k, v] of Object.entries(headers)) all.set(k, v)
  return new Response(res.body, { status: res.status, headers: all })
}

// byte ranges, so the player can seek and loop
function serveVideo(path: string, range: string | null): Response | Promise<Response> {
  const headers = { 'Content-Type': VIDEO_TYPES[extname(path).toLowerCase()], 'Accept-Ranges': 'bytes', ...CORS }
  const m = /^bytes=(\d*)-(\d*)$/.exec(range ?? '')
  if (!m || (m[1] === '' && m[2] === '')) return serveFile(path, headers)
  if (!existsSync(path)) return new Response('not found', { status: 404 })
  const size = statSync(path).size
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1])
  const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
  const part = Buffer.alloc(end - start + 1)
  const fd = openSync(path, 'r')
  try {
    readSync(fd, part, 0, part.length, start)
  } finally {
    closeSync(fd)
  }
  return new Response(part, {
    status: 206,
    headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(part.length) },
  })
}

/** After the app is ready. rendererDir: the built pages; access: which pictures the pages may see. */
export function handleSchemes(rendererDir: string, access: FileAccess): void {
  protocol.handle('vk-app', (request) => {
    const path = normalize(join(rendererDir, decodeURIComponent(new URL(request.url).pathname)))
    if (!isInside(path, rendererDir)) return new Response('forbidden', { status: 403 })
    return serveFile(path)
  })
  protocol.handle('vk-file', (request) => {
    const asked = normalize(decodeURIComponent(new URL(request.url).pathname))
    if (!isAbsolute(asked) || !isMedia(asked)) return new Response('forbidden', { status: 403 })
    // a link named like a picture must not lead to another kind of file
    let path: string
    try {
      path = realpathSync(asked)
    } catch {
      return new Response('not found', { status: 404 })
    }
    if (!isMedia(path) || !access.allows(path)) return new Response('forbidden', { status: 403 })
    if (Object.hasOwn(VIDEO_TYPES, extname(path).toLowerCase())) return serveVideo(path, request.headers.get('range'))
    return serveFile(path, CORS)
  })
}
