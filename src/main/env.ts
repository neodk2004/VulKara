// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The environment of the Python processes (engines, importer, content filter, training, runtime installs).
// It is the app's own environment without what could change which Python code runs or where downloads come
// from (set in a terminal the app was started from), and with the libraries' usage reports switched off.

/** inherited variables that never reach a Python process */
export const DROPPED = [
  'PYTHONPATH', 'PYTHONHOME', 'PYTHONSTARTUP', 'PYTHONUSERBASE', 'PYTHONINSPECT', 'PYTHONEXECUTABLE', 'PYTHONSAFEPATH',
  'HF_ENDPOINT', 'HF_HUB_OFFLINE', 'HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN', 'HF_TOKEN_PATH', 'CIVITAI_TOKEN',
  'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE',
]

/** no usage reports; an access token only where the app passes one on purpose */
export const PRIVACY_ENV: Record<string, string> = {
  HF_HUB_DISABLE_TELEMETRY: '1', HF_HUB_DISABLE_IMPLICIT_TOKEN: '1', HF_HUB_DISABLE_UPDATE_CHECK: '1',
  DO_NOT_TRACK: '1', DISABLE_TELEMETRY: '1', ANONYMIZED_TELEMETRY: 'False', GRADIO_ANALYTICS_ENABLED: 'False',
  UV_NO_PROGRESS: '1',
}

/** The base environment of a Python process. */
export function processEnv(from: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(from)) if (v !== undefined && !DROPPED.includes(k)) env[k] = v
  return { ...env, ...PRIVACY_ENV }
}
