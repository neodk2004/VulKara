// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Tips & tricks: prompt help and guidelines, grouped by topic and by model family (src/shared/data/tips.json).

import data from '@shared/data/tips.json'
import { locale } from '../i18n'

export interface TipImage {
  /** file name in src/renderer/src/assets/tips */
  file: string
  caption: string
  /** the prompt the picture was made with */
  prompt?: string
}

export interface Tip {
  title: string
  body: string
  /** a prompt that shows the tip */
  example?: string
  do?: string[]
  avoid?: string[]
  /** pictures made for the tip, usually a plain prompt next to a worked-out one (same model and seed) */
  images?: TipImage[]
}

// the pictures of the tips, shipped with the app
const PICTURES = import.meta.glob('../assets/tips/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

/** The URL of a tip picture, '' when the file is missing. */
export const tipPicture = (file: string): string => PICTURES['../assets/tips/' + file] ?? ''

export interface TipGroup {
  id: string
  title: string
  intro: string
  tips: Tip[]
}

export interface TipSource {
  title: string
  url: string
}

/** the tips in English (the source; src/shared/i18n/locales/<lang>/tips.json has the same groups, tips, pictures and sources) */
export const TIP_GROUPS = (data as { groups: TipGroup[] }).groups
export const TIP_SOURCES = (data as { sources: TipSource[] }).sources

const FILES = import.meta.glob<{ groups: TipGroup[]; sources: TipSource[] }>('@shared/i18n/locales/*/tips.json', { eager: true, import: 'default' })
/** the tips of every other language by its code */
export const TIPS_BY_LANG: Record<string, { groups: TipGroup[]; sources: TipSource[] }> = Object.fromEntries(
  Object.entries(FILES).map(([p, tips]) => [p.split('/').slice(-2)[0], tips]),
)

/** The tips in the app's language (call it while rendering, so a change of language shows at once); English where a
 * language has none. */
export const tipGroups = (): TipGroup[] => TIPS_BY_LANG[locale.value]?.groups ?? TIP_GROUPS

// topics for every model, then the model families
export const TOPICS = ['general', 'anatomy', 'details', 'loras', 'special']

// model families that share their tips with another group
const FAMILY_GROUP: Record<string, string> = { sd2: 'sd1', qwen_image21: 'qwen_image' }

/** The group with the tips for a model family, if there is one. */
export function groupForFamily(family: string | undefined): TipGroup | undefined {
  if (!family) return undefined
  const id = FAMILY_GROUP[family] ?? family
  return TOPICS.includes(id) ? undefined : tipGroups().find((g) => g.id === id)
}

/** The tips that contain all words of a search, in title, text, example or the lists. */
export function searchTips(groups: TipGroup[], query: string): TipGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return groups
  return groups
    .map((g) => ({
      ...g,
      tips: g.tips.filter((t) => {
        const text = [g.title, t.title, t.body, t.example ?? '', ...(t.do ?? []), ...(t.avoid ?? [])].join(' ').toLowerCase()
        return words.every((w) => text.includes(w))
      }),
    }))
    .filter((g) => g.tips.length)
}
