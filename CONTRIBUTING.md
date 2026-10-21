# Contributing to VulKara

Thank you for helping. VulKara is released under the [PolyForm Noncommercial License 1.0.0](LICENSE). By
contributing (code, translations, documents, pictures) you agree that:

- the contribution is your own work, or you have the right to give it under these terms;
- it is licensed under the PolyForm Noncommercial License 1.0.0, like the rest of VulKara;
- Oliver Schmidt may also publish it under other licence terms, in later versions of VulKara as well.

Say so in the pull request if you do not agree; the contribution can then not be taken.

## Before you start

- Open an issue for anything larger than a fix, so that the direction is agreed first.
- The app must also work on a Mac with 16 GB (Mac mini M4): check memory plans, imports and streaming for 16 GB.
- The content protection (minors, consent, the content filter of every result) is never loosened.

## Working on it

```bash
npm install
npm run dev            # the app with live reload
npm run typecheck
npm test               # vitest
npm run check:clean    # no code or assets of the app this project replaced
```

The engines have their own tests: `python -m pytest -q` in `engines/diffusers` with a Python that has the
requirements of `engines/diffusers/requirements.txt`. The developer guide is [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md),
with the guardrails every change follows.

## Translations

A new language, or a better one, is a pull request with a folder of JSON files; no code changes. See
[Translating VulKara](docs/TRANSLATING.md).

## Pull requests

- Keep a change to one topic; say what it changes and how you tested it.
- Update the user guide, the README (with screenshots where the look changes) and CHANGELOG.md (under *Unreleased*).
- Commit messages describe the change itself, without tool or generator notes.
