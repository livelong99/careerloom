import { useEffect, useState } from 'react'

import { Group, Note, Row } from '@/components/copilot/Group'
import { LevelMeter, useMicLevel } from '@/components/copilot/LevelMeter'
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

/** Streams the chosen mic to main (same `copilotAudio` channel a session uses) so the 3-second test has sound to listen to. Returns a stop function; any failure just means main reports no input. */
async function streamMic(deviceId: string | null): Promise<() => void> {
  try {
    const t0 = Date.now()
    const { startMic } = await import('../../overlay/capture/mic')
    const h = await startMic({ deviceId, onFrame: pcm16 => careerloom.copilotAudio({ source: 'mic', pcm16, t: Date.now() - t0 }) })
    return () => h.stop()
  } catch { return () => {} }
}

/** Audio inputs the browser can see; labels stay empty until the mic permission was granted once. */
function useInputDevices(): Array<{ id: string; label: string }> {
  const [list, setList] = useState<Array<{ id: string; label: string }>>([])
  useEffect(() => {
    let live = true
    navigator.mediaDevices?.enumerateDevices?.().then(ds => {
      if (live) setList(ds.filter(d => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })))
    }, () => {})
    return () => { live = false }
  }, [])
  return list
}

export function AudioPage() {
  const { config, save } = useCopilotConfig()
  const { jobId } = useSelection()
  const devices = useInputDevices()
  const ready = useAsync(() => (jobId ? careerloom.copilotReadiness(jobId) : Promise.resolve(null)), [jobId])
  const perms = ready.data ? orNull(ready.data) : null
  const [testing, setTesting] = useState<'mic' | 'system' | null>(null)
  const [probe, setProbe] = useState<{ source: 'mic' | 'system'; text: string } | null>(null)
  const level = useMicLevel(testing === 'mic', config?.audio.micDeviceId ?? null)

  async function test(source: 'mic' | 'system'): Promise<void> {
    setTesting(source); setProbe(null)
    const stop = source === 'mic' ? await streamMic(config?.audio.micDeviceId ?? null) : () => {}
    try {
      const r = orNull(await careerloom.copilotProbeAudio(source, 3000))
      setProbe({ source, text: r ? PROBE_TEXT[r.status] : 'The audio test is not available in this build yet.' })
    } catch (e) { setProbe({ source, text: errorText(e) }) } finally { stop(); setTesting(null) }
  }
  const open = (pane: 'microphone' | 'system-audio') => () => { void careerloom.copilotOpenSystemSettings(pane) }
  if (!config) return <Page title="Audio" blurb="Loading…" />
  const { audio } = config
  const micBad = perms?.mic === 'denied' || perms?.mic === 'restricted'
  const sysBad = perms?.system !== 'granted'

  return (
    <Page title="Audio" blurb="The interviewer comes from system audio, you come from the microphone. Keeping them apart removes guesswork about who is speaking.">
      <Group title="Your microphone" action={perms ? <PermissionChip status={perms.mic} /> : <Chip>Permission unknown until a job is picked</Chip>}>
        <Row label="Input device" hint="Speak normally. The bars should move without touching the top." htmlFor="mic-device">
          <select id="mic-device" className={selectClass} value={audio.micDeviceId ?? ''} onChange={e => void save({ audio: { micDeviceId: e.target.value || null } })}>
            <option value="">System default</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </Row>
        <Row label="Input level" hint={probe?.source === 'mic' ? probe.text : 'Press Test and speak for three seconds.'}>
          <LevelMeter level={level} />
          <Button variant="outline" disabled={testing !== null} onClick={() => void test('mic')}>Test for 3 seconds</Button>
        </Row>
        {micBad && <div className="border-t border-border pt-3"><PermissionFix kind="microphone" onOpen={open('microphone')} /></div>}
      </Group>

      <Group title="Interviewer (system audio)" action={<>{perms && <PermissionChip status={perms.system} />}<ToggleSwitch aria-label="Use system audio" checked={audio.useSystem} onCheckedChange={v => void save({ audio: { useSystem: v } })} /></>}>
        {sysBad && <div className="mb-3"><PermissionFix kind="system-audio" onOpen={open('system-audio')} onTest={audio.useSystem ? () => void test('system') : undefined} testing={testing !== null} /></div>}
        {probe?.source === 'system' && <p role="status" className="m-0 mb-3 text-sm text-foreground">{probe.text}</p>}
        <Row label="Source" hint="Use a virtual device such as BlackHole if system audio capture isn't available on your Mac." htmlFor="sys-source">
          <select id="sys-source" className={selectClass} value={audio.systemSource} onChange={e => void save({ audio: { systemSource: e.target.value as 'loopback' | 'virtual' } })}>
            <option value="loopback">Everything this computer plays</option>
            <option value="virtual">A virtual device</option>
          </select>
        </Row>
        {audio.systemSource === 'virtual' && (
          <Row label="Virtual device" hint="Type the device name as it appears in Sound settings." htmlFor="virtual-device">
            <input id="virtual-device" className={selectClass} defaultValue={audio.virtualDeviceId ?? ''} onBlur={e => void save({ audio: { virtualDeviceId: e.target.value.trim() || null } })} />
          </Row>
        )}
        <div className="mt-3"><Note>System audio records the other person. You&apos;ll confirm consent before each live session.</Note></div>
      </Group>

      <Group>
        <Row label="Use headphones" hint="If the interviewer comes out of your speakers, your microphone picks them up and they appear twice."><Chip>Recommended</Chip></Row>
        <Row label="Who is who" hint="System audio is labelled Interviewer. Microphone is labelled You. There is no voice identification." />
      </Group>
    </Page>
  )
}
