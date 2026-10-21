// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { describeMac, productName } from './mac_model'

describe('which Mac this is', () => {
  it('reads the product name from the device tree', () => {
    const out = `+-o product  <class IOService, id 0x100000110>
    {
      "product-name" = <"MacBook Pro (13-inch, M2, 2022)">
      "model-number" = <"MNEW3">
    }`
    expect(productName(out)).toBe('MacBook Pro (13-inch, M2, 2022)')
    expect(productName('no such entry')).toBe('')
  })

  it('names the chip only where the name does not', () => {
    expect(describeMac({ name: 'MacBook Pro (13-inch, M2, 2022)', chip: 'Apple M2', ramGb: 24 })).toBe('MacBook Pro (13-inch, M2, 2022) · 24 GB')
    // the Mac mini M4 says only "Mac mini (2024)"
    expect(describeMac({ name: 'Mac mini (2024)', chip: 'Apple M4', ramGb: 16 })).toBe('Mac mini (2024) · Apple M4 · 16 GB')
    expect(describeMac({ name: 'Mac14,7', chip: '', ramGb: 8 })).toBe('Mac14,7 · 8 GB')
  })
})
