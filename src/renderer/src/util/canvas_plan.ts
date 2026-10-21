// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The AI Canvas: pictures as layers on an endless surface and a frame in which the model paints. What lies
// under the frame decides what "Generate" does.
import type { PlainKey } from '@shared/i18n'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Layer extends Rect {
  id: string
  src: string
}

/** new: an empty frame; extend: partly covered; inpaint: covered with a painted mask; variation: covered without */
export type Plan = 'new' | 'extend' | 'inpaint' | 'variation'

/** The share of the frame that pictures cover (by their rectangles), 0..1. */
export function coverage(frame: Rect, layers: Rect[], cells = 32): number {
  let hit = 0
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x = frame.x + ((i + 0.5) * frame.w) / cells
      const y = frame.y + ((j + 0.5) * frame.h) / cells
      if (layers.some((l) => x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h)) hit++
    }
  }
  return hit / (cells * cells)
}

export function planFor(covered: number, hasMask: boolean): Plan {
  if (covered <= 0.001) return 'new'
  if (covered < 0.999) return 'extend'
  return hasMask ? 'inpaint' : 'variation'
}

export const PLAN_TEXT: Record<Plan, PlainKey> = {
  new: 'canvas.plan.new',
  extend: 'canvas.plan.extend',
  inpaint: 'canvas.plan.inpaint',
  variation: 'canvas.plan.variation',
}

/** A frame of the ratio w:h with about native × native pixels, sides in steps of 64, centred where the old one was. */
export function frameFor(ratio: { w: number; h: number }, native: number, old: Rect): Rect {
  const area = native * native
  const w = Math.max(64, Math.round(Math.sqrt((area * ratio.w) / ratio.h) / 64) * 64)
  const h = Math.max(64, Math.round(Math.sqrt((area * ratio.h) / ratio.w) / 64) * 64)
  return { x: Math.round(old.x + old.w / 2 - w / 2), y: Math.round(old.y + old.h / 2 - h / 2), w, h }
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** The largest frame for a model of native × native pixels: twice its pixels, no side above 2048 (more costs memory
 *  that a 16 GB Mac does not have, and models paint poorly far from their size). */
export const frameLimits = (native: number): { min: number; max: number; area: number } => ({ min: 256, max: 2048, area: 2 * native * native })

/** The frame resized from a corner by (dx, dy) world pixels: the opposite corner stays, sides in steps of 64 within
 *  the limits; a frame over the pixel budget shrinks the side that was dragged less. */
export function resizeFrame(old: Rect, corner: Corner, dx: number, dy: number, native: number): Rect {
  const { min, max, area } = frameLimits(native)
  const left = corner[1] === 'w'
  const top = corner[0] === 'n'
  const snap = (v: number): number => Math.min(max, Math.max(min, Math.round(v / 64) * 64))
  let w = snap(old.w + (left ? -dx : dx))
  let h = snap(old.h + (top ? -dy : dy))
  while (w * h > area) {
    // the side that grew less gives way (down to the minimum, then the other one)
    if ((w - old.w >= h - old.h && h > min) || w <= min) h -= 64
    else w -= 64
  }
  return { x: left ? old.x + old.w - w : old.x, y: top ? old.y + old.h - h : old.y, w, h }
}

/** The view (scale and offset) that shows all rectangles in a stage of the given size. */
export function fitView(items: Rect[], stageW: number, stageH: number): { scale: number; ox: number; oy: number } {
  const x0 = Math.min(...items.map((l) => l.x))
  const y0 = Math.min(...items.map((l) => l.y))
  const x1 = Math.max(...items.map((l) => l.x + l.w))
  const y1 = Math.max(...items.map((l) => l.y + l.h))
  const scale = Math.min(2, 0.9 * Math.min(stageW / (x1 - x0), stageH / (y1 - y0)))
  return { scale, ox: (stageW - (x1 - x0) * scale) / 2 - x0 * scale, oy: (stageH - (y1 - y0) * scale) / 2 - y0 * scale }
}
