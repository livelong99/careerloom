import { useEffect, useState } from 'react'

import { careerloom } from '../../lib/ipc'
import { CONSENT_VERSION } from './consentCopy'
import { createFakeKb, FAKE_STATES, type FakeState, type KbClient } from '../../lib/kbFake'

export type { KbClient }

/** `?fakeKb=<state>` (dev builds only; `1` means ready). */
export function fakeState(): FakeState | null {
  if (!import.meta.env.DEV) return null
  const v = new URLSearchParams(globalThis.location?.search ?? '').get('fakeKb')
  return v === null ? null : (FAKE_STATES as readonly string[]).includes(v) ? (v as FakeState) : 'ready'
}

let fake: { state: FakeState; client: KbClient } | null = null
export const resetFakeKb = (): void => { fake = null }
export function kb(): KbClient {
  if (!import.meta.env.DEV) return careerloom // inlined so the fake (and its data) is dropped from production bundles
  const s = fakeState()
  if (!s) return careerloom
  if (fake?.state !== s) fake = { state: s, client: createFakeKb(s, new URLSearchParams(location.search).get('fakeConsent') === '0' ? null : CONSENT_VERSION) }
  return fake.client
}

/** The real stubs answer `{ status: 'not-implemented' }` until the store/research packages land. */
export const isStub = (v: unknown): boolean => !!v && typeof v === 'object' && (v as { status?: unknown }).status === 'not-implemented'

/** Browser connectivity (the dev `offline` state forces it off). */
export function useOnline(): boolean {
  const [on, setOn] = useState(() => (fakeState() === 'offline' ? false : globalThis.navigator?.onLine !== false))
  useEffect(() => {
    if (fakeState() === 'offline') return
    const up = (): void => setOn(true), down = (): void => setOn(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return on
}
