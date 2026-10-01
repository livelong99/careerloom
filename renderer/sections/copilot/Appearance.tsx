import { AnchorGrid } from '@/components/copilot/AnchorGrid'
import { Group, Row } from '@/components/copilot/Group'
import { useCopilotConfig } from '@/components/copilot/api'
import { Chip, Pills, rangeClass } from '@/components/copilot/hwControls'
import { OverlayPreview } from '@/components/copilot/wp1'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import type { CopilotConfig } from '@/lib/types'
import { Page } from '../resume/PageStub'

type Overlay = CopilotConfig['overlay']
const LAYOUTS = [{ value: 'strip', label: 'Strip' }, { value: 'panel', label: 'Panel' }] as const
const THEMES = [{ value: 'app', label: 'Match app' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }] as const

export function AppearancePage() {
  const { config, save } = useCopilotConfig()
  if (!config) return <Page title="Overlay appearance" blurb="Loading…" />
  const o = config.overlay
  const set = (patch: Partial<Overlay>) => void save({ overlay: patch })
  const slider = (id: string, min: number, max: number, value: number, onChange: (v: number) => void, unit: string) => (
    <>
      <input id={id} type="range" className={rangeClass} min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} />
      <span className="w-14 text-right font-mono text-xs text-muted-foreground">{value}{unit}</span>
    </>
  )
  return (
    <Page title="Overlay appearance" blurb="Sized to be read in a glance. It sits above your call and never takes keyboard focus.">
      <div className="grid gap-4 lg:grid-cols-[26rem_minmax(0,1fr)] lg:items-start">
        <Group>
          <Row label="Layout" stack><Pills label="Layout" value={o.layout} options={LAYOUTS} onChange={v => set({ layout: v })} /></Row>
          <Row label="Position" hint="On the display the overlay opens on." stack><AnchorGrid value={o.anchor} onChange={a => set({ anchor: a })} /></Row>
          <Row label="Width" htmlFor="ov-width">{slider('ov-width', 280, 1200, o.width, v => set({ width: v }), ' px')}</Row>
          <Row label="Text size" htmlFor="ov-font">{slider('ov-font', 12, 18, o.fontPx, v => set({ fontPx: v }), ' px')}</Row>
          <Row label="Opacity" hint="Never below 60%." htmlFor="ov-opacity">{slider('ov-opacity', 60, 100, Math.round(o.opacity * 100), v => set({ opacity: Math.max(60, v) / 100 }), '%')}</Row>
          <Row label="Theme"><Pills label="Theme" value={o.theme} options={THEMES} onChange={v => set({ theme: v })} /></Row>
          <Row label="Click through when idle" hint="Clicks pass to your call. Hold ⌃⌥ to use the overlay."><ToggleSwitch aria-label="Click through when idle" checked={o.clickThroughIdle} onCheckedChange={v => set({ clickThroughIdle: v })} /></Row>
          <Row label="Stay above full-screen apps"><ToggleSwitch aria-label="Stay above full-screen apps" checked={o.aboveFullscreen} onCheckedChange={v => set({ aboveFullscreen: v })} /></Row>
          <Row label="Reduce motion" hint="Follows your system setting."><Chip>System</Chip></Row>
        </Group>
        <Group title="Live preview"><OverlayPreview config={config} /></Group>
      </div>
    </Page>
  )
}
