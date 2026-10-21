// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileAccess } from './file_access'

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'vk-access-'))
  const app = join(base, 'app')
  const elsewhere = join(base, 'elsewhere')
  mkdirSync(join(app, 'images'), { recursive: true })
  mkdirSync(join(elsewhere, 'trip'), { recursive: true })
  const result = join(app, 'images', 'a.png')
  const private_ = join(elsewhere, 'passport.jpg')
  const chosen = join(elsewhere, 'chosen.png')
  const inFolder = join(elsewhere, 'trip', 'beach.png')
  for (const f of [result, private_, chosen, inFolder]) writeFileSync(f, 'x')
  return { base, app, elsewhere, result, private_, chosen, inFolder, store: join(base, 'grants.json') }
}

describe('file access of the pages', () => {
  it('allows the app folders and what the user gave it, nothing else', () => {
    const t = setup()
    const access = new FileAccess(() => [t.app], () => t.store)
    expect(access.allows(t.result)).toBe(true)
    expect(access.allows(t.private_)).toBe(false)
    expect(access.allows(t.chosen)).toBe(false)
    access.grantFile(t.chosen)
    expect(access.allows(t.chosen)).toBe(true)
    expect(access.allows(t.private_)).toBe(false)  // a file next to it is not given
    access.grantFolder(join(t.elsewhere, 'trip'))
    expect(access.allows(t.inFolder)).toBe(true)
    expect(access.allows('relative.png')).toBe(false)
    expect(access.allows(join(t.app, 'images', '..', '..', 'elsewhere', 'passport.jpg'))).toBe(false)
  })

  it('follows links: a link inside an app folder to a private file is refused', () => {
    const t = setup()
    const link = join(t.app, 'images', 'innocent.png')
    symlinkSync(t.private_, link)
    expect(new FileAccess(() => [t.app], () => t.store).allows(link)).toBe(false)
  })

  it('keeps the grants after a restart, and takes what the history lists', () => {
    const t = setup()
    new FileAccess(() => [t.app], () => t.store).grantFile(t.chosen)
    const later = new FileAccess(() => [t.app], () => t.store, (p) => p === t.private_)
    expect(later.allows(t.chosen)).toBe(true)
    expect(later.allows(t.private_)).toBe(true)  // an earlier result of the history
    expect(() => later.check(join(t.elsewhere, 'missing.png'))).toThrow(/not there/)
    expect(() => new FileAccess(() => [t.app], () => t.store).check(t.private_)).toThrow(/not given to the app/)
  })

  it('grants several files with one write, skipping missing ones', () => {
    const t = setup()
    new FileAccess(() => [t.app], () => t.store).grantFiles([t.chosen, t.inFolder, join(t.elsewhere, 'gone.png')])
    const later = new FileAccess(() => [t.app], () => t.store)
    expect(later.allows(t.chosen)).toBe(true)
    expect(later.allows(t.inFolder)).toBe(true)
    expect(later.allows(t.private_)).toBe(false)
  })
})
