// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Texts of the data files (recommended models, helper groups, the licence list) in the app's language
// (src/shared/i18n/data.ts); English, as the files have them, where no translation is known.
import { curatedText, groupText, licenceText } from '@shared/i18n/data'
import { locale } from '../i18n'

export const curatedDescription = (id: string, english: string): string => curatedText(locale.value, id, english)
export const helperGroup = (english: string): string => groupText(locale.value, english)
export const licenceListText = (english: string): string => licenceText(locale.value, english)
