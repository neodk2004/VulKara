// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Which Mac this is, as people know it: "MacBook Pro (13-inch, M2, 2022)" or "Mac mini (2024)", with its chip and
// memory. Apple silicon Macs carry the marketing name in the device tree; older ones give the model identifier.

import { execFile, execFileSync } from 'node:child_process'
import { totalmem } from 'node:os'

export interface MacModel {
  /** e.g. "MacBook Pro (13-inch, M2, 2022)"; the model identifier ("Mac14,7") where no name is found */
  name: string
  /** e.g. "Apple M2" */
  chip: string
  ramGb: number
}

const run = (cmd: string, args: string[]): string => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 3000 })
  } catch {
    return ''
  }
}

/** The product name from `ioreg -p IODeviceTree -rn product -d 1`, '' when it is not there. */
export function productName(ioreg: string): string {
  const m = /"product-name"\s*=\s*<"([^"]*)">/.exec(ioreg)
  return m ? m[1].replace(/\0/g, '').trim() : ''
}

let cached: MacModel | undefined

const runAsync = (cmd: string, args: string[]): Promise<string> =>
  new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', timeout: 3000 }, (err, out) => resolve(err ? '' : out)))

/** Asks once at the start, in the background, so that the pages never wait for it. */
export async function warmMacModel(): Promise<void> {
  if (cached || process.platform !== 'darwin') return
  const [tree, model, chip] = await Promise.all([
    runAsync('/usr/sbin/ioreg', ['-p', 'IODeviceTree', '-rn', 'product', '-d', '1']),
    runAsync('/usr/sbin/sysctl', ['-n', 'hw.model']),
    runAsync('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string']),
  ])
  cached ??= { name: productName(tree) || model.trim() || 'Mac', chip: chip.trim(), ramGb: Math.round(totalmem() / 1024 ** 3) }
}

export function macModel(): MacModel {
  if (cached) return cached
  const ramGb = Math.round(totalmem() / 1024 ** 3)
  if (process.platform !== 'darwin') return (cached = { name: `${process.platform} ${process.arch}`, chip: '', ramGb })
  const name = productName(run('/usr/sbin/ioreg', ['-p', 'IODeviceTree', '-rn', 'product', '-d', '1']))
    || run('/usr/sbin/sysctl', ['-n', 'hw.model']).trim() || 'Mac'
  const chip = run('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string']).trim()
  return (cached = { name, chip, ramGb })
}

/** "MacBook Pro (13-inch, M2, 2022) · Apple M2 · 24 GB": the chip is left out where the name already names it. */
export function describeMac(m: MacModel): string {
  const chipShort = m.chip.replace(/^Apple\s+/, '')
  const parts = [m.name]
  if (m.chip && !(chipShort && m.name.includes(chipShort))) parts.push(m.chip)
  parts.push(`${m.ramGb} GB`)
  return parts.join(' · ')
}
