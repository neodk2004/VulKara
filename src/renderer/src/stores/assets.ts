// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Asset } from '@shared/types'

export const useAssetsStore = defineStore('assets', () => {
  const all = ref<Asset[]>([])
  const models = computed(() => all.value.filter((a) => a.type === 'model'))
  const loras = computed(() => all.value.filter((a) => a.type === 'lora'))
  const byId = (id: string): Asset | undefined => all.value.find((a) => a.id === id)
  /** the name shown for the model in a folder (a job's modelDir): its own name, else the folder's */
  const titleOf = (folder: string): string => {
    const name = folder.split('/').pop() ?? folder
    return (all.value.find((a) => a.folder === folder) ?? all.value.find((a) => a.type === 'model' && a.name === name))?.title ?? name
  }

  async function refresh(): Promise<void> {
    all.value = await window.vk.assets.list()
  }

  return { all, models, loras, byId, titleOf, refresh }
})
