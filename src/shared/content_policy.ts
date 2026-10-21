// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Content policy shared by the main process (every job's prompt) and the pages (consent question).
//
// The model licenses and their acceptable use policies forbid, among other things, sexual content involving
// minors and intimate pictures of real people without their consent. Krea 2 (4.2) and the FLUX non-commercial
// licenses (2.e) require content filter measures; the About page describes all measures.
//
// The word lists only contain words that clearly mean children (not "girl", "baby" or "junge Frau", which prompts
// about adults use too); the picture check of every result covers the rest. A trailing "*" matches any ending.
// The texts are in src/shared/i18n (app.contentPolicy); the consent question stays English as the main process's
// signal to the pages, which show it in the app's language.

import { translate, type Lang } from './i18n'

const MINOR_TERMS = [
  'child', 'children', 'childlike', 'kid', 'kids', 'minor', 'minors', 'underage', 'under-age', 'under age',
  'preteen', 'pre-teen', 'teen', 'teens', 'teenage', 'teenager', 'tween', 'toddler', 'infant', 'schoolgirl*',
  'schoolboy*', 'schoolchild*', 'elementary school', 'middle school', 'loli', 'lolis', 'lolicon', 'shota',
  'shotacon', 'jailbait', 'little girl*', 'little boy*', 'young girl*', 'young boy*',
  'kinder', 'kindlich*', 'minderjährig*', 'minderjaehrig*', 'jugendlich*', 'teenie*', 'kleinkind*',
  'säugling*', 'schulmädchen', 'schulmaedchen', 'schüler*', 'schueler*', 'grundschul*', 'kleines mädchen',
  'kleiner junge', 'junges mädchen',
]
// ages below 18 ("12 year old", "15yo", "16-jährig", "14 jahre")
const AGE_PATTERN = /(^|[^0-9])([1-9]|1[0-7])\s*-?\s*(years?|yrs?|yo|y\.o\.|jahre|jährig\w*|jaehrig\w*)(?![a-z])/i

const SEXUAL_TERMS = [
  'nude', 'nudes', 'naked', 'nudity', 'topless', 'bottomless', 'nipple*', 'breast*', 'boob*', 'tits', 'pussy',
  'vagina*', 'vulva', 'penis*', 'cock', 'dick', 'genital*', 'sex', 'sexual*', 'sexy', 'erotic*', 'porn*', 'nsfw',
  'hentai', 'lewd', 'explicit', 'fetish*', 'bdsm', 'orgasm*', 'masturbat*', 'fellatio', 'blowjob*', 'cum',
  'cumshot*', 'intercourse', 'lingerie', 'undress*', 'spread legs', 'seductive', 'provocative',
  'nackt*', 'oben ohne', 'brüste', 'brueste', 'sexuell*', 'erotisch*', 'intim*', 'unbekleidet', 'ausgezogen',
  'reizwäsche', 'reizwaesche', 'unterwäsche', 'unterwaesche',
]

const LETTER = 'a-zäöüß'

function matcher(term: string): [string, RegExp] {
  const prefix = term.endsWith('*')
  const body = (prefix ? term.slice(0, -1) : term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [term.replace('*', ''), new RegExp('(^|[^' + LETTER + '])' + body + (prefix ? '' : '(?![' + LETTER + '])'), 'i')]
}

const MINOR = MINOR_TERMS.map(matcher)
const SEXUAL = SEXUAL_TERMS.map(matcher)

/** Fullwidth or styled letters as plain ones, invisible characters (zero-width joiners) dropped: the text encoders
 * of the models normalize the same way, so "ｃｈｉｌｄ" or "ch\u200Bild" reach them as "child". */
export function normalizePrompt(prompt: string | undefined): string {
  return String(prompt ?? '').normalize('NFKC').replace(/\p{Cf}/gu, '').toLowerCase()
}

function find(text: string, list: [string, RegExp][]): string | null {
  const hit = list.find(([, re]) => re.test(text))
  return hit ? hit[0] : null
}

/** A prompt asking for sexual content involving minors: the reason (in lang), else null. */
export function prohibitedPrompt(prompt: string | undefined, lang: Lang = 'en'): string | null {
  const text = normalizePrompt(prompt)
  const sexual = find(text, SEXUAL)
  if (!sexual) return null
  const age = text.match(AGE_PATTERN)
  const minor = find(text, MINOR) ?? (age ? age[0].trim() : null)
  if (!minor) return null
  return translate(lang, 'app.contentPolicy.prohibited', { sexual, minor })
}

/** A sexual prompt: with a picture of a real person as input the app asks for the person's consent. */
export function isSexualPrompt(prompt: string | undefined): boolean {
  return !!find(normalizePrompt(prompt), SEXUAL)
}

export const CONSENT_QUESTION = translate('en', 'app.contentPolicy.consent')
