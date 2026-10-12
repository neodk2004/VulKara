// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Choosing a picture to start from: the app's own results from the history (ImagePicker.vue, mounted once in App.vue)
// or a file from disk. pickImage() opens the picker and resolves with the chosen path, or undefined when closed.
import { reactive } from 'vue'

export const picker = reactive<{ open: boolean; resolve?: (path: string | undefined) => void }>({ open: false })

export function pickImage(): Promise<string | undefined> {
  // a picker still open (should not happen: it is modal) is answered with nothing first
  picker.resolve?.(undefined)
  return new Promise((resolve) => {
    picker.resolve = resolve
    picker.open = true
  })
}

/** Called by the picker: closes it and hands the path (or nothing) to whoever asked. */
export function finishPick(path: string | undefined): void {
  const resolve = picker.resolve
  picker.resolve = undefined
  picker.open = false
  resolve?.(path)
}
