// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Where the windows find the pages and the preload script.

import { app } from 'electron'
import { join } from 'node:path'

/** the development server of electron-vite, or the pages of the app (always in the packaged app) */
export const PAGE_URL = (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) || 'vk-app://bundle/index.html'
export const PRELOAD = join(import.meta.dirname, '../preload/index.cjs')
export const RENDERER_DIR = join(import.meta.dirname, '../renderer')
