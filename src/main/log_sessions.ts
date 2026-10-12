// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The log files: one per start of the app, logs/session-YYYY-MM-DD_HH-MM-SS.log (local time) in the app data folder,
// the newest 10 kept. The one file of earlier versions (vulkara.log and its .1) is split into session files at its
// "[app] session started" lines once. The problem report lists them and shows one, redacted (log_redact.ts).

import { existsSync, lstatSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir, hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import type { LogSession } from '@shared/api'
import type { RedactContext } from './log_redact'
import { t } from './i18n'

export const KEEP_SESSIONS = 10
export const SESSION_RE = /^session-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_(\d+))?\.log$/
export const LEGACY_FILES = ['vulkara.log.1', 'vulkara.log']
export const SESSION_LINE = '[app] session started'
const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) {2}/
const ERROR_RE = /error|failed|traceback/i

const two = (n: number): string => String(n).padStart(2, '0')

/** "2026-10-07 10:22:01", as every line of the log begins */
export function stamp(time: number): string {
  const d = new Date(time)
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

/** session-2026-10-07_10-22-01.log; a second session of the same second gets _2, _3, … */
export function sessionName(time: number, taken: (name: string) => boolean = () => false): string {
  const base = `session-${stamp(time).replace(' ', '_').replace(/:/g, '-')}`
  let name = `${base}.log`
  for (let i = 2; taken(name); i++) name = `${base}_${i}.log`
  return name
}

/** When the session of a file name started (ms), undefined for any other name. */
export function sessionStart(name: string): number | undefined {
  const m = SESSION_RE.exec(name)
  if (!m) return undefined
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number)
  return new Date(y, mo - 1, d, h, mi, s).getTime()
}

/** The time at the start of a log line, undefined for a line without one. */
export function lineTime(line: string): number | undefined {
  const m = STAMP_RE.exec(line)
  if (!m) return undefined
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number)
  return new Date(y, mo - 1, d, h, mi, s).getTime()
}

const order = (name: string): [number, number] => [sessionStart(name) ?? 0, Number(SESSION_RE.exec(name)?.[7] ?? 1)]

/** The session files in a folder, oldest first. */
export function sessionFiles(dir: string): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names.filter((n) => SESSION_RE.test(n)).sort((a, b) => {
    const [ta, ia] = order(a)
    const [tb, ib] = order(b)
    return ta - tb || ia - ib
  })
}

/** Deletes all but the newest `keep` session files (never `current`); returns the names deleted. */
export function pruneSessions(dir: string, keep = KEEP_SESSIONS, current?: string): string[] {
  const others = sessionFiles(dir).filter((n) => n !== current)
  const room = Math.max(0, current ? keep - 1 : keep)
  const old = others.slice(0, Math.max(0, others.length - room))
  const removed: string[] = []
  for (const name of old) {
    try {
      unlinkSync(join(dir, name))
      removed.push(name)
    } catch {
      // stays; the next start tries again
    }
  }
  return removed
}

/** The sessions in the text of the old single log file: split at each start line, each with the time it began. */
export function splitLegacy(text: string, fallback: number): { time: number; text: string }[] {
  const parts: { time: number; lines: string[] }[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    const time = lineTime(line)
    const starts = line.slice(21) === SESSION_LINE
    if (starts || !parts.length) parts.push({ time: time ?? fallback, lines: [] })
    parts[parts.length - 1].lines.push(line)
  }
  return parts.map((p) => ({ time: p.time, text: p.lines.join('\n') + '\n' }))
}

/** vulkara.log (and vulkara.log.1) split into session files, then removed. Returns how many sessions were written. */
export function migrateLegacy(dir: string): number {
  const legacy = LEGACY_FILES.map((n) => join(dir, n)).filter((p) => existsSync(p))
  if (!legacy.length) return 0
  let written = 0
  for (const path of legacy) {
    const parts = splitLegacy(readFileSync(path, 'utf8'), statSync(path).mtimeMs)
    for (const part of parts) {
      // written already by a move that stopped halfway (a full disk): not written twice
      const same = join(dir, sessionName(part.time, () => false))
      if (existsSync(same) && readFileSync(same, 'utf8') === part.text) continue
      writeFileSync(join(dir, sessionName(part.time, (n) => existsSync(join(dir, n)))), part.text)
      written++
    }
  }
  for (const path of legacy) unlinkSync(path)
  return written
}

/** What the list of the problem report shows of a session file. */
export function describeSession(name: string, text: string, current: boolean): LogSession {
  const lines = text.split('\n').filter(Boolean)
  let end: number | undefined
  for (let i = lines.length - 1; i >= 0 && end === undefined; i--) end = lineTime(lines[i])
  return {
    id: name, start: sessionStart(name) ?? 0, end, lines: lines.length,
    errors: lines.filter((l) => ERROR_RE.test(l)).length, bytes: Buffer.byteLength(text), current,
  }
}

/** The sessions of the folder, newest first. */
export async function listSessions(dir: string, current?: string): Promise<LogSession[]> {
  const out: LogSession[] = []
  for (const name of sessionFiles(dir).reverse()) {
    try {
      out.push(describeSession(name, await readFile(join(dir, name), 'utf8'), name === current))
    } catch {
      // gone in between
    }
  }
  return out
}

/** The text of one session; only a name of the folder's session list is read, never a path given from outside. */
export async function readSession(dir: string, id: unknown): Promise<string> {
  if (typeof id !== 'string' || !sessionFiles(dir).includes(id)) throw new Error(t('main.logs.noSession'))
  return readFile(join(dir, id), 'utf8')
}

/** What the redaction needs to know about this Mac: home, user, host and the names of mounted volumes. */
export function machineContext(): RedactContext {
  let volumes: string[] = []
  try {
    // the startup disk is a link to / in /Volumes: its name is not the user's
    volumes = readdirSync('/Volumes').filter((v) => !v.startsWith('.') && !lstatSync(join('/Volumes', v)).isSymbolicLink())
  } catch {
    // no /Volumes
  }
  let user: string | undefined
  try {
    user = userInfo().username
  } catch {
    user = undefined
  }
  return { home: homedir(), user, host: hostname(), volumes }
}
