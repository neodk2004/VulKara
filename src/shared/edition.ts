// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// What a build of the app offers. VulKara is published free of charge, so there is one edition with everything;
// the switches stay so that a restricted build (no ComfyUI, nudity always filtered, only commercially usable models
// recommended) remains possible without touching the pages.

export interface Edition {
  id: 'full'
  /** downloaded: the app installs the runtimes; bundled: they ship inside the app (no such build exists) */
  runtimes: 'downloaded' | 'bundled'
  comfyui: boolean
  /** choice: a setting decides whether nudity is shown; filtered: never shown */
  explicitContent: 'choice' | 'filtered'
  /** recommend only models that may be used commercially, with pictures that may be */
  commercialModelsOnly: boolean
}

/** The edition of this build. */
export const EDITION: Edition = { id: 'full', runtimes: 'downloaded', comfyui: true, explicitContent: 'choice', commercialModelsOnly: false }

/** May a build with commercialModelsOnly recommend a model with these licence answers (licenses.json: yes, limited, no)? */
export function commerciallyUsable(licence: { model: string; outputs: string } | undefined): boolean {
  return !!licence && licence.model !== 'no' && licence.outputs !== 'no'
}
