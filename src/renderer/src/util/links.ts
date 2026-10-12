// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Links of model pages, licences and LoRA origins come from outside the app (Civitai, Hugging Face, manifests):
// only web pages are handed to the browser, anything else is ignored.

export const isWebLink = (link: string | undefined): link is string => !!link && /^https:\/\/[^\s/]/i.test(link)

export function openLink(link: string | undefined): void {
  if (isWebLink(link)) window.vk.app.openExternal(link).catch(() => undefined)
}
