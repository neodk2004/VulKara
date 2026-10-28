// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Benchmarks of single models (Hardware page): pictures through the normal queue, so they run as any picture does
// (the same runtime, memory plan and settings), with the seconds per step, the whole time and what the Mac's memory
// did meanwhile (the peaks of the monitor's 2 s samples, the footprint of the app and its engines, the swap). Kept in
// benchmarks.json in the data folder, newest first.

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { BenchmarkPhase, BenchmarkRun, QueuedJob, SystemStats } from '@shared/api'
import type { Job } from '@shared/types'

const MAX_RUNS = 200
const MAX_PHASES = 20
const open = (r: BenchmarkRun): boolean => r.state === 'waiting' || r.state === 'running'
const round = (n: number, digits = 2): number => Math.round(n * 10 ** digits) / 10 ** digits
/** a status that counts up ("Preparing SSD streaming (once) 28%") without its figure: one phase */
const withoutFigure = (s: string): string => s.replace(/\s*\d+([.,]\d+)?\s*%$/, '')

export class Benchmarks {
  private runs: BenchmarkRun[] = []
  private stats?: SystemStats
  /** the jobs started together (one Measure), by each of their ids: stopping one stops them all */
  private batches = new Map<string, string[]>()
  /** the page-ins and swap-ins when each running job started (GB since the Mac started) */
  private readStart = new Map<string, { disk: number; swap: number }>()

  /** build: the app's version and code state; starting: the queue's own first status, which tells nothing */
  constructor(
    private readonly file: () => string,
    private readonly changed: (runs: BenchmarkRun[]) => void,
    private readonly build = '',
    private readonly starting: () => string = () => '',
  ) {
    try {
      const runs: unknown = JSON.parse(readFileSync(file(), 'utf8'))
      // runs of the first version kept the status lines without their times
      if (Array.isArray(runs))
        this.runs = (runs as (BenchmarkRun & { statuses?: string[] })[]).map(({ statuses, ...r }) =>
          ({ ...r, phases: r.phases ?? (statuses ?? []).map((text): BenchmarkPhase => ({ text, at: 0, seconds: -1 })) }))
    } catch {
      // none yet, or unreadable: a fresh list
    }
    // a stopped run measured nothing whole; one the app was closed during never ends now
    this.runs = this.runs.filter((r) => !open(r) && r.state !== 'cancelled')
  }

  list(): BenchmarkRun[] {
    return this.runs
  }

  /** New queue jobs (ids) of this job are measured from now on. */
  track(ids: string[], job: Omit<Job, 'id'>, model: string, now: number): void {
    const totalGb = this.stats?.totalGb ?? 0
    this.runs.unshift(...ids.map((id): BenchmarkRun => ({
      id, at: now, model, ...(this.build ? { build: this.build } : {}), width: job.width, height: job.height, steps: job.steps, state: 'waiting',
      peakAppGb: 0, peakUsedGb: 0, peakSwapGb: 0, totalGb, phases: [],
    })))
    this.runs.splice(MAX_RUNS)
    for (const id of ids) this.batches.set(id, ids)
    for (const id of this.batches.keys()) if (!this.runs.some((r) => r.id === id)) this.batches.delete(id)  // runs gone
    this.save()
  }

  /** The other jobs of the benchmark a job belongs to that still wait or run; none for a job of another page. */
  together(id: string): string[] {
    const ids = this.batches.get(id) ?? []
    return this.runs.filter((r) => r.id !== id && ids.includes(r.id) && open(r)).map((r) => r.id)
  }

  clear(): void {
    this.runs = this.runs.filter(open)
    this.save()
  }

  /** A snapshot of the queue: states, the engine's status lines as timed phases and the end of each job. */
  observe(jobs: QueuedJob[], now: number): void {
    let changed = false
    for (const r of this.runs.filter(open)) {
      const q = jobs.find((j) => j.job.id === r.id)
      if (!q) {
        r.state = 'cancelled'  // removed from the queue while it waited; dropped below
        changed = true
        continue
      }
      if (q.state === 'waiting') continue
      if (r.state === 'waiting') {
        r.state = 'running'
        r.swapStartGb = this.stats ? round(this.stats.swapGb) : undefined
        if (this.stats) this.readStart.set(r.id, { disk: this.stats.pageinsGb, swap: this.stats.swapinsGb })
        this.sampleRun(r)
        changed = true
      }
      const last = r.phases[r.phases.length - 1]
      if (last) last.seconds = round((now - last.at) / 1000, 1)
      if (q.status && q.status !== this.starting() && last?.text !== q.status) {
        if (last && withoutFigure(last.text) === withoutFigure(q.status)) last.text = q.status
        else if (r.phases.length < MAX_PHASES) r.phases.push({ text: q.status, at: now, seconds: 0 })
        changed = true
      }
      if (q.secondsPerStep && q.secondsPerStep !== r.secondsPerStep) r.secondsPerStep = q.secondsPerStep
      const waited = q.waited?.map((w) => ({ ...w, seconds: round(w.seconds, 1), gb: round(w.gb) }))
      if (waited && JSON.stringify(waited) !== JSON.stringify(r.waited)) {
        r.waited = waited
        changed = true
      }
      if (q.footprint && JSON.stringify(q.footprint) !== JSON.stringify(r.footprint)) {
        r.footprint = q.footprint
        changed = true
      }
      if (q.precision && q.precision !== r.precision) {
        r.precision = q.precision
        changed = true
      }
      if (q.state !== 'running') {
        r.state = q.state
        r.error = q.error
        r.note = q.job.note
        r.result = q.results[0]
        if (q.startedAt && q.finishedAt) r.seconds = round((q.finishedAt - q.startedAt) / 1000, 1)
        this.sampleRun(r)  // read back up to the last sample
        this.readStart.delete(r.id)
        if (last && q.finishedAt) last.seconds = round((q.finishedAt - last.at) / 1000, 1)
        changed = true
      }
    }
    if (changed) {
      // a stopped run measured nothing whole: it leaves the list
      this.runs = this.runs.filter((r) => r.state !== 'cancelled')
      this.save()
    }
  }

  get running(): boolean {
    return this.runs.some((r) => r.state === 'running')
  }

  /** The monitor's sample (every 2 s): the peaks of the running job; appGb: the footprint of the app and its engines
   *  where it was measured (with what the GPU holds), else the resident size of the sample. */
  sample(stats: SystemStats, appGb?: number): void {
    this.stats = stats
    const running = this.runs.filter((r) => r.state === 'running')
    for (const r of running) this.sampleRun(r, appGb)
    if (running.length) this.changed(this.runs)
  }

  private sampleRun(r: BenchmarkRun, appGb?: number): void {
    // the running phase's time moves on also while the engine says nothing (quantizing, preparing the stream cache)
    const last = r.phases[r.phases.length - 1]
    if (last) last.seconds = round((Date.now() - last.at) / 1000, 1)
    const s = this.stats
    if (!s) return
    r.peakAppGb = Math.max(r.peakAppGb, round(appGb ?? s.appGb))
    r.peakUsedGb = Math.max(r.peakUsedGb, round(s.usedGb))
    r.peakSwapGb = Math.max(r.peakSwapGb, round(s.swapGb))
    const start = this.readStart.get(r.id)
    if (start) {
      r.diskReadGb = round(Math.max(0, s.pageinsGb - start.disk))
      r.swapReadGb = round(Math.max(0, s.swapinsGb - start.swap))
    }
    r.totalGb = round(s.totalGb, 1)
  }

  private save(): void {
    try {
      writeFileSync(this.file() + '.tmp', JSON.stringify(this.runs))
      renameSync(this.file() + '.tmp', this.file())
    } catch {
      // the data folder is not writable: the runs stay for this session
    }
    this.changed(this.runs)
  }
}
