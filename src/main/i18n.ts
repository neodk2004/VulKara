// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The main process's texts (errors, progress, dialogs) in the app's language. index.ts sets the language from the
// settings and macOS; until then, and in tests, it is English.

import { translator, type Lang, type Language } from '@shared/i18n'
import { engineText } from '@shared/i18n/engine'

let current: Language = { lang: 'en', locale: 'en-US' }

export const setMainLang = (lang: Lang, locale: string): void => {
  current = { lang, locale }
}
export const mainLanguage = (): Language => current

/** t('main.errors.busy') in the app's current language */
export const t = translator(() => current.lang)

/** An engine's status line in the app's language (known lines only; errors stay English). */
export const engineLine = (line: string): string => engineText(current.lang, line)
