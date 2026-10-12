// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { coverage, fitView, frameFor, planFor, resizeFrame } from './canvas_plan'

const FRAME = { x: 0, y: 0, w: 1024, h: 1024 }

describe('canvas', () => {
  it('decides what to do from what lies under the frame', () => {
    expect(planFor(coverage(FRAME, []), false)).toBe('new')
    expect(planFor(coverage(FRAME, [{ x: -512, y: 0, w: 1024, h: 1024 }]), false)).toBe('extend')
    expect(coverage(FRAME, [{ x: -512, y: 0, w: 1024, h: 1024 }])).toBeCloseTo(0.5)
    expect(planFor(coverage(FRAME, [{ x: -10, y: -10, w: 2000, h: 2000 }]), false)).toBe('variation')
    expect(planFor(coverage(FRAME, [{ x: -10, y: -10, w: 2000, h: 2000 }]), true)).toBe('inpaint')
    // two pictures together cover it
    expect(planFor(coverage(FRAME, [{ x: 0, y: 0, w: 512, h: 1024 }, { x: 512, y: 0, w: 512, h: 1024 }]), false)).toBe('variation')
  })

  it('sizes the frame for a ratio and keeps its centre', () => {
    expect(frameFor({ w: 1, h: 1 }, 1024, FRAME)).toEqual(FRAME)
    expect(frameFor({ w: 16, h: 9 }, 1024, FRAME)).toEqual({ x: -160, y: 128, w: 1344, h: 768 })
    expect(frameFor({ w: 3, h: 4 }, 512, { x: 100, y: 100, w: 512, h: 512 })).toEqual({ x: 132, y: 68, w: 448, h: 576 })
  })

  it('resizes the frame from a corner in steps of 64 within its limits', () => {
    // the right lower corner 200 px further: 1216 (snapped), the left upper corner stays
    expect(resizeFrame(FRAME, 'se', 200, 0, 1024)).toEqual({ x: 0, y: 0, w: 1216, h: 1024 })
    // the left upper corner inwards: the right lower one stays where it was
    expect(resizeFrame(FRAME, 'nw', 300, 100, 1024)).toEqual({ x: 320, y: 128, w: 704, h: 896 })
    // never below 256 per side
    expect(resizeFrame(FRAME, 'se', -5000, -5000, 1024)).toMatchObject({ w: 256, h: 256 })
    // at most twice the model's pixels (SDXL: 2 × 1024²), no side above 2048
    const big = resizeFrame(FRAME, 'se', 5000, 5000, 1024)
    expect(big.w).toBeLessThanOrEqual(2048)
    expect(big.w * big.h).toBeLessThanOrEqual(2 * 1024 * 1024)
    expect(big.w % 64 + big.h % 64).toBe(0)
    // a wide drag keeps the width and gives up height
    const wide = resizeFrame(FRAME, 'se', 1024, 400, 1024)
    expect(wide).toMatchObject({ w: 2048, h: 1024 })
  })

  it('fits everything into the stage', () => {
    const v = fitView([FRAME, { x: 1024, y: 0, w: 1024, h: 1024 }], 1000, 600)
    expect(v.scale).toBeCloseTo(0.439, 2)
    expect(v.ox).toBeCloseTo(50, 0)
  })
})
