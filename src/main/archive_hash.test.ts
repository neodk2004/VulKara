// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { treeHash } from './archive_hash'

const tree = (files: Record<string, string>, link?: [string, string]): string => {
  const root = mkdtempSync(join(tmpdir(), 'vk-tree-'))
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  if (link) symlinkSync(link[1], join(root, link[0]))
  return root
}

describe('content hash of an unpacked archive', () => {
  it('depends on names and contents only, not on the order they were written in', () => {
    const a = tree({ 'main.py': 'print(1)', 'comfy/x.py': 'x' })
    const b = tree({ 'comfy/x.py': 'x', 'main.py': 'print(1)' })
    expect(treeHash(a)).toBe(treeHash(b))
  })

  it('changes with one changed byte, a renamed file or an added link', () => {
    const base = treeHash(tree({ 'main.py': 'print(1)' }))
    expect(treeHash(tree({ 'main.py': 'print(2)' }))).not.toBe(base)
    expect(treeHash(tree({ 'Main.py': 'print(1)' }))).not.toBe(base)
    expect(treeHash(tree({ 'main.py': 'print(1)' }, ['evil.py', '/etc/passwd']))).not.toBe(base)
  })

  it('is the hash of tools/pin_runtimes.py', () => {
    // sha256("a.txt\0" + sha256("hi") + "\n")
    expect(treeHash(tree({ 'a.txt': 'hi' }))).toBe('ce2e0411ff854b471a38be28e29213a9b6945171cfab228e5a419e923959723c')
  })
})
