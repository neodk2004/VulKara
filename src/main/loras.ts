// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Looking after LoRAs: what a LoRA was trained with (read from the header of its file), its trigger words and
// category (kept in its manifest), renaming.

import { closeSync, existsSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LoraDetails, LoraTraining } from '@shared/api'

const MANIFEST = 'lora.json'
type Raw = Record<string, unknown>

/** The metadata in the header of a .safetensors file (8 bytes length, then JSON); only the header is read. */
export function safetensorsMetadata(file: string): Record<string, string> {
  const fd = openSync(file, 'r')
  try {
    const lengthBytes = Buffer.alloc(8)
    readSync(fd, lengthBytes, 0, 8, 0)
    const length = Number(lengthBytes.readBigUInt64LE(0))
    if (!(length > 0 && length < 100 * 1024 * 1024)) return {}
    const header = Buffer.alloc(length)
    readSync(fd, header, 0, length, 8)
    return (JSON.parse(header.toString('utf8')).__metadata__ ?? {}) as Record<string, string>
  } finally {
    closeSync(fd)
  }
}

/** What a LoRA was trained with, from the metadata the common trainers (kohya, ai-toolkit) write. */
export function trainingSummary(meta: Record<string, string>): LoraTraining {
  const json = (key: string): unknown => {
    try {
      return JSON.parse(meta[key] || 'null')
    } catch {
      return null
    }
  }
  const num = (v: unknown): number | undefined => (v === undefined || v === null || v === '' || v === 'None' || Number.isNaN(Number(v)) ? undefined : Number(v))
  const tags: Record<string, number> = {}
  for (const set of Object.values((json('ss_tag_frequency') ?? {}) as Record<string, Record<string, number>>))
    for (const [tag, n] of Object.entries(set ?? {})) if (tag.trim()) tags[tag.trim()] = (tags[tag.trim()] ?? 0) + n
  const dirs = (json('ss_dataset_dirs') ?? {}) as Record<string, { img_count?: number }>
  const images = Object.values(dirs).reduce((sum, d) => sum + (d?.img_count ?? 0), 0) || num(meta.ss_num_train_images)
  const finished = num(meta.ss_training_finished_at)
  return {
    title: meta['modelspec.title'] || meta.ss_output_name || meta.name || undefined,
    base: meta.ss_base_model_version || meta['modelspec.architecture'] || meta.ss_sd_model_name || undefined,
    network: [meta.ss_network_module, meta.ss_network_dim && `dim ${meta.ss_network_dim}`, meta.ss_network_alpha && `alpha ${meta.ss_network_alpha}`]
      .filter(Boolean).join(', ') || undefined,
    resolution: meta['modelspec.resolution'] || meta.ss_resolution || undefined,
    images: images || undefined,
    epochs: num(meta.ss_epoch),
    steps: num(meta.ss_max_train_steps) ?? num(meta.ss_steps),
    learningRate: num(meta.ss_learning_rate) ?? num(meta.ss_unet_lr),
    trained: finished ? new Date(finished * 1000).toISOString().slice(0, 10) : (meta['modelspec.date'] ?? '').slice(0, 10) || undefined,
    software: meta.software ? String(meta.software).slice(0, 80) : meta.ss_sd_scripts_commit_hash ? 'kohya sd-scripts' : undefined,
    topTags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 15),
  }
}

function readManifest(folder: string): Raw {
  return JSON.parse(readFileSync(join(folder, MANIFEST), 'utf8')) as Raw
}

function writeManifest(folder: string, manifest: Raw): void {
  const file = join(folder, MANIFEST)
  writeFileSync(file + '.tmp', JSON.stringify(manifest, null, 1))
  renameSync(file + '.tmp', file)
}

export function loraDetails(folder: string): LoraDetails {
  const manifest = readManifest(folder)
  const file = join(folder, String(manifest.file ?? 'lora.safetensors'))
  const source = (manifest.source ?? {}) as Raw
  const civitai = (source.type === 'civitai' ? source : manifest.civitai ?? {}) as Raw
  let training: LoraTraining | undefined
  try {
    training = trainingSummary(safetensorsMetadata(file))
  } catch {
    training = undefined  // not a safetensors file, or unreadable
  }
  return {
    sizeMb: existsSync(file) ? Math.round(statSync(file).size / 1048576) : 0,
    paramsM: typeof manifest.params_m === 'number' ? manifest.params_m : undefined,
    triggerSource: manifest.trigger_words_source === 'user' ? 'user' : civitai.model_id ? 'civitai' : 'training',
    page: civitai.model_id ? `https://civitai.com/models/${civitai.model_id}${civitai.version_id ? `?modelVersionId=${civitai.version_id}` : ''}` : undefined,
    pageName: typeof (manifest.civitai as Raw | undefined)?.name === 'string' ? String((manifest.civitai as Raw).name) : undefined,
    training,
  }
}

export function setTriggerWords(folder: string, words: string[]): string[] {
  const clean = [...new Set(words.filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim()))].slice(0, 30)
  const manifest = readManifest(folder)
  manifest.trigger_words = clean
  manifest.trigger_words_source = 'user'
  writeManifest(folder, manifest)
  return clean
}

export function setCategory(folder: string, category: string): void {
  const manifest = readManifest(folder)
  const clean = String(category ?? '').trim().slice(0, 40)
  if (clean) manifest.user_category = clean
  else delete manifest.user_category
  writeManifest(folder, manifest)
}

/** A name a LoRA folder can have: letters, digits, dot, underscore and hyphen. */
export const safeName = (name: string): string =>
  String(name ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/\.\.+/g, '_').replace(/^[._]+|[._]+$/g, '')
