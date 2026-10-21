// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Starts the app from the sources as "VulKara" instead of "Electron": macOS takes the name in the Dock and the
// menu bar from the app bundle, so this makes a copy of Electron's bundle with VulKara's name and icon.
//   node tools/dev-app.mjs [-- extra arguments for the app]
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ELECTRON = join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app')
const APP = join(ROOT, 'dist', 'dev', 'VulKara.app')
const STAMP = join(APP, 'Contents', 'vulkara-electron-version')
// the bundle is made again when Electron or the way it is made changes
const version = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version + '/2'
const EXE = join(APP, 'Contents', 'MacOS', 'VulKara')

if (!existsSync(STAMP) || readFileSync(STAMP, 'utf8') !== version) {
  rmSync(APP, { recursive: true, force: true })
  cpSync(ELECTRON, APP, { recursive: true, verbatimSymlinks: true })
  const plist = join(APP, 'Contents', 'Info.plist')
  const set = (key, value) => execFileSync('plutil', ['-replace', key, '-string', value, plist])
  set('CFBundleName', 'VulKara')
  set('CFBundleDisplayName', 'VulKara')
  set('CFBundleIdentifier', 'de.netfx2.vulkara.dev')
  // the process name, which the Dock shows while the app runs
  set('CFBundleExecutable', 'VulKara')
  renameSync(join(APP, 'Contents', 'MacOS', 'Electron'), EXE)
  copyFileSync(join(ROOT, 'build', 'icon.icns'), join(APP, 'Contents', 'Resources', 'electron.icns'))
  // the changed bundle needs a signature again (ad hoc is enough on this Mac)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', APP])
  writeFileSync(STAMP, version)
}

const extra = process.argv.slice(2).filter((a) => a !== '--')
spawn(EXE, [ROOT, ...extra], { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0))
