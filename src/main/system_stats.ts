// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// What the Mac is doing: the CPU, the memory VulKara and its engines hold, the memory the system uses, and the
// room the SSD streaming caches take (status bar, Hardware page). Read with the system's own tools (os, ps, vm_stat,
// sysctl, ioreg, statfs); nothing leaves the Mac.

import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import { cpus, homedir, totalmem } from 'node:os'
import { dirname, join } from 'node:path'
import type { HardwareInfo, SystemStats } from '@shared/api'

const GB = 1024 ** 3

const run = (cmd: string, args: string[]): Promise<string> =>
  new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout: 4000 }, (err, out) => resolve(err ? '' : out)))

// ------------------------------------------------------------------ GPU: what the graphics driver reports

/** The GPU's load in % from "ioreg -c IOAccelerator" (PerformanceStatistics, "Device Utilization %"); -1 when the
 *  driver does not tell it. The highest of several accelerators counts. */
export function gpuFromIoreg(text: string): number {
  const values = [...text.matchAll(/"Device Utilization %"\s*=\s*(\d+)/g)].map((m) => Number(m[1]))
  return values.length ? Math.min(100, Math.max(...values)) : -1
}

// ------------------------------------------------------------------ CPU: the share of all cores busy since the last call

let lastCpu: { idle: number; total: number } | undefined

export function cpuPercent(): number {
  let idle = 0
  let total = 0
  for (const c of cpus()) {
    idle += c.times.idle
    total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle
  }
  const before = lastCpu
  lastCpu = { idle, total }
  if (!before || total <= before.total) return 0
  return Math.max(0, Math.min(100, 100 * (1 - (idle - before.idle) / (total - before.total))))
}

// ------------------------------------------------------------------ memory

/** GB of memory the system has in use (active, wired and compressed pages), from `vm_stat`'s text. */
export function usedFromVmStat(text: string): number {
  const page = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? 16384)
  const pages = (name: string): number => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(text)?.[1] ?? 0)
  return ((pages('Pages active') + pages('Pages wired down') + pages('Pages occupied by compressor')) * page) / GB
}

/** GB read since the Mac started, from `vm_stat`'s count of pages (name: "Pageins" from files, "Swapins" from the swap). */
export function pagesInGb(text: string, name: 'Pageins' | 'Swapins'): number {
  const page = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? 16384)
  return (Number(new RegExp(`${name}:\\s+(\\d+)`).exec(text)?.[1] ?? 0) * page) / GB
}

/** GB of swap in use, from `sysctl -n vm.swapusage` ("total = 2048.00M  used = 1162.25M  free = …", with a decimal
 *  comma in some languages). */
export function swapFromSysctl(text: string): number {
  const m = /used\s*=\s*([\d.,]+)([KMGT])/.exec(text)
  return m ? (Number(m[1].replace(',', '.')) * 1024 ** 'KMGT'.indexOf(m[2])) / 1024 ** 2 : 0
}

/** GB (resident) of a process and all its descendants, from `ps -axo pid=,ppid=,rss=` (rss in KB). */
export function treeRss(psText: string, rootPid: number): number {
  const children = new Map<number, number[]>()
  const rss = new Map<number, number>()
  for (const line of psText.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)/.exec(line)
    if (!m) continue
    const [pid, ppid, kb] = [Number(m[1]), Number(m[2]), Number(m[3])]
    rss.set(pid, kb)
    children.set(ppid, [...(children.get(ppid) ?? []), pid])
  }
  let total = 0
  const stack = [rootPid]
  const seen = new Set<number>()
  while (stack.length) {
    const pid = stack.pop() as number
    if (seen.has(pid)) continue
    seen.add(pid)
    total += rss.get(pid) ?? 0
    stack.push(...(children.get(pid) ?? []))
  }
  return (total * 1024) / GB
}

/** The pids of a process and all its descendants, from `ps -axo pid=,ppid=`. */
export function treePids(psText: string, rootPid: number): number[] {
  const children = new Map<number, number[]>()
  for (const line of psText.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)/.exec(line)
    if (m) children.set(Number(m[2]), [...(children.get(Number(m[2])) ?? []), Number(m[1])])
  }
  const out: number[] = []
  const stack = [rootPid]
  while (stack.length) {
    const pid = stack.pop() as number
    if (out.includes(pid)) continue
    out.push(pid)
    stack.push(...(children.get(pid) ?? []))
  }
  return out
}

/** GB of the memory footprint (MEM) summed over `top -l 1 -stats pid,mem` lines ("26585  17G", "21808  8000K+"). */
export function footprintFromTop(text: string): number {
  let bytes = 0
  for (const m of text.matchAll(/^\s*\d+\s+([\d.]+)([BKMGT])[+-]?\s*$/gm)) bytes += Number(m[1]) * 1024 ** 'BKMGT'.indexOf(m[2])
  return bytes / GB
}

/** The memory footprint of the app and its engines, as macOS counts it (with what the GPU holds, which the resident
 *  size leaves out: an MLX engine of 17 GB shows 35 MB there). `top` costs about half a second of CPU, so this is
 *  asked only while a benchmark runs. */
export async function treeFootprintGb(rootPid: number): Promise<number> {
  const pids = treePids(await run('/bin/ps', ['-axo', 'pid=,ppid=']), rootPid)
  return footprintFromTop(await run('/usr/bin/top', ['-l', '1', '-stats', 'pid,mem', ...pids.flatMap((p) => ['-pid', String(p)])]))
}

// ------------------------------------------------------------------ the streaming caches on the SSD

function dirBytes(dir: string): number {
  let total = 0
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop() as string
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.isFile()) try { total += statSync(p).size } catch { /* vanished */ }
    }
  }
  return total
}

/** A folder as the pages show it: the home folder as ~ (the user's name stays out of screenshots and copied info). */
export function shownPath(p: string, home = homedir()): string {
  return p === home ? '~' : p.startsWith(home + '/') ? '~' + p.slice(home.length) : p
}

/** The stream caches (stream_cache in each model's folder, or the folders of the shared cache dir) and the free room of
 * the disk they are on. */
export async function streamStorage(modelsDir: string, streamCacheDir: string): Promise<{ cacheGb: number; freeGb: number; where: string }> {
  let bytes = 0
  const where = streamCacheDir || modelsDir
  if (streamCacheDir) {
    bytes = existsSync(streamCacheDir) ? dirBytes(streamCacheDir) : 0
  } else if (existsSync(modelsDir)) {
    for (const name of readdirSync(modelsDir)) {
      const cache = join(modelsDir, name, 'stream_cache')
      if (existsSync(cache)) bytes += dirBytes(cache)
    }
  }
  let freeGb = 0
  try {
    // a folder that is not made yet (a new installation): the free room of the disk it will be on
    let at = where
    while (!existsSync(at) && dirname(at) !== at) at = dirname(at)
    const s = await statfs(at)
    freeGb = (s.bavail * s.bsize) / GB
  } catch {
    // no such disk right now
  }
  return { cacheGb: bytes / GB, freeGb, where }
}

// ------------------------------------------------------------------ the monitor

export interface MonitorDeps {
  modelsDir(): string
  streamCacheDir(): string
  send(stats: SystemStats): void
}

/** Every 2 s: CPU, GPU and memory; every 30 s: the stream caches (walking them costs a little). */
export class SystemMonitor {
  private timer?: NodeJS.Timeout
  private storage = { cacheGb: 0, freeGb: 0, where: '' }
  private storageAt = 0
  private storageBusy = false
  current: SystemStats = { cpuPercent: 0, gpuPercent: -1, appGb: 0, usedGb: 0, totalGb: totalmem() / GB, streamCacheGb: 0, streamFreeGb: 0, streamWhere: '', swapGb: 0, pageinsGb: 0, swapinsGb: 0 }

  constructor(private readonly deps: MonitorDeps) {}

  start(): void {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), 2000)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  /** the caches are measured again at once (a setting changed, a cache was made) */
  refreshStorage(): void {
    this.storageAt = 0
  }

  private async tick(): Promise<void> {
    const [ps, vm, gpu, swap] = await Promise.all([run('/bin/ps', ['-axo', 'pid=,ppid=,rss=']), run('/usr/bin/vm_stat', []),
      run('/usr/sbin/ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator']), run('/usr/sbin/sysctl', ['-n', 'vm.swapusage'])])
    if (Date.now() - this.storageAt > 30_000 && !this.storageBusy) {
      this.storageBusy = true
      try {
        this.storage = await streamStorage(this.deps.modelsDir(), this.deps.streamCacheDir())
        this.storageAt = Date.now()
      } finally {
        this.storageBusy = false
      }
    }
    this.current = {
      cpuPercent: cpuPercent(), gpuPercent: gpuFromIoreg(gpu), appGb: treeRss(ps, process.pid), usedGb: usedFromVmStat(vm), totalGb: totalmem() / GB,
      streamCacheGb: this.storage.cacheGb, streamFreeGb: this.storage.freeGb, streamWhere: shownPath(this.storage.where),
      swapGb: swapFromSysctl(swap), pageinsGb: pagesInGb(vm, 'Pageins'), swapinsGb: pagesInGb(vm, 'Swapins'),
    }
    this.deps.send(this.current)
  }
}

// ------------------------------------------------------------------ the hardware, asked once

let hardware: Promise<HardwareInfo> | undefined

/** Metal lets one process use about this much of the unified memory (recommendedMaxWorkingSetSize: 74 %). */
export const metalBudgetGb = (ramBytes: number): number => Math.round((ramBytes * 0.74) / GB * 10) / 10

export function hardwareInfo(): Promise<HardwareInfo> {
  hardware ??= (async () => {
    const [chip, perf, eff, agx] = await Promise.all([
      run('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string']),
      run('/usr/sbin/sysctl', ['-n', 'hw.perflevel0.physicalcpu']),
      run('/usr/sbin/sysctl', ['-n', 'hw.perflevel1.physicalcpu']),
      run('/usr/sbin/ioreg', ['-rc', 'AGXAccelerator']),
    ])
    const gpuCores = Number(/"gpu-core-count" = (\d+)/.exec(agx)?.[1] ?? 0) || undefined
    const ram = totalmem()
    return {
      chip: chip.trim() || 'unknown', arch: process.arch, performanceCores: Number(perf) || 0, efficiencyCores: Number(eff) || 0,
      totalCores: cpus().length, ramGb: Math.round(ram / GB), gpuCores, metalBudgetGb: metalBudgetGb(ram),
      metal: process.platform === 'darwin' && process.arch === 'arm64',
    }
  })()
  return hardware
}
