// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Templates that draw a limb where a body can not have one: every model draws an extra limb from it.
import { describe, expect, it } from 'vitest'
import { BODY_TEMPLATES } from './openpose'

describe('no template draws a limb where none can be', () => {
  it('never ends a shin between the two knees', () => {
    // A shin that runs along the floor and stops between the knees is read by every model as a third lower leg.
    // Seen from the front, a shin that points back is a short stub behind its own knee, never a line across.
    const bad: string[] = []
    for (const [name, tpl] of Object.entries(BODY_TEMPLATES)) {
      if (tpl.portrait) continue
      const b = tpl.body
      const [rk, ra, lk, la] = [b[9], b[10], b[12], b[13]]
      if (!rk || !ra || !lk || !la) continue
      const [lo, hi] = [Math.min(rk[0], lk[0]), Math.max(rk[0], lk[0])]
      const between = (x: number): boolean => x > lo + (hi - lo) * 0.15 && x < hi - (hi - lo) * 0.15
      // only where the knees stand side by side (a figure facing us), not one behind the other (seen from the side)
      const sideBySide = Math.abs(rk[1] - lk[1]) < 0.05 && hi - lo > 0.1
      // and only a shin that lies along the floor: a walking leg crossing the middle (a runway step) is right
      const lying = (k: number[], a: number[]): boolean => Math.abs(a[1] - k[1]) < 0.35 * Math.abs(a[0] - k[0])
      if (sideBySide && ((lying(rk, ra) && between(ra[0])) || (lying(lk, la) && between(la[0])))) bad.push(name)
    }
    expect(bad).toEqual([])
  })

  it('keeps each knee on its own side in a body seen from above', () => {
    // A lying body drawn from above has its hips one over the other; a knee pulled up only gets shorter there. A knee
    // drawn up the picture, as a side view would, lies across the other leg, and the legs come out crossed.
    const bad: string[] = []
    for (const [name, tpl] of Object.entries(BODY_TEMPLATES)) {
      const b = tpl.body
      const [rh, rk, lh, lk] = [b[8], b[9], b[11], b[12]]
      if (!rh || !rk || !lh || !lk) continue
      const fromAbove = Math.abs(rh[1] - lh[1]) > 2 * Math.abs(rh[0] - lh[0]) && Math.abs(rh[1] - lh[1]) > 0.08
      if (!fromAbove) continue
      const mid = (rh[1] + lh[1]) / 2
      const side = (p: number[]): number => Math.sign(p[1] - mid)
      if (side(rk) !== side(rh) || side(lk) !== side(lh)) bad.push(name)
    }
    expect(bad).toEqual([])
  })
})
