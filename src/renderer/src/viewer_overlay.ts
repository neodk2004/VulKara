// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The large view: its own window in the app, an overlay on the page in the remote web UI (a browser has no second
// window). One place both the pages and the remote bridge reach, so the pages keep calling window.vk.viewer.open.

import { shallowRef } from 'vue'
import type { ViewerItem } from '@shared/api'

export const viewerOverlay = shallowRef<{ items: ViewerItem[]; index: number } | null>(null)
export const showViewer = (items: ViewerItem[], index: number): void => { viewerOverlay.value = { items, index } }
export const hideViewer = (): void => { viewerOverlay.value = null }
