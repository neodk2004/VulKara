// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The moving teaser of the planned 3D pose editor on the landing page: an OpenPose skeleton in 3D that the camera walks
// around, written as SVG with SMIL (no script, no inline style: the site's CSP allows neither), plus a still frame for
// "reduce motion". Writes docs/images/pose3d/teaser.svg and teaser_still.svg.   node tools/build_pose_teaser.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'images', 'pose3d')
const W = 640, H = 400, FRAMES = 72, SECONDS = 9

// OpenPose body points in metres, y up, the person faces +z (towards the first camera position)
const P = [
  [0, 1.6, 0.08], [0, 1.45, 0], // nose, neck
  [-0.19, 1.42, 0], [-0.42, 1.56, 0.05], [-0.5, 1.82, 0.12], // right shoulder, elbow, wrist (raised)
  [0.19, 1.42, 0], [0.26, 1.15, 0.12], [0.18, 0.96, 0.27], // left shoulder, elbow, wrist (bent forward)
  [-0.1, 0.95, 0], [-0.13, 0.52, 0.06], [-0.14, 0.08, -0.04], // right hip, knee, ankle
  [0.1, 0.95, 0], [0.18, 0.56, 0.2], [0.2, 0.13, 0.14], // left hip, knee, ankle (stepping forward)
  [-0.035, 1.64, 0.07], [0.035, 1.64, 0.07], [-0.08, 1.62, -0.01], [0.08, 1.62, -0.01], // eyes, ears
]
const LIMBS = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]]
const COLORS = [[255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170], [0, 255, 255], [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255], [255, 0, 170], [255, 0, 85]]
const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`
const RING = Array.from({ length: 32 }, (_, i) => [0.55 * Math.cos((i / 32) * 2 * Math.PI), 0, 0.55 * Math.sin((i / 32) * 2 * Math.PI)])

// camera on a circle around the hips, slightly from above with a slow nod; perspective projection
function project(p, yaw, pitch) {
  const [x0, y0, z0] = [p[0], p[1] - 0.9, p[2]]
  const x1 = x0 * Math.cos(yaw) + z0 * Math.sin(yaw), z1 = -x0 * Math.sin(yaw) + z0 * Math.cos(yaw)
  const y2 = y0 * Math.cos(pitch) - z1 * Math.sin(pitch), z2 = y0 * Math.sin(pitch) + z1 * Math.cos(pitch)
  const depth = 3.4 - z2, f = 500
  return { x: W / 2 + (f * x1) / depth, y: H / 2 - 10 - (f * y2) / depth, depth }
}
const camera = (i) => [(i / FRAMES) * 2 * Math.PI, 0.2 + 0.12 * Math.sin((i / FRAMES) * 4 * Math.PI)]
const n = (v) => Math.round(v * 10) / 10
// nearer is bolder: a limb's or point's opacity and width follow its depth
const near = (d) => Math.max(0.35, Math.min(1, 1 - (d - 3.0) * 0.8))

function svg(frames) {
  const anim = (attr, vals) => (frames.length > 1 ? `<animate attributeName="${attr}" dur="${SECONDS}s" repeatCount="indefinite" values="${vals.join(';')}"/>` : '')
  const val = (attr, vals) => `${attr}="${vals[0]}"`
  const ring = frames.map(([yaw, pitch]) => RING.map((p) => { const q = project(p, yaw, pitch); return `${n(q.x)},${n(q.y)}` }).join(' '))
  const pts = frames.map(([yaw, pitch]) => P.map((p) => project(p, yaw, pitch)))
  const limbs = LIMBS.map(([a, b], k) => {
    const v = { x1: [], y1: [], x2: [], y2: [], 'stroke-opacity': [], 'stroke-width': [] }
    for (const f of pts) {
      const d = (f[a].depth + f[b].depth) / 2
      v.x1.push(n(f[a].x)); v.y1.push(n(f[a].y)); v.x2.push(n(f[b].x)); v.y2.push(n(f[b].y))
      v['stroke-opacity'].push(Math.round(near(d) * 100) / 100); v['stroke-width'].push(n(22 / d))
    }
    const attrs = Object.keys(v)
    return `  <line ${attrs.map((at) => val(at, v[at])).join(' ')} stroke="${rgb(COLORS[k])}" stroke-linecap="round">${attrs.map((at) => anim(at, v[at])).join('')}</line>`
  })
  const joints = P.map((_, k) => {
    const v = { cx: [], cy: [], 'fill-opacity': [] }
    for (const f of pts) { v.cx.push(n(f[k].x)); v.cy.push(n(f[k].y)); v['fill-opacity'].push(Math.round(near(f[k].depth) * 100) / 100) }
    const attrs = Object.keys(v)
    return `  <circle r="4.5" ${attrs.map((at) => val(at, v[at])).join(' ')} fill="${rgb(COLORS[k])}">${attrs.map((at) => anim(at, v[at])).join('')}</circle>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" rx="18" fill="#0d0d10"/>
  <polygon points="${ring[0]}" fill="#ffb27d" fill-opacity="0.07" stroke="#ffb27d" stroke-opacity="0.35" stroke-width="1.5">${anim('points', ring)}</polygon>
${limbs.join('\n')}
${joints.join('\n')}
</svg>
`
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'teaser.svg'), svg(Array.from({ length: FRAMES + 1 }, (_, i) => camera(i))))
writeFileSync(join(OUT, 'teaser_still.svg'), svg([[0.55, 0.22]]))
console.log('docs/images/pose3d/teaser.svg, teaser_still.svg')
