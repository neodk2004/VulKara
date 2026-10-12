// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The pictures marked as favourites, as the lists of recent results see them. The marks themselves are kept with
// the history in the main process; this is a copy that follows every change of the history.

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { cleanError } from './runtimes'

export const useFavoritesStore = defineStore('favorites', () => {
  const files = ref(new Set<string>())

  async function refresh(): Promise<void> {
    files.value = new Set(await window.vk.history.favorites())
  }

  let started = false
  function start(): void {
    if (started) return
    started = true
    window.vk.history.onChange(() => void refresh())
    void refresh()
  }

  const has = (file: string): boolean => files.value.has(file)

  /** Marks or unmarks one file of a history entry (the id of its job). The heart follows at once. */
  async function toggle(id: string, file: string): Promise<void> {
    const on = !has(file)
    const next = new Set(files.value)
    if (on) next.add(file)
    else next.delete(file)
    files.value = next
    try {
      await window.vk.history.favorite(id, file, on)
    } catch (err) {
      void refresh()
      alert(cleanError(err))
    }
  }

  return { files, start, has, toggle }
})
