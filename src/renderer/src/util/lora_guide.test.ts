// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { loraGuide, loraKind } from './lora_guide'
import type { LoraDetails } from '@shared/api'
import type { Asset } from '@shared/types'

const asset = (type: Asset['type'], name: string, family: string, triggerWords?: string[]): Asset => ({
  id: `${type}:${name}`, title: name, name, folder: `/x/${name}`, type, meta: { arch: '', family, label: '', runtime: 'diffusers', kind: 'image', triggerWords },
})
const MODELS = [asset('model', 'JuggernautXL', 'sdxl'), asset('model', 'SD-1.5', 'sd1')]
const text = (sections: { title: string; text: string[] }[]): string => sections.flatMap((s) => [s.title, ...s.text]).join('\n')

describe('lora guide', () => {
  it('is written for the LoRA it describes', () => {
    const lora = asset('lora', 'Tattoo_Maker_XL', 'sdxl', ['proto_tat', 'tattoo_style'])
    const details: LoraDetails = { sizeMb: 218, triggerSource: 'civitai', page: 'https://civitai.com/models/1', pageName: 'Tattoo Maker XL',
      training: { resolution: '(1024, 1024)', images: 12, topTags: [['black ink', 9], ['tattoo_style', 8]] } }
    const guide = text(loraGuide(lora, details, MODELS))
    expect(guide).toContain('Tattoo_Maker_XL is a LoRA')
    expect(guide).toContain('“Tattoo Maker XL”')
    expect(guide).toContain('made for SDXL models')
    expect(guide).toContain('Fitting models on this Mac: JuggernautXL.')
    expect(guide).toContain('“proto_tat” and “tattoo_style”')
    expect(guide).toContain('between 0.7 and 1')
    expect(guide).toContain('1024, 1024 pixels')
    expect(guide).toContain('learned from 12 pictures. That is few')
    expect(guide).toContain('“black ink”')
    expect(guide).toContain('training is “black ink”.')  // a trigger word is not repeated as a training word
    expect(guide).toContain('Civitai')
  })

  it('says what is missing and manages without details', () => {
    const lora = asset('lora', 'Purple_Dreams', 'krea2')
    const guide = text(loraGuide(lora, undefined, MODELS))
    expect(guide).toContain('No Krea 2 model is installed yet')
    expect(guide).toContain('It has no trigger word')
    expect(guide).not.toContain('Civitai')
  })

  it('speaks in the third person', () => {
    const guide = text(loraGuide(asset('lora', 'x', 'flux1', ['x']), undefined, MODELS))
    expect(guide).not.toMatch(/\b(you|your|I|we)\b/i)
  })

  it('guesses what a LoRA teaches', () => {
    expect(loraKind(asset('lora', 'fantasy-digital-painting-style', 'flux1'))).toBe('style')
    expect(loraKind(asset('lora', 'br33zy', 'flux2'), { sizeMb: 1, triggerSource: 'civitai', pageName: 'Breezy (AI girl)' })).toBe('person')
    expect(loraKind(asset('lora', 'zzz', 'sdxl'))).toBeUndefined()
  })

  it('uses what the makers say about it', () => {
    const lora = asset('lora', 'zzz', 'sdxl', ['zz'])
    const guide = text(loraGuide(lora, undefined, MODELS, {
      source: 'civitai', page: 'https://civitai.com/models/1', name: 'Zed', creator: 'maker', kind: 'object', tags: [], description: [], versionNotes: [], trainedWords: [],
      recommended: { strength: 0.8, minStrength: 0.6, maxStrength: 1, fromMakers: true, steps: 30, guidance: 6, sampler: 'DPM++ 2M', examples: 4 },
      examples: [{ prompt: 'x' }], fetchedAt: 0,
    }))
    expect(guide).toContain('a certain thing')
    expect(guide).toContain('Its makers (maker) call it “Zed”.')
    expect(guide).toContain('Its makers recommend 0.8, anywhere between 0.6 and 1.')
    expect(guide).toContain('30 steps, guidance 6 and the sampler DPM++ 2M')
    expect(guide).toContain('Below are prompts its makers used')
    expect(guide).not.toMatch(/\b(you|your)\b/i)
  })
})
