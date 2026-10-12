// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The changelog shipped with the app (CHANGELOG.md), read into versions with their entries. Only what the file uses is
// understood: "## version – date" headings, "- " entries (continued on indented lines), paragraphs, **bold**, *italic*
// and `code`. The text is escaped first, so the result can be shown as HTML.

export interface ChangelogVersion {
  version: string
  date: string
  /** paragraphs before the entries, as HTML */
  intro: string[]
  /** the entries, as HTML */
  items: string[]
}

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function inline(text: string): string {
  // code spans keep their text as written: bold and italics only between them
  return escape(text).split(/(`[^`]+`)/).map((part) => part.startsWith('`') && part.endsWith('`') && part.length > 2
    ? `<code>${part.slice(1, -1)}</code>`
    : part.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>')).join('')
}

export function parseChangelog(text: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = []
  let current: ChangelogVersion | undefined
  // the lines of the entry or paragraph being read
  let block: { kind: 'item' | 'para'; lines: string[] } | undefined
  const flush = (): void => {
    if (current && block) (block.kind === 'item' ? current.items : current.intro).push(inline(block.lines.join(' ')))
    block = undefined
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const heading = /^## (.+?)(?:\s+[–-]\s+(.+))?$/.exec(line)
    if (heading) {
      flush()
      current = { version: heading[1].trim(), date: (heading[2] ?? '').trim(), intro: [], items: [] }
      versions.push(current)
    } else if (!current || line.startsWith('# ')) {
      continue  // the title of the file
    } else if (line.startsWith('- ')) {
      flush()
      block = { kind: 'item', lines: [line.slice(2).trim()] }
    } else if (!line.trim()) {
      flush()
    } else if (block) {
      block.lines.push(line.trim())
    } else {
      block = { kind: 'para', lines: [line.trim()] }
    }
  }
  flush()
  return versions
}
