// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// A short guide for every LoRA: what it is, what it needs and how to get good pictures with it, written from
// what is known about this LoRA (its family, trigger words, training data). Plain words, short sentences.

import type { LoraDetails, LoraInfo } from '@shared/api'
import { FAMILY_TITLES, VARIANT_TITLES, loraFits } from '@shared/lora_fit'
import type { Asset } from '@shared/types'
import { t, type PlainKey } from '../i18n'

export interface GuideSection {
  title: string
  text: string[]
}

const FAMILY_NAMES: Record<string, string> = {
  ...FAMILY_TITLES, sd1: 'Stable Diffusion 1.x', sd2: 'Stable Diffusion 2.x', sd3: 'Stable Diffusion 3.5',  // i18n-ok
}

// where a LoRA of a family usually feels right, and the size its models paint best
const HABITS: Record<string, { low: number; high: number; px?: number }> = {
  sd1: { low: 0.6, high: 0.9, px: 512 },
  sd2: { low: 0.6, high: 0.9, px: 768 },
  sdxl: { low: 0.7, high: 1, px: 1024 },
  sd3: { low: 0.7, high: 1, px: 1024 },
  flux1: { low: 0.8, high: 1.1, px: 1024 },
  chroma: { low: 0.8, high: 1.1, px: 1024 },
  flux2: { low: 0.8, high: 1.1, px: 1024 },
  krea2: { low: 0.8, high: 1.1, px: 1024 },
  z_image: { low: 0.7, high: 1, px: 1024 },
}

const list = (items: string[]): string =>
  items.length < 2 ? items.join('') : t('lora.guide.listAnd', { items: items.slice(0, -1).join(', '), last: items[items.length - 1] })
const quoted = (items: string[]): string => list(items.map((w) => `“${w}”`))

const TEACHES: Record<string, PlainKey> = {
  style: 'lora.guide.teachesStyle', person: 'lora.guide.teachesPerson', object: 'lora.guide.teachesObject', concept: 'lora.guide.teachesConcept',
}

/** What kind of thing the LoRA teaches, guessed from its names and training tags; undefined when unclear. */
export function loraKind(lora: Asset, details?: LoraDetails, info?: LoraInfo): 'style' | 'person' | 'object' | 'concept' | undefined {
  if (info?.kind) return info.kind
  const text = [lora.title, lora.name, details?.pageName ?? '', details?.training?.title ?? '', ...(lora.meta.triggerWords ?? [])].join(' ').toLowerCase()
  if (/style|painting|design|art\b|photography|look/.test(text)) return 'style'
  if (/\b(girl|boy|woman|man|person|character|face)\b/.test(text)) return 'person'
  return undefined
}

export function loraGuide(lora: Asset, details: LoraDetails | undefined, models: Asset[], info?: LoraInfo): GuideSection[] {
  const family = (lora.meta.variant && VARIANT_TITLES[lora.meta.variant]) || (FAMILY_NAMES[lora.meta.family] ?? lora.meta.family)
  const habit = HABITS[lora.meta.family] ?? { low: 0.7, high: 1 }
  const words = lora.meta.triggerWords ?? []
  const fitting = models.filter((m) => m.type === 'model' && loraFits(lora, m) && m.meta.kind === 'image').map((m) => m.title)
  const training = details?.training
  const kind = loraKind(lora, details, info)
  const advised = info?.recommended
  const sections: GuideSection[] = []

  const makersName = info?.name ?? details?.pageName ?? ''
  sections.push({
    title: t('lora.guide.whatTitle'),
    text: [
      `${t('lora.guide.isLora', { title: lora.title })} ${t((kind && TEACHES[kind]) || 'lora.guide.teachesUnknown')}`,
      ...(info?.name || details?.pageName ? [info?.creator ? t('lora.guide.makersCreatorCall', { creator: info.creator, name: makersName }) : t('lora.guide.makersCall', { name: makersName })] : []),
    ],
  })

  sections.push({
    title: t('lora.guide.fitsTitle'),
    text: [
      t('lora.guide.madeFor', { family }),
      fitting.length
        ? fitting.length > 6
          ? t('lora.guide.fittingMore', { models: list(fitting.slice(0, 6)), n: fitting.length - 6 })
          : t('lora.guide.fitting', { models: list(fitting) })
        : t('lora.guide.noModel', { family }),
    ],
  })

  sections.push({
    title: t('lora.guide.switchTitle'),
    text: words.length
      ? [t('lora.guide.wakesUp', { n: words.length, words: quoted(words.slice(0, 6)) }), t('lora.guide.addsTrigger')]
      : [t('lora.guide.noTrigger')],
  })

  const range = advised && advised.minStrength !== undefined && advised.maxStrength !== undefined && advised.minStrength !== advised.maxStrength
    ? { min: advised.minStrength, max: advised.maxStrength } : undefined
  sections.push({
    title: t('lora.guide.strengthTitle'),
    text: [
      `${t('lora.guide.strengthIntro')} ${advised?.strength !== undefined
        ? advised.fromMakers
          ? range ? t('lora.guide.makersRecommendRange', { strength: advised.strength, ...range }) : t('lora.guide.makersRecommend', { strength: advised.strength })
          : range ? t('lora.guide.examplesHaveRange', { strength: advised.strength, ...range }) : t('lora.guide.examplesHave', { strength: advised.strength })
        : t('lora.guide.usualStrength', { family, low: habit.low, high: habit.high })}`,
      t('lora.guide.tooHigh'),
      t('lora.guide.comparePage'),
    ],
  })

  const tips: string[] = [habit.px ? t('lora.guide.paintBestAround', { px: habit.px }) : t('lora.guide.paintBestOwn')]
  if (training?.resolution) tips.push(t('lora.guide.learnedSize', { size: training.resolution.replace(/[()]/g, '') }))
  if (training?.images) tips.push(t(training.images < 20 ? 'lora.guide.learnedFew' : 'lora.guide.learnedMany', { n: training.images }))
  const tags = (training?.topTags ?? []).map((tag) => tag[0]).filter((tag) => !words.includes(tag)).slice(0, 6)
  if (tags.length) tips.push(t('lora.guide.knownWords', { n: tags.length, words: quoted(tags) }))
  const settings = [
    advised?.steps && t('lora.guide.steps', { n: advised.steps }),
    advised?.guidance !== undefined && t('lora.guide.guidance', { value: advised.guidance }),
    advised?.sampler && t('lora.guide.sampler', { name: advised.sampler }),
  ].filter((s): s is string => !!s)
  if (settings.length && advised) tips.push(t('lora.guide.makersSettings', { settings: list(settings) }))
  tips.push(kind === 'style' ? t('lora.guide.styleTip') : t('lora.guide.promptTip'))
  tips.push(t('lora.guide.severalTip'))
  sections.push({ title: t('lora.guide.tipsTitle'), text: tips })

  if (info?.examples.length) sections.push({ title: t('lora.guide.moreTitle'), text: [t('lora.guide.moreExamples')] })
  else if (details?.page) sections.push({ title: t('lora.guide.moreTitle'), text: [t('lora.guide.moreCivitai')] })
  return sections
}
