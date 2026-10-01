import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import { createPrivacyMode, effectiveIndicator, NEUTRAL_TITLE, OVERLAY_TITLE, PRIVACY_NOTICE_VERSION, privacyActive } from './privacy-mode'
import type { CopilotConfig } from './types'

type Mode = CopilotConfig['privacy']['mode']
const off: Mode = DEFAULT_CONFIG.privacy.mode
const on = (over: Partial<Mode> = {}): Mode => ({ ...off, enabled: true, noticeVersion: PRIVACY_NOTICE_VERSION, hideFromCapture: true, noDockIcon: true, neutralTitle: true, indicator: 'dot', ...over })

const fakeWin = () => ({ setContentProtection: vi.fn(), setTitle: vi.fn(), isDestroyed: () => false })
const fakeDock = () => ({ hide: vi.fn(), show: vi.fn(() => Promise.resolve()) })
const asWin = (w: ReturnType<typeof fakeWin>) => w as unknown as Parameters<ReturnType<typeof createPrivacyMode>['applyPrivacyMode']>[0]

describe('privacy mode (plan §3.5 acceptance)', () => {
  it('1. defaults: nothing low-profile is applied', () => {
    const win = fakeWin(), dock = fakeDock()
    const pm = createPrivacyMode({ dock })
    pm.applyPrivacyMode(asWin(win), off, true)
    expect(win.setContentProtection).not.toHaveBeenCalledWith(true)
    expect(dock.hide).not.toHaveBeenCalled()
    expect(win.setTitle).not.toHaveBeenCalledWith(NEUTRAL_TITLE)
    expect(effectiveIndicator(off)).toBe('chip')
  })

  it('2. without a notice ack for the current version the flags are ignored', () => {
    const win = fakeWin(), dock = fakeDock()
    const pm = createPrivacyMode({ dock })
    for (const noticeVersion of [null, 'privacy-notice-v0']) {
      pm.applyPrivacyMode(asWin(win), on({ noticeVersion }), true)
    }
    expect(win.setContentProtection).not.toHaveBeenCalledWith(true)
    expect(dock.hide).not.toHaveBeenCalled()
    expect(privacyActive(on({ noticeVersion: null }))).toBe(false)
    expect(effectiveIndicator(on({ noticeVersion: null }))).toBe('chip')
  })

  it('2. with the ack it applies to every window, including ones created later', () => {
    const a = fakeWin(), b = fakeWin()
    const pm = createPrivacyMode({ dock: fakeDock() })
    pm.applyPrivacyMode(asWin(a), on(), false)
    pm.applyPrivacyMode(asWin(b), on(), false)
    expect(a.setContentProtection).toHaveBeenCalledWith(true)
    expect(b.setContentProtection).toHaveBeenCalledWith(true)
  })

  it('3. no Dock icon only while live; restored on stop, panic, quit and the crash path', () => {
    const win = fakeWin(), dock = fakeDock()
    const pm = createPrivacyMode({ dock })
    pm.applyPrivacyMode(asWin(win), on(), false)
    expect(dock.hide).not.toHaveBeenCalled()
    pm.applyPrivacyMode(asWin(win), on(), true)
    expect(dock.hide).toHaveBeenCalledTimes(1)
    pm.applyPrivacyMode(asWin(win), on(), true)
    expect(dock.hide).toHaveBeenCalledTimes(1) // idempotent
    pm.applyPrivacyMode(asWin(win), on(), false) // stop
    expect(dock.show).toHaveBeenCalledTimes(1)
    pm.applyPrivacyMode(asWin(win), on(), true)
    pm.restore(asWin(win)) // panic / before-quit / render-process-gone all call restore
    expect(dock.show).toHaveBeenCalledTimes(2)
    expect(win.setContentProtection).toHaveBeenLastCalledWith(false)
    pm.restore(asWin(win))
    expect(dock.show).toHaveBeenCalledTimes(2) // nothing left to restore
  })

  it('3. restoreAll covers windows and the Dock without a window reference', () => {
    const win = fakeWin(), dock = fakeDock()
    const pm = createPrivacyMode({ dock })
    pm.applyPrivacyMode(asWin(win), on(), true)
    pm.restoreAll()
    expect(dock.show).toHaveBeenCalledTimes(1)
    expect(win.setContentProtection).toHaveBeenLastCalledWith(false)
  })

  it('4. titles are constants; dynamic text never reaches setTitle', () => {
    const win = fakeWin()
    const pm = createPrivacyMode({ dock: fakeDock() })
    pm.applyPrivacyMode(asWin(win), on({ neutralTitle: false }), true)
    pm.applyPrivacyMode(asWin(win), on({ neutralTitle: true }), true)
    const titles = win.setTitle.mock.calls.map(c => c[0])
    expect(new Set(titles)).toEqual(new Set([OVERLAY_TITLE, NEUTRAL_TITLE]))
    expect(NEUTRAL_TITLE).toBe('Careerloom')
  })

  it('6. the indicator variant is honoured only with Privacy mode enabled and acked', () => {
    expect(effectiveIndicator(on({ indicator: 'dot' }))).toBe('dot')
    expect(effectiveIndicator(on({ indicator: 'off' }))).toBe('off')
    expect(effectiveIndicator({ ...off, indicator: 'off' })).toBe('chip')
    expect(effectiveIndicator(on({ enabled: false, indicator: 'dot' }))).toBe('chip')
  })

  it('8. turning the master switch off restores every default without confirmation', () => {
    const win = fakeWin(), dock = fakeDock()
    const pm = createPrivacyMode({ dock })
    pm.applyPrivacyMode(asWin(win), on(), true)
    pm.applyPrivacyMode(asWin(win), on({ enabled: false }), true)
    expect(win.setContentProtection).toHaveBeenLastCalledWith(false)
    expect(dock.show).toHaveBeenCalledTimes(1)
    expect(win.setTitle).toHaveBeenLastCalledWith(OVERLAY_TITLE)
  })
})
