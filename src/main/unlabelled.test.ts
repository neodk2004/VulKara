// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unlabelledOf } from './unlabelled'

describe('unlabelled copies', () => {
  it('finds the picture without its label next to a labelled result, and nothing for others', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vk-unlabelled-'))
    writeFileSync(join(dir, 'a.png'), 'labelled')
    writeFileSync(join(dir, 'b.png'), 'plain')
    mkdirSync(join(dir, '.unlabelled'))
    writeFileSync(join(dir, '.unlabelled', 'a.png'), 'clean')
    expect(unlabelledOf(join(dir, 'a.png'))).toBe(join(dir, '.unlabelled', 'a.png'))
    expect(unlabelledOf(join(dir, 'b.png'))).toBeUndefined()
    expect(unlabelledOf('')).toBeUndefined()
  })
})
