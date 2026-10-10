import { describe, expect, it } from 'vitest'

import { bundlePathFromExe, installBlocker, parseDigest, pickAsset, trustedAssetUrl, trustedFinalUrl } from './release'

const HEX = 'a'.repeat(64)
const url = (n: string) => `https://github.com/livelong99/careerloom/releases/download/v0.5.0/${n}`
const assets = [
  { name: 'Careerloom-0.5.0-arm64.zip', size: 10, browser_download_url: url('Careerloom-0.5.0-arm64.zip'), digest: `sha256:${HEX}` },
  { name: 'Careerloom-0.5.0-x64.zip', size: 11, browser_download_url: url('Careerloom-0.5.0-x64.zip'), digest: null },
  { name: 'Careerloom-Setup-0.5.0.exe', size: 12, browser_download_url: url('Careerloom-Setup-0.5.0.exe'), digest: `sha256:${HEX}` },
]

describe('pickAsset', () => {
  it('picks the zip for the CPU and the installer on Windows', () => {
    expect(pickAsset(assets, '0.5.0', 'darwin', 'arm64')?.name).toBe('Careerloom-0.5.0-arm64.zip')
    expect(pickAsset(assets, '0.5.0', 'darwin', 'x64')?.sha256).toBeNull()
    expect(pickAsset(assets, '0.5.0', 'win32', 'x64')?.name).toBe('Careerloom-Setup-0.5.0.exe')
  })
  it('returns null for linux, missing assets and junk', () => {
    expect(pickAsset(assets, '0.5.0', 'linux', 'x64')).toBeNull()
    expect(pickAsset(assets, '0.6.0', 'darwin', 'arm64')).toBeNull()
    expect(pickAsset(undefined, '0.5.0', 'darwin', 'arm64')).toBeNull()
  })
})
describe('digest and urls', () => {
  it('parses only sha256 digests', () => {
    expect(parseDigest(`sha256:${HEX.toUpperCase()}`)).toBe(HEX)
    expect(parseDigest('md5:abc')).toBeNull()
    expect(parseDigest(null)).toBeNull()
  })
  it('trusts only our release downloads', () => {
    expect(trustedAssetUrl(url('x.zip'))).toBe(true)
    expect(trustedAssetUrl('http://github.com/livelong99/careerloom/releases/download/v1/x.zip')).toBe(false)
    expect(trustedAssetUrl('https://github.com/evil/careerloom/releases/download/v1/x.zip')).toBe(false)
    expect(trustedAssetUrl('https://github.com.evil.com/livelong99/careerloom/releases/download/v1/x')).toBe(false)
    expect(trustedFinalUrl('https://objects.githubusercontent.com/abc')).toBe(true)
    expect(trustedFinalUrl('https://githubusercontent.com.evil.io/abc')).toBe(false)
  })
})
describe('installBlocker', () => {
  const base = { platform: 'darwin', packaged: true, exePath: '/Applications/Careerloom.app/Contents/MacOS/Careerloom', writable: () => true }
  it('allows a normal install', () => {
    expect(installBlocker(base)).toBeNull()
    expect(installBlocker({ ...base, platform: 'win32', exePath: 'C:\\x\\Careerloom.exe' })).toBeNull()
  })
  it('explains each refusal', () => {
    expect(installBlocker({ ...base, packaged: false })).toMatch(/development/)
    expect(installBlocker({ ...base, exePath: '/Volumes/Careerloom/Careerloom.app/Contents/MacOS/Careerloom' })).toMatch(/Applications folder/)
    expect(installBlocker({ ...base, exePath: '/private/var/AppTranslocation/X/d/Careerloom.app/Contents/MacOS/Careerloom' })).toMatch(/Applications folder/)
    expect(installBlocker({ ...base, writable: () => false })).toMatch(/cannot write/)
    expect(installBlocker({ ...base, platform: 'linux' })).toMatch(/macOS and Windows/)
    expect(installBlocker({ ...base, storeManaged: true })).toMatch(/Store/)
  })
  it('finds the bundle', () => {
    expect(bundlePathFromExe('/A/B.app/Contents/MacOS/B')).toBe('/A/B.app')
    expect(bundlePathFromExe('/usr/bin/node')).toBeNull()
  })
})
