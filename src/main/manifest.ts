// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Changes the user makes to the manifest of a model or LoRA (model.json, lora.json).

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { t } from './i18n'

const MAX_TITLE = 120

/**
 * Writes display_name, the name the app shows instead of the folder's name. A title that is empty or the folder's
 * name removes it. Everything else in the manifest stays as it is.
 */
export function writeDisplayName(file: string, name: string, title: string): void {
  let m: Record<string, unknown>
  try {
    m = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    throw new Error(t('main.assets.manifestUnreadable'))
  }
  const own = title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
  if (own && own !== name) m.display_name = own
  else delete m.display_name
  writeFileSync(file + '.tmp', JSON.stringify(m, null, 1))
  renameSync(file + '.tmp', file)
}
