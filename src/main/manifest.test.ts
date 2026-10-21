// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeDisplayName } from './manifest'

describe('display names', () => {
  const manifest = (): string => {
    const file = join(mkdtempSync(join(tmpdir(), 'vk-manifest-')), 'model.json')
    writeFileSync(file, JSON.stringify({ name: 'juggernaut_v7', arch: 'sdxl', defaults: { num_steps: 30 } }))
    return file
  }
  const read = (file: string): Record<string, unknown> => JSON.parse(readFileSync(file, 'utf8'))

  it('keeps the own name in the manifest and leaves everything else as it is', () => {
    const file = manifest()
    writeDisplayName(file, 'juggernaut_v7', '  Juggernaut   XL — photos ')
    expect(read(file)).toEqual({ name: 'juggernaut_v7', arch: 'sdxl', defaults: { num_steps: 30 }, display_name: 'Juggernaut XL — photos' })
  })

  it('removes the own name when the title is empty or the folder name', () => {
    const file = manifest()
    writeDisplayName(file, 'juggernaut_v7', 'Photos')
    writeDisplayName(file, 'juggernaut_v7', '')
    expect('display_name' in read(file)).toBe(false)
    writeDisplayName(file, 'juggernaut_v7', 'Photos')
    writeDisplayName(file, 'juggernaut_v7', 'juggernaut_v7')
    expect('display_name' in read(file)).toBe(false)
  })

  it('refuses a manifest it can not read', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'vk-manifest-')), 'model.json')
    expect(() => writeDisplayName(file, 'x', 'y')).toThrow()
  })
})
