// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  describeSession, lineTime, listSessions, migrateLegacy, pruneSessions, readSession, sessionFiles, sessionName,
  sessionStart, splitLegacy,
} from './log_sessions'
import { logTo, log, currentSession, logFolder } from './log'

const at = (y: number, mo: number, d: number, h: number, mi: number, s: number): number => new Date(y, mo - 1, d, h, mi, s).getTime()

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vk-logs-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('session files: names', () => {
  it('names a session by its start in local time, a second one of the same second with _2', () => {
    const t = at(2026, 10, 7, 9, 5, 3)
    expect(sessionName(t)).toBe('session-2026-10-07_09-05-03.log')
    const taken = new Set(['session-2026-10-07_09-05-03.log', 'session-2026-10-07_09-05-03_2.log'])
    expect(sessionName(t, (n) => taken.has(n))).toBe('session-2026-10-07_09-05-03_3.log')
    expect(sessionStart('session-2026-10-07_09-05-03.log')).toBe(t)
    expect(sessionStart('session-2026-10-07_09-05-03_2.log')).toBe(t)
    expect(sessionStart('vulkara.log')).toBeUndefined()
    expect(sessionStart('../session-2026-10-07_09-05-03.log')).toBeUndefined()
    expect(lineTime('2026-10-07 10:22:01  [app] session started')).toBe(at(2026, 10, 7, 10, 22, 1))
    expect(lineTime('no time')).toBeUndefined()
  })

  it('lists only session files, oldest first, by their time', () => {
    for (const n of ['session-2026-10-08_00-00-00.log', 'session-2026-10-07_23-59-59_2.log', 'session-2026-10-07_23-59-59.log',
      'pixelforge.log', 'session-x.log', 'notes.txt']) writeFileSync(join(dir, n), 'x\n')
    expect(sessionFiles(dir)).toEqual(['session-2026-10-07_23-59-59.log', 'session-2026-10-07_23-59-59_2.log', 'session-2026-10-08_00-00-00.log'])
    expect(sessionFiles(join(dir, 'missing'))).toEqual([])
  })
})

describe('session files: pruning', () => {
  const make = (n: number): string[] => Array.from({ length: n }, (_x, i) => {
    const name = sessionName(at(2026, 10, 1 + i, 12, 0, 0))
    writeFileSync(join(dir, name), `${i}\n`)
    return name
  })

  it('keeps the newest 10 and leaves other files alone', () => {
    const names = make(13)
    writeFileSync(join(dir, 'pixelforge.log'), 'old app\n')
    expect(pruneSessions(dir)).toEqual(names.slice(0, 3))
    expect(sessionFiles(dir)).toEqual(names.slice(3))
    expect(existsSync(join(dir, 'pixelforge.log'))).toBe(true)
    expect(pruneSessions(dir)).toEqual([])
  })

  it('never deletes the current session, even when the clock went back', () => {
    const names = make(12)
    const current = sessionName(at(2025, 1, 1, 0, 0, 0))
    writeFileSync(join(dir, current), 'now\n')
    pruneSessions(dir, 10, current)
    expect(sessionFiles(dir)).toEqual([current, ...names.slice(3)])
  })
})

describe('session files: the old single file', () => {
  const legacy = [
    '2026-10-07 09:49:50  [app] session started',
    '2026-10-07 09:49:50  moved 7 saved page states from the earlier name',
    '2026-10-07 10:06:17  [app] session started',
    '2026-10-07 10:22:01  [app] session started',
    '2026-10-07 10:33:55  [mlx] starting',
    '2026-10-07 10:36:45  [mlx] image done in 165.6s',
    '',
  ].join('\n')

  it('splits it at the start lines', () => {
    const parts = splitLegacy(legacy, 0)
    expect(parts.map((p) => p.time)).toEqual([at(2026, 10, 7, 9, 49, 50), at(2026, 10, 7, 10, 6, 17), at(2026, 10, 7, 10, 22, 1)])
    expect(parts[2].text).toBe('2026-10-07 10:22:01  [app] session started\n2026-10-07 10:33:55  [mlx] starting\n2026-10-07 10:36:45  [mlx] image done in 165.6s\n')
    // lines before the first start line (the tail of a rotated file) are a part of their own; no time: the file's
    expect(splitLegacy('a line without time\n', 1234)).toEqual([{ time: 1234, text: 'a line without time\n' }])
  })

  it('becomes session files, then is removed; pixelforge.log stays', () => {
    writeFileSync(join(dir, 'vulkara.log'), legacy)
    writeFileSync(join(dir, 'vulkara.log.1'), '2026-10-01 08:00:00  [app] session started\n2026-10-01 08:00:01  x\n')
    writeFileSync(join(dir, 'pixelforge.log'), 'old app\n')
    expect(migrateLegacy(dir)).toBe(4)
    expect(readdirSync(dir).sort()).toEqual([
      'pixelforge.log', 'session-2026-10-01_08-00-00.log', 'session-2026-10-07_09-49-50.log',
      'session-2026-10-07_10-06-17.log', 'session-2026-10-07_10-22-01.log',
    ])
    expect(readFileSync(join(dir, 'session-2026-10-07_09-49-50.log'), 'utf8')).toContain('moved 7 saved page states')
    expect(migrateLegacy(dir)).toBe(0)
  })

  it('does not write a session twice after a move that stopped halfway', () => {
    writeFileSync(join(dir, 'vulkara.log'), legacy)
    writeFileSync(join(dir, 'session-2026-10-07_09-49-50.log'), splitLegacy(legacy, 0)[0].text)  // written before the stop
    expect(migrateLegacy(dir)).toBe(2)
    expect(sessionFiles(dir)).toEqual(['session-2026-10-07_09-49-50.log', 'session-2026-10-07_10-06-17.log', 'session-2026-10-07_10-22-01.log'])
  })

  it('names a file without times by its modification time', () => {
    writeFileSync(join(dir, 'vulkara.log'), 'no times here\n')
    const t = at(2026, 9, 30, 18, 0, 0)
    utimesSync(join(dir, 'vulkara.log'), t / 1000, t / 1000)
    migrateLegacy(dir)
    expect(sessionFiles(dir)).toEqual(['session-2026-09-30_18-00-00.log'])
  })
})

describe('session files: the list and one session', () => {
  it('describes a session: start, end, lines, errors', () => {
    const text = [
      '2026-10-07 10:22:01  [app] session started',
      '2026-10-07 17:29:36  [import] Traceback (most recent call last):',
      '2026-10-07 17:29:36  [import] registry.UnsupportedModel: x',
      '2026-10-07 17:29:54  [diffusers] OSError: Error no file named x',
      '2026-10-07 18:00:00  [mlx] loading failed',
      '',
    ].join('\n')
    expect(describeSession('session-2026-10-07_10-22-01.log', text, true)).toEqual({
      id: 'session-2026-10-07_10-22-01.log', start: at(2026, 10, 7, 10, 22, 1), end: at(2026, 10, 7, 18, 0, 0),
      lines: 5, errors: 3, bytes: Buffer.byteLength(text), current: true,
    })
  })

  it('lists newest first and reads only names of the list', async () => {
    writeFileSync(join(dir, 'session-2026-10-07_10-22-01.log'), '2026-10-07 10:22:01  [app] session started\n')
    writeFileSync(join(dir, 'session-2026-10-08_10-22-01.log'), '2026-10-08 10:22:01  [app] session started\n')
    writeFileSync(join(dir, 'secret.txt'), 'no')
    const list = await listSessions(dir, 'session-2026-10-08_10-22-01.log')
    expect(list.map((s) => [s.id, s.current])).toEqual([['session-2026-10-08_10-22-01.log', true], ['session-2026-10-07_10-22-01.log', false]])
    expect(await readSession(dir, 'session-2026-10-07_10-22-01.log')).toContain('session started')
    for (const bad of ['secret.txt', '../session-2026-10-07_10-22-01.log', '/etc/passwd', 'session-2026-10-09_10-22-01.log', 42, undefined]) {
      await expect(readSession(dir, bad)).rejects.toThrow('No such log session.')
    }
  })
})

describe('logTo', () => {
  it('starts a session file, migrates the old file and keeps 10', async () => {
    writeFileSync(join(dir, 'vulkara.log'), Array.from({ length: 12 }, (_x, i) => `2026-10-0${1 + (i % 9)} 1${i % 10}:00:00  [app] session started`).join('\n') + '\n')
    const now = at(2026, 10, 11, 20, 15, 0)
    logTo(dir, now)
    expect(logFolder()).toBe(dir)
    expect(currentSession()).toBe('session-2026-10-11_20-15-00.log')
    expect(existsSync(join(dir, 'vulkara.log'))).toBe(false)
    expect(sessionFiles(dir)).toHaveLength(10)
    expect(sessionFiles(dir).at(-1)).toBe('session-2026-10-11_20-15-00.log')
    log('[mlx] starting')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(readFileSync(join(dir, 'session-2026-10-11_20-15-00.log'), 'utf8')).toMatch(/^2026-10-11 20:15:00 {2}\[app\] session started\n.* {2}\[mlx\] starting\n$/)
  })
})
