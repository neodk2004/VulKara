// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import type { VulkaraApi } from '@shared/api'

declare global {
  interface Window {
    vk: VulkaraApi
  }
}

export {}
