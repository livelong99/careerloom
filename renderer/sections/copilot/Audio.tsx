import { useEffect, useState } from 'react'

import { Group, Note, Row } from '@/components/copilot/Group'
import { LevelMeter } from '@/components/copilot/LevelMeter'
import { PermissionChip, PermissionFix } from '@/components/copilot/PermissionFix'
import { errorText, orNull, useAsync, useCopilotConfig } from '@/components/copilot/api'
import { Chip, selectClass } from '@/components/copilot/hwControls'
import { useSelection } from '@/components/copilot/selection'
import { Button } from '@/components/ui/button'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { careerloom } from '@/lib/ipc'
import type { SourceHealth } from '@/lib/types'
import { Page } from '../resume/PageStub'

const PROBE_TEXT: Record<SourceHealth['status'], string> = {
  ok: 'Working: Careerloom heard sound.',
  silent: 'Silent: no sound reached Careerloom. Check the device above and the permission in System Settings.',
  denied: 'Blocked: macOS did not let Careerloom use this input.',
  missing: 'No input device found.',
}

/** Streams the chosen mic to main (same `copilotAudio` channel a session uses) so the 3-second test has sound to listen to, and reports each frame's level so the meter shows what main hears. A failure to open the mic is returned, not hidden: it is the real reason the test would find nothing. */
async function streamMic(deviceId: string | null, onLevel: (level: number) => void): Promise<{ stop(): void; error: string | null; blocked: boolean }> {
  try {
    const t0 = Date.now()
    const { startMic } = await import('../../overlay/capture/mic')
    const h = await startMic({ deviceId, onFrame: pcm16 => { onLevel(levelOf(pcm16)); careerloom.copilotAudio({ source: 'mic', pcm16, t: Date.now() - t0 }) } })
    return { stop: () => h.stop(), error: null, blocked: false }
  } catch (e) {
    return { stop: () => {}, error: errorText(e), blocked: (e as { cause?: { name?: string } }).cause?.name === 'NotAllowedError' }
  }
}

/** 0..1 meter level of a PCM16 frame: speech peaks around 0.1–0.4 of full scale, so it is stretched to use the whole meter. */
function levelOf(pcm16: ArrayBuffer): number {
  const s = new Int16Array(pcm16, 0, pcm16.byteLength >> 1)
  let peak = 0
  for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i]!))
  return Math.min(1, (peak / 32768) * 2.5)
}

type Device = { id: string; label: string }
/** Real audio inputs only: Chromium's synthetic "default"/"communications" entries duplicate our System default, and ids stay empty until the mic permission was granted once. Re-read on plug/unplug and after `refreshKey` changes (labels appear once permission exists). */
function useInputDevices(refreshKey: unknown): Device[] {
  const [list, setList] = useState<Device[]>([])
  useEffect(() => {
    const md = navigator.mediaDevices
    if (!md?.enumerateDevices) return
    let live = true
    const read = (): void => {
      md.enumerateDevices().then(ds => {
        if (live) setList(ds.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })))
      }, () => {})
    }
    read()
    md.addEventListener?.('devicechange', read)
    return () => { live = false; md.removeEventListener?.('devicechange', read) }
  }, [refreshKey])
  return list
}

export function AudioPage() {
  const { config, save } = useCopilotConfig()
  const { jobId } = useSelection()
  const ready = useAsync(() => (jobId ? careerloom.copilotReadiness(jobId) : Promise.resolve(null)), [jobId])
  const perms = ready.data ? orNull(ready.data) : null
  const [testing, setTesting] = useState<'mic' | 'system' | null>(null)
  const [probe, setProbe] = useState<{ source: 'mic' | 'system'; text: string } | null>(null)
  const [blocked, setBlocked] = useState(false) // the last test was refused by macOS: readiness only knows this once a job is picked
  const [level, setLevel] = useState(0)
  const devices = useInputDevices(testing)

  async function test(source: 'mic' | 'system'): Promise<void> {
    setTesting(source); setProbe(null)
    const mic = source === 'mic' ? await streamMic(config?.audio.micDeviceId ?? null, setLevel) : null
    try {
      if (mic?.error) { setBlocked(mic.blocked); setProbe({ source, text: mic.error }); return }
      const r = orNull(await careerloom.copilotProbeAudio(source, 3000))
      setBlocked(r?.status === 'denied')
      setProbe({ source, text: r ? PROBE_TEXT[r.status] : 'The audio test is not available in this build yet.' })
    } catch (e) { setProbe({ source, text: errorText(e) }) } finally { mic?.stop(); setLevel(0); setTesting(null) }
  }
  const openMic = () => { void careerloom.copilotOpenSystemSettings('microphone') }
  if (!config) return <Page title="Audio" blurb="Loading…" />
  const { audio } = config
  const micBad = blocked || perms?.mic === 'denied' || perms?.mic === 'restricted'
  const savedGone = !!audio.micDeviceId && devices.length > 0 && !devices.some(d => d.id === audio.micDeviceId)

  return (
    <Page title="Audio" blurb="The interviewer comes from system audio, you come from the microphone. Keeping them apart removes guesswork about who is speaking.">
      <Group title="Your microphone" action={perms ? <PermissionChip status={perms.mic} /> : <Chip>Permission unknown until a job is picked</Chip>}>
        <Row label="Input device" hint="Speak normally. The bars should move without touching the top." htmlFor="mic-device">
          <select id="mic-device" className={selectClass} value={audio.micDeviceId ?? ''} onChange={e => void save({ audio: { micDeviceId: e.target.value || null } })}>
            <option value="">System default</option>
            {savedGone && <option value={audio.micDeviceId ?? ''}>Saved microphone (not connected, using system default)</option>}
            {devices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </Row>
        <Row label="Input level" hint={probe?.source === 'mic' ? probe.text : 'Press Test and speak for three seconds.'}>
          <LevelMeter level={level} />
          <Button variant="outline" disabled={testing !== null} onClick={() => void test('mic')}>Test for 3 seconds</Button>
        </Row>
        {micBad && <div className="border-t border-border pt-3"><PermissionFix kind="microphone" onOpen={openMic} /></div>}
      </Group>

      <Group title="Interviewer (system audio)" action={<><Chip>Coming soon</Chip><ToggleSwitch aria-label="Use system audio" checked={false} disabled onCheckedChange={() => undefined} /></>}>
        <Note>Capturing the interviewer from system audio is not available yet. Until then Careerloom listens to your microphone only, and the interviewer&apos;s questions are picked up when they are audible to it (use speakers, or answer practice questions out loud).</Note>
      </Group>

      <Group>
        <Row label="Use headphones" hint="If the interviewer comes out of your speakers, your microphone picks them up and they appear twice."><Chip>Recommended</Chip></Row>
        <Row label="Who is who" hint="System audio is labelled Interviewer. Microphone is labelled You. There is no voice identification." />
      </Group>
    </Page>
  )
}
