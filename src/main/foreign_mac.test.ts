// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { foreignMac, foreignRefusal, foreignRefusalOf, machineIdOf, platformUuid, ramGbOf, reimportRequest } from './foreign_mac'

const HERE = { machine: 'aaaaaaaaaaaaaaaa', ramGb: 16 }

describe('the Mac a model was imported on', () => {
  it('reads the UUID from ioreg and keeps only a short hash of it', () => {
    const out = '+-o J413AP  <class IOPlatformExpertDevice>\n    "IOPlatformUUID" = "12345678-ABCD-4EF0-9123-456789ABCDEF"\n'
    const uuid = platformUuid(out)
    expect(uuid).toBe('12345678-ABCD-4EF0-9123-456789ABCDEF')
    const id = machineIdOf(uuid)
    expect(id).toMatch(/^[0-9a-f]{16}$/)
    expect(id).toBe(machineIdOf(uuid))
    expect(id).not.toContain('12345678')
    expect(machineIdOf(platformUuid('nothing'))).toBe('')
  })

  it('rounds the memory as the importer does', () => {
    expect(ramGbOf(16 * 1024 ** 3)).toBe(16)
    expect(ramGbOf(24 * 1024 ** 3 - 1)).toBe(24)
  })

  it('tells a model by the machine id where it has one', () => {
    expect(foreignMac({ imported_on: { machine: 'bbbbbbbbbbbbbbbb', ram_gb: 24 } }, HERE)).toEqual({ ramGb: 24 })
    // another Mac with the same memory is another Mac too
    expect(foreignMac({ imported_on: { machine: 'bbbbbbbbbbbbbbbb', ram_gb: 16 } }, HERE)).toEqual({ ramGb: 16 })
    expect(foreignMac({ imported_on: { machine: HERE.machine, ram_gb: 16 }, plan: { ram_gb: 24 } }, HERE)).toBeUndefined()
    // this Mac's id could not be read: its memory decides
    expect(foreignMac({ imported_on: { machine: 'bbbbbbbbbbbbbbbb', ram_gb: 16 } }, { machine: '', ramGb: 16 })).toBeUndefined()
    expect(foreignMac({ imported_on: { ram_gb: 24 } }, HERE)).toEqual({ ramGb: 24 })
  })

  it('tells an older import (no imported_on) by the memory of its plan', () => {
    expect(foreignMac({ plan: { fits: true, ram_gb: 24.0 } }, HERE)).toEqual({ ramGb: 24 })
    expect(foreignMac({ plan: { fits: true, ram_gb: 16.0 } }, HERE)).toBeUndefined()
    expect(foreignMac({ plan: { fits: true, ram_gb: 15.99 } }, HERE)).toBeUndefined()
  })

  it('takes a model nothing is known of for one of this Mac', () => {
    expect(foreignMac({}, HERE)).toBeUndefined()
    expect(foreignMac({ plan: { fits: true } }, HERE)).toBeUndefined()
    expect(foreignMac({ imported_on: {} }, HERE)).toBeUndefined()
  })
})

describe('jobs with a model copied from another Mac', () => {
  const models = mkdtempSync(join(tmpdir(), 'vk-foreign-'))
  const model = (name: string, manifest: Record<string, unknown>): string => {
    const folder = join(models, name)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'model.json'), JSON.stringify(manifest))
    return folder
  }

  it('are refused, with the other Mac and what to do', () => {
    expect(foreignRefusal({ plan: { ram_gb: 24 } }, HERE, 'Juggernaut'))
      .toBe('Juggernaut was imported on another Mac (24 GB) and copied here: import it again on this Mac from its file, or remove it (Models).')
    const folder = model('Copied', { name: 'Copied', display_name: 'My FLUX', imported_on: { machine: 'bbbbbbbbbbbbbbbb' } })
    expect(foreignRefusalOf(folder, HERE)).toBe('My FLUX was imported on another Mac and copied here: import it again on this Mac from its file, or remove it (Models).')
  })

  it('start for a model imported here, an older one of this Mac and a folder without a model', () => {
    expect(foreignRefusalOf(model('Here', { name: 'Here', imported_on: { machine: HERE.machine, ram_gb: 16 } }), HERE)).toBeUndefined()
    expect(foreignRefusalOf(model('Older', { name: 'Older', plan: { ram_gb: 16 } }), HERE)).toBeUndefined()
    expect(foreignRefusalOf(join(models, 'none'), HERE)).toBeUndefined()
    expect(foreignRefusalOf('', HERE)).toBeUndefined()
  })
})

describe('importing a copied model again', () => {
  const there = (path: string): boolean => path === '/Users/a/Downloads/x.safetensors' || path === '/models/X/x.safetensors'

  it('takes a file that is still there, a Hugging Face repository or a Civitai page', () => {
    expect(reimportRequest({ source: { type: 'file', ref: '/Users/a/Downloads/x.safetensors', file: null }, quant_request: 'q8' }, '/models/X', there))
      .toEqual({ source: 'file', ref: '/Users/a/Downloads/x.safetensors', quant: 'q8' })
    expect(reimportRequest({ source: { type: 'hf', ref: 'org/repo', file: 'model.safetensors' } }, '/models/X', there))
      .toEqual({ source: 'hf', ref: 'org/repo', file: 'model.safetensors', quant: 'auto' })
    expect(reimportRequest({ source: { type: 'hf', ref: 'org/repo', file: null } }, '/models/X', there))
      .toEqual({ source: 'hf', ref: 'org/repo', file: undefined, quant: 'auto' })
    expect(reimportRequest({ source: { type: 'civitai', ref: 'https://civitai.com/models/1?modelVersionId=2' } }, '/models/X', there))
      .toEqual({ source: 'civitai', ref: 'https://civitai.com/models/1?modelVersionId=2', quant: 'auto' })
  })

  it('has nothing to take when the file is gone, inside the model itself, or the source is unknown', () => {
    expect(reimportRequest({ source: { type: 'file', ref: '/Users/a/Downloads/gone.safetensors' } }, '/models/X', there)).toBeUndefined()
    expect(reimportRequest({ source: { type: 'file', ref: '/models/X/x.safetensors' } }, '/models/X', there)).toBeUndefined()
    expect(reimportRequest({ source: { type: 'merge', base: 'Tiny' } }, '/models/X', there)).toBeUndefined()
    expect(reimportRequest({}, '/models/X', there)).toBeUndefined()
  })
})
