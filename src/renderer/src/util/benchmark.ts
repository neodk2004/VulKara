// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Benchmarks of single models (Hardware page): the job, the same for every model apart from its own settings, and the
// results as a Markdown table to paste into a report.

import type { BenchmarkPhase, BenchmarkRun, HardwareInfo } from '@shared/api'
import type { Asset, Job } from '@shared/types'
import { modelDefaults } from './job_form'
import { formatDuration } from './format'

export const BENCHMARK_PROMPT = 'a lighthouse on a rocky coast at dusk, photo'
export const BENCHMARK_SEED = 11

/** The model's own settings (steps, guidance, sampler, its negative prompt); size: a square edge, or 0 for its own. */
export function benchmarkJob(model: Asset, size: number): Omit<Job, 'id'> {
  const d = modelDefaults(model)
  const job: Omit<Job, 'id'> = {
    page: 'benchmark', prompt: BENCHMARK_PROMPT, modelId: model.id, modelDir: model.folder,
    width: size || d.width, height: size || d.height, steps: d.steps, guidance: d.guidance, seed: BENCHMARK_SEED,
  }
  if (d.sampler !== 'Default') job.sampler = d.sampler
  if (d.sigmaSchedule !== 'Default') job.sigmaSchedule = d.sigmaSchedule
  if (model.meta.negativePrompt && d.negativePrompt) job.negativePrompt = d.negativePrompt
  return job
}

const fixed = (n: number | undefined, digits: number): string => (n === undefined ? '' : n.toFixed(digits))

/** The swap the job added: its peak over what was in use when it started. */
export const swapGrowth = (r: BenchmarkRun): number | undefined =>
  r.swapStartGb === undefined ? undefined : Math.max(0, r.peakSwapGb - r.swapStartGb)

/** "Preparing SSD streaming (once) 100% 3:12 min"; phases of older runs have no time */
export const phaseText = (p: BenchmarkPhase): string => (p.seconds >= 0 ? `${p.text} ${formatDuration(p.seconds)}` : p.text)

/** English, like the problem report and Copy info: for pasting into an issue or the measurements. */
export function benchmarkTable(runs: BenchmarkRun[], hw?: HardwareInfo): string {
  const lines = [
    ...(hw ? [`${hw.chip}, ${hw.ramGb} GB`, ''] : []),
    '| Model | Build | Size | Steps | Bit size | s/step | Total s | Engine peak GB | Planned GB | Peak VulKara GB | Peak system GB | Swap added GB | Read from disk GB | Swap read back GB | Result | Phases |', // i18n-ok
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const r of runs) {
    const waited = (r.waited ?? []).map((w) => `waiting for ${w.what === 'ssd_stream' ? 'blocks from the SSD' : w.what} during the steps ${formatDuration(w.seconds)} (${w.gb.toFixed(1)} GB)`) // i18n-ok
    const engine = [...r.phases.map(phaseText), ...waited, ...(r.note ? [r.note] : [])].join('; ').replaceAll('|', '/').replaceAll('\n', '; ')
    lines.push(`| ${r.model.replaceAll('|', '/')} | ${r.build ?? ''} | ${r.width}×${r.height} | ${r.steps ?? ''} | ${r.precision ?? ''} | ${fixed(r.secondsPerStep, 2)} | ${fixed(r.seconds, 1)} `
      + `| ${fixed(r.footprint?.peakGb, 1)} | ${fixed(r.footprint?.planGb, 1)} | ${r.peakAppGb.toFixed(1)} | ${r.peakUsedGb.toFixed(1)} of ${r.totalGb.toFixed(0)} | ${fixed(swapGrowth(r), 2)} | ${fixed(r.diskReadGb, 2)} | ${fixed(r.swapReadGb, 2)} | ${r.state}${r.error ? `: ${r.error.replaceAll('|', '/').replaceAll('\n', ' ')}` : ''} | ${engine} |`) // i18n-ok
  }
  return lines.join('\n')
}
