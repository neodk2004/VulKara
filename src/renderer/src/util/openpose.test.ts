// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { BODY_TEMPLATES, fitInside, type Point, type Points } from './openpose'

const SIZES: [number, number][] = [[1152, 832], [1280, 512], [1024, 1024], [832, 1152], [512, 1280]]
const inside = (pts: Points, w: number, h: number): boolean =>
  pts.every((k) => !k || (k[0] >= w * 0.05 - 0.01 && k[0] <= w * 0.95 + 0.01 && k[1] >= h * 0.05 - 0.01 && k[1] <= h * 0.95 + 0.01))

describe('pose templates in the canvas', () => {
  it('leaves points that are inside where they are', () => {
    expect(fitInside([[100, 100], [200, 300]], 1000, 1000)).toMatchObject({ scale: 1, dx: 0, dy: 0 })
  })

  it('brings every full-body template inside every canvas, also when it was applied by the neck of a standing person', () => {
    for (const [name, tpl] of Object.entries(BODY_TEMPLATES)) {
      if (tpl.portrait) continue
      for (const [w, h] of SIZES) {
        // as PosePage places it: the box as large as fits, then moved so that the neck is where a standing person's was
        const aspect = tpl.aspect ?? 0.55
        const bh = Math.min(h * 0.85, (w * 0.9) / aspect)
        const bw = bh * aspect
        const [x0, y0] = [(w - bw) / 2, (h - bh) / 2]
        let pts: Points = tpl.body.map((k) => k && ([x0 + k[0] * bw, y0 + k[1] * bh] as Point))
        const dx = w / 2 - (pts[1]?.[0] ?? w / 2)
        pts = pts.map((k) => k && ([k[0] + dx, k[1]] as Point))
        const f = fitInside(pts, w, h)
        const out = pts.map((k) => k && ([f.cx + (k[0] - f.cx) * f.scale + f.dx, f.cy + (k[1] - f.cy) * f.scale + f.dy] as Point))
        expect(inside(out, w, h), `${name} on ${w} × ${h}`).toBe(true)
      }
    }
  })

  it('shrinks only what is larger than the canvas', () => {
    const f = fitInside([[-500, 0], [1500, 100]], 1000, 1000)
    expect(f.scale).toBeCloseTo(0.45)
  })
})
