// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { CURATED, GROUPS, importRequest, installedAs, licencePage, memoryFit } from './curated'
import type { Asset } from '@shared/types'

const asset = (name: string, source?: Asset['source']): Asset => ({
  id: 'model:' + name, title: name, name, folder: '/models/' + name, type: 'model', source,
  meta: { arch: 'sd15', family: 'sd1', label: '', runtime: 'diffusers', kind: 'image' },
})

describe('recommended models', () => {
  it('is a complete list', () => {
    expect(CURATED.length).toBeGreaterThan(20)
    const groups = GROUPS.map((g) => g.id)
    for (const m of CURATED) {
      expect(groups).toContain(m.group)
      expect(m.ref && m.title && m.description).toBeTruthy()
      expect(m.nsfw).toBe(m.group === 'nsfw')
    }
    expect(new Set(CURATED.map((m) => m.id)).size).toBe(CURATED.length)
  })

  it('recognises an installed recommendation', () => {
    const sd = CURATED.find((m) => m.id === 'SD-1.5')!
    const gguf = CURATED.find((m) => m.id === 'FLUX.1-schnell-Q8')!
    expect(installedAs(sd, [asset('SD-1.5')])?.title).toBe('SD-1.5')
    expect(installedAs(sd, [asset('mine', { type: 'hf', ref: sd.ref, file: null })])?.title).toBe('mine')
    expect(installedAs(gguf, [asset('other', { type: 'hf', ref: gguf.ref, file: 'flux1-schnell-Q4_K_S.gguf' })])).toBeUndefined()
    expect(installedAs(CURATED.find((m) => m.id === 'DreamShaper-8')!, [asset('Lykon_dreamshaper-8_SD1')])).toBeDefined()
    expect(installedAs(sd, [])).toBeUndefined()
  })

  it('knows what to import and where the licence is', () => {
    const gguf = CURATED.find((m) => m.id === 'FLUX.1-schnell-Q8')!
    expect(importRequest(gguf)).toEqual({ source: 'hf', ref: 'city96/FLUX.1-schnell-gguf', file: 'flux1-schnell-Q8_0.gguf', name: 'FLUX.1-schnell-Q8' })
    expect(licencePage(gguf)).toBe('https://huggingface.co/city96/FLUX.1-schnell-gguf')
  })

  it('says streamed where only SSD streaming makes a model fit', () => {
    // FLUX.1 [dev] 16 bit: in memory from 24 GB, streamed on a 16 GB Mac (Mac mini M4), not on 8 GB
    const flux = CURATED.find((m) => m.id === 'FLUX.1-dev')!
    expect(memoryFit(flux, 24)).toBe('memory')
    expect(memoryFit(flux, 16)).toBe('streamed')
    expect(memoryFit(flux, 8)).toBe('none')
  })

  it('streams GGUF files too (unpacked into the stream cache once)', () => {
    const gguf = CURATED.find((m) => m.id === 'FLUX.1-schnell-Q8')!
    expect(memoryFit(gguf, 24)).toBe('memory')
    expect(memoryFit(gguf, 16)).toBe('streamed')
    expect(memoryFit(gguf, 8)).toBe('none')
  })
})
