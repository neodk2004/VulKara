// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The remote web UI's certificates. A small certificate authority of this Mac's own, made once and kept: a device that
// installs and trusts it once opens the web UI over HTTPS without a warning from then on. With it, a server certificate
// for the Mac's current addresses (its IPs on the local network, <name>.local, localhost), made anew when an address
// changes or before it runs out; the authority stays, so the devices keep trusting it.
// Made with macOS's own openssl (LibreSSL), no package needed.
import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OPENSSL = '/usr/bin/openssl'
// Apple refuses a server certificate of a user-trusted authority that lasts longer than 825 days, browsers more than 398
const SERVER_DAYS = 397
const RENEW_DAYS = 30
// The authority may only vouch for the local network: a device that trusts it trusts it for these names and nothing
// else, so its key could never be used to pose as any other site. Private IPv4 ranges (with 100.64/10 of VPNs such as
// Tailscale), loopback, *.local and localhost.
const PRIVATE: Array<[string, number]> = [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10], ['127.0.0.0', 8]]
const CONSTRAINTS = 'critical,' + [
  ...PRIVATE.map(([net, bits]) => `permitted;IP:${net}/${mask(bits)}`), 'permitted;DNS:local', 'permitted;DNS:localhost',
].join(',')
// the authority's make-up; an authority of an earlier make-up (without the name constraints) is made anew
const CA_KIND = 'local-only-1'

export interface Tls { key: string; cert: string; ca: string }
/** where the server is reached: IPs and host names */
export interface Names { ips: string[]; hosts: string[] }

const openssl = (dir: string, args: string[]): void => { execFileSync(OPENSSL, args, { cwd: dir, stdio: 'pipe' }) }

function mask(bits: number): string {
  const m = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return [24, 16, 8, 0].map((s) => (m >>> s) & 255).join('.')
}
const toInt = (ip: string): number => ip.split('.').reduce((n, p) => ((n << 8) | Number(p)) >>> 0, 0)

/** an IPv4 address inside the ranges the authority may vouch for */
export function isLocalIp(ip: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false
  return PRIVATE.some(([net, bits]) => bits === 0 || (toInt(ip) >>> (32 - bits)) === (toInt(net) >>> (32 - bits)))
}
/** a host name as the certificate may carry it: letters, digits, hyphens and dots only */
const cleanHost = (h: string): string => h.replace(/[^A-Za-z0-9.-]/g, '')

/** The authority and a server certificate for these names, made where missing, outdated or for other names. */
export function ensureTls(dir: string, names: Names, owner: string, now = Date.now()): Tls {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const kind = join(dir, 'ca.kind')
  if (!existsSync(join(dir, 'ca.crt')) || !existsSync(join(dir, 'ca.key')) || !existsSync(kind) || readFileSync(kind, 'utf8') !== CA_KIND) {
    makeAuthority(dir, owner)
    writeFileSync(kind, CA_KIND)
    writeFileSync(join(dir, 'server.names'), '')  // a new authority: the server certificate too
  }
  // only names inside the authority's constraints: one outside would make the whole certificate invalid
  const ips = names.ips.filter(isLocalIp)
  const hosts = names.hosts.map(cleanHost).filter((h) => h === 'localhost' || /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.local$/.test(h))
  const wanted = [...ips.map((ip) => `IP:${ip}`), ...hosts.map((h) => `DNS:${h}`)].sort().join(',')
  if (!current(dir, wanted, now)) makeServer(dir, wanted, hosts[0] ?? 'localhost')
  const read = (f: string): string => readFileSync(join(dir, f), 'utf8')
  return { key: read('server.key'), cert: read('server.crt'), ca: read('ca.crt') }
}

function current(dir: string, wanted: string, now: number): boolean {
  const files = ['server.crt', 'server.key', 'server.names'].map((f) => join(dir, f))
  if (!files.every(existsSync) || readFileSync(files[2], 'utf8') !== wanted) return false
  const until = Date.parse(new X509Certificate(readFileSync(files[0])).validTo)
  return until - now > RENEW_DAYS * 86_400_000
}

function makeAuthority(dir: string, owner: string): void {
  // the name a phone shows when the certificate is installed: whose Mac it belongs to
  writeFileSync(join(dir, 'ca.cnf'), [
    '[req]', 'distinguished_name = dn', 'prompt = no',
    '[dn]', `CN = VulKara on ${owner.replace(/[^\w .-]/g, '').slice(0, 40) || 'this Mac'}`, 'O = VulKara',
    '[v3_ca]', 'basicConstraints = critical,CA:TRUE,pathlen:0', 'keyUsage = critical,keyCertSign,cRLSign', 'subjectKeyIdentifier = hash',
    `nameConstraints = ${CONSTRAINTS}`,
  ].join('\n') + '\n')
  openssl(dir, ['req', '-x509', '-new', '-nodes', '-newkey', 'rsa:2048', '-sha256', '-days', '3650',
    '-keyout', 'ca.key', '-out', 'ca.crt', '-config', 'ca.cnf', '-extensions', 'v3_ca'])
  chmodSync(join(dir, 'ca.key'), 0o600)
}

function makeServer(dir: string, wanted: string, name: string): void {
  writeFileSync(join(dir, 'server.cnf'), [
    '[req]', 'distinguished_name = dn', 'prompt = no',
    '[dn]', `CN = ${name}`,
    '[v3_srv]', 'basicConstraints = critical,CA:FALSE', 'keyUsage = critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage = serverAuth', `subjectAltName = ${wanted}`, 'subjectKeyIdentifier = hash', 'authorityKeyIdentifier = keyid',
  ].join('\n') + '\n')
  openssl(dir, ['req', '-new', '-nodes', '-newkey', 'rsa:2048', '-keyout', 'server.key', '-out', 'server.csr', '-config', 'server.cnf'])
  openssl(dir, ['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt',
    '-days', String(SERVER_DAYS), '-sha256', '-extfile', 'server.cnf', '-extensions', 'v3_srv'])
  chmodSync(join(dir, 'server.key'), 0o600)
  writeFileSync(join(dir, 'server.names'), wanted)
}
