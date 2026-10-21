// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The only bridge between the pages and the main process: a fixed, typed set of calls (window.vk).

import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { VulkaraApi } from '@shared/api'
import { makeApi } from '@shared/bridge'

const call = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

function on<A extends unknown[]>(channel: string, fn: (...args: A) => void): () => void {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => fn(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: VulkaraApi = makeApi(call, on, {
  fileUrl: (path) => 'vk-file://local' + path.split('/').map(encodeURIComponent).join('/'),
  pathOf: (file) => {
    // the path of a file dropped onto the page; the app may show and use it from now on (file_access.ts). It
    // comes from the File object: a page can not make one for a file it was not given
    const path = webUtils.getPathForFile(file)
    if (path) ipcRenderer.sendSync('files:dropped', path)
    return path
  },
})

contextBridge.exposeInMainWorld('vk', api)
