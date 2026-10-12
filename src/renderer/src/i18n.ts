// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The pages' texts in the app's language (src/shared/i18n). The language is a reactive value: everything that calls
// t() while rendering (a template, a computed) follows a change at once, without a restart.
//   <script setup> import { t } from '../i18n'      <template> {{ t('settings.title') }}
// Never call t() once at module level or into a plain constant of a component's setup: that keeps the text of the
// language at that moment. Keep the key instead (title: 'settings.folders.models' as Key) and call t() in the template.

import { ref } from 'vue'
import { LOCALES, translate, value, type Args, type Key, type Lang, type Language } from '@shared/i18n'

export type { Key, PlainKey } from '@shared/i18n'

/** the app's current language (System resolved by the main process) */
export const locale = ref<Lang>('en')
/** the locale for dates: macOS's region with the setting System, else the chosen language's */
const region = ref('en-US')

export function t<K extends Key>(key: K, ...args: Args<K>): string {
  return translate(locale.value, key, args[0] as Record<string, string | number> | undefined)
}

/** A key built at run time (from an id) as a text, or fallback when there is no such key. */
export function tMaybe(key: string, fallback: string): string {
  const text = translate(locale.value, key)
  return text === key ? fallback : text
}

/** The locale for numbers: the app's language, so a decimal mark matches the words around it. */
export const numLocale = (): string => LOCALES[locale.value]
/** The locale for dates: macOS's region with the language setting System, else the chosen language's. */
export const dateLocale = (): string => region.value

/** A number with a fixed count of decimals in the app's language: 2.5 -> "2.5", in German "2,5"; no grouping. */
export function num(value: number, digits = 0): string {
  return value.toLocaleString(numLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })
}

/** A number as it comes (0.85, 12), with the language's decimal mark: in German 0,85. */
export const dec = (n: number): string => value(locale.value, n)

/** A date and time in the app's language. */
export const dateTime = (ts: number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string =>
  new Date(ts).toLocaleString(dateLocale(), options)

function apply(language: Language): void {
  locale.value = language.lang
  region.value = language.locale
  document.documentElement.lang = language.lang
}

/** Asks the main process for the language and follows its changes (every window does this before it mounts). */
export async function startI18n(): Promise<void> {
  try {
    apply(await window.vk.i18n.lang())
  } catch {
    // no main process (a test page): English
  }
  window.vk?.i18n.onLang(apply)
}
