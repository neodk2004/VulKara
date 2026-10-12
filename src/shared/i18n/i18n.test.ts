// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { CATALOGS, LANG_NAMES, LANGS, LOCALES, pickLang, resolveLang, translate } from '.'

type Tree = { [k: string]: string | Tree }

/** every text as key -> text (a plural as key.one and key.other) */
function leaves(tree: Tree, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out[prefix + k] = v
    else leaves(v, `${prefix}${k}.`, out)
  }
  return out
}

const placeholders = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()

const en = leaves(CATALOGS.en as unknown as Tree)

describe('the texts', () => {
  for (const lang of LANGS.filter((l) => l !== 'en')) {
    const other = leaves(CATALOGS[lang] as unknown as Tree)
    it(`${lang} has the same keys as English`, () => {
      expect(Object.keys(other).filter((k) => !(k in en))).toEqual([])
      expect(Object.keys(en).filter((k) => !(k in other))).toEqual([])
    })
    it(`${lang} has the same placeholders as English`, () => {
      const differ = Object.keys(en).filter((k) => k in other && placeholders(en[k]).join() !== placeholders(other[k]).join())
      expect(differ.map((k) => `${k}: ${other[k]}`)).toEqual([])
    })
    it(`${lang} has no empty texts`, () => {
      expect(Object.keys(other).filter((k) => en[k] !== '' && other[k].trim() === '')).toEqual([])
    })
  }
  it('English has no empty texts and no unfilled placeholders of the {{ }} kind', () => {
    expect(Object.keys(en).filter((k) => en[k].trim() === '' || /\{\{/.test(en[k]))).toEqual([])
  })
})

describe('translate', () => {
  it('fills in placeholders and picks the plural form', () => {
    expect(translate('en', 'settings.runtimes.lastChecked', { when: 'today' })).toBe('Updates last checked: today')
    expect(translate('en', 'no.such.key')).toBe('no.such.key')
  })
  it('System picks the first language macOS uses that the app has, else English', () => {
    expect(pickLang(['fr-FR', 'de-DE', 'en-US'])).toBe('de')
    expect(pickLang(['pt-BR'])).toBe('pt-BR')
    expect(pickLang(['pt-PT'])).toBe('pt-PT')
    expect(pickLang(['pt_PT'])).toBe('pt-PT')
    // a language without its region: the first variant the app has
    expect(pickLang(['pt'])).toBe('pt-BR')
    expect(pickLang(['de-AT'])).toBe('de')
    expect(pickLang(['es_419'])).toBe('es')
    expect(pickLang(['fr-FR', 'it'])).toBe('en')
    expect(pickLang([])).toBe('en')
    expect(resolveLang('es', ['de-DE'])).toBe('es')
    expect(resolveLang('system', ['de-DE'])).toBe('de')
  })
})

describe('numbers in placeholders', () => {
  it('take the decimal mark of the language, never grouped; English stays as it is', () => {
    expect(translate('en', 'settings.runtimes.confirmRemove', { name: 'MLX', size: 0.9 })).toContain('(0.9 GB)')
    expect(translate('de', 'settings.runtimes.confirmRemove', { name: 'MLX', size: 0.9 })).toContain('0,9 GB')
    expect(translate('de', 'jobs.labels.upscale', { factor: 12345 })).toContain('12345')
  })
})

describe('the languages', () => {
  it('are English and every folder of locales/, each with its name and locale', () => {
    expect(LANGS[0]).toBe('en')
    expect(LANGS).toEqual(expect.arrayContaining(['de', 'es', 'pt-BR', 'pt-PT']))
    for (const l of LANGS) {
      expect(LANG_NAMES[l]).toBeTruthy()
      expect(() => new Intl.NumberFormat(LOCALES[l])).not.toThrow()
    }
  })
  it('a setting that names no language of the app follows macOS', () => {
    expect(resolveLang('xx', ['de-DE'])).toBe('de')
  })
})
