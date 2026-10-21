// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The problem report as it goes to the clipboard and to GitHub: the header, then the redacted log in a code block.
// The log itself never goes into the link: it would not fit, and the user pastes it after reading it.
import { REPO_URL } from './links'

/** GitHub takes up to 65,536 characters in an issue; the description the user writes needs some of them. */
export const ISSUE_MAX = 60_000

/** header + log as a Markdown code block (a fence longer than any run of backticks in the log). */
export function reportText(header: string, log: string): string {
  const longest = Math.max(0, ...(log.match(/`+/g) ?? []).map((r) => r.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${header}\n\n${fence}text\n${log.replace(/\n+$/, '')}\n${fence}\n`
}

/** The report for an issue: the newest lines of the log that fit, with a line saying how many were left out. */
export function issueReport(header: string, log: string, max = ISSUE_MAX): { text: string; dropped: number } {
  const full = reportText(header, log)
  if (full.length <= max) return { text: full, dropped: 0 }
  const lines = log.replace(/\n+$/, '').split('\n')
  let size = reportText(header, '').length + 80
  let keep = lines.length
  while (keep > 0 && size + lines[keep - 1].length + 1 <= max) size += lines[--keep].length + 1
  const dropped = keep
  const note = `… ${dropped} earlier ${dropped === 1 ? 'line' : 'lines'} left out (GitHub takes about 65,000 characters).`
  return { text: reportText(header, [note, ...lines.slice(keep)].join('\n')), dropped }
}

export const ISSUE_TITLE = 'Problem: '
export const ISSUE_BODY = [
  '**What happened, and what did you expect?**',
  '',
  '',
  '**Steps to reproduce** (page, model, settings)',
  '',
  '',
  '**Log**: VulKara copied it with personal data replaced by ****. Paste it below this line (⌘V).',
  '',
].join('\n')

/** The new-issue page of the app's repository, with a title and a short body to fill in; no log, no data of the Mac. */
export function issueUrl(repo = REPO_URL): string {
  return `${repo}/issues/new?title=${encodeURIComponent(ISSUE_TITLE)}&body=${encodeURIComponent(ISSUE_BODY)}`
}
