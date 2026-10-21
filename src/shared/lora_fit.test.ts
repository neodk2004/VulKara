// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { familyTitle, loraFits, modelVariant } from './lora_fit'
import { baseOfModel } from './lora_bases'
import type { Asset, ModelMeta } from './types'

const asset = (type: Asset['type'], meta: Partial<ModelMeta>): Asset => ({
  id: `${type}:x`, title: 'x', name: 'x', folder: '/x', type,
  meta: { arch: '', family: '', label: '', runtime: 'diffusers', kind: 'image', ...meta },
})

const klein4 = asset('model', { arch: 'flux2_klein', family: 'flux2', variant: 'klein4b' })
const klein9 = asset('model', { arch: 'flux2_klein', family: 'flux2', variant: 'klein9b' })
const flux2dev = asset('model', { arch: 'flux2_dev', family: 'flux2' })
const lora9 = asset('lora', { family: 'flux2', variant: 'klein9b' })
const lora4 = asset('lora', { family: 'flux2', variant: 'klein4b' })
const older = asset('lora', { family: 'flux2' })

describe('which LoRAs fit which model', () => {
  it('keeps FLUX.2 [klein] 4B, [klein] 9B and [dev] apart', () => {
    expect(loraFits(lora9, klein9)).toBe(true)
    expect(loraFits(lora9, klein4)).toBe(false)
    expect(loraFits(lora4, klein9)).toBe(false)
    expect(loraFits(lora4, flux2dev)).toBe(false)  // [dev] is known from its architecture
    expect(modelVariant(flux2dev.meta)).toBe('dev')
  })

  it('lets a LoRA or model without a known sub-base through (the engine checks the layers)', () => {
    expect(loraFits(older, klein4)).toBe(true)
    expect(loraFits(lora9, asset('model', { arch: 'flux2_klein', family: 'flux2' }))).toBe(true)
  })

  it('never offers another family, nor LoRAs for a model that takes none or can not run', () => {
    expect(loraFits(asset('lora', { family: 'sdxl' }), klein4)).toBe(false)
    expect(loraFits(asset('lora', { family: 'wan', variant: '14b' }), asset('model', { arch: 'wan22_i2v_14b', family: 'wan', noLoras: true }))).toBe(false)
    expect(loraFits(asset('lora', { family: 'wan', variant: '14b' }), asset('model', { arch: 'wan22_ti2v', family: 'wan' }))).toBe(false)
    expect(loraFits(asset('lora', { family: 'chroma' }), asset('model', { arch: 'chroma', family: 'chroma', unsupported: 'no runtime' }))).toBe(false)
    expect(loraFits(asset('lora', { family: 'chroma' }), asset('model', { arch: 'chroma', family: 'chroma' }))).toBe(true)
    expect(loraFits(asset('lora', { family: 'flux1' }), asset('model', { arch: 'chroma', family: 'chroma' }))).toBe(false)
    expect(loraFits(asset('lora', { family: 'z_image' }), asset('model', { arch: 'z_image', family: 'z_image' }))).toBe(true)
    expect(loraFits(asset('lora', { family: 'z_image' }), klein4)).toBe(false)
    // a family no model type has: it simply finds no model
    expect(loraFits(asset('lora', { family: 'lumina' }), klein4)).toBe(false)
  })

  it('names families and sub-bases', () => {
    expect(familyTitle('flux2', 'klein9b')).toBe('FLUX.2 [klein] 9B')
    expect(familyTitle('chroma')).toBe('Chroma')
    expect(familyTitle('sdxl')).toBe('SDXL')
    expect(familyTitle('')).toBe('Other')
  })

  it('takes the 9B LoRAs on Civitai for a model that knows it is the 9B', () => {
    expect(baseOfModel({ arch: 'flux2_klein', family: 'flux2', variant: 'klein9b' })?.id).toBe('flux2_klein9')
    expect(baseOfModel({ arch: 'flux2_klein', family: 'flux2', variant: 'klein4b' }, { names: ['my 9b test'] })?.id).toBe('flux2_klein4')
  })
})
