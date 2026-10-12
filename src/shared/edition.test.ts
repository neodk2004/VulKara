// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { EDITION, commerciallyUsable } from './edition'
import curated from './data/curated_models.json'
import licences from './data/licenses.json'

describe('the edition', () => {
  it('offers everything', () => {
    expect(EDITION).toMatchObject({ id: 'full', comfyui: true, explicitContent: 'choice', commercialModelsOnly: false })
  })

  it('has a licence for every recommended model, so a restricted build could decide', () => {
    for (const m of curated) expect(licences.models.find((l) => l.id === m.id), m.id).toBeDefined()
    expect(commerciallyUsable({ model: 'yes', outputs: 'yes' })).toBe(true)
    expect(commerciallyUsable({ model: 'limited', outputs: 'limited' })).toBe(true)
    expect(commerciallyUsable({ model: 'no', outputs: 'yes' })).toBe(false)
    expect(commerciallyUsable(undefined)).toBe(false)
  })
})
