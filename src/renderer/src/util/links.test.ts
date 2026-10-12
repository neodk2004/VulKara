// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWebLink, openLink } from './links'

describe('links from outside the app', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('takes https pages only', () => {
    expect(isWebLink('https://civitai.com/models/1')).toBe(true)
    expect(isWebLink('HTTPS://huggingface.co/a/b')).toBe(true)
    for (const link of [undefined, '', 'http://example.com', 'javascript:alert(1)', 'file:///etc/passwd', 'https://', ' https://x.org']) {
      expect(isWebLink(link)).toBe(false)
    }
  })

  it('hands only web pages to the browser', () => {
    const openExternal = vi.fn(() => Promise.resolve())
    vi.stubGlobal('window', { vk: { app: { openExternal } } })
    openLink('javascript:alert(1)')
    openLink(undefined)
    openLink('https://huggingface.co/x')
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith('https://huggingface.co/x')
  })
})
