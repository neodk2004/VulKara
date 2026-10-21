// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// A log made fit to be posted: everything that belongs to the user or this Mac is replaced by ****, before the log
// is shown in the problem report or copied. What helps to find a problem stays: model and LoRA names, runtime and
// engine files, checksums, error messages. Pure: the Mac's names come in as the context.
//
// The rules, in this order:
//   tokens    hf_…, ghp_…, github_pat_…, JWTs, what follows "Authorization:" or "Bearer", key-like values of
//             token= / api_key= / key= (8+ characters with a digit), 32 hex characters on their own (a Civitai key)
//             and mixed-case letter and digit runs of 40+ (base64 keys). Hex runs of 40 (commits) and 64 (SHA-256
//             of files and models) are kept: they are checksums, not secrets.
//   prompts   string values of JSON / Python dict keys such as prompt, negative_prompt, caption, note, trigger_words,
//             title, display_name, description, rules, text; prompt="…" arguments; the text after "Prompt:" labels.
//   links     the query and fragment of a URL (https://host/path?**** ), a user:password@ part (counted as a token).
//   paths     /Users/<me> becomes ~, another /Users/<name> and /Volumes/<name> become /Users/**** and /Volumes/****.
//             From such a root (also /tmp, /private/var/folders and unknown roots), every folder is **** up to the
//             first app folder (models, loras, images, history, runtimes, stream_cache, helpers, logs, engines,
//             Library, site-packages, the ComfyUI model folders, …); from there on everything is kept, so
//             /Volumes/****/****/****/models/FLUX.1-dev/weights stays readable. Folders named VulKara and the
//             standard ones of a home folder (Desktop, Documents, Downloads, Pictures, Movies, Music) are kept.
//             System paths (/Applications, /System, /Library, /usr, /opt, …) are kept. File names with a technical
//             extension (.json, .safetensors, .gguf, .py, …) are kept anywhere.
//   files     names of pictures and videos (.png .jpg .heic .webp .tif .mp4 .mov …) become ****.<ext>, in paths
//             and on their own.
//   emails, addresses (IPv4 and IPv6 other than 127.0.0.1, ::1, 0.0.0.0; MAC), ids (UUIDs)
//   names     the user name, the Mac's host name (with and without .local), the names of mounted volumes, and the
//             folder names hidden in a path wherever else they appear.

export const MASK = '****'

export interface RedactContext {
  /** os.homedir() */
  home?: string
  /** os.userInfo().username */
  user?: string
  /** os.hostname() */
  host?: string
  /** the names in /Volumes */
  volumes?: string[]
}

export const CATEGORIES = ['paths', 'files', 'names', 'prompts', 'tokens', 'links', 'emails', 'addresses', 'ids'] as const
export type RedactCategory = (typeof CATEGORIES)[number]
export type RedactCounts = Record<RedactCategory, number>

export interface Redacted {
  text: string
  counts: RedactCounts
}

const LABELS: Record<RedactCategory, [string, string]> = {
  paths: ['path', 'paths'],
  files: ['file name', 'file names'],
  names: ['name', 'names'],
  prompts: ['prompt or text', 'prompts and texts'],
  tokens: ['token', 'tokens'],
  links: ['link query', 'link queries'],
  emails: ['e-mail address', 'e-mail addresses'],
  addresses: ['network address', 'network addresses'],
  ids: ['ID', 'IDs'],
}

/** "Hidden: 41 paths, 2 tokens, 3 prompts and texts", or that nothing was found. */
export function hiddenSummary(counts: RedactCounts): string {
  const parts = CATEGORIES.filter((c) => counts[c] > 0).map((c) => `${counts[c]} ${LABELS[c][counts[c] === 1 ? 0 : 1]}`)
  return parts.length ? `Hidden: ${parts.join(', ')}` : 'Nothing personal found'
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const MEDIA_EXT = 'png|jpe?g|jpe|heic|heif|webp|tiff?|bmp|gif|avif|jxl|psd|dng|raw|cr2|cr3|nef|arw|orf|rw2|mp4|mov|m4v|avi|mkv|webm|3gp'
const MEDIA = new RegExp(`\\.(${MEDIA_EXT})$`, 'i')
// file names that say what a program reads or writes, not what the user named
const TECHNICAL_EXT = 'json|jsonl|safetensors|gguf|ckpt|pt|pth|bin|onnx|npz|py|pyc|so|dylib|node|js|mjs|cjs|asar|yaml|yml|toml|cfg|ini|txt|log|md|whl|sh|plist|mlpackage|mlmodelc|metallib'
const TECHNICAL = new RegExp(`\\.(${TECHNICAL_EXT})$`, 'i')
// app folders: from the first of them on, a path is kept
const ANCHORS = new Set([
  'models', 'loras', 'images', 'history', 'runtimes', 'stream_cache', 'helpers', 'pycache', 'logs', 'engines', 'library',
  'application support', 'site-packages', 'dist-packages', '.cache', 'contents', 'node_modules', 'app.asar',
  'app.asar.unpacked', 'checkpoints', 'diffusion_models', 'unet', 'vae', 'clip', 'text_encoders', 'controlnet',
  'upscale_models', 'embeddings', 'custom_nodes', 'venv', '.venv',
])
// folder names that are the app's or the system's, kept also before an app folder
const KEEP = new Set(['vulkara', 'desktop', 'documents', 'downloads', 'pictures', 'movies', 'music', 'public'])
const SYSTEM_ROOTS = ['Applications', 'System', 'Library', 'usr', 'bin', 'sbin', 'opt', 'etc', 'dev', 'cores', 'nix']
const TEMP_ROOTS = [['private', 'var', 'folders'], ['var', 'folders'], ['private', 'tmp'], ['tmp'], ['private', 'var', 'tmp'], ['var', 'tmp']]

/** JSON and Python dict keys whose string values are the user's words */
const TEXT_KEYS = 'negative_prompt_2|negative_prompt|prompt_2|prompt|positive|negative|captions?|notes?|trigger_words?|triggers|trained_words|display_?name|displayName|title|description|rules|comment|text'
const SECRET_KEYS = 'api_?key|apiKey|access_?token|accessToken|auth_?token|hf_token|civitai_token|token|password|passwd|secret|authorization'

const STR_D = String.raw`"(?:[^"\\\n]|\\.)*"`
const STR_S = String.raw`'(?:[^'\\\n]|\\.)*'`

function zero(): RedactCounts {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as RedactCounts
}

export function redact(input: string, ctx: RedactContext = {}): Redacted {
  const counts = zero()
  let text = input
  const sub = (re: RegExp, cat: RedactCategory, fn: (m: string, ...g: string[]) => string): void => {
    text = text.replace(re, (m: string, ...g: string[]) => {
      const out = fn(m, ...g)
      if (out !== m) counts[cat]++
      return out
    })
  }

  // tokens and secrets: first, before a link or path could take them apart
  sub(/\b(?:hf|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/g, 'tokens', () => MASK)
  sub(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, 'tokens', () => MASK)
  sub(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'tokens', () => MASK)
  sub(/\b(Authorization)(["']?\s*[:=]\s*["']?)(?:(?:Bearer|Basic|Token)\s+)?[^\s"',;]+/gi, 'tokens', (_m, k, sep) => `${k}${sep}${MASK}`)
  sub(/\b(Bearer)\s+(?!\*{4})[A-Za-z0-9._~+/=-]{8,}/g, 'tokens', (_m, b) => `${b} ${MASK}`)
  sub(/\b(token|api_?key|apikey|access_token|key|secret|password|sig|signature)=(?!\*{4})([A-Za-z0-9._~+/%-]{7,}[A-Za-z0-9_~+/%-])/gi, 'tokens',
    (m, k, v) => (/\d/.test(v) ? `${k}=${MASK}` : m))
  sub(/(?<![A-Za-z0-9])[0-9a-fA-F]{32}(?![A-Za-z0-9])/g, 'tokens', () => MASK)
  // (not a long name in code: those have words, runs of 8 small letters, and few digits)
  sub(/(?<![A-Za-z0-9+/_-])(?=[A-Za-z0-9+]*[a-z])(?=[A-Za-z0-9+]*[A-Z])[A-Za-z0-9+]{40,}={0,2}(?![A-Za-z0-9+/_-])/g,
    'tokens', (m) => (/^[0-9a-fA-F]+$/.test(m) || /[a-z]{8}/.test(m) || (m.match(/\d/g) ?? []).length < 3 ? m : MASK))

  // the user's words: prompts, captions, notes, names they gave
  const maskStrings = (v: string): string => v.replace(new RegExp(`${STR_D}|${STR_S}`, 'g'), (s) => (s.length > 2 ? `${s[0]}${MASK}${s[0]}` : s))
  for (const [keys, cat] of [[TEXT_KEYS, 'prompts'], [SECRET_KEYS, 'tokens']] as const) {
    const value = `${STR_D}|${STR_S}|\\[[^\\[\\]\\n]*\\]`
    sub(new RegExp(`(["'])(${keys})\\1(\\s*:\\s*)(${value})`, 'gi'), cat, (_m, q, k, sep, v) => `${q}${k}${q}${sep}${maskStrings(v)}`)
    // keyword arguments in a repr or a command line: prompt="…", prompt='…'
    sub(new RegExp(`(?<![\\w-])(${keys})=(${STR_D}|${STR_S})`, 'gi'), cat, (_m, k, v) => `${k}=${maskStrings(v)}`)
  }
  // "Prompt: a cat on a sofa", "negative prompt: …" up to the end of the line (not a type annotation in code)
  sub(/(?<![\w"'-])((?:negative[ _])?prompt|caption|trigger words?|note)(\s*:[ \t]*)(?!\*{4})(?!(?:str|int|float|bool|dict|list|Optional|None|Any)\b)(\S[^\n]*)$/gim,
    'prompts', (_m, k, sep) => `${k}${sep}${MASK}`)

  // links and paths, in one pass so that the path of a link is not taken for a file path
  const spaced = ['Application Support', 'Mobile Documents', ...(ctx.volumes ?? []).filter((v) => /\s/.test(v))]
  // a folder or file name with up to three spaces in it counts when a / follows (a folder) or it ends in a known
  // extension (a file); otherwise a name ends at a space
  const ch = `[^\\s/'"\`<>|,;:()\\[\\]{}]`
  const words = `${ch}+?(?: ${ch}+?){0,3}?`
  const seg = `(?:${spaced.map(escapeRe).join('|')}|${words}(?=/)|${words}\\.(?:${MEDIA_EXT}|${TECHNICAL_EXT})(?![\\w.])|${ch}+)`
  const pathRe = `(?<![\\w.~*\\\\/-])(?:~(?:/${seg})*|(?:/${seg})+)/?`
  const urlRe = String.raw`\b(?:https?|wss?|ftp|file):\/\/[^\s'"<>\`]+`
  const masked = new Set<string>()
  const kept = new Set<string>()
  const home = ctx.home?.replace(/\/+$/, '')
  const user = ctx.user

  const cleanPath = (p: string): string => {
    let tail = ''
    const trail = /[.]+$/.exec(p)
    if (trail && p.length > trail[0].length) {
      tail = trail[0]
      p = p.slice(0, -tail.length)
    }
    let root: string
    let rest: string[]
    const split = (s: string): string[] => (s ? s.split('/') : [])
    if (p === '~' || p.startsWith('~/')) {
      root = '~'
      rest = split(p.slice(2))
    } else if (home && home !== '/' && (p === home || p.startsWith(home + '/'))) {
      root = '~'
      rest = split(p.slice(home.length + 1))
    } else {
      const parts = p.slice(1).split('/')
      if (parts[0] === 'Users' && parts.length > 1) {
        root = parts[1] === user ? '~' : parts[1] === 'Shared' ? '/Users/Shared' : `/Users/${MASK}`
        if (root.endsWith(MASK)) masked.add(parts[1])
        rest = parts.slice(2)
      } else if (parts[0] === 'Volumes' && parts.length > 1) {
        root = `/Volumes/${MASK}`
        if (parts[1] !== 'Macintosh HD') masked.add(parts[1])
        else root = '/Volumes/Macintosh HD'
        rest = parts.slice(2)
      } else if (SYSTEM_ROOTS.includes(parts[0])) {
        // the system's own files: only picture and video names are hidden
        return '/' + parts.map((s) => (MEDIA.test(s) ? `${MASK}${s.slice(s.lastIndexOf('.'))}` : s)).join('/') + tail
      } else {
        const temp = TEMP_ROOTS.find((t) => t.every((s, i) => parts[i] === s))
        const n = temp ? temp.length : 1
        root = '/' + parts.slice(0, n).join('/')
        rest = parts.slice(n)
      }
    }
    let open = false
    const out = rest.map((s, i) => {
      if (s === '') return s
      if (MEDIA.test(s)) return `${MASK}${s.slice(s.lastIndexOf('.'))}`
      if (open || KEEP.has(s.toLowerCase())) {
        kept.add(s)
        return s
      }
      if (ANCHORS.has(s.toLowerCase())) {
        open = true
        return s
      }
      if (i === rest.length - 1 && TECHNICAL.test(s)) return s
      if (s === MASK) return s
      masked.add(s)
      return MASK
    })
    return [root, ...out].join('/') + tail
  }

  const cleanUrl = (u: string): string => {
    const m = /^([a-z]+:\/\/)([^/?#]*)([^?#]*)([?#].*)?$/i.exec(u)
    if (!m) return u
    const [, scheme, authority, path, query] = m
    if (scheme.toLowerCase() === 'file://') return scheme + authority + cleanPath(path || '/')
    let host = authority
    const at = authority.lastIndexOf('@')
    if (at >= 0) {
      host = `${MASK}@${authority.slice(at + 1)}`
      counts.tokens++
    }
    if (query && query.length > 1 && query.slice(1) !== MASK) {
      counts.links++
      return `${scheme}${host}${path}${query[0]}${MASK}`
    }
    return scheme + host + path + (query ?? '')
  }

  text = text.replace(new RegExp(`(${urlRe})|(${pathRe})`, 'g'), (m: string, url?: string) => {
    if (url) {
      const trail = /[.,;:)\]}'"!]+$/.exec(url)?.[0] ?? ''
      const core = trail ? url.slice(0, -trail.length) : url
      return cleanUrl(core) + trail
    }
    if (m.length < 2 && m !== '~') return m
    const out = cleanPath(m)
    if (out !== m) counts.paths++
    return out
  })

  // a hidden folder or file name may go on past a space, a comma, a bracket or an apostrophe ("Urlaub Kreta mit Anna",
  // "Oma's Geburtstag", "Anna, Ben (2023)"): the rest of it, up to the next "/", quote or line end, is hidden as well;
  // a picture's extension stays. Some log text right after such a name may go with it: better than a name left half.
  const nameRest = new RegExp(`^(.*?)\\.(${MEDIA_EXT})(?![\\w])`, 'i')
  const onlyExt = new RegExp(`^\\.(?:${MEDIA_EXT})(?![\\w])`, 'i')
  text = text.replace(/(?<![:/]\/)(?<=\/)\*{4}((?:[^\n/"`']|'(?=[A-Za-z]))+)/g, (m: string, rest: string) => {
    if (onlyExt.test(rest)) return m
    const media = nameRest.exec(rest)
    return media ? `${MASK}.${media[2]}${rest.slice(media[0].length)}` : MASK
  })

  // pictures and videos named on their own
  sub(new RegExp(`(?<![\\w.*-])[\\w.-]*[\\w-]\\.(${MEDIA_EXT})(?![\\w])`, 'gi'), 'files', (_m, ext) => `${MASK}.${ext}`)

  sub(/(?<![\w.+%-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g, 'emails', () => MASK)
  sub(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, 'ids', () => MASK)
  sub(/(?<![\w:-])(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![\w:-])/g, 'addresses', () => MASK)
  sub(/(?<![\w:.])(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(?![\w:])/g, 'addresses', () => MASK)
  sub(/(?<![\w:.])(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?(?![\w:])/g, 'addresses',
    (m) => (m.split(':').filter(Boolean).length >= 2 && m !== '::1' ? MASK : m))
  sub(/(?<![\w.=])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\w]|\.\d)/g, 'addresses', (m, ...g) =>
    g.slice(0, 4).every((n) => Number(n) <= 255) && m !== '127.0.0.1' && m !== '0.0.0.0' ? MASK : m)

  // the names of this Mac and its user, wherever they are left
  const word = (name: string, cat: RedactCategory, flags = 'gi'): void => {
    if (!name || name.length < 2) return
    sub(new RegExp(`(?<![A-Za-z0-9])${escapeRe(name)}(?![A-Za-z0-9])`, flags), cat, () => MASK)
  }
  const host = ctx.host?.trim()
  if (host && host.toLowerCase() !== 'localhost') {
    word(host, 'names')
    const short = host.replace(/\.local$/i, '')
    if (short !== host) word(short, 'names')
  }
  if (user) word(user, 'names')
  for (const v of ctx.volumes ?? []) if (v.length >= 3 && v !== 'Macintosh HD') word(v, 'names', 'g')
  // a folder hidden in one path is hidden in the rest of the log too (unless an app folder of another path has it)
  for (const name of masked) {
    if (name.length >= 4 && /[A-Za-z]/.test(name) && !kept.has(name) && name !== MASK) {
      sub(new RegExp(`(?<![A-Za-z0-9_.-])${escapeRe(name)}(?![A-Za-z0-9_-])`, 'g'), 'names', () => MASK)
    }
  }
  return { text, counts }
}
