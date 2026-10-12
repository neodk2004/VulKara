// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { isSexualPrompt, prohibitedPrompt } from './content_policy'

const CASES: [string, boolean][] = [
  ['a sexy woman in lingerie on a bed', false], ['portrait of a girl, smiling', false], ['nude woman, 25 years old', false],
  ['kind of sexy evening dress', false], ['junge Frau, erotisch, Abendlicht', false], ['teen at school, cartoon', false],
  ['naked teen', true], ['sexy schoolgirl outfit', true], ['15yo nude', true], ['nackt, 14 jahre alt', true],
  ['erotic loli', true], ['little girl, lingerie', true], ['child, naked', true], ['16-jährige, nackt', true],
  ['a 30 year old nude model', false], ['Kinderzimmer, Spielzeug', false], ['children playing in a park', false],
  ['sexy 18 year old', false], ['Sexy Teenager', true],
]

describe('prohibitedPrompt', () => {
  it.each(CASES)('%s -> %s', (prompt, refused) => {
    expect(!!prohibitedPrompt(prompt)).toBe(refused)
  })
})

describe('isSexualPrompt', () => {
  it('tells intimate prompts from others', () => {
    expect(isSexualPrompt('lingerie shoot')).toBe(true)
    expect(isSexualPrompt('beach portrait')).toBe(false)
  })

  it('sees through fullwidth letters and invisible characters', () => {
    expect(prohibitedPrompt('ｎｕｄｅ ｃｈｉｌｄ')).not.toBeNull()
    expect(prohibitedPrompt('nude ch\u200Bild')).not.toBeNull()
    expect(isSexualPrompt('n\u00ADude')).toBe(true)
  })
})
