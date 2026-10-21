// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The remote web UI's life: on while Settings -> Remote access is on, with its own token, restarted when the port
// or the token changes, closed when the app quits.

import { randomBytes } from 'node:crypto'
import { hostname, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { createRemoteServer } from './remote_server'
import { fileAccess, remoteBridge } from './ipc'
import { allowedMedia } from './protocols'
import { RENDERER_DIR } from './pages'
import { getSettings, onSettingChanged, setSetting } from './settings'
import { log } from './log'
import { dataDir } from './paths'
import { ensureTls, isLocalIp, type Tls } from './remote_tls'

/** A fresh token: 24 random bytes, written URL-safe (it goes into a link and a QR code). */
export const newToken = (): string => randomBytes(24).toString('base64url')

/** the certificate the server runs with, null: plain HTTP (switched off, or the certificate could not be made) */
let tls: Tls | null = null

const server = createRemoteServer({
  token: () => (getSettings().remoteAccess ? getSettings().remoteToken : ''),
  call: (channel, args) => remoteBridge.call(channel, args),
  subscribe: (fn) => remoteBridge.subscribe(fn),
  filePath: (path) => allowedMedia(path, fileAccess),
  staticDir: () => RENDERER_DIR,
  log,
  tls: () => tls,
})

let running = false

async function apply(): Promise<void> {
  const s = getSettings()
  if (s.remoteAccess && !s.remoteToken) {
    // switched on for the first time: the token is made here, never by a page
    setSetting('remoteToken', newToken())
    return  // setSetting calls back into apply() with the token in place
  }
  await server.stop()
  running = false
  if (!s.remoteAccess) return
  tls = null
  if (s.remoteHttps) {
    try {
      tls = ensureTls(join(dataDir(), 'remote-tls'), { ips: [...lanIps(), '127.0.0.1'], hosts: [`${macName()}.local`, 'localhost'] }, macName())
    } catch (err) {
      // never quietly plain HTTP when HTTPS is asked for: the token would cross the network in the clear
      log(`[remote] no certificate, not serving: ${(err as Error).message}`)
      return
    }
  }
  try {
    await server.start(s.remotePort)
    running = true
  } catch {
    // the port is taken: the error is in the log, the page shows it as not running
  }
}

/** The addresses the web UI can be reached at on this Mac's local networks (IPv4, not the loopback), on the port it
 *  really got (the one set, or the next free one). */
export function remoteAddresses(): string[] {
  const port = server.port() ?? getSettings().remotePort
  // over HTTPS only the addresses the certificate can vouch for (the local network's)
  return lanIps().filter((ip) => !tls || isLocalIp(ip)).map((ip) => `${tls ? 'https' : 'http'}://${ip}:${port}/`)
}

/** served over HTTPS (with the Mac's own certificate) */
export const remoteHttps = (): boolean => !!tls

/** the Mac's IPv4 addresses on its local networks (not the loopback) */
const lanIps = (): string[] => Object.values(networkInterfaces()).flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a!.address)

/** the Mac's name on the network, without .local */
const macName = (): string => hostname().replace(/\.local$/, '').replace(/[^A-Za-z0-9-]/g, '') || 'mac'

export const remoteRunning = (): boolean => running

// one apply() after the other: two settings changed close together must not start two servers
let applying = Promise.resolve()
const reapply = (): void => { applying = applying.then(apply, apply) }

/** After the IPC handlers are registered. */
export function startRemote(): void {
  // listening first: on the first start apply() makes the token and relies on this to come back with it
  onSettingChanged((key) => {
    if (key === 'remoteAccess' || key === 'remotePort' || key === 'remoteToken' || key === 'remoteHttps') reapply()
  })
  reapply()
}

export function stopRemote(): Promise<void> {
  running = false
  return server.stop()
}
