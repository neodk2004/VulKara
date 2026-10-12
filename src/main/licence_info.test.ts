// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cachedLicence, fetchLicence, fromCivitai, fromHuggingFace, repoFromFolderName, setOrigin, type LicenceFetcher } from './licence_info'
import { baseLicence, stricter } from '@shared/licence_terms'

function folder(manifest: Record<string, unknown>, name = 'model.json'): string {
  const dir = mkdtempSync(join(tmpdir(), 'vk-licence-'))
  writeFileSync(join(dir, name), JSON.stringify(manifest))
  return dir
}

/** answers from a table of URLs; anything else is "not found" */
const fake = (pages: Record<string, unknown>, asked: string[] = []): LicenceFetcher => async (url) => {
  asked.push(url)
  return url in pages ? JSON.stringify(pages[url]) : undefined
}

describe('licences of installed models', () => {
  it('reads the permissions of the makers on Civitai', () => {
    const l = fromCivitai({ id: 133005, name: 'Juggernaut XL', allowCommercialUse: ['Image', 'RentCivit'], allowDerivatives: true, allowNoCredit: false }, { id: 7, baseModel: 'SDXL 1.0' })
    expect(l).toMatchObject({ source: 'civitai', model: 'limited', outputs: 'yes', baseModel: 'SDXL 1.0', page: 'https://civitai.com/models/133005?modelVersionId=7' })
    expect(l.note).toContain('Credit to the makers is required.')
    expect(fromCivitai({ id: 1, allowCommercialUse: 'None' }, {})).toMatchObject({ model: 'no', outputs: 'no' })
  })

  it('reads the licence of a Hugging Face model card', () => {
    expect(fromHuggingFace('a/b', { cardData: { license: 'apache-2.0' } })).toMatchObject({ licence: 'Apache License 2.0', model: 'yes', outputs: 'yes' })
    const other = fromHuggingFace('bfl/dev', { cardData: { license: 'other', license_name: 'flux-1-dev-non-commercial-license', base_model: ['x/y'] } })
    expect(other).toMatchObject({ licence: 'FLUX.1 [dev] Non-Commercial License', model: 'no', outputs: 'yes', baseModel: 'x/y' })
    const unknown = fromHuggingFace('a/c', { cardData: { license: 'other', license_name: 'my-licence', license_link: 'LICENSE.md' } })
    expect(unknown).toMatchObject({ licence: 'my-licence', model: 'unknown', licenceUrl: 'https://huggingface.co/a/c/blob/main/LICENSE.md' })
  })

  it('does not send the checksum of a file without origin unless the user allowed it', async () => {
    const dir = folder({ source: { type: 'file', ref: '' }, sha256: 'c'.repeat(64) })
    const asked: string[] = []
    const l = await fetchLicence(dir, 'model.json', fake({}, asked), {})
    expect(asked.some((u) => u.includes('/by-hash/'))).toBe(false)
    expect(l.note).toContain('Settings → Privacy')
  })

  it('looks a file without origin up on Civitai by its checksum (when allowed) and keeps the answer in its folder', async () => {
    const sha = 'b'.repeat(64)
    const dir = folder({ source: { type: 'file', ref: '' }, sha256: sha })
    const asked: string[] = []
    const l = await fetchLicence(dir, 'model.json', fake({
      [`https://civitai.com/api/v1/model-versions/by-hash/${sha}`]: { id: 9, modelId: 42, baseModel: 'SD 1.5' },
      'https://civitai.com/api/v1/models/42': { name: 'DreamShaper', allowCommercialUse: ['Image', 'Sell'] },
    }, asked), {}, true)
    expect(asked[0]).toContain('/by-hash/')
    expect(l).toMatchObject({ source: 'civitai', name: 'DreamShaper', model: 'limited', outputs: 'yes', baseModel: 'SD 1.5' })
    expect(cachedLicence(dir)).toMatchObject({ name: 'DreamShaper' })
  })

  it('says so when the origin is not known, and keeps that too', async () => {
    const dir = folder({ source: { type: 'file', ref: '' } }, 'lora.json')
    const l = await fetchLicence(dir, 'lora.json', fake({}), {})
    expect(l).toMatchObject({ source: 'none', model: 'unknown', outputs: 'unknown' })
    expect(existsSync(join(dir, 'licence.json'))).toBe(true)
  })

  it('uses the ids of a Civitai import and the model card of a Hugging Face one', async () => {
    const civ = folder({ source: { type: 'civitai', model_id: 5, version_id: 6 } })
    expect(await fetchLicence(civ, 'model.json', fake({
      'https://civitai.com/api/v1/model-versions/6': { id: 6, modelId: 5, baseModel: 'Flux.1 D' },
      'https://civitai.com/api/v1/models/5': { allowCommercialUse: [] },
    }), {})).toMatchObject({ source: 'civitai', model: 'no', outputs: 'no', baseModel: 'Flux.1 D' })
    const hf = folder({ source: { type: 'hf', ref: 'org/model' } })
    expect(await fetchLicence(hf, 'model.json', fake({ 'https://huggingface.co/api/models/org/model': { tags: ['license:mit'] } }), {}))
      .toMatchObject({ source: 'huggingface', licence: 'MIT License' })
  })

  it('knows the licences of the base models and takes the stricter answer', () => {
    expect(baseLicence('sdxl')?.terms.name).toBe('CreativeML Open RAIL++-M')
    expect(baseLicence('flux1', '', 'Flux.1 D')?.title).toBe('FLUX.1 [dev]')
    expect(baseLicence('flux1', 'flux1_schnell')?.terms.model).toBe('yes')
    expect(baseLicence('flux1')).toBeUndefined()
    expect(baseLicence('anima')?.terms.model).toBe('no')
    expect(stricter('yes', 'limited')).toBe('limited')
    expect(stricter('unknown', 'no')).toBe('no')
    expect(stricter('yes', 'unknown')).toBe('unknown')
  })

  it('guesses the repository from a folder named like it, and only uses it when it exists', async () => {
    expect(repoFromFolderName('Lykon_dreamshaper-8_SD1')).toBe('Lykon/dreamshaper-8')
    expect(repoFromFolderName('sd2-community_stable-diffusion-2-1_SD2')).toBe('sd2-community/stable-diffusion-2-1')
    expect(repoFromFolderName('JuggernautXL')).toBeUndefined()
    const root = mkdtempSync(join(tmpdir(), 'vk-licence-'))
    const dir = join(root, 'Lykon_dreamshaper-8_SD1')
    mkdirSync(dir)
    writeFileSync(join(dir, 'model.json'), JSON.stringify({ source: { type: 'file' }, sha256: 'c'.repeat(64) }))
    const l = await fetchLicence(dir, 'model.json', fake({ 'https://huggingface.co/api/models/Lykon/dreamshaper-8': { cardData: { license: 'creativeml-openrail-m' } } }), {})
    expect(l).toMatchObject({ source: 'huggingface', licence: 'CreativeML Open RAIL-M', guessed: true })
  })

  it('takes the page the user names and reads the licence there', async () => {
    const dir = folder({ source: { type: 'file' } })
    expect(setOrigin(dir, 'model.json', 'https://example.com/x')).toBe(false)
    expect(setOrigin(dir, 'model.json', 'https://civitai.com/models/133005/juggernaut-xl?modelVersionId=240840')).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8')).civitai).toEqual({ model_id: 133005, version_id: 240840 })
    expect(setOrigin(dir, 'model.json', 'https://huggingface.co/Lykon/dreamshaper-8/tree/main')).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'model.json'), 'utf8')).huggingface_repo).toBe('Lykon/dreamshaper-8')
    // the page named last decides
    const l = await fetchLicence(dir, 'model.json', fake({ 'https://huggingface.co/api/models/Lykon/dreamshaper-8': { tags: ['license:creativeml-openrail-m'] } }), {})
    expect(l.source).toBe('huggingface')
  })
})
