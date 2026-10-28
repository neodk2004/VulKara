// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Samplers per model family; labels as in engines/diffusers/samplers.py and engines/comfy/workflows.py.
// Noise-predicting models (SD 1.x/2.x, SDXL) and flow-matching models (SD 3.5, FLUX) take different samplers.

import type { ModelMeta } from './types'

const NOISE = ['Euler', 'Euler a', 'DPM++ 2M', 'DPM++ 2M SDE', 'DPM++ SDE', 'UniPC', 'Heun', 'DDIM', 'LMS', 'DEIS',
  'DPM2', 'DPM2 a', 'LCM', 'TCD']
const COMFY = ['ER SDE', 'Euler', 'Euler a', 'DPM++ 2M', 'DPM++ 2M SDE', 'DPM++ SDE', 'UniPC', 'Heun', 'DDIM', 'LMS']
const FLOW = ['Euler (flow)', 'Heun (flow)', 'DPM++ 2M (flow)', 'UniPC (flow)', 'LCM (flow)']
// the FLUX, Chroma, Qwen-Image and Z-Image pipelines bring their own sigma schedule, which these samplers can not take
const FLUX_UNSUPPORTED = ['Heun (flow)', 'DPM++ 2M (flow)']
const OWN_SIGMAS = ['flux1', 'chroma', 'flux2', 'qwen_image', 'qwen_image21', 'z_image']

export const SIGMA_SCHEDULES = ['Default', 'Karras', 'Exponential', 'Beta']

/** The samplers a model can use ("Default" = the model's own), or null when it has no choice. */
export function samplersFor(meta: ModelMeta | undefined): string[] | null {
  if (!meta) return null
  let list: string[] | null = null
  if (meta.runtime === 'comfyui') list = COMFY
  else if (meta.family === 'sdxl' || meta.family === 'sd1' || meta.family === 'sd2') list = NOISE
  else if (meta.family === 'sd3') list = FLOW
  else if (OWN_SIGMAS.includes(meta.family)) list = FLOW.filter((s) => !FLUX_UNSUPPORTED.includes(s))
  if (!list) return null
  // the maker names the samplers it runs the model with: hold the picker to those, so e.g. a DPM++-only model
  // does not offer Euler. Skip it when none of them is one this family's pipeline can take (keeps a usable picker).
  if (meta.samplers?.length) {
    const only = list.filter((s) => meta.samplers!.includes(s))
    if (only.length) list = only
  }
  return ['Default', ...list]
}
