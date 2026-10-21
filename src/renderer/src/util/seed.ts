// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
/** A typed seed: a whole number from 0 to 2^31 - 1, null (random) for anything else ("1e309", "abc"). */
export function seedOf(text: string): number | null {
  const n = Math.floor(Number(text))
  return text.trim() !== '' && Number.isFinite(n) ? Math.min(Math.max(0, n), 2 ** 31 - 1) : null
}
