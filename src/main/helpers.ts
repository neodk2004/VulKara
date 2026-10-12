// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The helper models as Models → Installed shows them (engines/diffusers/helpers.json): content filter, Restore,
// pose and depth detection, ControlNets, upscaling. Each is a folder under the helpers folder; it is there when it
// holds its files. The photo tools (photo_tools.ts) are listed with them.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { HelperModel } from '@shared/api'
import { helperText } from '@shared/i18n/data'
import { mainLanguage } from './i18n'

type Raw = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

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

/** The helpers of the catalog with where they are and whether they are there. */
export function listHelpers(enginesDir: string, helpersDir: string): HelperModel[] {
  let helpers: Raw[] = []
  try {
    helpers = (JSON.parse(readFileSync(join(enginesDir, 'diffusers', 'helpers.json'), 'utf8')) as { helpers: Raw[] }).helpers
  } catch {
    return []
  }
  const lang = mainLanguage().lang
  return helpers.map((h) => {
    const folder = join(helpersDir, ...str(h.folder).split('/'))
    // more than a few config files: the weights are there (a download that broke off leaves little)
    const bytes = existsSync(folder) ? dirBytes(folder) : 0
    const sizeMb = Number(h.size_mb) || 0
    return {
      id: str(h.id), name: helperText(lang, str(h.id), 'name', str(h.name)), group: str(h.group),
      description: helperText(lang, str(h.id), 'description', str(h.description)), repo: str(h.repo),
      folder, sizeMb, installed: bytes > sizeMb * 0.5 * 1024 ** 2,
      diskMb: Math.round(bytes / 1024 ** 2), required: h.required === true, preview: str(h.preview),
    }
  })
}
