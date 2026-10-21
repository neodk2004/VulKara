// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { qrSvg } from './qr'

// Read the matrix back out of the SVG path (one "Mx yh1v1h-1z" per dark module, in a 4-module quiet zone).
function matrixFromSvg(svg: string): number[][] {
  const view = /viewBox="0 0 (\d+) /.exec(svg)![1]
  const size = Number(view), q = 4, n = size - 2 * q
  const m = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (const mm of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) m[Number(mm[2]) - q][Number(mm[1]) - q] = 1
  return m
}

// Decode a version-5 / level-L / byte-mode QR back to its text: pick the mask from the format info, un-mask,
// read the zigzag, strip mode+length. Enough to prove our encoder is self-consistent and standards-shaped.
function decode(m: number[][]): string {
  const N = m.length
  const fn = Array.from({ length: N }, () => new Array<boolean>(N).fill(false))
  const mark = (r: number, c: number): void => { if (r >= 0 && c >= 0 && r < N && c < N) fn[r][c] = true }
  for (const [fr, fc] of [[0, 0], [0, N - 7], [N - 7, 0]]) for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) mark(fr + dr, fc + dc)
  for (let i = 0; i < N; i++) { mark(6, i); mark(i, 6) }
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(30 + dr, 30 + dc)
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8) }
  for (let i = 0; i < 8; i++) { mark(8, N - 1 - i); mark(N - 1 - i, 8) }
  // mask from format copy 1 (bits placed MSB first), XOR 0x5412, data bits 14..13 = mask after the 2 level bits
  let fmt = 0
  const c1: [number, number][] = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]]
  for (const [r, c] of c1) fmt = (fmt << 1) | m[r][c]
  const data5 = (fmt ^ 0b101010000010010) >> 10
  const mask = data5 & 0b111
  const maskFns = [
    (r: number, c: number) => (r + c) % 2 === 0, (r: number, _c: number) => r % 2 === 0,
    (_r: number, c: number) => c % 3 === 0, (r: number, c: number) => (r + c) % 3 === 0,
    (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ]
  const bits: number[] = []
  let up = true
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let t = 0; t < N; t++) {
      const row = up ? N - 1 - t : t
      for (let c = 0; c < 2; c++) {
        const cc = col - c
        if (fn[row][cc]) continue
        bits.push(m[row][cc] ^ (maskFns[mask](row, cc) ? 1 : 0))
      }
    }
    up = !up
  }
  const cw: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; cw.push(v) }
  // mode nibble (4) + length (8): cw[0] = 0100 + length high nibble, cw[1] = length low nibble + first byte high nibble
  const n = ((cw[0] & 0xf) << 4) | (cw[1] >> 4)
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(((cw[i + 1] & 0xf) << 4) | (cw[i + 2] >> 4))
  return new TextDecoder().decode(new Uint8Array(out))
}

describe('the QR encoder', () => {
  it('round-trips a remote-access link through a standards-shaped decode', () => {
    const url = 'http://192.168.1.75:8787/?t=rpYzwo8uvp_gd9McO00Wv7rLQWO_olQJ'
    const svg = qrSvg(url)
    expect(svg).toBeTruthy()
    expect(decode(matrixFromSvg(svg!))).toBe(url)
  })

  it('round-trips a short and a near-full payload', () => {
    for (const url of ['http://10.0.0.2:8787/?t=abc', 'http://192.168.178.123:65000/?t=' + 'A'.repeat(70)]) {
      expect(decode(matrixFromSvg(qrSvg(url)!))).toBe(url)
    }
  })

  it('returns null when the text does not fit', () => {
    expect(qrSvg('x'.repeat(200))).toBeNull()
  })
})
