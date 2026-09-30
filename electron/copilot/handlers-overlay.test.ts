// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-overlay-handlers-'))
vi.mock('electron', () => ({ app: { getPath: () => dir }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))
const host = { overlayCommand: vi.fn(), stop: vi.fn(async () => undefined), ackPrivacyNotice: vi.fn(() => ({ ok: true })), checkHotkey: vi.fn(() => ({ ok: true })) }
vi.mock('./overlay-runtime', () => ({ getOverlayHost: () => host }))

import { copilotHandlers } from './handlers'
import { PRIVACY_NOTICE_VERSION } from './privacy-mode'

const real = process.platform
const mac = () => Object.defineProperty(process, 'platform', { value: 'darwin' })
afterEach(() => { Object.defineProperty(process, 'platform', { value: real }); vi.clearAllMocks() })

describe('WP1 handlers', () => {
  it('copilotOverlay forwards a typed command and treats {} as a heartbeat', () => {
    mac()
    copilotHandlers.copilotOverlay({})
    copilotHandlers.copilotOverlay({ moveTo: 'bl', collapse: true })
    expect(host.overlayCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({ moveTo: 'bl', collapse: true }))
  })

  it.each([null, 'x', [], { collapse: 'yes' }, { moveTo: 'middle' }])('copilotOverlay rejects %j', bad => {
    mac()
    expect(() => copilotHandlers.copilotOverlay(bad)).toThrow()
  })

  it('copilotStop accepts only the three reasons', async () => {
    mac()
    await copilotHandlers.copilotStop('panic')
    expect(host.stop).toHaveBeenCalledWith('panic')
    expect(() => copilotHandlers.copilotStop('later')).toThrow()
  })

  it('the renderer cannot record the notice ack through copilotSetConfig; only copilotAckPrivacyNotice can', () => {
    mac()
    const cfg = copilotHandlers.copilotSetConfig({ privacy: { mode: { enabled: true, noticeVersion: PRIVACY_NOTICE_VERSION, hideFromCapture: true } } }) as { privacy: { mode: { enabled: boolean; noticeVersion: string | null; hideFromCapture: boolean } } }
    expect(cfg.privacy.mode).toMatchObject({ enabled: true, hideFromCapture: true, noticeVersion: null })
    expect(copilotHandlers.copilotAckPrivacyNotice(PRIVACY_NOTICE_VERSION)).toEqual({ ok: true })
    expect(host.ackPrivacyNotice).toHaveBeenCalledWith(PRIVACY_NOTICE_VERSION)
  })

  it('ack and hotkey checks validate their input', () => {
    mac()
    expect(() => copilotHandlers.copilotAckPrivacyNotice(3)).toThrow()
    expect(() => copilotHandlers.copilotCheckHotkey(undefined)).toThrow()
  })
})
