// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { LORA_BASES, baseOfAsset, baseOfCivitai, baseOfModel, isInstalled } from './lora_bases'
import type { Asset } from './types'

const model = (arch: string, family: string, extra: Partial<Asset> = {}): Asset => ({
  id: 'model:' + arch, title: arch, name: arch, folder: '/m/' + arch, type: 'model',
  meta: { arch, family, label: arch, runtime: 'diffusers', kind: 'image' }, ...extra,
})
const lora = (source: Asset['source'] & Record<string, unknown>): Asset => ({
  id: 'lora:x', title: 'x', name: 'x', folder: '/l/x', type: 'lora', meta: { arch: '', family: 'sdxl', label: '', runtime: 'diffusers', kind: 'image' }, source,
})

describe('the bases LoRAs are made for', () => {
  it('has a unique id, a family and a source on both sites for every base', () => {
    expect(new Set(LORA_BASES.map((b) => b.id)).size).toBe(LORA_BASES.length)
    for (const b of LORA_BASES) {
      expect(b.family).toBeTruthy()
      expect(b.civitai.length).toBeGreaterThan(0)
      expect(b.hf.every((r) => /^[\w.-]+\/[\w.-]+$/.test(r))).toBe(true)
    }
  })

  it('maps the architectures of the app to their base', () => {
    expect(baseOfModel({ arch: 'sd15', family: 'sd1' })?.civitai).toEqual(['SD 1.5'])
    expect(baseOfModel({ arch: 'sd15_inpaint', family: 'sd1' })?.id).toBe('sd15')
    expect(baseOfModel({ arch: 'sdxl', family: 'sdxl' })?.civitai).toEqual(['SDXL 1.0'])
    expect(baseOfModel({ arch: 'flux1_dev', family: 'flux1' })?.civitai).toEqual(['Flux.1 D'])
    expect(baseOfModel({ arch: 'flux1_schnell', family: 'flux1' })?.civitai).toEqual(['Flux.1 S'])
    expect(baseOfModel({ arch: 'flux2_klein', family: 'flux2' })?.id).toBe('flux2_klein4')
    expect(baseOfModel({ arch: 'qwen_image21', family: 'qwen_image21' })?.civitai).toEqual(['Qwen 2.1'])
    expect(baseOfModel({ arch: 'krea2', family: 'krea2' })?.hf).toEqual(['krea/Krea-2-Turbo'])
    expect(baseOfModel({ arch: 'wan22_ti2v', family: 'wan' })?.id).toBe('wan22_5b')
    expect(baseOfModel({ arch: 'chroma', family: 'chroma' })?.civitai).toEqual(['Chroma'])
    expect(baseOfModel({ arch: 'z_image', family: 'z_image' })?.civitai).toEqual(['ZImageTurbo'])
    // an unknown architecture of a known family: the family's first base
    expect(baseOfModel({ arch: 'something_new', family: 'flux1' })?.id).toBe('flux1_dev')
    expect(baseOfModel({ arch: 'x', family: 'unknown' })).toBeUndefined()
  })

  it('prefers the base model Civitai names, and tells SDXL offspring apart by name', () => {
    expect(baseOfModel({ arch: 'sdxl', family: 'sdxl' }, { baseModel: 'Pony' })?.id).toBe('pony')
    expect(baseOfModel({ arch: 'sdxl', family: 'sdxl' }, { baseModel: 'Illustrious' })?.id).toBe('illustrious')
    expect(baseOfModel({ arch: 'sdxl', family: 'sdxl' }, { names: ['waiNSFWIllustrious_v14'] })?.id).toBe('illustrious')
    expect(baseOfModel({ arch: 'sdxl', family: 'sdxl' }, { names: ['ponyDiffusionV6XL'] })?.id).toBe('pony')
    expect(baseOfModel({ arch: 'flux2_klein', family: 'flux2' }, { names: ['FLUX.2-klein-9B'] })?.id).toBe('flux2_klein9')
    expect(baseOfModel({ arch: 'flux1_dev', family: 'flux1' }, { baseModel: 'Flux.1 Krea' })?.id).toBe('flux1_krea')
    expect(baseOfAsset(model('sdxl', 'sdxl', { baseModel: 'NoobAI' }))?.id).toBe('noobai')
    expect(baseOfCivitai('Pony V7')).toBeUndefined()  // AuraFlow, not SDXL
    expect(baseOfCivitai('Flux.2 Klein 9B-base')).toBe('flux2_klein9')
    expect(baseOfCivitai('SD 3.5 Large')).toBe('sd35_large')
    expect(baseOfCivitai('Wan Video 2.2 I2V-A14B')).toBe('wan22_14b')
    expect(baseOfCivitai('Chroma')).toBe('chroma')
    expect(baseOfCivitai('ZImageTurbo')).toBe('z_image_turbo')
    expect(baseOfCivitai('ZImageBase')).toBe('z_image_base')
    // Z-Image (Base) by name, as the import tells it; distilled fine-tunes of it are Turbo's
    expect(baseOfModel({ arch: 'z_image', family: 'z_image' }, { names: ['Tongyi-MAI/Z-Image'] })?.id).toBe('z_image_base')
    expect(baseOfModel({ arch: 'z_image', family: 'z_image' }, { names: ['Tongyi-MAI/Z-Image-Turbo'] })?.id).toBe('z_image_turbo')
    expect(baseOfModel({ arch: 'z_image', family: 'z_image' }, { names: ['redcraft_zibDistilled'] })?.id).toBe('z_image_turbo')
    expect(baseOfModel({ arch: 'z_image', family: 'z_image' }, { names: ['zImageBase_base'] })?.id).toBe('z_image_base')
  })

  it('knows installed LoRAs by their Civitai model or Hugging Face file', () => {
    const assets = [
      lora({ type: 'civitai', ref: 'https://civitai.com/models/58390?modelVersionId=62833', model_id: 58390 }),
      lora({ type: 'hf', ref: 'ByteDance/Hyper-SD', file: 'Hyper-SDXL-8steps-lora.safetensors' }),
    ]
    expect(isInstalled({ source: 'civitai', ref: 'https://civitai.com/models/58390?modelVersionId=99' }, assets)).toBe(true)
    expect(isInstalled({ source: 'civitai', ref: 'https://civitai.com/models/5839' }, assets)).toBe(false)
    expect(isInstalled({ source: 'hf', ref: 'ByteDance/Hyper-SD', file: 'Hyper-SDXL-8steps-lora.safetensors' }, assets)).toBe(true)
    expect(isInstalled({ source: 'hf', ref: 'ByteDance/Hyper-SD', file: 'Hyper-FLUX.1-dev-8steps-lora.safetensors' }, assets)).toBe(false)
    expect(isInstalled({ source: 'hf', ref: 'other/repo', file: 'a.safetensors' }, assets)).toBe(false)
    // a model is not a LoRA
    expect(isInstalled({ source: 'hf', ref: 'a/b' }, [model('sdxl', 'sdxl', { source: { type: 'hf', ref: 'a/b' } })])).toBe(false)
  })
})
