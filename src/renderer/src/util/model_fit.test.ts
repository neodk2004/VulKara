// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { guidanceHint, stepsHint } from './model_fit'
import type { ModelMeta } from '@shared/types'

const meta = (m: Partial<ModelMeta> & { steps: number; guidance: number }): ModelMeta => {
  const { steps, guidance, ...rest } = m
  return { arch: 'sdxl', family: 'sdxl', label: 'Stable Diffusion XL', runtime: 'diffusers', kind: 'image',
    defaults: { num_steps: steps, guidance_scale: guidance, width: 1024, height: 1024 }, ...rest }
}
const SCHNELL = meta({ arch: 'flux1_schnell', family: 'flux1', label: 'FLUX.1 [schnell]', steps: 4, guidance: 0 })
const DEV = meta({ arch: 'flux1_dev', family: 'flux1', label: 'FLUX.1 [dev]', steps: 28, guidance: 3.5 })
const SDXL = meta({ steps: 30, guidance: 6 })
const SDXL_TURBO = meta({ steps: 4, guidance: 0 })
const KLEIN = meta({ arch: 'flux2_klein', family: 'flux2', label: 'FLUX.2 [klein]', steps: 4, guidance: 1 })
const KLEIN_BASE = meta({ arch: 'flux2_klein', family: 'flux2', label: 'FLUX.2 [klein]', steps: 50, guidance: 4 })
const ZIT = meta({ arch: 'z_image', family: 'z_image', label: 'Z-Image', steps: 9, guidance: 0 })
const FLUX_DEV_TURBO = meta({ arch: 'flux1_dev', family: 'flux1', label: 'FLUX.1 [dev]', steps: 4, guidance: 0 })

describe('steps for the model', () => {
  it('notes FLUX.1 [schnell] at 18 steps and offers its 4', () => {
    expect(stepsHint(SCHNELL, 18)).toEqual({ text: 'Made for 4 steps: more take longer without a better picture.', fix: { label: 'Use 4 steps', value: 4 } })
  })

  it('says nothing for FLUX.1 [schnell] at 4 to 8 steps', () => {
    expect(stepsHint(SCHNELL, 4)).toBeNull()
    expect(stepsHint(SCHNELL, 8)).toBeNull()
    expect(stepsHint(SCHNELL, 9)).not.toBeNull()
  })

  it('says nothing for undistilled models, whatever the steps', () => {
    expect(stepsHint(DEV, 28)).toBeNull()
    expect(stepsHint(SDXL, 80)).toBeNull()
    expect(stepsHint(KLEIN_BASE, 4)).toBeNull()
  })

  it('notes other distilled models by their default steps', () => {
    expect(stepsHint(ZIT, 25)?.text).toBe('Made for 9 steps: more take longer without a better picture.')
    expect(stepsHint(KLEIN, 20)?.fix.value).toBe(4)
  })

  it('says nothing for an unknown model or one without defaults', () => {
    expect(stepsHint(undefined, 50)).toBeNull()
    expect(stepsHint({ ...SDXL, defaults: undefined }, 50)).toBeNull()
  })
})

describe('guidance for the model', () => {
  it('notes guidance on the distilled FLUX 3 Image Klein, which samples without', () => {
    const F3 = { arch: 'flux3_klein', family: 'flux3', label: 'FLUX 3 Image Klein', runtime: 'mlx', kind: 'image', defaults: { num_steps: 16, guidance_scale: 1, width: 1024, height: 1024 } } as ModelMeta
    expect(guidanceHint(F3, 3.5, 16)?.fix.value).toBe(1)
    expect(guidanceHint({ ...F3, defaults: { num_steps: 50, guidance_scale: 3.5, width: 1024, height: 1024 } }, 3.5, 50)).toBeNull()
  })

  it('notes guidance on FLUX.1 [schnell], which has none', () => {
    expect(guidanceHint(SCHNELL, 6.2, 18)).toEqual({ text: 'FLUX.1 [schnell] has no guidance: this value has no effect.', fix: { label: 'Use guidance 0', value: 0 } })
    expect(guidanceHint({ ...SCHNELL, runtime: 'mlx' }, 6.2, 4)).not.toBeNull()
  })

  it('takes guidance of 1 and below as off', () => {
    expect(guidanceHint(SCHNELL, 0, 4)).toBeNull()
    expect(guidanceHint(SCHNELL, 1, 4)).toBeNull()
  })

  it('says nothing where the guidance works', () => {
    expect(guidanceHint(DEV, 3.5, 28)).toBeNull()
    expect(guidanceHint(DEV, 7, 28)).toBeNull()
    expect(guidanceHint(SDXL, 12, 30)).toBeNull()
    expect(guidanceHint(KLEIN_BASE, 4, 50)).toBeNull()
    // a turbo fine-tune of FLUX.1 [dev] takes guidance as an embedding: no second pass
    expect(guidanceHint(FLUX_DEV_TURBO, 3.5, 4)).toBeNull()
  })

  it('notes guidance on a distilled FLUX.2 [klein]; MLX guides it above 8 steps', () => {
    expect(guidanceHint(KLEIN, 4, 4)?.text).toBe('This distilled FLUX.2 [klein] has no guidance: this value has no effect.')
    expect(guidanceHint({ ...KLEIN, runtime: 'mlx' }, 4, 4)).not.toBeNull()
    expect(guidanceHint({ ...KLEIN, runtime: 'mlx' }, 4, 20)).toBeNull()
  })

  it('notes guidance on models made without it, by what the runtime does with it', () => {
    expect(guidanceHint({ ...ZIT, runtime: 'mlx' }, 5, 9)?.text).toBe('This distilled Z-Image has no guidance: this value has no effect.')
    expect(guidanceHint(ZIT, 5, 9)?.text).toMatch(/^Made to run without guidance \(1 or less\): above that every step runs twice/)
    expect(guidanceHint(SDXL_TURBO, 7, 4)?.fix).toEqual({ label: 'Use guidance 0', value: 0 })
    expect(guidanceHint({ ...SDXL_TURBO, runtime: 'comfyui' }, 7, 4)).not.toBeNull()
  })

  it('says nothing for an unknown model or one without defaults', () => {
    expect(guidanceHint(undefined, 7, 25)).toBeNull()
    expect(guidanceHint({ ...SCHNELL, defaults: undefined }, 7, 25)).toBeNull()
  })
})
