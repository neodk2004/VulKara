// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Which pictures the pages may see or hand to a job. Code smuggled into a page could otherwise read every picture on
// the Mac, through vk-file:// or by sending it into a job. Allowed are:
//   - the app's folders (pictures, models, LoRAs, helper models, the app's data with its inputs),
//   - the files the history lists (results kept in an earlier pictures folder),
//   - what the user gave the app: files and folders chosen in a dialog of the main process, files dropped onto a page.
// A page can not grant anything itself: dialogs run in the main process, and a dropped file's path comes from the
// File object (webUtils), which a page can not make for a file it was not given. The grants are kept in a file of
// the app's data, so a picture placed on the canvas is still shown after a restart.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { isInside } from './paths'
import { t } from './i18n'

const MAX_GRANTS = 20000

/** what a page handed over, for the errors */
export type FileRole = 'picture' | 'mask' | 'control' | 'selection' | 'training'
const GONE = {
  picture: 'main.files.pictureGone', mask: 'main.files.maskGone', control: 'main.files.controlGone',
  selection: 'main.files.selectionGone', training: 'main.files.trainingGone',
} as const
const NOT_GIVEN = {
  picture: 'main.files.pictureNotGiven', mask: 'main.files.maskNotGiven', control: 'main.files.controlNotGiven',
  selection: 'main.files.selectionNotGiven', training: 'main.files.trainingNotGiven',
} as const

function real(path: string): string | undefined {
  if (typeof path !== 'string' || !isAbsolute(path)) return undefined
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

export class FileAccess {
  private files: string[] = []
  private folders: string[] = []
  private fileSet = new Set<string>()
  private loaded = false

  constructor(
    /** the app's folders, read anew on every check (the settings can change them) */
    private readonly roots: () => string[],
    /** where the grants are kept (read when first needed: the app's data folder is known once it started) */
    private readonly store: () => string,
    /** whether the history lists a file */
    private readonly inHistory: (path: string) => boolean = () => false,
  ) {}

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      const data = JSON.parse(readFileSync(this.store(), 'utf8')) as { files?: unknown; folders?: unknown }
      this.files = Array.isArray(data.files) ? data.files.filter((f): f is string => typeof f === 'string') : []
      this.folders = Array.isArray(data.folders) ? data.folders.filter((f): f is string => typeof f === 'string') : []
    } catch {
      // none yet
    }
    this.fileSet = new Set(this.files)
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.store()), { recursive: true })
      writeFileSync(this.store(), JSON.stringify({ files: this.files, folders: this.folders }))
    } catch {
      // kept for this session only
    }
  }

  /** A file the user gave the app (dialog, drop). */
  grantFile(path: string): void {
    this.grantFiles([path])
  }

  /** Several files at once (a multiple choice in a dialog): the list is written once. */
  grantFiles(paths: string[]): void {
    this.load()
    let added = false
    for (const path of paths) {
      const p = real(path)
      if (!p || this.fileSet.has(p)) continue
      this.files.push(p)
      this.fileSet.add(p)
      added = true
    }
    if (!added) return
    if (this.files.length > MAX_GRANTS) {
      const gone = this.files.splice(0, this.files.length - MAX_GRANTS)
      for (const g of gone) this.fileSet.delete(g)
    }
    this.save()
  }

  /** A folder the user chose (its pictures, also in subfolders). */
  grantFolder(path: string): void {
    const p = real(path)
    if (!p) return
    this.load()
    if (this.folders.includes(p)) return
    this.folders.push(p)
    if (this.folders.length > 500) this.folders.shift()
    this.save()
  }

  /** Whether a page may see this file or hand it to a job (links are followed first). */
  allows(path: string): boolean {
    const p = real(path)
    if (!p) return false
    for (const r of this.roots()) {
      const root = real(r)
      if (root && (p === root || isInside(p, root))) return true
    }
    this.load()
    if (this.fileSet.has(p)) return true
    if (this.folders.some((f) => isInside(p, f))) return true
    return this.inHistory(p) || this.inHistory(path)
  }

  /** For a path from a page: throws when it may not be used. */
  check(path: unknown, role: FileRole = 'picture'): void {
    if (typeof path !== 'string' || !path) return
    if (!existsSync(path)) throw new Error(t(GONE[role]))
    if (!this.allows(path)) throw new Error(t(NOT_GIVEN[role]))
  }
}
