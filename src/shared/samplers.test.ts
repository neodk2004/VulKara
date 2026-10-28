// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { samplersFor } from './samplers'
import type { ModelMeta } from './types'

const meta = (over: Partial<ModelMeta> = {}): ModelMeta =>
  ({ arch: '', family: 'sdxl', label: '', runtime: 'diffusers', kind: 'image', ...over })

describe('samplersFor', () => {
  it('offers a family its full list when the maker named nothing', () => {
    const list = samplersFor(meta())!
    expect(list[0]).toBe('Default')
    expect(list).toContain('Euler')
    expect(list).toContain('DPM++ 2M')
  })

  it('holds the picker to the samplers the maker named, Default always first', () => {
    const list = samplersFor(meta({ samplers: ['DPM++ 2M', 'DPM++ 2M SDE'] }))!
    expect(list).toEqual(['Default', 'DPM++ 2M', 'DPM++ 2M SDE'])
    expect(list).not.toContain('Euler')
  })

  it('keeps only those the family can actually take, in the family order', () => {
    // a flow sampler name on an SDXL model is not in the SDXL list: it is dropped, not shown
    const list = samplersFor(meta({ samplers: ['UniPC', 'Euler (flow)', 'DPM++ 2M'] }))!
    expect(list).toEqual(['Default', 'DPM++ 2M', 'UniPC'])
  })

  it('ignores the restriction when none of the named samplers fits the family (keeps a usable picker)', () => {
    const list = samplersFor(meta({ samplers: ['Euler (flow)'] }))!
    expect(list).toContain('Euler')
    expect(list.length).toBeGreaterThan(2)
  })

  it('restricts a FLUX model within its flow samplers', () => {
    expect(samplersFor(meta({ family: 'flux1', samplers: ['Euler (flow)'] }))).toEqual(['Default', 'Euler (flow)'])
  })

  it('returns null for a family with no choice and never crashes without meta', () => {
    expect(samplersFor(meta({ family: 'wan' }))).toBeNull()
    expect(samplersFor(undefined)).toBeNull()
  })
})
