// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// A result with the EU AI label has its picture without the label next to it, in ".unlabelled" (written by
// engines/diffusers/content_check.py label). Used as an input again, the unlabelled picture is taken, so a picture made
// from a labelled one gets one label, not the old one showing through.

import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export const UNLABELLED = '.unlabelled'

/** The picture without its label, when there is one. */
export function unlabelledOf(path: string): string | undefined {
  if (typeof path !== 'string' || !path) return undefined
  const clean = join(dirname(path), UNLABELLED, basename(path))
  return existsSync(clean) ? clean : undefined
}
