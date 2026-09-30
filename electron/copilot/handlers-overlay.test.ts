// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-overlay-handlers-'))
vi.mock('electron', () => ({ app: { getPath: () => dir }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))
const host = {
  overlayCommand: vi.fn(), stop: vi.fn(async () => undefined), ackPrivacyNotice: vi.fn(() => ({ ok: true })), checkHotkey: vi.fn(() => ({ ok: true })),
  publishState: vi.fn(), publish: vi.fn(), setSessionHooks: vi.fn(), onAction: vi.fn(),
}
vi.mock('./overlay-runtime', () => ({ getOverlayHost: () => host }))

import { copilotHandlers } from './handlers'
import { PRIVACY_NOTICE_VERSION } from './privacy-mode'

const real = process.platform
const mac = () => Object.defineProperty(process, 'platform', { value: 'darwin' })
afterEach(() => { Object.defineProperty(process, 'platform', { value: real }); vi.clearAllMocks() })

describe('WP1 handlers', () => {
  it('copilotOverlay forwards a typed command and treats {} as a heartbeat', async () => {
    mac()
    await copilotHandlers.copilotOverlay({})
    await copilotHandlers.copilotOverlay({ moveTo: 'bl', collapse: true })
    expect(host.overlayCommand).toHaveBeenNthCalledWith(2, expect.objectContaining({ moveTo: 'bl', collapse: true }))
  })

  it.each([null, 'x', [], { collapse: 'yes' }, { moveTo: 'middle' }])('copilotOverlay rejects %j', async bad => {
    mac()
    await expect(Promise.resolve().then(() => copilotHandlers.copilotOverlay(bad))).rejects.toThrow()
  })

  it('copilotStop accepts only the three reasons', async () => {
    mac()
    await copilotHandlers.copilotStop('panic')
    expect(host.stop).toHaveBeenCalledWith('panic') // the kill switch runs even with no recorded session
    await expect(Promise.resolve().then(() => copilotHandlers.copilotStop('later'))).rejects.toThrow()
  })

  it('the renderer cannot record the notice ack through copilotSetConfig; only copilotAckPrivacyNotice can', async () => {
    mac()
    const cfg = await copilotHandlers.copilotSetConfig({ privacy: { mode: { enabled: true, noticeVersion: PRIVACY_NOTICE_VERSION, hideFromCapture: true } } }) as { privacy: { mode: { enabled: boolean; noticeVersion: string | null; hideFromCapture: boolean } } }
    expect(cfg.privacy.mode).toMatchObject({ enabled: true, hideFromCapture: true, noticeVersion: null })
    expect(await copilotHandlers.copilotAckPrivacyNotice(PRIVACY_NOTICE_VERSION)).toEqual({ ok: true })
    expect(host.ackPrivacyNotice).toHaveBeenCalledWith(PRIVACY_NOTICE_VERSION)
  })

  it('ack and hotkey checks validate their input', async () => {
    mac()
    await expect(Promise.resolve().then(() => copilotHandlers.copilotAckPrivacyNotice(3))).rejects.toThrow()
    await expect(Promise.resolve().then(() => copilotHandlers.copilotCheckHotkey(undefined))).rejects.toThrow()
  })
})
