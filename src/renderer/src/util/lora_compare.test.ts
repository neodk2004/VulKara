// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { comparisonJobs, parseStrengths } from './lora_compare'
import type { Asset } from '@shared/types'

const MODEL: Asset = {
  id: 'model:xl', title: 'xl', name: 'xl', folder: '/models/xl', type: 'model',
  meta: { arch: 'sdxl', family: 'sdxl', label: 'SDXL', runtime: 'diffusers', kind: 'image', negativePrompt: true, defaults: { num_steps: 30, guidance_scale: 6, width: 1024, height: 1024 } },
}
const lora = (name: string): Asset => ({ id: 'lora:' + name, title: name, name, folder: '/loras/' + name, type: 'lora', meta: { arch: '', family: 'sdxl', label: '', runtime: 'diffusers', kind: 'image' } })

describe('lora comparison', () => {
  it('reads strengths however they are separated', () => {
    expect(parseStrengths('0, 0.5, 1')).toEqual([0, 0.5, 1])
    expect(parseStrengths('0;0.25  0.75\n1.5')).toEqual([0, 0.25, 0.75, 1.5])
    expect(parseStrengths('1, 1, 9, -3, x, -0.5')).toEqual([1, -0.5])
    expect(parseStrengths('1 2 3 0 0.1 0.2 0.3 0.4 0.5')).toHaveLength(8)
    expect(parseStrengths('')).toEqual([])
  })

  it('makes one job per strength and LoRA, and one without any', () => {
    const jobs = comparisonJobs(MODEL, [lora('a'), lora('b')], [0, 0.5, 1], ' a fox ', 42)
    expect(jobs.map((j) => j.label)).toEqual(['Without LoRA', 'a × 0.5', 'a × 1', 'b × 0.5', 'b × 1'])
    expect(new Set(jobs.map((j) => j.seed))).toEqual(new Set([42]))
    expect(jobs[0].loras).toBeUndefined()
    expect(jobs[1]).toMatchObject({ page: 'lora', prompt: 'a fox', steps: 30, guidance: 6, width: 1024, loras: [{ path: '/loras/a', scale: 0.5 }] })
    expect(comparisonJobs(MODEL, [lora('a')], [1], 'x', 1)).toHaveLength(1)
  })
})
