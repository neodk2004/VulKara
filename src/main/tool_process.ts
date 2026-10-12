// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The output of the Python processes, read line by line. A one-off tool of an engine ("main.py detect_pose",
// "main.py export_single" …) reports on stdout in lines "__tag__ {json}" and ends with its exit code; the
// long-lived processes (engines, content filter, selection, training) have line protocols of their own and
// share only lineSplitter.

import { spawn, type ChildProcess } from 'node:child_process'
import type { Command } from './runtimes'
import { processEnv } from './env'

/** A handler for the "data" events of a stream that hands each whole line to onLine (without its "\n"). A chunk
 *  can end in the middle of a line: that part waits for the next chunk; a last line without "\n" is never handed on. */
export function lineSplitter(onLine: (line: string) => void): (data: Buffer | string) => void {
  let buffer = ''
  return (data) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  }
}

/** A line "__tag__ {json}" as tag and payload; undefined when the rest is not JSON or not an object. */
export function taggedLine(line: string): { tag: string; payload: Record<string, unknown> } | undefined {
  const space = line.indexOf(' ')
  let payload: unknown
  try {
    payload = JSON.parse(line.slice(space + 1))
  } catch {
    return undefined  // not a line for us
  }
  return payload && typeof payload === 'object' ? { tag: line.slice(0, space), payload: payload as Record<string, unknown> } : undefined
}

export interface ToolEnd {
  code: number | null
  /** the end of its error output (at most 4000 characters) */
  stderr: string
}

/** Runs the tool and hands each tagged line of its output to onLine; started gets the process, to stop it. */
export function runTool(
  command: Command,
  env: Record<string, string>,
  onLine: (tag: string, payload: Record<string, unknown>) => void,
  started?: (proc: ChildProcess) => void,
): Promise<ToolEnd> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command.command, command.args, { env: { ...processEnv(), ...command.env, ...env } })
    started?.(proc)
    let stderr = ''
    proc.stdout.on('data', lineSplitter((line) => {
      const tagged = taggedLine(line)
      if (tagged) onLine(tagged.tag, tagged.payload)
    }))
    proc.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-4000) })
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ code, stderr }))
  })
}
