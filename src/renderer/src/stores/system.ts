// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// What the Mac is doing (status bar, Hardware page): the main process measures every 2 s and sends it.

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { HardwareInfo, SystemStats } from '@shared/api'
import { num } from '../i18n'

export const useSystemStore = defineStore('system', () => {
  const stats = ref<SystemStats>()
  const hardware = ref<HardwareInfo>()

  let started = false
  async function start(): Promise<void> {
    if (started) return
    started = true
    window.vk.system.onStats((s) => { stats.value = s })
    stats.value = await window.vk.system.stats()
  }

  async function loadHardware(): Promise<void> {
    hardware.value ??= await window.vk.system.hardware()
  }

  return { stats, hardware, start, loadHardware }
})

/** "8.6 GB", "640 MB" */
export const gb = (value: number): string => (value >= 1 ? `${num(value, value >= 10 ? 0 : 1)} GB` : `${Math.round(value * 1024)} MB`)
