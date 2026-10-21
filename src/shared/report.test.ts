// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { ISSUE_BODY, issueReport, issueUrl, reportText } from './report'

describe('problem report', () => {
  it('puts the log into a code block under the header', () => {
    expect(reportText('VulKara 1.0 · macOS 26.0', 'a\nb\n')).toBe('VulKara 1.0 · macOS 26.0\n\n```text\na\nb\n```\n')
    // a log with a fence of its own gets a longer one
    expect(reportText('h', 'x ``` y')).toBe('h\n\n````text\nx ``` y\n````\n')
  })

  it('keeps the newest lines that fit an issue', () => {
    const log = Array.from({ length: 1000 }, (_x, i) => `line ${i} ${'x'.repeat(90)}`).join('\n')
    const { text, dropped } = issueReport('header', log, 20_000)
    expect(text.length).toBeLessThanOrEqual(20_000)
    expect(dropped).toBeGreaterThan(0)
    expect(text).toContain(`… ${dropped} earlier lines left out`)
    expect(text).toContain('line 999 ')
    expect(text).not.toContain(`line ${dropped - 1} `)
    expect(issueReport('header', 'short')).toEqual({ text: reportText('header', 'short'), dropped: 0 })
  })

  it('opens the new-issue page of the repository with a title and body, never the log', () => {
    const url = new URL(issueUrl('https://github.com/owner/App'))
    expect(url.origin + url.pathname).toBe('https://github.com/owner/App/issues/new')
    expect(url.searchParams.get('title')).toBe('Problem: ')
    expect(url.searchParams.get('body')).toBe(ISSUE_BODY)
    expect(issueUrl()).toMatch(/^https:\/\/github\.com\/revil-O\/VulKara\/issues\/new\?title=/)
  })
})
