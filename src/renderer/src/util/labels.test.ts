// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { jobLabel, samplerLabel, styleLabel } from './labels'

describe('labels', () => {
  it('shows the labels the app stores in English word for word in English', () => {
    for (const l of ['Upscale ×2', 'Without LoRA', 'Restored: corrected, dust removed, twice the size', 'Preview: coloured', 'Sharpen (NAFNet)'])
      expect(jobLabel(l)).toBe(l)
  })
  it('keeps names it does not know', () => {
    expect(styleLabel('Some old style')).toBe('Some old style')
    expect(samplerLabel('Euler')).toBe('Euler')
  })
})
