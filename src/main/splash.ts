// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The splash window at start: the main window loads behind it; the splash closes by itself once the main window is
// ready and the splash has been seen for a moment (a click closes it earlier).

import { app, BrowserWindow, type WebContents } from 'electron'
import { PAGE_URL, PRELOAD } from './pages'

let splash: BrowserWindow | undefined
let mainReady = false
let confirmed = false
let showMain: (() => void) | undefined
let quitting = false
let shownAt = 0
// long enough to read the name, short enough not to be in the way
const MIN_SHOWN_MS = 5000
app.on('before-quit', () => (quitting = true))

export const isSplash = (sender: WebContents): boolean => !!splash && !splash.isDestroyed() && sender === splash.webContents

/** Whether the main window has loaded (the splash enables its button then). */
export const splashState = (): { ready: boolean } => ({ ready: mainReady })

function maybeShowMain(): void {
  // closing the splash while the app quits must not bring up the main window
  if (!mainReady || !confirmed || quitting) return
  showMain?.()
  showMain = undefined
  if (splash && !splash.isDestroyed()) splash.close()
}

/** Opens the splash; show is called once the main window is ready and the splash confirmed (or closed). */
export function openSplash(background: string, show: () => void): BrowserWindow {
  showMain = show
  mainReady = confirmed = false
  splash = new BrowserWindow({
    width: 640, height: 384, center: true, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    frame: false, show: false, backgroundColor: background,
    // the first click goes to the button, not only to bringing the window to the front
    acceptFirstMouse: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, devTools: !app.isPackaged },
  })
  splash.once('ready-to-show', () => {
    shownAt = Date.now()
    splash?.show()
    app.focus({ steal: true })
  })
  // closing it (⌘W) counts as confirming
  splash.on('closed', () => {
    splash = undefined
    confirmed = true
    maybeShowMain()
  })
  splash.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  splash.webContents.on('will-navigate', (event) => event.preventDefault())
  void splash.loadURL(PAGE_URL + '#/splash')
  return splash
}

/** The main window has loaded. */
export function mainWindowReady(): void {
  mainReady = true
  if (splash && !splash.isDestroyed()) splash.webContents.send('splash:ready')
  // closed already: the main window comes at once
  if (confirmed) {
    maybeShowMain()
    return
  }
  // no confirmation needed: the splash goes once it has been shown for a moment
  const left = shownAt ? Math.max(0, shownAt + MIN_SHOWN_MS - Date.now()) : MIN_SHOWN_MS
  setTimeout(confirmSplash, left)
}

/** The splash was confirmed. */
export function confirmSplash(): void {
  confirmed = true
  maybeShowMain()
}

export const splashWindow = (): BrowserWindow | undefined => (splash && !splash.isDestroyed() ? splash : undefined)
