import { describe, expect, it, vi } from 'vitest'

import { assertSupported, capabilities, liveSupported } from './capabilities'
import { asPermStatus, ensureMic, isAllowedPermission, micSettingsPath, screenStatus, settingsUrl } from './audio-perms'

describe('capabilities', () => {
  it('copilot runs on macOS and Windows; live needs Apple silicon on a Mac, any Windows PC', () => {
    expect(capabilities('win32', 'x64')).toMatchObject({ copilot: true, live: true })
    expect(capabilities('win32', 'arm64')).toMatchObject({ copilot: true, live: true })
    expect(capabilities('linux', 'arm64').copilot).toBe(false)
    expect(capabilities('darwin', 'x64')).toMatchObject({ copilot: true, live: false })
    expect(liveSupported('darwin', 'arm64')).toBe(true)
  })
  it('assertSupported refuses off-platform calls and live on Intel', () => {
    expect(() => assertSupported(false, 'linux')).toThrow(/macOS and Windows only/)
    expect(() => assertSupported(true, 'win32')).not.toThrow()
    expect(() => assertSupported(true, 'darwin', 'x64')).toThrow(/Apple silicon/)
    expect(() => assertSupported(false, 'darwin', 'x64')).not.toThrow()
    expect(() => assertSupported(true, 'darwin', 'arm64')).not.toThrow()
  })
})

describe('audio permissions', () => {
  it('asks only when undetermined and returns the new status', async () => {
    let status = 'not-determined'
    const p = { getMediaAccessStatus: () => status, askForMediaAccess: vi.fn(async () => { status = 'granted'; return true }) }
    expect(await ensureMic(p)).toBe('granted')
    expect(await ensureMic(p)).toBe('granted')
    expect(p.askForMediaAccess).toHaveBeenCalledTimes(1)
  })
  it('never prompts when denied', async () => {
    const p = { getMediaAccessStatus: () => 'denied', askForMediaAccess: vi.fn(async () => true) }
    expect(await ensureMic(p)).toBe('denied')
    expect(p.askForMediaAccess).not.toHaveBeenCalled()
  })
  it('maps unknown strings and only allows own-page media requests', () => {
    expect(asPermStatus('weird')).toBe('unknown')
    expect(isAllowedPermission('media', 'file:///app/index.html')).toBe(true)
    expect(isAllowedPermission('media', 'https://evil.example/')).toBe(false)
    expect(isAllowedPermission('geolocation', 'file:///app/index.html')).toBe(false)
    expect(settingsUrl('microphone')).toContain('Privacy_Microphone')
  })
  it('allows the Vite dev server on 127.0.0.1 (what `npm run dev` uses) and an origin without a trailing slash', () => {
    expect(isAllowedPermission('media', 'http://127.0.0.1:5173/overlay.html')).toBe(true)
    expect(isAllowedPermission('media', 'http://127.0.0.1:5173')).toBe(true)
    expect(isAllowedPermission('media', 'http://localhost:5173/')).toBe(true)
    expect(isAllowedPermission('media', 'http://127.0.0.1.evil.example/')).toBe(false)
    expect(isAllowedPermission('media', 'http://localhost:5173.evil.example/')).toBe(false)
  })
  it('never lets a page open the camera', () => {
    expect(isAllowedPermission('media', 'file:///app/index.html', ['audio'])).toBe(true)
    expect(isAllowedPermission('media', 'file:///app/index.html', ['audio', 'video'])).toBe(false)
    expect(isAllowedPermission('media', 'file:///app/index.html', ['video'])).toBe(false)
  })
})

describe('windows permissions', () => {
  it('opens Windows Settings panes and names the right path', () => {
    expect(settingsUrl('microphone', 'win32')).toBe('ms-settings:privacy-microphone')
    expect(settingsUrl('system-audio', 'win32')).toBe('ms-settings:sound')
    expect(settingsUrl('microphone', 'darwin')).toBe('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
    expect(micSettingsPath('win32')).toMatch(/^Settings → Privacy & security/)
    expect(micSettingsPath('darwin')).toMatch(/^System Settings/)
  })
  it('screen capture needs no permission on Windows; the mic prompt API is optional', async () => {
    const p = { getMediaAccessStatus: () => 'denied' }
    expect(screenStatus(p, 'win32')).toBe('granted')
    expect(screenStatus(p, 'darwin')).toBe('denied')
    expect(await ensureMic({ getMediaAccessStatus: () => 'not-determined' })).toBe('not-determined') // no askForMediaAccess: no throw
  })
})
