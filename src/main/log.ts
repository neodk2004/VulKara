// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The app log: what the engines and installers print, kept in memory for the Logs page and written to a file of
// this session (logs/session-….log in the app data folder, the newest 10 kept: log_sessions.ts), so an earlier
// session can still be read and reported. Every line has its time; a finished package download also gets its size
// and average speed.

import { createWriteStream, existsSync, mkdirSync, writeFileSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import type { LogLine } from '@shared/api'
import { KEEP_SESSIONS, SESSION_LINE, migrateLegacy, pruneSessions, sessionName, stamp } from './log_sessions'

const MAX_LINES = 4000
/** a session file stops growing here, with a note */
export const MAX_SESSION_BYTES = 5 * 1024 * 1024
const lines: LogLine[] = []
const listeners: ((line: LogLine) => void)[] = []
let stream: WriteStream | undefined
let written = 0
let dir: string | undefined
let current: string | undefined

const UNITS: Record<string, number> = { KiB: 1 / 1024, MiB: 1, GiB: 1024 }
/** package -> when its download started and how large it is (MiB) */
const downloads = new Map<string, { start: number; mib: number }>()

/** "121.4 MiB · 8.3 MiB/s" for the line that reports a finished download, undefined for every other line. */
export function downloadNote(text: string, now: number, running = downloads): string | undefined {
  const started = /\bDownloading (\S+) \(([\d.]+)\s*(KiB|MiB|GiB)\)/.exec(text)
  if (started) {
    running.set(started[1], { start: now, mib: Number(started[2]) * UNITS[started[3]] })
    return undefined
  }
  const finished = /\bDownloaded (\S+)/.exec(text)
  const d = finished && running.get(finished[1])
  if (!finished || !d) return undefined
  running.delete(finished[1])
  const seconds = Math.max(0.05, (now - d.start) / 1000)
  const size = d.mib >= 1024 ? `${(d.mib / 1024).toFixed(1)} GiB` : `${d.mib.toFixed(1)} MiB`
  return `${size} · ${(d.mib / seconds).toFixed(1)} MiB/s`
}

/**
 * The lines worth keeping of what a process printed, each marked with where it came from. A progress bar
 * rewrites its line many times: only a finished bar is kept.
 */
export function cleanOutput(source: string, chunk: string): string[] {
  const out: string[] = []
  for (const raw of chunk.split('\n')) {
    const text = raw.split('\r').filter((p) => p.trim()).pop()?.trimEnd()
    if (!text) continue
    const bar = /(\d+)%\|/.exec(text)
    if (bar && bar[1] !== '100') continue
    // an engine may mark its own lines already, with its full name or a short one ("[comfy]" of comfyui)
    const own = /^\[([\w ]+)\]\s*/.exec(text)
    out.push(own && source.startsWith(own[1]) ? `[${source}] ${text.slice(own[0].length)}` : `[${source}] ${text}`)
  }
  return out
}

/**
 * Starts this session's log file in the folder: the old single file of earlier versions becomes session files
 * first, and only the newest 10 sessions are kept.
 */
export function logTo(folder: string, now = Date.now()): void {
  try {
    mkdirSync(folder, { recursive: true })
    try {
      migrateLegacy(folder)
    } catch {
      // the old file stays; it is tried again at the next start
    }
    const name = sessionName(now, (n) => existsSync(join(folder, n)))
    const first = `${stamp(now)}  ${SESSION_LINE}\n`
    writeFileSync(join(folder, name), first)
    pruneSessions(folder, KEEP_SESSIONS, name)
    stream = createWriteStream(join(folder, name), { flags: 'a' })
    stream.on('error', () => (stream = undefined))
    written = Buffer.byteLength(first)
    dir = folder
    current = name
    record(SESSION_LINE, now)
  } catch {
    stream = undefined  // no log file then, the page still shows the lines
  }
}

/** The folder of the session files and the name of this session's file. */
export const logFolder = (): string | undefined => dir
export const currentSession = (): string | undefined => current

function toFile(text: string): void {
  if (!stream) return
  const bytes = Buffer.byteLength(text)
  if (written + bytes > MAX_SESSION_BYTES) {
    stream.write(`${stamp(Date.now())}  [app] this session's log file is full (${MAX_SESSION_BYTES / 1024 / 1024} MB): later lines are only on the Logs page\n`)
    stream.end()
    stream = undefined
    return
  }
  written += bytes
  stream.write(text)
}

/** A line for the page only (the file has it already). */
function record(content: string, time: number): void {
  const line: LogLine = { time, text: content }
  lines.push(line)
  console.log(content)
  for (const fn of listeners) fn(line)
}

export function log(text: string): void {
  for (const raw of text.split('\n')) {
    const content = raw.split('\r').filter((p) => p.trim()).pop()
    if (!content) continue
    const time = Date.now()
    const line: LogLine = { time, text: content, note: downloadNote(content, time) }
    lines.push(line)
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
    console.log(content)
    toFile(`${stamp(time)}  ${content}${line.note ? `  [${line.note}]` : ''}\n`)
    for (const fn of listeners) fn(line)
  }
}

/** What a process printed, cleaned and marked with its source. */
export function logOutput(source: string, chunk: string): void {
  for (const line of cleanOutput(source, chunk)) log(line)
}

export const logLines = (): LogLine[] => [...lines]

export function onLog(fn: (line: LogLine) => void): void {
  listeners.push(fn)
}
