// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { REMOTE_CHANNELS } from './remote_channels'

describe('what the remote web UI may call', () => {
  it('has generating and watching', () => {
    for (const c of ['queue:add', 'queue:snapshot', 'assets:list', 'history:list', 'files:writeImage']) expect(REMOTE_CHANNELS.has(c)).toBe(true)
  })

  it('has nothing that changes the Mac, its settings or its secrets', () => {
    for (const c of ['settings:set', 'settings:chooseFolder', 'tokens:set', 'files:choose', 'files:saveAs', 'files:reveal',
      'assets:remove', 'imports:add', 'runtimes:install', 'training:start', 'app:openExternal', 'app:logs', 'dialog:ask']) {
      expect(REMOTE_CHANNELS.has(c)).toBe(false)
    }
  })
})
