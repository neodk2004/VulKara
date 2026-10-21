// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { formatDuration, jobFacts, jobProgress } from './format'
import type { QueuedJob } from '@shared/api'

const job = (over: Partial<QueuedJob> = {}): QueuedJob => ({
  job: { id: '1', page: 'text', prompt: 'p', modelId: 'm', modelDir: '/m', width: 768, height: 512, seed: 5, steps: 20 },
  state: 'running', progress: -1, status: '', results: [], addedAt: 0, ...over,
})

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(40)).toBe('40 s')
    expect(formatDuration(75)).toBe('1:15 min')
    expect(formatDuration(3700)).toBe('1:01 h')
  })

  it('describes a job', () => {
    expect(jobFacts(job())).toBe('768×512 · 20 steps · seed 5')
    // a restoration without the AI repair: no model, so no steps or seed
    const restored = job()
    restored.job.restore = { correct: true, repair: false, colorize: false, colorStrength: 1, sharpen: false, sharpness: 0.3, lock: true, maxChange: 0.06, rules: [], checkFaces: true }
    expect(jobFacts(restored)).toBe('768×512')
    expect(jobProgress(job({ status: 'Loading model' }))).toBe('Loading model')
    expect(jobProgress(job({ progress: 42, eta: 70, secondsPerStep: 2.1 }))).toBe('42 % · 1:10 min left · 2.1 s/step')
    expect(jobProgress(job({ state: 'waiting' }))).toBe('Waiting')
    expect(jobProgress(job({ state: 'failed', error: 'boom' }))).toBe('boom')
  })
})
