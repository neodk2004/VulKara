// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toEngineJob } from './engine_job'
import { STYLES, STYLE_GROUPS, applyStyle, styleSlug } from './styles'
import type { Job } from './types'

const JOB: Job = { id: '1', page: 'text', prompt: 'a fox', modelId: 'm', modelDir: '/m', width: 512, height: 512, seed: 1 }

describe('styles', () => {
  it('every style has a template, a group and a preview picture', () => {
    const groups = STYLE_GROUPS.map((g) => g.id)
    for (const s of STYLES) {
      expect(s.template).toContain('{prompt}')
      expect(groups).toContain(s.group)
      expect(existsSync(join(__dirname, '../renderer/src/assets/styles', styleSlug(s.name) + '.jpg')), s.name).toBe(true)
    }
    expect(new Set(STYLES.map((s) => s.name)).size).toBe(STYLES.length)
  })

  it('puts the prompt into the template and adds to the negative prompt', () => {
    expect(applyStyle('Pixel Art', ' a fox ', 'blurry')).toEqual({
      prompt: 'pixel-art a fox, low-res, blocky, pixel art style, 8-bit graphics',
      negative: 'blurry, sloppy, messy, blurry, noisy, highly detailed, ultra textured, photo, realistic',
    })
    expect(applyStyle(undefined, 'a fox')).toEqual({ prompt: 'a fox', negative: '' })
    expect(applyStyle('No such style', 'a fox', 'x')).toEqual({ prompt: 'a fox', negative: 'x' })
    expect(applyStyle('Anime', '  ').prompt).toBe('  ')
  })

  it('reaches the engine, while the job keeps the prompt as written', () => {
    const job = { ...JOB, style: 'Line Art' }
    const sent = toEngineJob(job)
    expect(sent.prompt).toBe('line art drawing a fox, professional, sleek, modern, minimalist, graphic, line art, vector graphics')
    expect(sent.negative_prompt).toContain('photorealistic')
    expect(job.prompt).toBe('a fox')
    expect(toEngineJob(JOB).negative_prompt).toBeUndefined()
  })
})
