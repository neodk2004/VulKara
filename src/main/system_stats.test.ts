// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { footprintFromTop, metalBudgetGb, pagesInGb, swapFromSysctl, treePids, treeRss, usedFromVmStat, shownPath } from './system_stats'

describe('system stats', () => {
  it('reads the memory in use from vm_stat', () => {
    const text = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                   325372.
Pages active:                                 461864.
Pages inactive:                               390452.
Pages wired down:                             198302.
Pages occupied by compressor:                 100000.
`
    expect(usedFromVmStat(text)).toBeCloseTo(((461864 + 198302 + 100000) * 16384) / 1024 ** 3, 3)
  })

  it('reads what was read back from the disks and the swap', () => {
    const vm = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPageins:   65536.\nSwapins:   32768.\n'
    expect(pagesInGb(vm, 'Pageins')).toBe(1)
    expect(pagesInGb(vm, 'Swapins')).toBe(0.5)
    expect(pagesInGb('', 'Swapins')).toBe(0)
  })

  it('reads the swap in use, with a decimal point or comma', () => {
    expect(swapFromSysctl('total = 2048.00M  used = 1162.25M  free = 885.75M  (encrypted)')).toBeCloseTo(1162.25 / 1024, 4)
    expect(swapFromSysctl('total = 9216,00M  used = 8563,44M  free = 652,56M  (encrypted)')).toBeCloseTo(8563.44 / 1024, 4)
    expect(swapFromSysctl('total = 0.00M  used = 0.00M  free = 0.00M')).toBe(0)
    expect(swapFromSysctl('')).toBe(0)
  })

  it('sums the footprint top reports for the app and its engines', () => {
    expect(treePids('  100     1\n  200   100\n  300   200\n  400     1', 100).sort()).toEqual([100, 200, 300])
    const top = 'Processes: 3 total\n\nPID    MEM\n26585  17G\n26444  77M+\n21808  8000K-\n'
    expect(footprintFromTop(top)).toBeCloseTo(17 + 77 / 1024 + 8000 / 1024 ** 2, 4)
    expect(footprintFromTop('')).toBe(0)
  })

  it('sums the memory of the app and every process under it, nothing else', () => {
    const ps = `  100     1  200000
  200   100  300000
  300   200  1048576
  400     1  999999
  500   400  5`
    expect(treeRss(ps, 100)).toBeCloseTo((200000 + 300000 + 1048576) / 1024 ** 2, 4)
    expect(treeRss(ps, 999)).toBe(0)
  })

  it('knows Metal\'s share of the unified memory (16 GB Mac: about 11.8 GB, 24 GB: about 17.8)', () => {
    expect(metalBudgetGb(16 * 1024 ** 3)).toBeCloseTo(11.8, 1)
    expect(metalBudgetGb(24 * 1024 ** 3)).toBeCloseTo(17.8, 1)
  })

  it('tells the free room of the disk also for a models folder that is not made yet', async () => {
    const { streamStorage } = await import('./system_stats')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const s = await streamStorage(join(tmpdir(), 'vk-not-there', 'models'), '')
    expect(s.freeGb).toBeGreaterThan(0)
    expect(s.cacheGb).toBe(0)
  })

  it('reads the GPU load the driver reports, and says when there is none', async () => {
    const { gpuFromIoreg } = await import('./system_stats')
    const text = '"PerformanceStatistics" = {"Tiler Utilization %"=15,"Renderer Utilization %"=14,"Device Utilization %"=18,"In use system memory"=570408960}'
    expect(gpuFromIoreg(text)).toBe(18)
    expect(gpuFromIoreg(text + ' "Device Utilization %"=64')).toBe(64)
    expect(gpuFromIoreg('nothing here')).toBe(-1)
  })
})

describe('shownPath', () => {
  it('writes the home folder as ~ and leaves other folders as they are', () => {
    expect(shownPath('/Users/jane/VulKara/models', '/Users/jane')).toBe('~/VulKara/models')
    expect(shownPath('/Users/jane', '/Users/jane')).toBe('~')
    expect(shownPath('/Users/janet/models', '/Users/jane')).toBe('/Users/janet/models')
    expect(shownPath('/Volumes/SSD/models', '/Users/jane')).toBe('/Volumes/SSD/models')
  })
})
