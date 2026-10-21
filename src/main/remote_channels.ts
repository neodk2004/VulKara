// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// What the remote web UI may call: Generate and monitor, nothing more. A list of what is allowed, not of what is
// not, so a channel added later stays local until it is put here on purpose. Left out on purpose: changing settings
// (folders, safe mode), tokens, importing and removing models, installing runtimes, every file-system dialog, the
// viewer windows, training and the logs.

export const REMOTE_CHANNELS: ReadonlySet<string> = new Set([
  // what the pages need to start
  'settings:get', 'i18n:lang', 'app:info', 'runtimes:list', 'runtimes:updates',
  // generating and watching
  'queue:add', 'queue:cancel', 'queue:clearFinished', 'queue:snapshot', 'system:stats',
  // models and LoRAs to choose from
  'assets:list', 'loras:details',
  // results (remove: from the list, or to the Trash — the user's own pictures)
  'history:list', 'history:favorite', 'history:favorites', 'history:remove',
  // pictures a page makes itself (a mask, an illusion pattern, a pose skeleton)
  'files:writeImage', 'files:writePose',
])

/** What a browser hears of the events the pages get: the queue, results, models and the machine's load. Left out like
 *  the calls above: the log lines (prompts, paths), training, imports and exports; and the Mac's language, since each
 *  device keeps its own. */
export const REMOTE_EVENTS: ReadonlySet<string> = new Set([
  'queue:change', 'history:change', 'assets:change', 'system:stats', 'runtimes:progress', 'runtimes:updatesChanged',
])
