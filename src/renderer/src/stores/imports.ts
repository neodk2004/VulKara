// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAssetsStore } from './assets'
import type { ImportJob, ImportRequest } from '@shared/api'

export const useImportsStore = defineStore('imports', () => {
  const jobs = ref<ImportJob[]>([])
  const open = computed(() => jobs.value.filter((j) => j.state === 'waiting' || j.state === 'running'))

  let started = false
  async function start(): Promise<void> {
    if (started) return
    started = true
    const assets = useAssetsStore()
    window.vk.imports.onChange((list) => { jobs.value = list })
    window.vk.assets.onChange(() => void assets.refresh())
    jobs.value = await window.vk.imports.list()
  }

  const add = (request: ImportRequest, title: string): Promise<string> => window.vk.imports.add(request, title)
  const cancel = (id: string): Promise<void> => window.vk.imports.cancel(id)
  const clearFinished = (): Promise<void> => window.vk.imports.clearFinished()
  /** the newest import of this source, to show its state where it was started */
  const of = (request: ImportRequest): ImportJob | undefined =>
    jobs.value.findLast((j) => j.request.source === request.source && j.request.ref === request.ref && j.request.file === request.file)

  return { jobs, open, start, add, cancel, clearFinished, of }
})
