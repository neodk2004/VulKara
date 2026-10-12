// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { plain } from './settings'

describe('plain', () => {
  it('turns reactive objects into clonable copies and leaves other values as they are', () => {
    const templates = reactive([{ name: 'a', note: '', lock: true }])
    const copy = plain([...templates, { name: 'b', note: '', lock: false }])
    expect(() => structuredClone(copy)).not.toThrow()
    expect(copy).toEqual([{ name: 'a', note: '', lock: true }, { name: 'b', note: '', lock: false }])
    expect(plain('dark')).toBe('dark')
    expect(plain(4)).toBe(4)
    expect(plain(null)).toBe(null)
  })
})
