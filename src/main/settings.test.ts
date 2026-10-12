// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'vk-settings-'))
vi.mock('electron', () => ({ app: { getPath: () => dir } }))

const { getSettings, isValidSetting, setSetting, settableByPage } = await import('./settings')

describe('settings', () => {
  it('takes only the settings there are, with values they can have', () => {
    expect(isValidSetting('theme', 'dark')).toBe(true)
    expect(isValidSetting('modelsDir', '/Volumes/Models')).toBe(true)
    expect(isValidSetting('modelsDir', 'models')).toBe(false)
    expect(isValidSetting('memoryReserveGb', Number.NaN)).toBe(false)
    for (const key of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty'])
      expect(isValidSetting(key, {})).toBe(false)
  })

  it('stores nothing that is not a setting', () => {
    expect(() => setSetting('constructor' as 'theme', 'x' as 'dark')).toThrow(/Invalid value/)
    setSetting('theme', 'light')
    expect(getSettings().theme).toBe('light')
    expect(Object.hasOwn(getSettings(), 'constructor')).toBe(false)
  })

  it('lets a page reset a folder but not point it somewhere', () => {
    expect(settableByPage('runtimesDir', '/tmp/evil')).toBe(false)
    expect(settableByPage('helpersDir', '/Volumes/x')).toBe(false)
    expect(settableByPage('runtimesDir', '')).toBe(true)
    expect(settableByPage('theme', 'dark')).toBe(true)
  })
})
