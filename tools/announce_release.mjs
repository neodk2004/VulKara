// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Announces a release on Mastodon and Bluesky (.github/workflows/release.yml). Each one only when its secrets are set:
//   MASTODON_INSTANCE (https://mastodon.social), MASTODON_TOKEN (an access token with write:statuses)
//   BLUESKY_HANDLE (vulkara.bsky.social), BLUESKY_APP_PASSWORD (an app password, never the account password)
// The text: the version, the first entry of the release notes, the download link, hashtags; at most 300 characters.
//   TAG=v0.5.1 RELEASE_URL=... BODY="$(cat notes.md)" node tools/announce_release.mjs --dry-run
const { TAG = '', RELEASE_URL = '', BODY = '' } = process.env
const dry = process.argv.includes('--dry-run')
const LIMIT = 300
const TAGS = '#VulKara #StableDiffusion #macOS #AIart'

/** The first entry of the notes as plain text: no Markdown, one line. */
function firstEntry(body) {
  const entry = (body.split(/\n(?=- )/).find((e) => e.startsWith('- ')) ?? '').split(/\n\s*\n/)[0]
  return entry.replace(/^- /, '').replace(/\*\*|`|\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim()
}

export function announcement(tag, url, body) {
  const head = `VulKara ${tag.replace(/^v/, '')} is out.`
  const tail = `\n\n${url}\n${TAGS}`
  let entry = firstEntry(body)
  const room = LIMIT - head.length - tail.length - 1
  // the first sentence when the whole entry is too long, cut at a word only when that is too long as well
  const sentence = /^.+?[.:;](?=\s|$)/.exec(entry)?.[0]
  if (entry.length > room && sentence && sentence.length <= room) entry = sentence.replace(/[:;]$/, '.')
  if (entry.length > room) entry = entry.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, '') + '…'
  return `${head} ${entry}${tail}`.replace(/ \n/, '\n')
}

async function mastodon(text) {
  const { MASTODON_INSTANCE: base, MASTODON_TOKEN: token } = process.env
  if (!base || !token) return 'Mastodon: no secrets, skipped'
  const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/statuses`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': `vulkara-${TAG}` },
    body: JSON.stringify({ status: text, language: 'en' }),
  })
  if (!res.ok) throw new Error(`Mastodon: HTTP ${res.status} ${await res.text()}`)
  return `Mastodon: ${(await res.json()).url}`
}

/** Bluesky marks links and hashtags with facets (byte offsets in UTF-8). */
function facets(text) {
  const bytes = (s) => Buffer.byteLength(s, 'utf8')
  const out = []
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    const start = bytes(text.slice(0, m.index))
    out.push({ index: { byteStart: start, byteEnd: start + bytes(m[0]) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] })
  }
  for (const m of text.matchAll(/#(\w+)/g)) {
    const start = bytes(text.slice(0, m.index))
    out.push({ index: { byteStart: start, byteEnd: start + bytes(m[0]) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[1] }] })
  }
  return out
}

async function bluesky(text) {
  const { BLUESKY_HANDLE: handle, BLUESKY_APP_PASSWORD: password } = process.env
  if (!handle || !password) return 'Bluesky: no secrets, skipped'
  const api = 'https://bsky.social/xrpc'
  const login = await fetch(`${api}/com.atproto.server.createSession`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: handle, password }),
  })
  if (!login.ok) throw new Error(`Bluesky login: HTTP ${login.status}`)
  const { accessJwt, did } = await login.json()
  const res = await fetch(`${api}/com.atproto.repo.createRecord`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessJwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record: { $type: 'app.bsky.feed.post', text, facets: facets(text), langs: ['en'], createdAt: new Date().toISOString() } }),
  })
  if (!res.ok) throw new Error(`Bluesky: HTTP ${res.status} ${await res.text()}`)
  return `Bluesky: ${(await res.json()).uri}`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!TAG || !RELEASE_URL) throw new Error('TAG and RELEASE_URL are needed')
  const text = announcement(TAG, RELEASE_URL, BODY)
  console.log(`${text}\n(${text.length} characters)\n`)
  if (dry) process.exit(0)
  // one failing service does not stop the other
  for (const post of [mastodon, bluesky]) {
    try {
      console.log(await post(text))
    } catch (err) {
      console.log(String(err))
      process.exitCode = 1
    }
  }
}
