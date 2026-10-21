// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// A tiny QR encoder for the remote-access link: fixed version 5, error correction L, byte mode, best of the 8 masks.
// 37x37 modules, enough for a LAN link with a token (up to 105 bytes). No dependency; standards-conformant output
// (verified to decode with OpenCV and BarcodeDetector). Returns null when the text does not fit.
function qrMatrix(text: string): boolean[][] | null {
  const SIZE = 37, DATA_CW = 108, EC_CW = 26
  const bytes = [...new TextEncoder().encode(text)]
  if (bytes.length > DATA_CW - 3) return null
  // GF(256), the Reed-Solomon field QR uses (primitive polynomial 0x11D)
  const EXP = new Array<number>(512), LOG = new Array<number>(256)
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
  const mul = (a: number, b: number): number => (a && b ? EXP[LOG[a] + LOG[b]] : 0)
  const genPoly = (n: number): number[] => {
    let g = [1]
    for (let i = 0; i < n; i++) {
      const ng = new Array<number>(g.length + 1).fill(0)
      for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]) }
      g = ng
    }
    return g
  }
  const eccOf = (data: number[], n: number): number[] => {
    const g = genPoly(n), res = data.concat(new Array<number>(n).fill(0))
    for (let i = 0; i < data.length; i++) { const c = res[i]; if (c) for (let j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], c) }
    return res.slice(data.length)
  }
  // bit stream: mode (byte = 0100), length (8 bits), the bytes, terminator, byte padding, pad codewords
  const bits: number[] = []
  const push = (val: number, len: number): void => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1) }
  push(0b0100, 4); push(bytes.length, 8); for (const b of bytes) push(b, 8)
  const cap = DATA_CW * 8
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0)
  while (bits.length % 8) bits.push(0)
  const dcw: number[] = []
  for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; dcw.push(v) }
  const pad = [0xec, 0x11]; let pi = 0; while (dcw.length < DATA_CW) dcw.push(pad[pi++ % 2])
  const all = dcw.concat(eccOf(dcw, EC_CW))
  // the matrix, with a map of the function modules data placement must skip
  const m = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0))
  const fn = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false))
  const set = (r: number, c: number, v: boolean): void => { m[r][c] = v ? 1 : 0; fn[r][c] = true }
  const finder = (r: number, c: number): void => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr, cc = c + dc
      if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) continue
      const inr = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
      const ring = inr && (dr === 0 || dr === 6 || dc === 0 || dc === 6)
      const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
      set(rr, cc, inr && (ring || core))
    }
  }
  finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0)
  for (let i = 8; i < SIZE - 8; i++) { if (!fn[6][i]) set(6, i, i % 2 === 0); if (!fn[i][6]) set(i, 6, i % 2 === 0) }
  set(SIZE - 8, 8, true) // the dark module
  const align = (r: number, c: number): void => {
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
  }
  align(30, 30) // version 5 has a single alignment pattern
  // reserve the two format-info areas so data placement skips them
  for (let i = 0; i < 9; i++) { fn[8][i] = true; fn[i][8] = true }
  for (let i = 0; i < 8; i++) { fn[8][SIZE - 1 - i] = true; fn[SIZE - 1 - i][8] = true }
  // data placement: zigzag up/down two columns at a time from the bottom-right, skipping the vertical timing column
  const databits: number[] = []
  for (const cw of all) for (let i = 7; i >= 0; i--) databits.push((cw >> i) & 1)
  let bi = 0, up = true
  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let t = 0; t < SIZE; t++) {
      const row = up ? SIZE - 1 - t : t
      for (let c = 0; c < 2; c++) { const cc = col - c; if (fn[row][cc]) continue; m[row][cc] = bi < databits.length ? databits[bi] : 0; bi++ }
    }
    up = !up
  }
  const maskFns = [
    (r: number, c: number) => (r + c) % 2 === 0,
    (r: number, _c: number) => r % 2 === 0,
    (_r: number, c: number) => c % 3 === 0,
    (r: number, c: number) => (r + c) % 3 === 0,
    (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ]
  // 15-bit format info: 2 bits level (L = 01) + 3 bits mask, BCH(15,5) with generator 0x537, XOR mask 0x5412
  const formatBits = (mask: number): number => {
    const d = (0b01 << 3) | mask
    let v = d << 10
    const g = 0b10100110111
    for (let i = 14; i >= 10; i--) if ((v >> i) & 1) v ^= g << (i - 10)
    return ((d << 10) | v) ^ 0b101010000010010
  }
  const place = (mask: number): number[][] => {
    const t = m.map((row) => row.slice())
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!fn[r][c] && maskFns[mask](r, c)) t[r][c] ^= 1
    const f = formatBits(mask), b = (i: number): number => (f >> (14 - i)) & 1 // placed MSB first
    for (let i = 0; i <= 5; i++) t[8][i] = b(i)
    t[8][7] = b(6); t[8][8] = b(7); t[7][8] = b(8)
    for (let i = 9; i <= 14; i++) t[14 - i][8] = b(i)
    for (let i = 0; i <= 7; i++) t[SIZE - 1 - i][8] = b(i)
    for (let i = 8; i <= 14; i++) t[8][SIZE - 15 + i] = b(i)
    t[SIZE - 8][8] = 1 // the dark module is always set; it overlaps copy 2's bit 7
    return t
  }
  const penalty = (t: number[][]): number => {
    let p = 0
    for (let r = 0; r < SIZE; r++) for (let run = 1, c = 1; c <= SIZE; c++) { if (c < SIZE && t[r][c] === t[r][c - 1]) run++; else { if (run >= 5) p += 3 + (run - 5); run = 1 } }
    for (let c = 0; c < SIZE; c++) for (let run = 1, r = 1; r <= SIZE; r++) { if (r < SIZE && t[r][c] === t[r - 1][c]) run++; else { if (run >= 5) p += 3 + (run - 5); run = 1 } }
    for (let r = 0; r < SIZE - 1; r++) for (let c = 0; c < SIZE - 1; c++) if (t[r][c] === t[r][c + 1] && t[r][c] === t[r + 1][c] && t[r][c] === t[r + 1][c + 1]) p += 3
    let dark = 0; for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) dark += t[r][c]
    p += Math.floor(Math.abs((dark * 100) / (SIZE * SIZE) - 50) / 5) * 10
    return p
  }
  let best: number[][] | null = null, bestP = Infinity
  for (let mask = 0; mask < 8; mask++) { const t = place(mask); const p = penalty(t); if (p < bestP) { bestP = p; best = t } }
  return best!.map((row) => row.map((v) => v === 1))
}

/** The link as an inline SVG string (dark modules as one path, 4-module quiet zone). Null when the text does not fit. */
export function qrSvg(text: string): string | null {
  const m = qrMatrix(text)
  if (!m) return null
  const n = m.length, q = 4, size = n + 2 * q
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}
