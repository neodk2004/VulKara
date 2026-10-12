// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Content filter of the results: every picture or video an engine reports is checked by
// engines/diffusers/content_check.py before a page sees it, and marked as AI generated. The checker is one
// long-lived process of the Diffusers runtime. It fails closed: what could not be checked is not shown.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Command } from './runtimes'
import type { AiLabel } from '@shared/types'
import { processEnv } from './env'
import { lineSplitter } from './tool_process'
import { t } from './i18n'

export interface Verdict {
  ok: boolean
  reason?: string
}

export class ContentGuard {
  private proc?: ChildProcessWithoutNullStreams
  /** the checks the current process has not answered yet; a stopped process fails only its own */
  private waiting = new Map<number, (v: Verdict) => void>()
  private nextId = 1

  constructor(
    private readonly resolveCommand: () => Command | undefined,
    private readonly log: (line: string) => void,
  ) {}

  private start(): ChildProcessWithoutNullStreams {
    const cmd = this.resolveCommand()
    if (!cmd) throw new Error(t('main.guard.needsDiffusers'))
    const proc = spawn(cmd.command, cmd.args, { env: { ...processEnv(), ...cmd.env } })
    const waiting = new Map<number, (v: Verdict) => void>()
    this.proc = proc
    this.waiting = waiting
    proc.stdout.on('data', lineSplitter((line) => this.onAnswer(line, waiting)))
    proc.stderr.on('data', (data: Buffer) => this.log(data.toString('utf8')))
    proc.on('error', (err) => this.log(err.message))
    // a check written while the checker ends fails with EPIPE; "close" answers the waiting checks
    proc.stdin.on('error', (err) => this.log(err.message))
    proc.on('close', () => {
      if (this.proc === proc) this.proc = undefined
      for (const resolve of waiting.values())
        resolve({ ok: false, reason: t('main.guard.stopped') })
      waiting.clear()
    })
    return proc
  }

  private onAnswer(line: string, waiting: Map<number, (v: Verdict) => void>): void {
    if (!line.startsWith('{')) return
    let answer: Verdict & { id?: number }
    try {
      answer = JSON.parse(line)
    } catch {
      return
    }
    const resolve = answer.id !== undefined ? waiting.get(answer.id) : undefined
    if (resolve && answer.id !== undefined) {
      waiting.delete(answer.id)
      resolve({ ok: answer.ok === true, reason: answer.reason })
    }
  }

  /** Never rejects. */
  /** preview: a model's preview picture, not a result: removed when it does not pass, never marked.
   *  keep: the user's own picture (training): only judged, never removed or marked. */
  check(path: string, opts: { safeMode: boolean; model: string; preview?: boolean; keep?: boolean; label?: AiLabel }): Promise<Verdict> {
    return new Promise((resolve) => {
      try {
        const proc = this.proc ?? this.start()
        const id = this.nextId++
        this.waiting.set(id, resolve)
        proc.stdin.write(JSON.stringify({ id, path, safe_mode: opts.safeMode, model: opts.model, preview: opts.preview === true, keep: opts.keep === true, label: opts.label ?? null }) + '\n')
      } catch (err) {
        resolve({ ok: false, reason: t('main.guard.couldNotRun', { error: (err as Error).message }) })
      }
    })
  }

  stop(): void {
    this.proc?.kill()
    this.proc = undefined
  }
}
