// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, net: {}, protocol: {} }))

const { isMedia } = await import('./protocols')

describe('vk-file', () => {
  it('serves pictures and videos only', () => {
    expect(isMedia('/Users/me/VulKara/images/a.png')).toBe(true)
    expect(isMedia('/Users/me/Desktop/Photo.JPG')).toBe(true)
    expect(isMedia('/tmp/clip.mp4')).toBe(true)
    expect(isMedia('/Users/me/Library/Application Support/VulKara/tokens.json')).toBe(false)
    expect(isMedia('/Users/me/VulKara/models/x/model.json')).toBe(false)
    expect(isMedia('/Users/me/.ssh/id_ed25519')).toBe(false)
    expect(isMedia('/tmp/x.constructor')).toBe(false)
  })
})
