// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Where VulKara keeps its files. App data (settings, history, runtimes) lives in the user data folder of
// the app; the large files (models, LoRAs, pictures) in ~/VulKara by default, changeable in the settings.

import { app } from 'electron'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'

export const dataDir = (): string => app.getPath('userData')

export const DEFAULT_MODELS_DIR = join(homedir(), 'VulKara', 'models')
export const DEFAULT_IMAGES_DIR = join(homedir(), 'VulKara', 'images')

/** The engine scripts: shipped next to the app when packaged, engines/ of the source tree in development. */
export function enginesDir(): string {
  const candidates = [
    app.isPackaged ? undefined : process.env.VK_ENGINES_DIR,
    app.isPackaged ? join(process.resourcesPath, 'engines') : undefined,
    resolve(app.getAppPath(), 'engines'),
  ].filter((d): d is string => !!d)
  return candidates.find((d) => existsSync(join(d, 'diffusers', 'main.py'))) ?? candidates[candidates.length - 1]
}

/** Is p inside dir (not dir itself)? */
export function isInside(p: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(p))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}
