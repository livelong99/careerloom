import { useState } from 'react'
import { Loader2, X } from 'lucide-react'

import { Group, Note, Row } from '@/components/copilot/Group'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleSwitch } from '@/components/ui/toggle-switch'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { PrescreenPolicy, PrescreenStatus } from '../../lib/types'
import { LocalModelSetup } from '../onboarding/ModelStep'
import { ThirdPartyNotices } from '../onboarding/notices'
import { methodLabel, modelNote, retrainAndReport } from './prescreen'

type Props = { status: PrescreenStatus; busy: boolean; reload: () => Promise<void>; rescreen: () => Promise<void> }

const same = (a: PrescreenPolicy, b: PrescreenPolicy) => a.remoteAnywhere === b.remoteAnywhere && a.years === b.years && a.countries.join('\n') === b.countries.join('\n')

/** The one editor for the pre-screen policy (Settings › Jobs): allowed countries, remote-anywhere, years. Draft until saved. */
export function PrescreenPolicyEditor({ status, busy, reload, rescreen }: Props) {
  const [draft, setDraft] = useState<PrescreenPolicy>(status.policy)
  const [country, setCountry] = useState('')
  const [saving, setSaving] = useState(false)
  const dirty = !same(draft, status.policy)
  const set = (patch: Partial<PrescreenPolicy>) => setDraft(d => ({ ...d, ...patch }))
  const add = () => {
    const c = country.trim()
    if (c && !draft.countries.some(x => x.toLowerCase() === c.toLowerCase())) set({ countries: [...draft.countries, c] })
    setCountry('')
  }
  const save = async () => {
    setSaving(true)
    try {
      setDraft(await careerloom.savePrescreenPolicy(draft))
      await reload()
      await rescreen()
    } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) } finally { setSaving(false) }
  }
  return (
    <Group title="Pre-screen policy" action={dirty ? <Badge variant="warn">Unsaved</Badge> : undefined}>
      <Row label="Where you're searching" htmlFor="ps-country" hint={draft.countries.length ? 'Jobs outside these places are dropped before any agent run.' : 'Any location — the location gate is off.'} stack>
        <div className="flex flex-wrap items-center gap-1.5">
          {draft.countries.map(c => (
            <Badge key={c} variant="brand" className="gap-0.5 pr-1">
              {c}
              <button type="button" aria-label={`Remove ${c}`} className="cursor-pointer rounded-full hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--accent-text)" onClick={() => set({ countries: draft.countries.filter(x => x !== c) })}><X className="h-3 w-3" /></button>
            </Badge>
          ))}
          <Input id="ps-country" className="h-8 w-64 text-sm" placeholder="Add a country or city, then Enter" value={country} aria-label="Add a country" onChange={e => setCountry(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        </div>
      </Row>
      <Row label="Include remote-anywhere and region-wide jobs" hint="Off: they go to “Needs agent” instead of passing.">
        <ToggleSwitch checked={draft.remoteAnywhere} onCheckedChange={v => set({ remoteAnywhere: v })} aria-label="Include remote-anywhere jobs" />
      </Row>
      <Row label="Years of experience" htmlFor="ps-years" hint="Drops Staff / Principal / Director roles above it; blank skips the check.">
        <Input id="ps-years" type="number" min={0} max={60} className="h-8 w-20 text-sm" aria-label="Years of experience" value={draft.years ?? ''} onChange={e => set({ years: e.target.value === '' ? null : Number(e.target.value) })} />
      </Row>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={!dirty || saving || busy} onClick={() => void save()}>{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save and re-screen</Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(status.defaults)}>Reset to profile</Button>
        {dirty && <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(status.policy)}>Revert</Button>}
      </div>
    </Group>
  )
}

/** Job-fit model status (base + personal layer), set-up and retrain. Same actions the Jobs popover offers, in full. */
export function PrescreenModelPanel({ status, busy, reload, rescreen }: Props) {
  const [setup, setSetup] = useState(false)
  const [training, setTraining] = useState(false)
  const retrain = async () => {
    setTraining(true)
    try { await retrainAndReport(rescreen) } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) } finally { setTraining(false) }
  }
  return (
    <Group title="Job-fit model" action={<Badge variant={status.available && !status.reason ? 'info' : 'neutral'}>{methodLabel(status)}</Badge>}>
      <p className="m-0 text-sm text-muted-foreground">{modelNote(status)}</p>
      {status.available && !status.reason && status.groups.length > 0 && <p className="m-0 mt-2 text-xs text-muted-foreground">Target occupations: {status.groups.join('; ')}</p>}
      {status.available && <div className="mt-2"><ThirdPartyNotices /></div>}
      <div className="mt-3 flex gap-2">
        {status.available && <Button size="sm" variant="outline" disabled={training || busy} onClick={() => void retrain()}>{training && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Retrain</Button>}
        {!status.available && !setup && <Button size="sm" variant="outline" onClick={() => setSetup(true)}>Set up local model</Button>}
      </div>
      {!status.available && setup && <div className="mt-3"><LocalModelSetup onStatus={s => { if (s.installed) void reload() }} /></div>}
      <div className="mt-3"><Note>Pre-screen runs on this computer and never discards a job; it only sorts them. Score thresholds are not adjustable yet.</Note></div>
    </Group>
  )
}
