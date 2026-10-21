// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureTls, isLocalIp } from './remote_tls'

describe('the remote web UI certificates', () => {
  it('signs a server certificate for the Mac\'s addresses with an authority of its own, and keeps the authority', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vk-tls-'))
    const names = { ips: ['192.168.1.75', '127.0.0.1'], hosts: ['mymac.local', 'localhost'] }
    const first = ensureTls(dir, names, 'My Mac')

    // the chain holds, and the certificate is one for a server, for exactly these names
    const ok = execFileSync('/usr/bin/openssl', ['verify', '-CAfile', join(dir, 'ca.crt'), join(dir, 'server.crt')]).toString()
    expect(ok).toMatch(/: OK/)
    const cert = new X509Certificate(first.cert)
    expect(cert.checkIP('192.168.1.75')).toBe('192.168.1.75')
    expect(cert.checkHost('mymac.local')).toBe('mymac.local')
    expect(new X509Certificate(first.ca).ca).toBe(true)
    expect(new X509Certificate(first.ca).subject).toMatch(/VulKara on My Mac/)
    // short enough for Apple (825 days at most for an authority a user installed)
    expect((Date.parse(cert.validTo) - Date.now()) / 86_400_000).toBeLessThan(400)

    // the same names: nothing made anew
    expect(ensureTls(dir, names, 'My Mac').cert).toBe(first.cert)

    // another address: a new server certificate from the same authority (devices keep trusting it)
    const moved = ensureTls(dir, { ...names, ips: ['10.0.0.8', '127.0.0.1'] }, 'My Mac')
    expect(moved.cert).not.toBe(first.cert)
    expect(moved.ca).toBe(first.ca)
    expect(new X509Certificate(moved.cert).checkIP('10.0.0.8')).toBe('10.0.0.8')
    expect(readFileSync(join(dir, 'server.names'), 'utf8')).toContain('IP:10.0.0.8')
  })

  it('vouches only for the local network: name constraints on the authority, names outside left out', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vk-tls-'))
    ensureTls(dir, { ips: ['192.168.1.75', '8.8.8.8', '100.101.102.103'], hosts: ['my,mac.local', 'example.com', 'localhost'] }, 'My Mac')
    const ca = execFileSync('/usr/bin/openssl', ['x509', '-in', join(dir, 'ca.crt'), '-noout', '-text']).toString()
    expect(ca).toMatch(/Name Constraints: critical/)
    expect(ca).toMatch(/pathlen:0/)
    // a certificate for another site, signed with the authority's key, is refused by the constraints
    writeFileSync(join(dir, 'x.cnf'), '[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=example.com\n[v]\nsubjectAltName=DNS:example.com\n')
    execFileSync('/usr/bin/openssl', ['req', '-new', '-nodes', '-newkey', 'rsa:2048', '-keyout', 'x.key', '-out', 'x.csr', '-config', 'x.cnf'], { cwd: dir, stdio: 'pipe' })
    execFileSync('/usr/bin/openssl', ['x509', '-req', '-in', 'x.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'x.crt', '-days', '30', '-extfile', 'x.cnf', '-extensions', 'v'], { cwd: dir, stdio: 'pipe' })
    expect(() => execFileSync('/usr/bin/openssl', ['verify', '-CAfile', 'ca.crt', 'x.crt'], { cwd: dir, stdio: 'pipe' })).toThrow()
    // the server certificate holds only the names inside, and verifies
    expect(execFileSync('/usr/bin/openssl', ['verify', '-CAfile', 'ca.crt', 'server.crt'], { cwd: dir }).toString()).toMatch(/: OK/)
    const names = readFileSync(join(dir, 'server.names'), 'utf8')
    expect(names).toBe('DNS:localhost,DNS:mymac.local,IP:100.101.102.103,IP:192.168.1.75')
  })

  it('makes an authority of an earlier make-up anew', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vk-tls-'))
    const names = { ips: ['192.168.1.75'], hosts: ['localhost'] }
    const first = ensureTls(dir, names, 'My Mac')
    rmSync(join(dir, 'ca.kind'))
    const again = ensureTls(dir, names, 'My Mac')
    expect(again.ca).not.toBe(first.ca)
    expect(again.cert).not.toBe(first.cert)
    expect(ensureTls(dir, names, 'My Mac').ca).toBe(again.ca)
  })

  it('knows the local ranges', () => {
    for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.10', '100.64.0.1', '127.0.0.1']) expect(isLocalIp(ip)).toBe(true)
    for (const ip of ['172.32.0.1', '8.8.8.8', '100.128.0.1', '192.169.0.1', '', 'fe80::1']) expect(isLocalIp(ip)).toBe(false)
  })
})
