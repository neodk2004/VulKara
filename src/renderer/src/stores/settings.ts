// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_SETTINGS, type FolderKey, type Settings } from '@shared/settings'
import { cleanError } from './runtimes'

/** A copy without Vue's proxies: IPC cannot clone a reactive object, e.g. a template taken from this store. */
export const plain = <T>(value: T): T => (value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value)

export const useSettingsStore = defineStore('settings', () => {
  const values = ref<Settings>({ ...DEFAULT_SETTINGS })
  const error = ref('')

  async function load(): Promise<void> {
    values.value = await window.vk.settings.get()
  }

  async function set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    error.value = ''
    try {
      await window.vk.settings.set(key, plain(value))
    } catch (err) {
      error.value = cleanError(err)
    }
    await load()
  }

  async function chooseFolder(key: FolderKey): Promise<void> {
    error.value = ''
    try {
      await window.vk.settings.chooseFolder(key)
    } catch (err) {
      error.value = cleanError(err)
    }
    await load()
  }

  return { values, error, load, set, chooseFolder }
})
