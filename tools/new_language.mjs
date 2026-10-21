// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Starts a new language: src/shared/i18n/locales/<code>/ with every text in English, ready to be translated
// (docs/TRANSLATING.md). An existing folder is completed instead: texts it has stay, missing ones are added in English.
//
//   node tools/new_language.mjs <code> "<own name>" "<English name>" [<locale>]
//   node tools/new_language.mjs it "Italiano" "Italian" it-IT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(import.meta.dirname, '..')
const [code, name, english, locale = code] = process.argv.slice(2)
if (!code || !name || !english || !/^[a-z]{2,3}(-[A-Z]{2}|-[0-9]{3})?$/.test(code)) {
  console.log('node tools/new_language.mjs <code> "<own name>" "<English name>" [<locale>]   e.g. it "Italiano" "Italian" it-IT')
  console.log('<code>: a language ("it") or a language with its region ("pt-PT", "es-419")')
  process.exit(1)
}
const DIR = join(ROOT, 'src/shared/i18n/locales', code)
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const read = (f) => (existsSync(join(DIR, f)) ? JSON.parse(readFileSync(join(DIR, f), 'utf8')) : undefined)
const write = (f, data) => writeFileSync(join(DIR, f), JSON.stringify(data, null, 1) + '\n')

/** The English texts (src/shared/i18n/en, TypeScript), bundled once to read them here. */
async function englishMessages() {
  const tmp = mkdtempSync(join(tmpdir(), 'vk-i18n-'))
  try {
    const out = join(tmp, 'en.mjs')
    await build({ entryPoints: [join(ROOT, 'src/shared/i18n/en/index.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
    return (await import(pathToFileURL(out).href)).en
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** The texts of the data files as data.ts wants them (src/shared/i18n/data.test.ts builds the same). */
function englishData() {
  const out = { curated: {}, helpers: {}, groups: {}, tools: {}, licences: {} }
  for (const c of json('src/shared/data/curated_models.json')) out.curated[c.id] = c.description
  for (const h of json('engines/diffusers/helpers.json').helpers) {
    out.helpers[h.id] = { name: h.name, description: h.description }
    out.groups[h.group] = h.group
  }
  out.groups['Photo tools'] = 'Photo tools'
  out.groups = Object.fromEntries(Object.entries(out.groups).sort(([a], [b]) => a.localeCompare(b)))
  for (const t of json('engines/diffusers/photo_tools.json').tools) {
    out.tools[t.id] = { name: t.name, summary: t.summary ?? '', description: t.description }
    if (t.default_label) out.tools[t.id].defaultLabel = t.default_label
    if (t.variants) out.tools[t.id].variants = Object.fromEntries(Object.entries(t.variants).map(([k, v]) => [k, { label: v.label, description: v.description }]))
  }
  const licences = json('src/shared/data/licenses.json')
  for (const m of licences.models) {
    out.licences[m.group] = m.group
    if (m.note) out.licences[m.note] = m.note
  }
  for (const s of licences.software) out.licences[s.group] = s.group
  return out
}

/** english with every text the language already has (same keys) taken from have */
function merge(englishTree, have) {
  if (typeof englishTree === 'string') return typeof have === 'string' && have.trim() ? have : englishTree
  if (Array.isArray(englishTree)) return englishTree.map((v, i) => merge(v, Array.isArray(have) ? have[i] : undefined))
  if (englishTree && typeof englishTree === 'object') {
    return Object.fromEntries(Object.entries(englishTree).map(([k, v]) => [k, merge(v, have && typeof have === 'object' ? have[k] : undefined)]))
  }
  return englishTree
}

/** the tips: texts from have where the structure matches, everything that must stay English from tips.json */
function mergeTips(en, have) {
  const tips = merge(en, have)
  // prompts, picture files and sources are the same in every language
  tips.sources = en.sources
  tips.groups.forEach((g, i) => g.tips.forEach((tip, j) => {
    const e = en.groups[i].tips[j]
    if (e.example !== undefined) tip.example = e.example
    tip.images?.forEach((im, k) => Object.assign(im, { file: e.images[k].file, prompt: e.images[k].prompt }))
  }))
  return tips
}

mkdirSync(DIR, { recursive: true })
const fresh = !existsSync(join(DIR, 'messages.json'))
write('language.json', { name, english, locale })
write('messages.json', merge(await englishMessages(), read('messages.json')))
write('data.json', merge(englishData(), read('data.json')))
write('tips.json', mergeTips(json('src/shared/data/tips.json'), read('tips.json')))
console.log(`${fresh ? 'Started' : 'Completed'} ${code} (${english}) in src/shared/i18n/locales/${code}: language.json, messages.json, data.json, tips.json`)
console.log('Translate the texts (docs/TRANSLATING.md), then: npm test && npm run typecheck')
