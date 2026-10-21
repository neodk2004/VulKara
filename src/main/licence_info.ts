// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The licence of an installed model or LoRA, read from where it came from: the permissions its makers set on
// Civitai, or the licence in its Hugging Face model card. A file without a known origin is looked up on Civitai by
// its SHA-256. Kept next to the model as licence.json, so it goes to the Trash with it and comes back with it.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { TERMS, type Allowed } from '@shared/licence_terms'
import type { AssetLicence } from '@shared/api'
import { infoSource } from './lora_info'

type Raw = Record<string, unknown>

const CACHE = 'licence.json'

/** A Fetcher that says "not found" by returning undefined instead of throwing. */
export type LicenceFetcher = (url: string, headers: Record<string, string>) => Promise<string | undefined>

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** What the permissions a model's makers chose on Civitai allow. */
export function fromCivitai(model: Raw, version: Raw): AssetLicence {
  const uses = Array.isArray(model.allowCommercialUse) ? (model.allowCommercialUse as unknown[]).map(String)
    : typeof model.allowCommercialUse === 'string' ? [model.allowCommercialUse] : []
  const named = uses.filter((u) => u && u !== 'None')
  const images: Allowed = named.includes('Image') ? 'yes' : 'no'
  const id = num(model.id) ?? num(version.modelId)
  const notes = [
    'Commercial use the makers allow: ' + (named.length ? named.join(', ') : 'none') + '.',
    'Selling generated pictures: ' + (images === 'yes' ? 'allowed' : 'not allowed') + '.',
    'Sharing merges: ' + (model.allowDerivatives === false ? 'not allowed' : 'allowed') + '.',
  ]
  if (model.allowNoCredit === false) notes.push('Credit to the makers is required.')
  return {
    source: 'civitai',
    page: id ? `https://civitai.com/models/${id}${num(version.id) ? `?modelVersionId=${num(version.id)}` : ''}` : undefined,
    name: typeof model.name === 'string' ? model.name : undefined,
    licence: "Civitai model licence (the makers' permissions)",
    licenceUrl: id ? `https://civitai.com/models/${id}` : undefined,
    model: named.some((u) => u === 'Rent' || u === 'RentCivit' || u === 'Sell') ? 'limited' : 'no',
    outputs: images,
    note: notes.join(' '),
    baseModel: typeof version.baseModel === 'string' ? version.baseModel : undefined,
    fetchedAt: Date.now(),
  }
}

/** The licence a Hugging Face model card names (front matter: license, license_name, license_link). */
export function fromHuggingFace(repo: string, api: Raw): AssetLicence {
  const card = (api.cardData ?? {}) as Raw
  const tag = (Array.isArray(api.tags) ? (api.tags as unknown[]).map(String) : []).find((t) => t.startsWith('license:'))?.slice(8)
  const id = String(card.license ?? tag ?? '').toLowerCase()
  const name = typeof card.license_name === 'string' ? card.license_name.toLowerCase() : ''
  const terms = TERMS[id] ?? TERMS[name]
  const link = typeof card.license_link === 'string' ? card.license_link : undefined
  const base = Array.isArray(card.base_model) ? String(card.base_model[0] ?? '') : typeof card.base_model === 'string' ? card.base_model : undefined
  return {
    source: 'huggingface', page: `https://huggingface.co/${repo}`, name: repo.split('/').pop(),
    licence: terms?.name ?? (name || id || undefined),
    licenceUrl: terms?.url ?? (link && /^https?:/.test(link) ? link : link ? `https://huggingface.co/${repo}/blob/main/${link}` : undefined),
    model: terms?.model ?? 'unknown', outputs: terms?.outputs ?? 'unknown',
    note: terms?.note || (id || name ? 'Read the licence on its page for what it allows.' : 'Its model card names no licence.'),
    baseModel: base, fetchedAt: Date.now(),
  }
}

/** The Hugging Face repository a folder name like "Lykon_dreamshaper-8_SD1" stands for (owner, repo, family). */
export function repoFromFolderName(name: string): string | undefined {
  const m = /^([A-Za-z0-9][\w.-]*?)_([\w.-]+?)(?:_(?:SD1|SD2|SDXL|SD3|FLUX))?$/.exec(name)
  return m && !m[1].includes('_') ? `${m[1]}/${m[2]}` : undefined
}

/**
 * The page of a model whose origin is not known, as the user names it: a Civitai link (models/<id>, optionally with
 * modelVersionId) or a Hugging Face repository / link. Written into its manifest; returns false for other links.
 */
export function setOrigin(folder: string, manifestName: string, link: string): boolean {
  const text = link.trim()
  const civitai = /civitai\.com\/models\/(\d+)/.exec(text)
  const version = /modelVersionId=(\d+)/.exec(text)
  const hf = /^(?:https?:\/\/huggingface\.co\/)?([\w.-]+\/[\w.-]+?)(?:\/(?:tree|blob|resolve)\/.*)?\/?$/.exec(text)
  if (!civitai && !hf) return false
  const file = join(folder, manifestName)
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Raw
  delete manifest.huggingface_repo
  if (civitai) manifest.civitai = { ...((manifest.civitai ?? {}) as Raw), model_id: Number(civitai[1]), version_id: version ? Number(version[1]) : undefined }
  else manifest.huggingface_repo = hf![1]
  writeFileSync(file + '.tmp', JSON.stringify(manifest, null, 1))
  renameSync(file + '.tmp', file)
  return true
}

export function cachedLicence(folder: string): AssetLicence | undefined {
  try {
    return existsSync(join(folder, CACHE)) ? (JSON.parse(readFileSync(join(folder, CACHE), 'utf8')) as AssetLicence) : undefined
  } catch {
    return undefined
  }
}

/** Reads the licence from the model's origin and keeps it in its folder. */
export async function fetchLicence(folder: string, manifestName: string, fetcher: LicenceFetcher, tokens: { civitai?: string; huggingface?: string }, hashLookups = false): Promise<AssetLicence> {
  const manifest = JSON.parse(readFileSync(join(folder, manifestName), 'utf8')) as Raw
  const from = infoSource(manifest)
  const civitaiHeaders: Record<string, string> = tokens.civitai ? { Authorization: `Bearer ${tokens.civitai}` } : {}
  const json = async (url: string, headers: Record<string, string>): Promise<Raw | undefined> => {
    const text = await fetcher(url, headers)
    return text === undefined ? undefined : (JSON.parse(text) as Raw)
  }
  let result: AssetLicence | undefined
  if (from.civitai) {
    let version: Raw = {}
    let modelId = from.civitai.modelId
    if (from.civitai.versionId) {
      version = (await json(`https://civitai.com/api/v1/model-versions/${from.civitai.versionId}`, civitaiHeaders)) ?? {}
      modelId ??= num(version.modelId)
    }
    const model = modelId ? await json(`https://civitai.com/api/v1/models/${modelId}`, civitaiHeaders) : undefined
    if (model) result = fromCivitai({ ...model, id: modelId }, version)
  } else if (from.huggingface) {
    const headers: Record<string, string> = tokens.huggingface ? { Authorization: `Bearer ${tokens.huggingface}` } : {}
    const api = await json(`https://huggingface.co/api/models/${from.huggingface}`, headers)
    if (api) result = fromHuggingFace(from.huggingface, api)
  } else {
    // only when the user allowed it: the checksum tells Civitai which files are on this Mac
    if (hashLookups && typeof manifest.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(manifest.sha256)) {
      // a file without a known origin: Civitai knows its files by their checksum
      const version = await json(`https://civitai.com/api/v1/model-versions/by-hash/${manifest.sha256}`, civitaiHeaders)
      const modelId = version ? num(version.modelId) : undefined
      const model = modelId ? await json(`https://civitai.com/api/v1/models/${modelId}`, civitaiHeaders) : undefined
      if (version && model) result = fromCivitai({ ...model, id: modelId }, version)
    }
    // a converted file has another checksum: a folder named like its repository ("owner_repo_SD1") still tells it
    const repo = result ? undefined : repoFromFolderName(basename(folder))
    // only a guess: a private or missing repository just means the guess was wrong
    const api = repo ? await json(`https://huggingface.co/api/models/${repo}`, {}).catch(() => undefined) : undefined
    if (repo && api) result = { ...fromHuggingFace(repo, api), guessed: true }
  }
  result ??= {
    source: 'none', model: 'unknown', outputs: 'unknown', fetchedAt: Date.now(),
    note: hashLookups
      ? 'Its origin is not known and Civitai does not know the file: the licence is on the page it came from.'
      : 'Its origin is not known: enter the link of its page, or allow looking files up on Civitai by their checksum in Settings → Privacy.',
  }
  writeFileSync(join(folder, CACHE), JSON.stringify(result, null, 1))
  return result
}
