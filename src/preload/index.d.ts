// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import type { VulkaraApi } from '@shared/api'

declare global {
  interface Window {
    vk: VulkaraApi
  }
}

export {}
