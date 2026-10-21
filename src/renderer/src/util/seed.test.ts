// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { seedOf } from './seed'

describe('seed input', () => {
  it('keeps whole numbers in range and makes the rest random', () => {
    expect(seedOf('42')).toBe(42)
    expect(seedOf('7.9')).toBe(7)
    expect(seedOf('-3')).toBe(0)
    expect(seedOf('99999999999')).toBe(2 ** 31 - 1)
    expect(seedOf('1e309')).toBeNull()
    expect(seedOf('abc')).toBeNull()
    expect(seedOf('')).toBeNull()
  })
})
