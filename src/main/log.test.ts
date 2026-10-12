// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { cleanOutput, downloadNote } from './log'

describe('log', () => {
  it('notes size and speed of a finished package download', () => {
    const running = new Map()
    expect(downloadNote('[runtime comfyui] Downloading torch (121.4MiB)', 1000, running)).toBeUndefined()
    expect(downloadNote('[runtime comfyui] Downloading kornia (1.1MiB)', 1000, running)).toBeUndefined()
    expect(downloadNote('[runtime comfyui] Downloaded torch', 11000, running)).toBe('121.4 MiB · 12.1 MiB/s')
    expect(downloadNote('[runtime comfyui] Downloaded torch', 12000, running)).toBeUndefined()
    expect(downloadNote('[runtime comfyui] Downloading big (2.5GiB)', 0, running)).toBeUndefined()
    expect(downloadNote('[runtime comfyui] Downloaded big', 100000, running)).toBe('2.5 GiB · 25.6 MiB/s')
    expect(downloadNote('[diffusers] image done in 4.0s', 0, running)).toBeUndefined()
  })

  it('keeps what a process printed readable', () => {
    expect(cleanOutput('diffusers', 'Loading pipeline components...:  43%|████▎     | 3/7 [00:00<00:01]')).toEqual([])
    expect(cleanOutput('diffusers', '\rLoading:   0%|   | 0/7\rLoading: 100%|██████████| 7/7 [00:00<00:00]')).toEqual(['[diffusers] Loading: 100%|██████████| 7/7 [00:00<00:00]'])
    expect(cleanOutput('diffusers', '[diffusers] image done in 23.1s\nsecond line\n\n')).toEqual(['[diffusers] image done in 23.1s', '[diffusers] second line'])
    expect(cleanOutput('content filter', 'Fetching 3 files:   0%|          | 0/3')).toEqual([])
    expect(cleanOutput('comfyui', '[comfy] enlarged in 22.2s')).toEqual(['[comfyui] enlarged in 22.2s'])
    expect(cleanOutput('diffusers', '[transformers] a note')).toEqual(['[diffusers] [transformers] a note'])
  })
})
