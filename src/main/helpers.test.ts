// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listHelpers } from './helpers'

describe('helper models', () => {
  it('lists the catalog and tells which are on this Mac by their files', () => {
    const helpers = mkdtempSync(join(tmpdir(), 'vk-helpers-'))
    mkdirSync(join(helpers, 'upscalers'), { recursive: true })
    writeFileSync(join(helpers, 'upscalers', 'RealESRGAN_x4plus.safetensors'), Buffer.alloc(40 * 1024 ** 2))
    mkdirSync(join(helpers, 'annotators', 'depth'), { recursive: true })
    writeFileSync(join(helpers, 'annotators', 'depth', 'config.json'), '{}')  // a download that broke off
    const list = listHelpers(resolve('engines'), helpers)
    expect(list.length).toBeGreaterThanOrEqual(20)
    expect(list.find((h) => h.id === 'realesrgan')).toMatchObject({ installed: true, diskMb: 40, group: 'Upscale' })
    expect(list.find((h) => h.id === 'depth')?.installed).toBe(false)
    expect(list.filter((h) => h.required).map((h) => h.id).sort()).toEqual(['content-age', 'content-nsfw'])
    expect(list.every((h) => h.preview && h.folder.startsWith(helpers))).toBe(true)
  })
})
