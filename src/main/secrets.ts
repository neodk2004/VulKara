// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Access tokens (Hugging Face, Civitai), encrypted with the macOS keychain (safeStorage). The page can only
// set or clear a token and ask whether one exists; the plain token never goes back to it.

import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dataDir } from './paths'

export type TokenService = 'huggingface' | 'civitai'
const SERVICES: unknown[] = ['huggingface', 'civitai']
const file = (): string => join(dataDir(), 'tokens.json')
const session: Partial<Record<TokenService, string>> = {}  // when encryption is not available

function readAll(): Record<string, string> {
  try {
    return existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {}
  } catch {
    return {}
  }
}

/** Written whole or not at all; a damaged file is kept aside instead of being overwritten without a word. */
function writeAll(all: Record<string, string>): void {
  mkdirSync(dirname(file()), { recursive: true })
  if (existsSync(file())) {
    try {
      JSON.parse(readFileSync(file(), 'utf8'))
    } catch {
      renameSync(file(), file() + '.damaged')
    }
  }
  const tmp = file() + '.tmp'
  writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 })
  renameSync(tmp, file())
}

export function setToken(service: TokenService, token: string): 'stored' | 'session' | 'removed' {
  if (!SERVICES.includes(service)) throw new Error('unknown service')
  const all = readAll()
  const value = token.trim()
  if (!value) {
    delete all[service]
    delete session[service]
  } else if (safeStorage.isEncryptionAvailable()) {
    all[service] = safeStorage.encryptString(value).toString('base64')
  } else {
    session[service] = value
  }
  writeAll(all)
  return !value ? 'removed' : safeStorage.isEncryptionAvailable() ? 'stored' : 'session'
}

/** The plain token, for the processes that download (main process only). */
export function getToken(service: TokenService): string | undefined {
  if (!SERVICES.includes(service)) return undefined
  if (session[service]) return session[service]
  const enc = readAll()[service]
  if (typeof enc !== 'string' || !safeStorage.isEncryptionAvailable()) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return undefined
  }
}

export const hasToken = (service: TokenService): boolean => !!getToken(service)
