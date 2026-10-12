// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { cleanError } from '../stores/runtimes'
import { consentParts } from './consent'
import { CONSENT_QUESTION } from '@shared/content_policy'

describe('the consent question', () => {
  it('is recognised although the main process sends it with its error class in front', () => {
    // how Electron hands on a ConsentRequired thrown in a handler: the class name stays in the message
    const err = new Error(`Error invoking remote method 'queue:add': ConsentRequired: ${CONSENT_QUESTION}`)
    expect(cleanError(err)).toBe(CONSENT_QUESTION)
    expect(cleanError(new Error("Error invoking remote method 'queue:add': Error: The model is gone."))).toBe('The model is gone.')
    expect(cleanError(new Error('plain: message stays'))).toBe('plain: message stays')
  })

  it('asks the question itself and keeps the explanation as the detail', () => {
    const { question, detail } = consentParts()
    expect(question).toMatch(/^Does the picture show no real person/)
    expect(detail).toMatch(/^Your prompt asks for intimate content/)
    expect(detail).not.toContain(question)
  })
})
