// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The app's texts in every language, for the pages and the main process alike.
//   t('settings.title')                          a text
//   t('jobs.steps', { n: 20 })                   placeholders are written {n} in the texts
//   a text with { one, other } is a plural: the form is chosen by the number n
// English (en/, TypeScript) is the source and gives the keys their types. Every other language is a folder
// locales/<code>/ of JSON files, found when the app is built: language.json (its name and locale), messages.json (the
// texts, English's keys), data.json (texts of the data files, data.ts) and tips.json (the tips). A new folder is a new
// language in the menu; i18n.test.ts checks that it has every key and placeholder of English.
/// <reference types="vite/client" />
import { en } from './en'

/** what locales/<code>/language.json says about a language */
export interface LanguageInfo {
  /** its own name, for the language menu ("Deutsch") */
  name: string
  /** its name in English (the documents) */
  english: string
  /** the locale for numbers, plurals and dates ("de-DE") */
  locale: string
}

const INFO = import.meta.glob<LanguageInfo>('./locales/*/language.json', { eager: true, import: 'default' })
const MESSAGES = import.meta.glob<Messages>('./locales/*/messages.json', { eager: true, import: 'default' })
const code = (path: string): string => path.split('/')[2]

/** a language code: "en" or a folder of locales/ ("de", "pt-BR") */
export type Lang = string
/** the language setting: system follows macOS (English if macOS uses none of the app's languages) */
export type LangSetting = 'system' | Lang

/** English, then the other languages by code */
export const LANGS: readonly Lang[] = ['en', ...Object.keys(MESSAGES).map(code).sort()]
const INFOS: Record<Lang, LanguageInfo> = {
  en: { name: 'English', english: 'English', locale: 'en-US' },
  ...Object.fromEntries(Object.entries(INFO).map(([p, info]) => [code(p), info])),
}
/** each language under its own name, for the language menu */
export const LANG_NAMES: Record<Lang, string> = Object.fromEntries(LANGS.map((l) => [l, INFOS[l]?.name ?? l]))
/** each language's name in English */
export const LANG_ENGLISH: Record<Lang, string> = Object.fromEntries(LANGS.map((l) => [l, INFOS[l]?.english ?? l]))
/** the locale for dates and numbers */
export const LOCALES: Record<Lang, string> = Object.fromEntries(LANGS.map((l) => [l, INFOS[l]?.locale ?? 'en-US']))
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && LANGS.includes(v)

/** what the main process tells the windows */
export interface Language {
  lang: Lang
  /** for dates and numbers, e.g. "de-DE" */
  locale: string
}

export interface Plural {
  one: string
  other: string
}

type Widen<T> = T extends string ? string : T extends Plural ? Plural : { [K in keyof T]: Widen<T[K]> }
/** the shape of every language: English's keys, any text */
export type Messages = Widen<typeof en>

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Paths<T[K], `${P}${K}.`>
}[keyof T & string]
/** every text's key, e.g. 'settings.title' */
export type Key = Paths<typeof en>

type At<T, K extends string> = K extends `${infer H}.${infer R}` ? (H extends keyof T ? At<T[H], R> : never) : K extends keyof T ? T[K] : never
type Names<S> = S extends `${string}{${infer N}}${infer R}` ? N | Names<R> : never
type ParamsOf<V> = V extends Plural ? Names<V['one'] | V['other']> | 'n' : Names<V>
/** the placeholders of a key's English text */
export type Params<K extends Key> = ParamsOf<At<typeof en, K>>
export type Args<K extends Key> = [Params<K>] extends [never] ? [] : [Record<Params<K>, string | number>]
/** a key whose text has no placeholders: the type for keys kept in a list or a variable ({ title: 'settings.title' }) */
export type PlainKey = { [K in Key]: [Params<K>] extends [never] ? K : never }[Key]

const CATALOGS: Record<Lang, Messages> = {
  en: en as Messages,
  ...Object.fromEntries(Object.entries(MESSAGES).map(([p, m]) => [code(p), m])),
}

/** The app's language for a list of system languages ("de-DE", "pt-PT", "pt", ...): the first that the app has,
 * exactly ("pt-PT") or by its base language ("de-AT" -> "de"; "pt" -> the first variant, "pt-BR"); English if none. */
export function pickLang(preferred: readonly string[]): Lang {
  const lower = LANGS.map((l) => l.toLowerCase())
  for (const tag of preferred) {
    const t = tag.replace(/_/g, '-').toLowerCase()
    const base = t.split('-')[0]
    const i = [lower.indexOf(t), lower.indexOf(base), lower.findIndex((l) => l.startsWith(base + '-'))].find((x) => x >= 0)
    if (i !== undefined) return LANGS[i]
  }
  return 'en'
}

export const resolveLang = (setting: LangSetting, system: readonly string[]): Lang =>
  (setting !== 'system' && isLang(setting) ? setting : pickLang(system))

function lookup(catalog: Messages, key: string): string | Plural | undefined {
  let node: unknown = catalog
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' || (node && typeof node === 'object' && 'other' in node) ? (node as string | Plural) : undefined
}

const plurals = new Map<Lang, Intl.PluralRules>()

/** The text of key in lang, with its placeholders filled in; English if lang lacks it, the key if English does too. */
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const found = (CATALOGS[lang] ? lookup(CATALOGS[lang], key) : undefined) ?? lookup(en as Messages, key)
  if (found === undefined) return key
  let text: string
  if (typeof found === 'string') {
    text = found
  } else {
    if (!plurals.has(lang)) plurals.set(lang, new Intl.PluralRules(LOCALES[lang] ?? 'en-US'))
    const n = Number(params?.n ?? 0)
    text = plurals.get(lang)!.select(n) === 'one' ? found.one : found.other
  }
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? value(lang, params[name]) : all))
}

/** A value for a placeholder: a number with the language's decimal mark (2.5 GB, in German 2,5 GB), never grouped. */
export function value(lang: Lang, v: string | number): string {
  return typeof v === 'number' && lang !== 'en' && Number.isFinite(v)
    ? v.toLocaleString(LOCALES[lang] ?? 'en-US', { useGrouping: false, maximumFractionDigits: 10 })
    : String(v)
}

/** A translator bound to one language, typed by the keys. */
export function translator(lang: () => Lang): <K extends Key>(key: K, ...args: Args<K>) => string {
  return (key, ...args) => translate(lang(), key, args[0] as Record<string, string | number> | undefined)
}

/** Whether key is one of the texts (for keys built at run time, e.g. from an id). */
export const hasKey = (key: string): key is Key => lookup(en as Messages, key) !== undefined

export { CATALOGS }
