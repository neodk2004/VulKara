// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// Checksums of what the runtime installs download. GitHub builds its source ZIPs on request, so the bytes of a ZIP
// may change while its files stay the same: unpacked archives are compared by their content instead.

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'

export const sha256File = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

/**
 * The content of a folder as one SHA-256: sorted lines "<relative path>\0<SHA-256 of the file>\n" of all its files
 * ("<path>\0link:<target>\n" for symbolic links). Where the files came from (ZIP, tar, compression) does not matter.
 */
export function treeHash(root: string): string {
  const lines: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      const p = join(dir, e.name)
      if (e.isSymbolicLink()) lines.push(`${rel}\0link:${readlinkSync(p)}\n`)
      else if (e.isDirectory()) walk(p, rel)
      else if (e.isFile()) lines.push(`${rel}\0${sha256File(p)}\n`)
    }
  }
  walk(root, '')
  lines.sort()
  return createHash('sha256').update(lines.join('')).digest('hex')
}
