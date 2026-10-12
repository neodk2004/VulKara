// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Comparing the strengths of LoRAs: the same prompt and seed, one picture per strength and LoRA.

import type { Asset, Job } from '@shared/types'

/** "0, 0.5; 1" -> [0, 0.5, 1]: at most 8 different values between -2 and 3. */
export function parseStrengths(text: string): number[] {
  const out: number[] = []
  for (const part of String(text ?? '').split(/[,;\s]+/)) {
    const value = Number(part)
    if (part.trim() && Number.isFinite(value) && value >= -2 && value <= 3 && !out.includes(value)) out.push(value)
  }
  return out.slice(0, 8)
}

/** The jobs of a comparison. Strength 0 is one picture without any LoRA, whatever the number of LoRAs. */
export function comparisonJobs(model: Asset, loras: Asset[], strengths: number[], prompt: string, seed: number): Omit<Job, 'id'>[] {
  const d = model.meta.defaults ?? {}
  const base: Omit<Job, 'id'> = {
    page: 'lora', prompt: prompt.trim(), modelId: model.id, modelDir: model.folder,
    width: Number(d.width) || 1024, height: Number(d.height) || 1024, seed,
    steps: Number(d.num_steps) || undefined, guidance: typeof d.guidance_scale === 'number' ? d.guidance_scale : undefined,
  }
  if (model.meta.negativePrompt && typeof d.negative_prompt === 'string') base.negativePrompt = d.negative_prompt
  const jobs: Omit<Job, 'id'>[] = []
  if (strengths.includes(0)) jobs.push({ ...base, label: 'Without LoRA' /* i18n-ok: stored in English, shown by jobLabel() */ })
  for (const lora of loras)
    for (const s of strengths) if (s !== 0) jobs.push({ ...base, loras: [{ path: lora.folder, scale: s }], label: `${lora.title} × ${s}` })
  return jobs
}
