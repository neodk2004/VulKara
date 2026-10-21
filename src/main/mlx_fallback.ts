// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// MLX can not stream a model from the SSD, Diffusers can: a job MLX refuses for the Mac's memory goes on with Diffusers
// instead of failing (engines.ts). Kept apart from the engine processes so that it can be tested on its own.

import type { EngineEvent } from '@shared/types'
import { t } from './i18n'

export type EngineListener = (event: EngineEvent | { event: 'exit'; message: string }) => void

// what the MLX engine says when the model does not fit (engines/mlx/main.py)
const MEMORY_REFUSAL = /needs about \d+ GB RAM/

export const DIFFUSERS_NOTE = 'Made with Diffusers instead of MLX: MLX has too little memory on this Mac for this model, '
  + 'Diffusers streams it from the SSD (slower)'

/**
 * Wraps the listener of a job on MLX. Until MLX refuses, events pass through. A memory refusal is not passed on: the
 * job gets a status instead, and once MLX is idle again `handOver` sends the job to Diffusers (with the
 * same listener). Without Diffusers installed the refusal is passed on as it is.
 */
export function mlxOrDiffusers(listener: EngineListener, diffusersInstalled: () => boolean, handOver: () => void): EngineListener {
  let refused = false
  return (event) => {
    if (refused) {
      if ((event.event === 'state' && event.state === 'idle') || event.event === 'exit') {
        refused = false
        handOver()
      }
      return
    }
    if (event.event === 'error' && MEMORY_REFUSAL.test(event.message) && diffusersInstalled()) {
      refused = true
      // the note comes with the Diffusers job (engines.ts), so a job cancelled meanwhile does not get it
      listener({ event: 'status', message: t('main.engines.tooLargeForMlx') })
      return
    }
    listener(event)
  }
}
