// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Steps and guidance that do not suit the chosen model. Switching the model keeps them (job_form applyModel), so a
// value meant for one model can end up on a distilled one: FLUX.1 [schnell] at 18 steps and guidance 6.2 takes
// four times as long for no better picture. The model's own defaults (model.json, set by the import from the
// architecture and the model's name) tell what it is made for:
//   - few default steps (12 or fewer) mark a distilled or turbo model; more than twice as many only take longer
//   - what guidance does, per architecture and runtime (engines/diffusers/engine.py, engines/mlx/main.py):
//     FLUX.1 [schnell] has none at all; a distilled FLUX.2 [klein] ignores it (diffusers; MLX up to 8 steps);
//     Z-Image-Turbo on MLX runs with its Turbo config, guidance forced to 0. Other distilled models made for
//     guidance 1 or less (SDXL Turbo, Z-Image-Turbo with Diffusers, Chroma1-Flash, Qwen-Image Lightning, Wan 2.2
//     14B) do guide above 1: two passes per step, about twice the time.
// Values of 1 and below count as guidance off throughout the app. FLUX.1 [dev] and FLUX.2 [dev] take guidance as an
// embedding (no second pass), so their families are left out of the "twice" rule.

import type { ModelMeta } from '@shared/types'
import { t } from '../i18n'

export interface FitHint {
  text: string
  /** the button that sets the model's own value */
  fix: { label: string; value: number }
}

/** steps a distilled model is made for at most */
const DISTILLED_STEPS = 12
/** guidance at or below this is off */
const OFF = 1
const EMBEDDED_GUIDANCE = ['flux1', 'flux2']

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** A hint when the steps are far above what a distilled model is made for, else null. */
export function stepsHint(meta: ModelMeta | undefined, steps: number): FitHint | null {
  const made = num(meta?.defaults?.num_steps)
  if (made === undefined || made > DISTILLED_STEPS || !(steps > 2 * made)) return null
  return { text: t('generate.fit.steps', { n: made }), fix: { label: t('generate.fit.useSteps', { n: made }), value: made } }
}

/** A hint when the guidance has no effect on the model, or doubles the time of one made without it, else null. */
export function guidanceHint(meta: ModelMeta | undefined, guidance: number, steps: number): FitHint | null {
  const made = num(meta?.defaults?.guidance_scale)
  const madeSteps = num(meta?.defaults?.num_steps)
  if (!meta || made === undefined || madeSteps === undefined || !(guidance > OFF)) return null
  const fix = { label: t('generate.fit.useGuidance', { n: made }), value: made }
  const distilled = made <= OFF && madeSteps <= DISTILLED_STEPS
  const ignored = meta.arch === 'flux1_schnell'
    || (meta.arch === 'flux2_klein' && distilled && (meta.runtime !== 'mlx' || steps <= 8))
    || (meta.arch === 'z_image' && distilled && meta.runtime === 'mlx')
  if (ignored) {
    if (meta.arch === 'flux1_schnell') return { text: t('generate.fit.noGuidance', { name: meta.label || 'FLUX.1 [schnell]' }), fix } // i18n-ok
    return { text: meta.label ? t('generate.fit.distilledNoGuidance', { name: meta.label }) : t('generate.fit.distilledModelNoGuidance'), fix }
  }
  if (distilled && meta.runtime !== 'mlx' && !EMBEDDED_GUIDANCE.includes(meta.family)) {
    return { text: t('generate.fit.withoutGuidance', { off: OFF }), fix }
  }
  return null
}
