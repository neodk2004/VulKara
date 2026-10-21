// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Finds English text in the pages that does not go through t() (src/shared/i18n):
//   templates: text between tags, text attributes (title, placeholder, label, hint, ...) and strings in {{ }} or in
//              bound attributes that read like words ('Checking…', 'Save'), except the first argument of t()
//   scripts of .vue files and the renderer's util/stores: strings that read like a sentence (a capital and a space)
// A line can be let through with a comment containing "i18n-ok" (on that line or the line above), e.g. for a name.
//
//   node tools/check_i18n.mjs            exit code 0 when nothing is found, 1 with a list
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { NodeTypes } from '@vue/compiler-core'

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src/renderer/src')

// text that stays as it is in every language: names, units, signs
const ALLOW = new Set([
  'VulKara', 'LoRA', 'LoRAs', 'MLX', 'Diffusers', 'ComfyUI', 'Civitai', 'Hugging Face', 'GitHub', 'PyPI', 'GB', 'MB', 'KB',
  'px', 's', 'ms', 'min', 'h', 'x', '×', '%', 'ControlNet', 'GGUF', 'VAE', 'CFG', 'SDXL', 'FLUX', 'macOS', 'Mac', 'Apple',
  'OK', 'Buy Me a Coffee', 'EU', 'AI GENERATED', 'JSON', 'PNG', 'JPEG', 'WebP', 'MP4', 'Lucide', 'Electron',
  'Vue', 'Pinia', 'PyTorch', 'safetensors', 'bf16', 'fp16', 'fp8', 'int8', 'int4', 'nvfp4', 'Q8', 'Q4', 'Q6', 'Q5',
  'Seed', 'Sampler', 'Prompt', 'Guidance', 'Inpainting', 'Runtime', 'Streaming', 'Checkpoint',
])
const TEXT_ATTRS = new Set(['title', 'placeholder', 'label', 'aria-label', 'alt', 'hint', 'text', 'more', 'subtitle', 'empty', 'note', 'caption', 'confirm'])
const WORDS = /[A-Za-zÀ-ÿ]{2,}/

const findings = []

function wordy(s) {
  const v = s.replace(/\s+/g, ' ').trim()
  if (!v || !WORDS.test(v) || ALLOW.has(v)) return false
  // keys, ids, paths, class names, urls, css: no spaces, no capital start, or a dot path
  if (/^[a-z0-9_.:/#@-]+$/.test(v) && !/\s/.test(v)) return false
  if (/^(https?:|vk-|\/|\.|#|--)/.test(v)) return false
  // every word allowed (e.g. "LoRA · GB")
  if (v.split(/[\s·,/()+:→←-]+/).filter(Boolean).every((w) => ALLOW.has(w) || !WORDS.test(w))) return false
  return true
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length
}

function allowed(lines, line) {
  return /i18n-ok/.test(lines[line - 1] ?? '') || /i18n-ok/.test(lines[line - 2] ?? '')
}

function report(file, text, lines, offset, what) {
  const line = lineAt(text, offset)
  if (allowed(lines, line)) return
  findings.push(`${relative(ROOT, file)}:${line}: ${what}`)
}

// string literals in an expression that read like words, outside t('...')'s key
function expressionStrings(expr) {
  const out = []
  const re = /(\bt|tMaybe|hasKey)\(\s*(['"`])(?:\\.|(?!\2).)*\2|(['"`])((?:\\.|(?!\3).)*)\3/g
  let m
  while ((m = re.exec(expr))) {
    if (m[1]) continue
    const s = m[4].replace(/\$\{[^}]*\}/g, ' ')
    if (wordy(s) && (/[A-Z]/.test(s[0] ?? '') || /\s/.test(s.trim()) || /…$/.test(s))) out.push(m[4])
  }
  return out
}

function walk(node, file, text, lines, base) {
  if (node.type === NodeTypes.TEXT) {
    if (wordy(node.content)) report(file, text, lines, base + node.loc.start.offset, `text "${node.content.trim().slice(0, 60)}"`)
  } else if (node.type === NodeTypes.INTERPOLATION) {
    for (const s of expressionStrings(node.content.loc.source)) report(file, text, lines, base + node.loc.start.offset, `string '${s.slice(0, 60)}' in {{ }}`)
  } else if (node.type === NodeTypes.ELEMENT) {
    for (const p of node.props) {
      if (p.type === NodeTypes.ATTRIBUTE && TEXT_ATTRS.has(p.name) && p.value && wordy(p.value.content)) {
        report(file, text, lines, base + p.loc.start.offset, `attribute ${p.name}="${p.value.content.slice(0, 60)}"`)
      } else if (p.type === NodeTypes.DIRECTIVE && p.exp && (p.name === 'bind' || p.name === 'on' || p.name === 'if' || p.name === 'show')) {
        const arg = p.arg?.content ?? ''
        if (p.name === 'bind' && ['class', 'style', 'key', 'to', 'src', 'href', 'is', 'type', 'value', 'id', 'name'].includes(arg)) continue
        if (p.name === 'if' || p.name === 'show') continue
        for (const s of expressionStrings(p.exp.loc.source)) report(file, text, lines, base + p.loc.start.offset, `string '${s.slice(0, 60)}' in ${p.rawName}`)
      }
    }
  }
  for (const c of node.children ?? []) walk(c, file, text, lines, base)
  if (node.branches) for (const b of node.branches) walk(b, file, text, lines, base)
}

// a string in a script that reads like a sentence: starts with a capital, has a space and a word of letters
const SENTENCE = /(['"`])([A-ZÀ-Ý][^'"`\n]*?\s[^'"`\n]*?)\1/g
function scriptStrings(file, text, lines, base, code) {
  let m
  while ((m = SENTENCE.exec(code))) {
    const s = m[2]
    if (!wordy(s.replace(/\$\{[^}]*\}/g, ' '))) continue
    const before = code.slice(Math.max(0, m.index - 30), m.index)
    // keys of t(), console output, errors meant for the log, imports
    if (/(\bt|tMaybe|console\.\w+|log|import|from)\(?\s*$/.test(before)) continue
    const line = lineAt(text, base + m.index)
    const src = lines[line - 1] ?? ''
    if (/^\s*(\/\/|\*|\/\*)/.test(src)) continue
    report(file, text, lines, base + m.index, `script string '${s.slice(0, 60)}'`)
  }
}

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(vue|ts)$/.test(name) && !/\.test\.ts$|\.d\.ts$/.test(name) && name !== 'i18n.ts') out.push(p)
  }
  return out
}

for (const file of files(SRC)) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  if (file.endsWith('.vue')) {
    const { descriptor } = parseSfc(text, { filename: file })
    if (descriptor.template?.ast) walk(descriptor.template.ast, file, text, lines, 0) // the template's offsets are the file's
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (block) scriptStrings(file, text, lines, block.loc.start.offset, block.content)
    }
  } else {
    scriptStrings(file, text, lines, 0, text)
  }
}

if (findings.length) {
  console.log(findings.join('\n'))
  console.log(`\n${findings.length} texts without t() (allow one with a comment "i18n-ok")`)
  process.exit(1)
}
console.log('i18n: all texts go through t()')
