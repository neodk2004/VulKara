// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { mlxOrDiffusers, type EngineListener } from './mlx_fallback'

type Event = Parameters<EngineListener>[0]

function setup(diffusers = true) {
  const seen: Event[] = []
  let handedOver = 0
  const wrapped = mlxOrDiffusers((e) => seen.push(e), () => diffusers, () => { handedOver++ })
  return { wrapped, seen, handedOver: () => handedOver }
}

describe('MLX hands over to Diffusers', () => {
  it('passes the events of a job MLX runs', () => {
    const { wrapped, seen, handedOver } = setup()
    wrapped({ event: 'progress', value: 40 })
    wrapped({ event: 'result', path: '/images/a.png' })
    wrapped({ event: 'state', state: 'idle' })
    expect(seen.map((e) => e.event)).toEqual(['progress', 'result', 'state'])
    expect(handedOver()).toBe(0)
  })

  it('turns a memory refusal into a status and hands the job over once MLX is idle', () => {
    // FLUX.1 [dev] on a 16 GB Mac (Mac mini M4): MLX needs about 18 GB even in 4 bit
    const { wrapped, seen, handedOver } = setup()
    wrapped({ event: 'error', message: 'FLUX.1 [dev] needs about 18 GB RAM' })
    expect(seen.some((e) => e.event === 'status')).toBe(true)
    expect(seen.some((e) => e.event === 'note')).toBe(false)
    expect(seen.some((e) => e.event === 'error')).toBe(false)
    expect(handedOver()).toBe(0)
    wrapped({ event: 'state', state: 'idle' })  // the end of the refused job: not passed on, the job goes on
    expect(seen.some((e) => e.event === 'state')).toBe(false)
    expect(handedOver()).toBe(1)
  })

  it('also hands over when the MLX process ends after refusing', () => {
    const { wrapped, handedOver } = setup()
    wrapped({ event: 'error', message: 'Krea 2 needs about 19 GB RAM' })
    wrapped({ event: 'exit', message: 'stopped' })
    expect(handedOver()).toBe(1)
  })

  it('passes other errors, and a refusal when Diffusers is not installed', () => {
    const a = setup()
    a.wrapped({ event: 'error', message: 'The LoRA x does not fit this model' })
    expect(a.seen).toEqual([{ event: 'error', message: 'The LoRA x does not fit this model' }])
    const b = setup(false)
    b.wrapped({ event: 'error', message: 'FLUX.1 [dev] needs about 18 GB RAM' })
    b.wrapped({ event: 'state', state: 'idle' })
    expect(b.seen.map((e) => e.event)).toEqual(['error', 'state'])
    expect(b.handedOver()).toBe(0)
  })
})
