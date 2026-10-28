// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import type { BenchmarkRun } from '@shared/api'
import type { Asset } from '@shared/types'
import { benchmarkJob, benchmarkTable } from './benchmark'

const model = {
  id: 'z', title: 'Z-Image Turbo', folder: '/models/z', type: 'model',
  meta: { arch: 'z_image', family: 'z_image', label: 'Z-Image', runtime: 'mlx', kind: 'image', defaults: { num_steps: 9, guidance_scale: 0, width: 1024, height: 1024 } },
} as unknown as Asset

describe('benchmark', () => {
  it('runs the model with its own settings, the same prompt and seed for every model', () => {
    expect(benchmarkJob(model, 0)).toMatchObject({ page: 'benchmark', modelDir: '/models/z', width: 1024, height: 1024, steps: 9, guidance: 0, seed: 11 })
    expect(benchmarkJob(model, 512)).toMatchObject({ width: 512, height: 512, steps: 9 })
  })

  it('copies the runs as a Markdown table with the swap the job added', () => {
    const run: BenchmarkRun = {
      id: 'a', at: 0, model: 'Z|Image', build: '0.7.1 7370989+ 2026-10-26 15:42', width: 1024, height: 1024, steps: 9, precision: 'transformer 4 bit, text encoder 4 bit', state: 'done', secondsPerStep: 92.92, seconds: 900,
      peakAppGb: 11.2, peakUsedGb: 15.4, totalGb: 16, swapStartGb: 1, peakSwapGb: 4.5, diskReadGb: 45.5, swapReadGb: 2,
      waited: [{ what: 'ssd_stream', seconds: 130, gb: 45.33 }], phases: [{ text: 'Loading model (MLX, 4 bit)', at: 0, seconds: 75 }, { text: 'Generating', at: 0, seconds: 836.4 }],
    }
    const lines = benchmarkTable([run], { chip: 'Apple M4', ramGb: 16 } as never).split('\n')
    expect(lines[0]).toBe('Apple M4, 16 GB')
    expect(lines[4]).toBe('| Z/Image | 0.7.1 7370989+ 2026-10-26 15:42 | 1024×1024 | 9 | transformer 4 bit, text encoder 4 bit | 92.92 | 900.0 |  |  | 11.2 | 15.4 of 16 | 3.50 | 45.50 | 2.00 | done | Loading model (MLX, 4 bit) 1:15 min; Generating 13:56 min; waiting for blocks from the SSD during the steps 2:10 min (45.3 GB) |')
  })
})
