// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Models whose folders were copied from another Mac. What an import decides depends on the Mac it runs on (the memory
// plan, FP8 stored as GGUF, the quantization caches), so a model runs only on the Mac it was imported on; one copied
// here is imported again from its file, or removed. The importer writes "imported_on" into model.json
// (engines/diffusers/importer.py imported_on): this Mac's id and its memory in whole GB.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative } from 'node:path'
import { totalmem } from 'node:os'
import type { ImportRequest } from '@shared/api'
import { t } from './i18n'

type Raw = Record<string, unknown>

export interface ThisMac {
  /** sha256 of the Mac's IOPlatformUUID, its first 16 hex characters; '' where it can not be read */
  machine: string
  /** memory in whole GB, rounded as the importer rounds memory.total_ram_gb() */
  ramGb: number
}

/** The IOPlatformUUID in the output of `ioreg -rd1 -c IOPlatformExpertDevice`, '' when it is not there. */
export function platformUuid(ioreg: string): string {
  return /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(ioreg)?.[1].trim() ?? ''
}

/** The app's id of a Mac: a hash of its UUID that does not give the UUID away. The UUID itself is never kept. */
export function machineIdOf(uuid: string): string {
  return uuid ? createHash('sha256').update(uuid).digest('hex').slice(0, 16) : ''
}

export const ramGbOf = (bytes: number): number => Math.round(bytes / 1024 ** 3)

let cached: ThisMac | undefined

/** This Mac, asked once. */
export function thisMac(): ThisMac {
  if (cached) return cached
  let ioreg = ''
  if (process.platform === 'darwin') {
    try {
      ioreg = execFileSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 3000 })
    } catch {
      // no id: models are told apart by their memory only
    }
  }
  return (cached = { machine: machineIdOf(platformUuid(ioreg)), ramGb: ramGbOf(totalmem()) })
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/**
 * The other Mac a model was imported on, undefined when it was imported here (or nothing tells). By imported_on: its
 * machine id where both are known, else its memory; an import made before imported_on existed by the memory of its
 * plan (plan.ram_gb). ramGb: the other Mac's memory, where known.
 */
export function foreignMac(m: Raw, here: ThisMac): { ramGb?: number } | undefined {
  const on = m.imported_on && typeof m.imported_on === 'object' ? (m.imported_on as Raw) : undefined
  const planRam = num((m.plan as Raw | undefined)?.ram_gb)
  const ram = on ? num(on.ram_gb) : planRam
  const other = ram === undefined ? {} : { ramGb: Math.round(ram) }
  if (on && typeof on.machine === 'string' && on.machine && here.machine) return on.machine === here.machine ? undefined : other
  if (ram === undefined) return undefined
  return Math.round(ram) === here.ramGb ? undefined : other
}

/** Why a job, a bake or a training can not use the model of this manifest, undefined when it can. */
export function foreignRefusal(m: Raw, here: ThisMac, name: string): string | undefined {
  const other = foreignMac(m, here)
  if (!other) return undefined
  return other.ramGb ? t('main.assets.importedElsewhereRam', { name, ram: other.ramGb }) : t('main.assets.importedElsewhere', { name })
}

/** foreignRefusal for the model in a folder (a job's modelDir); undefined where there is no model.json. */
export function foreignRefusalOf(folder: string, here: ThisMac = thisMac()): string | undefined {
  let m: Raw
  try {
    m = JSON.parse(readFileSync(join(folder, 'model.json'), 'utf8')) as Raw
  } catch {
    return undefined
  }
  const own = typeof m.display_name === 'string' ? m.display_name.trim() : ''
  return foreignRefusal(m, here, own || (typeof m.name === 'string' && m.name) || basename(folder))
}

/**
 * How a model is imported again from where it came from: a file or folder on disk that is still there (and not inside
 * the model's own folder, which goes to the Trash first), a Hugging Face repository or a Civitai page. Undefined when
 * the source is gone or unknown (a baked model, a folder imported in place).
 */
export function reimportRequest(m: Raw, folder: string, exists: (path: string) => boolean = existsSync): ImportRequest | undefined {
  const src = (m.source && typeof m.source === 'object' ? m.source : {}) as Raw
  const ref = typeof src.ref === 'string' ? src.ref.trim() : ''
  if (!ref) return undefined
  const quant = (['auto', 'none', 'q8', 'q4'] as const).find((q) => q === m.quant_request) ?? 'auto'
  if (src.type === 'file' || src.type === 'dir') {
    const inside = !relative(folder, ref).startsWith('..') && !isAbsolute(relative(folder, ref))
    if (!isAbsolute(ref) || inside || !exists(ref)) return undefined
    return { source: src.type, ref, quant }
  }
  if (src.type === 'hf') return { source: 'hf', ref, file: typeof src.file === 'string' && src.file ? src.file : undefined, quant }
  if (src.type === 'civitai') return { source: 'civitai', ref, quant }
  return undefined
}
