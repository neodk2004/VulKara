# Translating VulKara

VulKara speaks English, German, Spanish and Portuguese (Brazil and Portugal). A new language is a folder of four
JSON files; no code has to change. This guide is for anyone who wants to add a language, or improve one, with a pull
request.

[README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Developer guide: Translations](DEVELOPMENT.md#translations)

## What you need

- A Mac with Apple silicon, [Node.js](https://nodejs.org) 22 or newer and git, to check your work in the app. Without a
  Mac you can still translate the files and let the tests run in the pull request.
- A fork of the repository on GitHub (or Gitea), cloned to your computer:

```bash
git clone https://github.com/<you>/VulKara.git
cd VulKara/vulkara
npm install
```

## 1. Start the language

```bash
node tools/new_language.mjs it "Italiano" "Italian" it-IT
```

- **code**: the language (`it`), or the language with its region when a language has more than one variant
  (`pt-BR`, `pt-PT`, `es-419`). macOS's language list is matched against it: `it-IT` and `it-CH` on a Mac both take
  `it`; a Mac set to `pt` takes the first Portuguese folder.
- **own name**: how the language calls itself; it is shown in the language menu (`Italiano`).
- **English name**: for the documents (`Italian`).
- **locale**: for numbers, plurals and dates (`it-IT`); usually the code with a region.

The script makes `src/shared/i18n/locales/<code>/` with every text in English, ready to be translated:

| File | What is in it |
| --- | --- |
| `language.json` | The name and locale you gave |
| `messages.json` | Every text of the app: pages, buttons, hints, dialogs, messages, the engines' status lines (about 1,900) |
| `data.json` | The descriptions of the recommended models, helper models and photo tools, and the licence list's groups and notes |
| `tips.json` | The Tips & tricks page |

Running the script again on an existing folder completes it: texts already translated stay, texts the app gained
since are added in English. Use this after updating your fork.

## 2. Translate

Translate the **values**, never the keys:

```json
"runtimes": {
  "title": "Runtimes",
  "lastChecked": "Ultimo controllo degli aggiornamenti: {when}",
  "confirmRemove": "Rimuovere il runtime {name} ({size} GB)? I modelli restano dove sono."
}
```

- **Placeholders** in braces (`{name}`, `{n}`, `{size}`) stay exactly as they are, with the same names; move them
  where your grammar wants them. Every placeholder of the English text must be in yours.
- **Plurals** are objects with `one` and `other`: keep both, even when your language uses the same form. The app
  picks the form by the number `n` with the rules of your locale.

```json
"count": { "one": "{n} immagine", "other": "{n} immagini" }
```

- **Keep it short** where space is short: the navigation labels (`nav.*`) fit in 86 pixels (about 11 characters, one
  word if possible), buttons and tabs in a few words. Hints and explanations may be full sentences.
- **Name things as the app names them**: when a text points to a page, a button or a setting ("Settings → Runtimes"),
  write that element's name exactly as you translated it. The `→` stays.
- **Stays English**: model, LoRA, sampler and scheduler names; product names (VulKara, FLUX.1, SDXL, Civitai, Hugging
  Face, ComfyUI, MLX, Diffusers, macOS); units (GB, MB, px, s, %, bit); file and folder names; keyboard symbols
  (⌘↩); the words of the EU's icon ("AI GENERATED", "AI MODIFIED").
- **Terms the app keeps in every language**: LoRA, Seed, Sampler, Scheduler, Runtime, Streaming, Prompt, Guidance,
  Inpainting, ControlNet, Checkpoint, VAE, GGUF. Use your language's usual word for everything else (steps, model,
  canvas, history, ...). The [glossary](DEVELOPMENT.md#glossary) shows the choices of the other languages.
- **tips.json**: translate `title`, `intro`, `body`, the `do` and `avoid` items and the picture `caption`s. The
  `example` prompts, the pictures' `file` and `prompt` and the `sources` stay as they are: prompts are written for the
  models, which read English best.
- **data.json**: in `groups` and `licences` the key is the English text itself; translate only the value. Licence
  notes must keep their exact legal meaning.
- **Tone**: the plain, friendly wording of a good Mac app. The informal "you" where your language has a choice (as
  German *du*, Spanish *tú*), or the impersonal style your language's macOS uses (as European Portuguese).
- JSON: UTF-8, double quotes, a `\"` for a quote inside a text.

## 3. Check

```bash
npm test             # every key, placeholder and plural of English is in your files, nothing more, nothing empty
npm run typecheck
```

A failing test names the key, for example `it has the same placeholders as English: settings.runtimes.lastChecked`.

Then look at it in the app:

```bash
npm run dev
```

Choose your language at the top right of the Start page (or Settings → Appearance → Language). Go through every page
at the window's usual size and at its smallest: no text may be cut off or run over a button. Hover the **ⓘ** and
**!** badges to read the hints.

## 4. The user guide (optional)

The guide is `docs/USER_GUIDE.md`; the translated ones are `docs/<code>/USER_GUIDE.md`.

- Copy `docs/USER_GUIDE.md` to `docs/<code>/USER_GUIDE.md` and translate it. Keep the headings (number, level and
  order), tables, lists and code blocks as they are; translate the heading texts.
- Links inside the guide (`(#3-text-to-image)`) point to the translated headings: the anchor is the heading in lower
  case, without punctuation, spaces as `-` (`## 3. Testo in immagine` → `#3-testo-in-immagine`).
- Pictures: `../screenshots/<code>/<name>.jpg` and `../images/...`, `../icons/...`. Screenshots of the app in your
  language, light mode, 1600 × 1100 points; or leave the English ones (`../screenshots/<name>.jpg`) and say so in the
  pull request.
- The language line under the title, and add your language to the line in the other guides and the README.

## 5. The pull request

- One language per pull request, titled for example *Italian translation*.
- In the description: the language and code, whether you checked it in the app (which macOS), and anything you were
  unsure about.
- Add a line to `CHANGELOG.md` under *Unreleased*: *The app in Italian (Settings → Appearance → Language).*
- By contributing you agree that your translation is licensed under the AGPL-3.0-or-later, as the rest of VulKara.

## Improving a language

Change the text in `src/shared/i18n/locales/<code>/` and check as above. A wrong term used in many places is best
changed everywhere in one pull request; say which term you replaced and why.

## When the app gains new texts

New texts are written in English first (`src/shared/i18n/en/`) and added to every language in the same change. A
language whose translator is not around gets them in English (the tests ask for every key): run
`node tools/new_language.mjs <code> ...` and translate the new English values later. In the app, a text a language does
not have is shown in English.
