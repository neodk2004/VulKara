// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CACHE_TTL, UpdateChecker, allowedUrl, compare, componentStatus, installedPackageVersion, newestAllowed, parseGithubReleases,
  parsePypi, parseVersion, requirementSpec, satisfies, targetsOf, type CheckableRuntime, type FetchLike, type RuntimeTargets,
  type Target,
} from './runtime_updates'

const pypi = (versions: Record<string, { yanked?: boolean }[]>): unknown => ({ info: { version: 'x' }, releases: versions })
const file = (yanked = false): { yanked: boolean }[] => [{ yanked }]

describe('versions', () => {
  it('orders releases, pre-releases, post- and development releases', () => {
    const sorted = ['1.0.dev1', '1.0a1', '1.0a2.dev1', '1.0a2', '1.0b1', '1.0rc1', '1.0', '1.0.post1', '1.0.1', '1.1', '1.10', '2.0']
    for (let i = 1; i < sorted.length; i++) expect(compare(sorted[i - 1], sorted[i]), `${sorted[i - 1]} < ${sorted[i]}`).toBe(-1)
    expect(compare('1.0', '1.0.0')).toBe(0)
    expect(compare('v0.38.0', '0.38')).toBe(0)
    expect(compare('0.9.9', '0.10.0')).toBe(-1)
  })

  it('reads the usual spellings', () => {
    expect(parseVersion('1.0-rc.2')?.pre).toEqual(['rc', 2])
    expect(parseVersion('2.1.0+cpu')?.release).toEqual([2, 1, 0])
    expect(parseVersion('1.0-1')?.post).toBe(1)
    expect(parseVersion('not a version')).toBeUndefined()
  })

  it('keeps inside the range of the requirements, caps included', () => {
    expect(satisfies('0.42.1', '>=0.41,<1.0')).toBe(true)
    expect(satisfies('1.0.0', '>=0.41,<1.0')).toBe(false)
    expect(satisfies('1.0rc1', '<1.0')).toBe(false)
    expect(satisfies('0.40.9', '>=0.41,<1.0')).toBe(false)
    expect(satisfies('0.20.0', '==0.20.0')).toBe(true)
    expect(satisfies('0.20.1', '==0.20.0')).toBe(false)
    expect(satisfies('0.2.9', '~=0.2.7')).toBe(true)
    expect(satisfies('0.3.0', '~=0.2.7')).toBe(false)
    expect(satisfies('1.4.2', '==1.*')).toBe(true)
    expect(satisfies('2.0', '==1.*')).toBe(false)
    expect(satisfies('1.5', '!=1.5')).toBe(false)
    expect(satisfies('1.0.post1', '>1.0')).toBe(false)
    expect(satisfies('3.0', '')).toBe(true)
    expect(satisfies('3.0', undefined)).toBe(true)
  })

  it('offers the newest final release in the range, never a pre-release', () => {
    const versions = ['0.40.0', '0.41.0', '0.42.1', '0.43.0rc1', '0.43.0.dev2', '1.0.0', '1.1.0']
    expect(newestAllowed(versions, '>=0.41,<1.0')).toBe('0.42.1')
    expect(newestAllowed(versions)).toBe('1.1.0')
    expect(newestAllowed(versions, '==0.20.0')).toBeUndefined()
  })
})

describe('requirements and installed versions', () => {
  const req = [
    '# diffusers engine',
    'torch>=2.8',
    'diffusers>=0.41,<1.0  # 0.41: Qwen-Image 2.1',
    'Optimum_Quanto >= 0.2.7',
    'uvicorn[standard]>=0.30; python_version >= "3.9"',
    'sentencepiece',
    '-r other.txt',
  ].join('\n')

  it('finds the range of a package, whatever its spelling', () => {
    expect(requirementSpec(req, 'diffusers')).toBe('>=0.41,<1.0')
    expect(requirementSpec(req, 'optimum-quanto')).toBe('>=0.2.7')
    expect(requirementSpec(req, 'uvicorn')).toBe('>=0.30')
    expect(requirementSpec(req, 'sentencepiece')).toBe('')
    expect(requirementSpec(req, 'mflux')).toBeUndefined()
  })

  it('reads the installed version from the dist-info folder', () => {
    const venv = mkdtempSync(join(tmpdir(), 'vk-venv-'))
    const site = join(venv, 'lib', 'python3.11', 'site-packages')
    mkdirSync(join(site, 'diffusers-0.41.0.dist-info'), { recursive: true })
    mkdirSync(join(site, 'optimum_quanto-0.2.7.dist-info'))
    mkdirSync(join(site, 'diffusers'))
    expect(installedPackageVersion(venv, 'diffusers')).toBe('0.41.0')
    expect(installedPackageVersion(venv, 'optimum-quanto')).toBe('0.2.7')
    expect(installedPackageVersion(venv, 'mflux')).toBeUndefined()
    expect(installedPackageVersion(join(venv, 'missing'), 'diffusers')).toBeUndefined()
  })
})

describe('published versions', () => {
  it('reads PyPI answers without yanked releases, empty ones and pre-releases', () => {
    const body = pypi({ '0.41.0': file(), '0.42.0': file(true), '0.42.1': [{ yanked: true }, { yanked: false }], '0.43.0rc1': file(), '0.44.0': [] })
    expect(parsePypi(body).sort(compare)).toEqual(['0.41.0', '0.42.1'])
    expect(() => parsePypi({ message: 'Not Found' })).toThrow()
  })

  it('reads GitHub releases without drafts and pre-releases', () => {
    const body = [
      { tag_name: 'v0.40.0', draft: false, prerelease: false },
      { tag_name: 'v0.41.0-rc1', draft: false, prerelease: true },
      { tag_name: 'v0.41.0', draft: true, prerelease: false },
      { tag_name: 'nightly', draft: false, prerelease: false },
    ]
    expect(parseGithubReleases(body)).toEqual(['0.40.0'])
    expect(() => parseGithubReleases({ message: 'rate limited' })).toThrow()
  })

  it('asks only pypi.org and api.github.com over https', () => {
    expect(allowedUrl('https://pypi.org/pypi/diffusers/json')).toBe(true)
    expect(allowedUrl('https://api.github.com/repos/a/b/releases')).toBe(true)
    expect(allowedUrl('http://pypi.org/pypi/diffusers/json')).toBe(false)
    expect(allowedUrl('https://pypi.org.example.com/x')).toBe(false)
    expect(allowedUrl('https://user@pypi.org/x')).toBe(false)
  })
})

describe('the update decision', () => {
  const t = (over: Partial<Target>): Target => ({ key: 'pypi:x', name: 'x', url: 'https://pypi.org/pypi/x/json', kind: 'pypi', ...over })

  it('offers the newest allowed version above the installed one', () => {
    const s = componentStatus(t({ spec: '>=0.41,<1.0', installed: '0.41.0' }), { versions: ['0.41.0', '0.42.1', '1.0.0'], fetchedAt: 1 })
    expect(s).toMatchObject({ installed: '0.41.0', latest: '0.42.1', newest: '1.0.0', updateAvailable: true })
  })

  it('offers an update when an installed runtime lacks a package its requirements gained', () => {
    const s = componentStatus(t({ spec: '>=0.4,<0.5', missing: true }), { versions: ['0.4.2'], fetchedAt: 1 })
    expect(s).toMatchObject({ installed: undefined, latest: '0.4.2', updateAvailable: true })
    // a runtime that is not installed at all is not offered anything
    expect(componentStatus(t({ spec: '>=0.4,<0.5' }), { versions: ['0.4.2'], fetchedAt: 1 }).updateAvailable).toBe(false)
  })

  it('offers nothing when a pin holds the package, but reports the newer release', () => {
    const s = componentStatus(t({ spec: '==0.20.0', installed: '0.20.0' }), { versions: ['0.20.0', '0.21.0'], fetchedAt: 1 })
    expect(s).toMatchObject({ latest: '0.20.0', newest: '0.21.0', updateAvailable: false })
  })

  it('offers the pinned release of a GitHub component, also without network', () => {
    const gh = t({ kind: 'github', key: 'github:a/b', name: 'ComfyUI', pinned: '0.39.0', installed: '0.38.0' })
    expect(componentStatus(gh, undefined)).toMatchObject({ latest: '0.39.0', updateAvailable: true })
    expect(componentStatus({ ...gh, installed: '0.39.0' }, { versions: ['0.39.0', '0.41.0'], fetchedAt: 1 }))
      .toMatchObject({ updateAvailable: false, newest: '0.41.0' })
  })

  it('says so when it could not check', () => {
    expect(componentStatus(t({ installed: '1.0' }), undefined)).toMatchObject({ updateAvailable: false, error: 'not checked yet' })
    expect(componentStatus(t({ installed: '1.0' }), { versions: [], fetchedAt: 0, error: 'could not check (HTTP 503)' }))
      .toMatchObject({ updateAvailable: false, error: 'could not check (HTTP 503)' })
  })

  it('does not offer an older version than the installed one', () => {
    expect(componentStatus(t({ spec: '<1.0', installed: '1.2.0' }), { versions: ['0.9.0'], fetchedAt: 1 }).updateAvailable).toBe(false)
  })
})

/** A fake runtime folder with an engine and its requirements: what runtimes.ts hands in for each definition. */
function fakeRuntime(pkg: string, installed: string, requirement: string): { dirs: { runtimeDir: string; enginesDir: string } } {
  const root = mkdtempSync(join(tmpdir(), 'vk-rt-'))
  const runtimeDir = join(root, 'runtime')
  const enginesDir = join(root, 'engines')
  mkdirSync(join(runtimeDir, 'venv', 'lib', 'python3.12', 'site-packages', `${pkg.replace(/-/g, '_')}-${installed}.dist-info`), { recursive: true })
  mkdirSync(join(enginesDir, 'future'), { recursive: true })
  writeFileSync(join(enginesDir, 'future', 'requirements.txt'), `numpy\n${requirement}\n`)
  return { dirs: { runtimeDir, enginesDir } }
}

describe('a runtime definition', () => {
  it('is checked from its fields alone, also a new one', () => {
    const { dirs } = fakeRuntime('new-engine', '2.3.0', 'new-engine>=2.0,<3')
    const def: CheckableRuntime = { id: 'future', engine: 'future', versions: [{ kind: 'pypi', package: 'new-engine' }] }
    const rt = targetsOf(def, { ...dirs, installed: true })
    expect(rt.targets).toEqual([expect.objectContaining({ key: 'pypi:new-engine', name: 'new-engine', spec: '>=2.0,<3', installed: '2.3.0', url: 'https://pypi.org/pypi/new-engine/json' })])
  })

  it('falls back to the version package and reads a version file of a GitHub component', () => {
    const { dirs } = fakeRuntime('tool', '1.0', 'tool')
    mkdirSync(join(dirs.runtimeDir, 'App'))
    writeFileSync(join(dirs.runtimeDir, 'App', 'version.py'), '# generated\n__version__ = "0.38.0"\n')
    expect(targetsOf({ id: 'f', engine: 'future', versionPackage: 'tool' }, { ...dirs, installed: true }).targets[0])
      .toMatchObject({ name: 'tool', spec: '', installed: '1.0' })
    const gh = targetsOf({ id: 'f', engine: 'future', versions: [{ kind: 'github', name: 'App', repo: 'org/app', pinned: '0.39.0', versionFile: 'App/version.py' }] }, { ...dirs, installed: true })
    expect(gh.targets[0]).toMatchObject({ key: 'github:org/app', installed: '0.38.0', pinned: '0.39.0', url: 'https://api.github.com/repos/org/app/releases?per_page=30' })
  })

  it('leaves out sources with names that are no package or repository names', () => {
    const { dirs } = fakeRuntime('tool', '1.0', 'tool')
    const def: CheckableRuntime = { id: 'f', engine: 'future', versions: [{ kind: 'pypi', package: '../x' }, { kind: 'github', name: 'x', repo: 'a/b/c', pinned: '1', versionFile: 'v' }] }
    expect(targetsOf(def, { ...dirs, installed: true }).targets).toEqual([])
  })
})

describe('the checker', () => {
  function setup(): { checker: () => UpdateChecker; calls: string[]; clock: { now: number }; file: string; replies: Record<string, unknown> } {
    const { dirs } = fakeRuntime('new-engine', '2.3.0', 'new-engine>=2.0,<3')
    const file = join(mkdtempSync(join(tmpdir(), 'vk-upd-')), 'runtime-updates.json')
    const calls: string[] = []
    const clock = { now: 1_000_000 }
    const replies: Record<string, unknown> = { 'https://pypi.org/pypi/new-engine/json': pypi({ '2.3.0': file_(), '2.4.1': file_(), '3.0.0': file_() }) }
    const fetcher: FetchLike = async (url) => {
      calls.push(url)
      const body = replies[url]
      return body === undefined ? new Response('', { status: 404 }) : new Response(JSON.stringify(body))
    }
    const targets = (): RuntimeTargets[] => [
      targetsOf({ id: 'future', engine: 'future', versions: [{ kind: 'pypi', package: 'new-engine' }] }, { ...dirs, installed: true }),
      targetsOf({ id: 'absent', engine: 'future', versions: [{ kind: 'pypi', package: 'other' }] }, { ...dirs, installed: false }),
    ]
    return { checker: () => new UpdateChecker({ fetcher, targets, file, now: () => clock.now }), calls, clock, file, replies }
  }
  const file_ = (): { yanked: boolean }[] => file()

  it('checks the installed runtimes and keeps the result for 12 hours', async () => {
    const { checker, calls, clock } = setup()
    const c = checker()
    expect(c.status().runtimes[0]).toMatchObject({ id: 'future', updateAvailable: false, error: 'not checked yet' })
    const first = await c.check()
    expect(calls).toEqual(['https://pypi.org/pypi/new-engine/json'])
    expect(first.runtimes).toHaveLength(1)
    expect(first.runtimes[0]).toMatchObject({ id: 'future', installed: '2.3.0', latest: '2.4.1', updateAvailable: true, checkedAt: 1_000_000 })
    expect(first.runtimes[0].components[0].newest).toBe('3.0.0')
    clock.now += CACHE_TTL - 1
    await c.check()
    expect(calls).toHaveLength(1)
    await c.check(true)
    expect(calls).toHaveLength(2)
    clock.now += CACHE_TTL
    await c.check()
    expect(calls).toHaveLength(3)
  })

  it('keeps the last result in a file, shown at once after a restart', async () => {
    const { checker, calls, file } = setup()
    await checker().check()
    expect(JSON.parse(readFileSync(file, 'utf8')).sources['pypi:new-engine'].versions).toContain('2.4.1')
    const again = checker()
    expect(again.status().runtimes[0]).toMatchObject({ latest: '2.4.1', updateAvailable: true })
    await again.check()
    expect(calls).toHaveLength(1)
  })

  it('reports a failed check as "could not check" and keeps what it knew', async () => {
    const { checker, replies, clock } = setup()
    const c = checker()
    await c.check()
    delete replies['https://pypi.org/pypi/new-engine/json']
    clock.now += 1000
    const res = await c.check(true)
    expect(res.runtimes[0].components[0]).toMatchObject({ latest: '2.4.1', error: 'could not check (HTTP 404)' })
    expect(res.runtimes[0].error).toBeUndefined()
  })

  it('checks once while a check runs', async () => {
    const { checker, calls } = setup()
    const c = checker()
    await Promise.all([c.check(true), c.check(true)])
    expect(calls).toHaveLength(1)
  })

  it('ignores a damaged file', () => {
    const { checker, file } = setup()
    writeFileSync(file, '{broken')
    expect(checker().olderThan(1)).toBe(true)
  })
})
