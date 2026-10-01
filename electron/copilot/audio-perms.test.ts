import { describe, expect, it, vi } from 'vitest'

import { assertSupported, capabilities, liveSupported } from './capabilities'
import { asPermStatus, ensureMic, isAllowedPermission, settingsUrl } from './audio-perms'

describe('capabilities', () => {
  it('copilot is macOS-only; live needs Apple silicon', () => {
    expect(capabilities('win32', 'x64')).toMatchObject({ copilot: false, live: false })
    expect(capabilities('linux', 'arm64').copilot).toBe(false)
    expect(capabilities('darwin', 'x64')).toMatchObject({ copilot: true, live: false })
    expect(liveSupported('darwin', 'arm64')).toBe(true)
  })
  it('assertSupported refuses off-platform calls and live on Intel', () => {
    expect(() => assertSupported(false, 'win32')).toThrow(/macOS only/)
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
