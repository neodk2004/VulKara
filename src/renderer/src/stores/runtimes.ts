// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RuntimeInfo, RuntimeUpdate, RuntimeUpdates } from '@shared/api'
import { t } from '../i18n'

export const useRuntimesStore = defineStore('runtimes', () => {
  const list = ref<RuntimeInfo[]>([])
  /** runtime id -> current stage of its installation */
  const installing = ref<Record<string, string>>({})
  const errors = ref<Record<string, string>>({})
  const anyInstalled = computed(() => list.value.some((r) => r.installed))
  /** the last update check of the installed runtimes */
  const updates = ref<RuntimeUpdates>({ checking: false, runtimes: [] })
  const updateOf = (id: string): RuntimeUpdate | undefined => updates.value.runtimes.find((u) => u.id === id)
  const anyUpdate = computed(() => updates.value.runtimes.some((u) => u.updateAvailable))
  const checkError = ref('')

  let listening = false
  async function refresh(): Promise<void> {
    if (!listening) {
      listening = true
      window.vk.runtimes.onProgress((id, stage) => {
        if (stage) installing.value[id] = stage
        else void refresh()
      })
      window.vk.runtimes.onUpdates((u) => (updates.value = u))
    }
    const [runtimes, found] = await Promise.all([window.vk.runtimes.list(), window.vk.runtimes.updates()])
    list.value = runtimes
    updates.value = found
    // the main process knows what is being installed, also after this page was reloaded
    const running: Record<string, string> = {}
    const failed: Record<string, string> = {}
    for (const r of list.value) {
      if (r.installing) running[r.id] = installing.value[r.id] ?? r.installing
      if (r.error) failed[r.id] = r.error
    }
    installing.value = running
    errors.value = failed
  }

  async function install(id: RuntimeInfo['id']): Promise<void> {
    installing.value[id] = t('common.starting')
    delete errors.value[id]
    try {
      await window.vk.runtimes.install(id)
    } catch (err) {
      errors.value[id] = cleanError(err)
    }
    await refresh()
  }

  /** Asks PyPI and GitHub now. */
  async function checkUpdates(): Promise<void> {
    checkError.value = ''
    updates.value = { ...updates.value, checking: true }
    try {
      updates.value = await window.vk.runtimes.checkUpdates(true)
    } catch (err) {
      checkError.value = cleanError(err)
      updates.value = { ...updates.value, checking: false }
    }
  }

  async function remove(id: RuntimeInfo['id']): Promise<void> {
    let failure = ''
    try {
      await window.vk.runtimes.remove(id)
    } catch (err) {
      failure = cleanError(err)
    }
    await refresh()
    if (failure) errors.value[id] = failure
  }

  return { list, installing, errors, anyInstalled, updates, updateOf, anyUpdate, checkError, refresh, install, remove, checkUpdates }
})

/** The message of an error that came through IPC, without Electron's prefix. */
export function cleanError(err: unknown): string {
  // the main process's error class comes along as a prefix (Error:, ConsentRequired:, ...)
  return String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (?:[A-Z][A-Za-z]*: )?/, '')
}
