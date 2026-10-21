// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The consent question (shared/content_policy.ts) as a dialog with two plain answers: the question itself as its
// message, the explanation as its detail. Resolves true when the user answers yes.
import { t } from '../i18n'

export function consentParts(text = t('app.contentPolicy.consent')): { question: string; detail: string } {
  const parts = text.split('\n\n')
  return { question: parts[parts.length - 1], detail: parts.slice(0, -1).join('\n\n') }
}

export function askConsent(): Promise<boolean> {
  const { question, detail } = consentParts()
  return window.vk.dialog.ask(question, t('common.consent.yes'), t('common.consent.no'), detail)
}
