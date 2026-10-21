// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Control pictures: a pose, a depth map or edges steer the composition of a picture. Which kinds a model can
// take follows engines/diffusers/controlnet.py (the control model is downloaded on first use).

import type { PlainKey } from './i18n'
import type { ModelMeta } from './types'

export interface ControlType {
  id: string
  title: PlainKey
  /** what the control picture shows, and what a photo is turned into when it is prepared */
  hint: PlainKey
}

export const CONTROL_TYPES: ControlType[] = [
  { id: 'BodyPose', title: 'generate.control.pose', hint: 'generate.control.poseHint' },
  { id: 'Depth', title: 'generate.control.depth', hint: 'generate.control.depthHint' },
  { id: 'Canny', title: 'generate.control.edges', hint: 'generate.control.edgesHint' },
  { id: 'LineArt', title: 'generate.control.lineArt', hint: 'generate.control.lineArtHint' },
  { id: 'Scribble', title: 'generate.control.scribble', hint: 'generate.control.scribbleHint' },
  { id: 'Tile', title: 'generate.control.tile', hint: 'generate.control.tileHint' },
]

const BY_FAMILY: Record<string, string[]> = {
  sdxl: ['BodyPose', 'Depth', 'Canny', 'LineArt', 'Scribble', 'Tile'],
  flux1: ['BodyPose', 'Depth', 'Canny', 'LineArt', 'Scribble'],
}
const BY_ARCH: Record<string, string[]> = {
  sd15: ['BodyPose', 'Depth', 'Canny', 'LineArt', 'Scribble'],
  sd35_medium: ['Depth', 'Canny'],
  sd35_large: ['Depth', 'Canny', 'Tile'],
}

/** The kinds of control picture a model can take; empty when it takes none. */
export function controlTypesFor(meta: ModelMeta | undefined): ControlType[] {
  // models ComfyUI runs take none yet
  if (!meta || meta.runtime === 'comfyui') return []
  const ids = BY_ARCH[meta.arch] ?? BY_FAMILY[meta.family] ?? []
  return CONTROL_TYPES.filter((t) => ids.includes(t.id))
}
