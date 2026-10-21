// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { lineSplitter, taggedLine } from './tool_process'

function split(chunks: (string | Buffer)[]): string[] {
  const lines: string[] = []
  const onData = lineSplitter((line) => lines.push(line))
  for (const chunk of chunks) onData(chunk)
  return lines
}

describe('tool_process', () => {
  it('hands on whole lines, however the output is cut into chunks', () => {
    expect(split(['__progress__ {"st', 'age":"load"}\n__err', 'or__ {}\n'])).toEqual(['__progress__ {"stage":"load"}', '__error__ {}'])
    expect(split([Buffer.from('one\ntwo\n'), Buffer.from('three\n')])).toEqual(['one', 'two', 'three'])
    expect(split(['a\n\nb\n'])).toEqual(['a', '', 'b'])
  })

  it('keeps a partial last line back until its end arrives', () => {
    expect(split(['done\nhalf a li'])).toEqual(['done'])
    expect(split(['done\nhalf a li', 'ne\n'])).toEqual(['done', 'half a line'])
  })

  it('reads tag and payload of a tagged line', () => {
    expect(taggedLine('__pose__ {"people":[]}')).toEqual({ tag: '__pose__', payload: { people: [] } })
    expect(taggedLine('__progress__ {"stage":"a b","progress":50}')).toEqual({ tag: '__progress__', payload: { stage: 'a b', progress: 50 } })
  })

  it('skips lines that are not JSON', () => {
    expect(taggedLine('Loading pipeline components...')).toBeUndefined()
    expect(taggedLine('__pose__ {"people":')).toBeUndefined()
    expect(taggedLine('')).toBeUndefined()
  })

  it('skips payloads that are not objects', () => {
    expect(taggedLine('__pose__ null')).toBeUndefined()
    expect(taggedLine('__pose__ 42')).toBeUndefined()
    expect(taggedLine('__pose__ "text"')).toBeUndefined()
    expect(taggedLine('__pose__ true')).toBeUndefined()
  })
})
