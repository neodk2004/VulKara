// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import type { LangSetting } from './i18n'

/** A template of the Restore page: the steps and guard rails for one kind of old photo. */
export interface RestoreTemplate {
  name: string
  correct: boolean
  repair: boolean
  colorize: boolean
  colorStrength?: number
  sharpen?: boolean
  sharpness?: number
  lock: boolean
  maxChange: number
  checkFaces: boolean
  /** a note for the AI, e.g. what the photo shows */
  note: string
}

export interface Settings {
  /** '' = ~/VulKara/models */
  modelsDir: string
  /** '' = ~/VulKara/images */
  imagesDir: string
  /** '' = history/ in the app's data folder */
  historyDir: string
  /** '' = ~/VulKara/loras */
  lorasDir: string
  /** helper models (ControlNets, pose and depth detection, content filter); '' = ~/VulKara */
  helpersDir: string
  /** '' = runtimes/ in the app's data folder */
  runtimesDir: string
  defaultQuant: 'auto' | 'none' | 'q8' | 'q4'
  /** 0 = automatic (20 %, at least 4 GB) */
  memoryReserveGb: number
  ssdStreaming: 'auto' | 'always' | 'off'
  /** where streamed models keep their blocks; '' = in each model's folder. A fast internal SSD speeds streaming up */
  streamCacheDir: string
  runtime: 'auto' | 'diffusers' | 'mlx'
  /** steps that barely change are reused (engines/diffusers/step_cache.py): faster, pictures differ slightly */
  stepCache: 'off' | 'light' | 'strong'
  /** false = safe mode: no nudity in results, no explicit preview pictures */
  allowExplicit: boolean
  notifySound: boolean
  /** light or dark appearance; system follows macOS */
  theme: 'system' | 'light' | 'dark'
  /** the language of the app; system follows macOS (English if macOS uses none of the app's languages) */
  language: LangSetting
  /** the user's own guard rails for the AI restoration of old photos, added to the fixed ones */
  restoreRules: string[]
  /** the user's own templates of the Restore page */
  restoreTemplates: RestoreTemplate[]
  /** set once the first picture is finished; it stays when the history is emptied */
  firstPictureMade: boolean
  /** files without a known origin are looked up on Civitai by their checksum (trigger words, licence); off by default */
  hashLookups: boolean
  /** the runtimes' newer versions are looked up once a day (public PyPI and GitHub lists) */
  updateChecks: boolean
}

/** The folder settings. A page can only reset them to the default; a folder is chosen in the main process's dialog. */
export const FOLDER_KEYS = ['modelsDir', 'imagesDir', 'historyDir', 'lorasDir', 'helpersDir', 'runtimesDir', 'streamCacheDir'] as const
export type FolderKey = (typeof FOLDER_KEYS)[number]

export const DEFAULT_SETTINGS: Settings = {
  modelsDir: '',
  imagesDir: '',
  historyDir: '',
  lorasDir: '',
  helpersDir: '',
  runtimesDir: '',
  defaultQuant: 'auto',
  memoryReserveGb: 0,
  ssdStreaming: 'auto',
  streamCacheDir: '',
  runtime: 'auto',
  stepCache: 'off',
  allowExplicit: false,
  notifySound: true,
  theme: 'system',
  language: 'system',
  restoreRules: [],
  restoreTemplates: [],
  firstPictureMade: false,
  hashLookups: false,
  updateChecks: true,
}
