// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'vk-secrets-'))
vi.mock('electron', () => ({
  app: { getPath: () => dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s.split('').reverse().join('')),
    decryptString: (b: Buffer) => b.toString().split('').reverse().join(''),
  },
}))

const { getToken, hasToken, setToken } = await import('./secrets')

describe('access tokens', () => {
  it('keeps a token per service, in a file only the user can read', () => {
    expect(setToken('civitai', ' abc ')).toBe('stored')
    expect(getToken('civitai')).toBe('abc')
    expect(statSync(join(dir, 'tokens.json')).mode & 0o077).toBe(0)
    expect(setToken('civitai', '')).toBe('removed')
    expect(hasToken('civitai')).toBe(false)
  })

  it('knows no other services', () => {
    expect(() => setToken('github' as 'civitai', 'x')).toThrow()
    for (const service of ['__proto__', 'constructor', 'toString'])
      expect(hasToken(service as 'civitai')).toBe(false)
  })
})
