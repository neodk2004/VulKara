// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inline, parseChangelog } from './changelog'

describe('changelog', () => {
  it('reads versions, paragraphs and entries that go on over several lines', () => {
    const v = parseChangelog(`# Changelog

## 0.2.0 – 2026-10-08

- **Faster**: about 40 %
  on an M2.
- Guides.

## 0.1.0 – 2026-10-01

The first release.

- Pictures *and* videos.
`)
    expect(v.map((x) => [x.version, x.date])).toEqual([['0.2.0', '2026-10-08'], ['0.1.0', '2026-10-01']])
    expect(v[0].items).toEqual(['<strong>Faster</strong>: about 40 % on an M2.', 'Guides.'])
    expect(v[1].intro).toEqual(['The first release.'])
    expect(v[1].items).toEqual(['Pictures <em>and</em> videos.'])
  })

  it('escapes HTML and keeps code as it is', () => {
    expect(inline('<b>x</b> `x.weight._data` & **y**')).toBe('&lt;b&gt;x&lt;/b&gt; <code>x.weight._data</code> &amp; <strong>y</strong>')
  })

  it('reads the changelog shipped with the app', () => {
    const v = parseChangelog(readFileSync('CHANGELOG.md', 'utf8'))
    expect(v.length).toBeGreaterThan(5)
    expect(v.at(-1)?.version).toBe('0.1.0')
    expect(v.every((x) => x.items.length > 0)).toBe(true)
  })

  it('skips a heading that names no version, and what follows it', () => {
    const v = parseChangelog('# Changelog\n\n## 0.1.0 – 2026-01-08\n\n- First.\n\n## Versions below 0.1.0 truncated ..\n\nolder text\n')
    expect(v.map((x) => x.version)).toEqual(['0.1.0'])
    expect(v[0].intro).toEqual([])
  })

  it('leaves stars inside code spans alone', () => {
    expect(inline('`a*b*c` and *d*')).toBe('<code>a*b*c</code> and <em>d</em>')
  })
})
