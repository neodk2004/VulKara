// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { QueuedJob, SystemStats } from '@shared/api'
import { Benchmarks } from './benchmark'

const job = { page: 'benchmark', prompt: 'p', modelId: 'm', modelDir: '/models/m', width: 1024, height: 1024, steps: 9, seed: 11 }
const stats = (usedGb: number, swapGb: number, appGb = 8, pageinsGb = 100, swapinsGb = 50): SystemStats => ({
  cpuPercent: 0, gpuPercent: -1, appGb, usedGb, totalGb: 16, streamCacheGb: 0, streamFreeGb: 0, streamWhere: '', swapGb, pageinsGb, swapinsGb,
})
const queued = (over: Partial<QueuedJob>): QueuedJob => ({ job: { ...job, id: 'a' }, state: 'running', progress: -1, status: '', results: [], addedAt: 0, ...over })

describe('benchmarks', () => {
  it('measures a job from the queue and the monitor: first step, per step, whole time, peaks, swap added', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bench-')), 'benchmarks.json')
    const b = new Benchmarks(() => file, () => {}, '0.7.1 abc1234 2026-10-26 15:42', () => 'Starting')
    b.sample(stats(6, 1))
    b.track(['a'], job, 'Z-Image Turbo', 1000)
    b.observe([queued({ startedAt: 2000, status: 'Starting' })], 2000)
    b.observe([queued({ startedAt: 2000, status: 'Preparing SSD streaming (once) 3%' })], 3000)
    b.observe([queued({ startedAt: 2000, status: 'Preparing SSD streaming (once) 28%' })], 60_000)
    b.observe([queued({ startedAt: 2000, status: 'Loading model (MLX, 4 bit)' })], 123_000)
    b.sample(stats(14.5, 3), 11)  // the footprint over the resident size
    b.observe([queued({ startedAt: 2000, progress: 11, status: 'Generating', precision: 'transformer 4 bit, text encoder 4 bit' })], 150_000)
    b.sample(stats(12, 2.5, 8, 145.5, 51.25))
    b.observe([queued({ startedAt: 2000, finishedAt: 302_000, state: 'done', secondsPerStep: 30.4, results: ['/p.png'],
      waited: [{ what: 'ssd_stream', seconds: 130.04, gb: 45.333 }], footprint: { peakGb: 9.1, readGb: 6.2, planGb: 8.4 } })], 302_100)
    const [r] = b.list()
    expect(r).toMatchObject({
      state: 'done', model: 'Z-Image Turbo', precision: 'transformer 4 bit, text encoder 4 bit', build: '0.7.1 abc1234 2026-10-26 15:42', secondsPerStep: 30.4, seconds: 300, peakUsedGb: 14.5, peakAppGb: 11,
      swapStartGb: 1, peakSwapGb: 3, totalGb: 16, result: '/p.png', footprint: { peakGb: 9.1, readGb: 6.2, planGb: 8.4 }, diskReadGb: 45.5, swapReadGb: 1.25, waited: [{ what: 'ssd_stream', seconds: 130, gb: 45.33 }],
    })
    // one phase per step of the work, a figure that counts up stays one phase; each with its time
    expect(r.phases.map((p) => [p.text, p.seconds])).toEqual([
      ['Preparing SSD streaming (once) 28%', 120], ['Loading model (MLX, 4 bit)', 27], ['Generating', 152],
    ])
    // kept in the data folder; a run the app was closed during, or a stopped one, is gone when it starts again
    expect(JSON.parse(readFileSync(file, 'utf8'))[0].seconds).toBe(300)
    writeFileSync(file, JSON.stringify([{ ...r, id: 'x', state: 'running' }, { ...r, id: 'y', state: 'cancelled' }, r]))
    expect(new Benchmarks(() => file, () => {}).list().map((x) => x.id)).toEqual(['a'])
  })

  it('a stopped run leaves the list; clearing keeps what still runs', () => {
    const b = new Benchmarks(() => join(mkdtempSync(join(tmpdir(), 'bench-')), 'b.json'), () => {})
    b.track(['a', 'b', 'f'], job, 'M', 0)
    // a taken out of the queue while it waited, f stopped while it ran
    b.observe([queued({ job: { ...job, id: 'b' }, state: 'waiting' }), queued({ job: { ...job, id: 'f' }, state: 'running', startedAt: 0 })], 0)
    b.observe([queued({ job: { ...job, id: 'b' }, state: 'waiting' }), queued({ job: { ...job, id: 'f' }, state: 'cancelled', startedAt: 0, finishedAt: 5 })], 5)
    expect(b.list().map((r) => [r.id, r.state])).toEqual([['b', 'waiting']])
    b.clear()
    expect(b.list().map((r) => r.id)).toEqual(['b'])
    // the pictures of one benchmark stop together; a job of another page has none
    b.track(['c', 'd', 'e'], job, 'M', 1)
    expect(b.together('c')).toEqual(['d', 'e'])
    expect(b.together('x')).toEqual([])
  })
})
