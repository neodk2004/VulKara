// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loraDetails, safeName, safetensorsMetadata, setCategory, setTriggerWords, trainingSummary } from './loras'

/** A LoRA folder with a manifest and a file that has only a safetensors header. */
function lora(meta: Record<string, string> = {}, manifest: Record<string, unknown> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'vk-loras-'))
  const folder = join(root, 'style')
  mkdirSync(folder)
  const header = Buffer.from(JSON.stringify({ __metadata__: meta }))
  const length = Buffer.alloc(8)
  length.writeBigUInt64LE(BigInt(header.length))
  writeFileSync(join(folder, 'lora.safetensors'), Buffer.concat([length, header]))
  writeFileSync(join(folder, 'lora.json'), JSON.stringify({ name: 'style', file: 'lora.safetensors', family: 'sdxl', trigger_words: ['styl3'], ...manifest }))
  return folder
}

describe('loras', () => {
  it('reads what a LoRA was trained with from the header of its file', () => {
    const folder = lora({
      ss_network_module: 'networks.lora', ss_network_dim: '16', ss_network_alpha: '8', ss_resolution: '(1024, 1024)',
      ss_max_train_steps: '1500', ss_learning_rate: '0.0001', ss_training_finished_at: '1700000000',
      ss_tag_frequency: JSON.stringify({ a: { 'red dress': 12, portrait: 30 }, b: { portrait: 5 } }),
      ss_dataset_dirs: JSON.stringify({ a: { img_count: 20 }, b: { img_count: 4 } }),
    })
    expect(safetensorsMetadata(join(folder, 'lora.safetensors')).ss_network_dim).toBe('16')
    const d = loraDetails(folder)
    expect(d.training).toMatchObject({ network: 'networks.lora, dim 16, alpha 8', images: 24, steps: 1500, learningRate: 0.0001, trained: '2023-11-14' })
    expect(d.training?.topTags).toEqual([['portrait', 35], ['red dress', 12]])
    expect(d.triggerSource).toBe('training')
  })

  it('knows where a LoRA came from', () => {
    const d = loraDetails(lora({}, { source: { type: 'civitai', model_id: 12, version_id: 34 }, civitai: { name: 'Style X' }, params_m: 22 }))
    expect(d).toMatchObject({ page: 'https://civitai.com/models/12?modelVersionId=34', pageName: 'Style X', paramsM: 22, triggerSource: 'civitai' })
    expect(trainingSummary({}).topTags).toEqual([])
  })

  it('keeps trigger words and category in the manifest', () => {
    const folder = lora()
    expect(setTriggerWords(folder, [' new word ', '', 'new word', 'second'])).toEqual(['new word', 'second'])
    setCategory(folder, ' portraits ')
    const m = JSON.parse(readFileSync(join(folder, 'lora.json'), 'utf8'))
    expect(m).toMatchObject({ trigger_words: ['new word', 'second'], trigger_words_source: 'user', user_category: 'portraits' })
    expect(loraDetails(folder).triggerSource).toBe('user')
    setCategory(folder, '')
    expect('user_category' in JSON.parse(readFileSync(join(folder, 'lora.json'), 'utf8'))).toBe(false)
  })

  it('makes safe names', () => {
    expect(safeName('../my lora!')).toBe('my_lora')
  })
})
