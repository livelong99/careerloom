import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { usePolled } from '../../../hooks/usePolled'
import { useRuns } from '../../../hooks/useRuns'
import { isLocaleChoice, LOCALES, useLocale, type LocaleChoice } from '../../../i18n'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { REFRESH_OPTIONS, useRefreshCadence } from '../../../lib/refreshCadence'
import { applyTheme, readTheme, type Theme } from '../../../lib/theme'
import { showToast } from '../../../lib/toast'
import { SegTabs } from '../../SegTabs'
import { Group, Row } from '../../kit/Group'
import { applyWithUndo, ReadinessBadge, SaveState, useSaveState } from '../kit'
import type { PageProps } from '../pages'

const LOCALE_NAMES: Record<string, string> = { system: 'System default', en: 'English', fr: 'Français', ja: '日本語', ko: '한국어', 'zh-CN': '简体中文', 'zh-TW': '繁體中文' }
const THEMES: Array<{ value: Theme; label: string }> = [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]
const errorText = (err: unknown) => normalizeCliError(err).message

export function GeneralPage({ settings, onChanged }: PageProps) {
  return (
    <>
      <FolderGroup settings={settings} onChanged={onChanged} />
      <AppearanceGroup />
      <RefreshGroup />
    </>
  )
}

function FolderGroup({ settings, onChanged }: PageProps) {
  const { adopt } = useRuns()
  const save = useSaveState()
  const check = settings.rootCheck
  const bins = usePolled(() => careerloom.runnerStatus(), [], { intervalMs: null })
  const [recheck, setRecheck] = useState(0)
  const ready = usePolled(() => careerloom.getReadiness(recheck > 0), [recheck, settings.root], { intervalMs: null, enabled: check?.ok === true })
  useEffect(() => careerloom.onReadiness(() => ready.refresh()), [ready.refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = () => void save.run(async () => {
    const dir = await careerloom.chooseDirectory()
    if (!dir) return
    await careerloom.setRoot(dir)
    onChanged()
  }).then(ok => { if (ok) showToast('career-ops folder set') })
  const install = () => void save.run(async () => {
    const dir = await careerloom.chooseDirectory()
    if (!dir) return
    adopt(await careerloom.setupCareerOps(dir))
    showToast('Installing career-ops… follow it in Agent')
  })
  const facts = [bins.data?.git ? 'git found' : 'git not found', bins.data?.node ? `Node ${bins.data.node}` : 'Node not found']

  return (
    <Group title="career-ops folder" action={<SaveState status={save.status} onRetry={choose} />}>
      <Row stack focus="root" label="Folder" hint={check?.ok ? 'Your CV, tracker and reports live here. Careerloom reads them; the agent writes.' : check ? check.reason : 'Point Careerloom at a career-ops checkout, or install a fresh one.'}>
        <div className="flex w-full items-center justify-between gap-3">
          <code className="min-w-0 truncate text-sm" title={check?.ok ? check.root : undefined}>{check?.ok ? check.root : 'No folder yet'}</code>
          <div className="flex shrink-0 items-center gap-2">
            <ReadinessBadge state={check?.ok ? 'ready' : 'needs-setup'} label={check?.ok ? 'Valid' : 'Not set'} />
            <Button size="sm" variant="outline" onClick={choose}>Choose folder…</Button>
            {!check?.ok && <Button size="sm" disabled={!bins.data?.git} title={bins.data?.git ? undefined : 'git not found'} onClick={install}>Install career-ops…</Button>}
          </div>
        </div>
      </Row>
      <Row focus="deps" label="Dependencies" hint={check?.ok ? `${ready.data?.deps === false ? "career-ops' packages aren't installed yet — repair from Integrations" : 'node_modules present'} · ${facts.join(' · ')}` : 'Choose a folder to check its dependencies.'}>
        {check?.ok && <ReadinessBadge state={ready.loading && !ready.data ? 'checking' : ready.data?.deps === false ? 'needs-setup' : 'ready'} />}
        {check?.ok && <Button size="sm" variant="outline" disabled={ready.loading} onClick={() => setRecheck(n => n + 1)}>{ready.loading ? 'Checking…' : 'Check again'}</Button>}
      </Row>
    </Group>
  )
}

function AppearanceGroup() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const { choice, setChoice } = useLocale()
  const setThemeTo = (t: Theme) => { setTheme(t); applyTheme(t) }
  return (
    <Group title="Appearance & language">
      <Row focus="theme" label="Theme" hint="App only. The Copilot overlay has its own theme under Copilot.">
        <SegTabs options={THEMES} value={theme} onChange={v => applyWithUndo(`Theme set to ${v}`, theme, v as Theme, setThemeTo)} />
      </Row>
      <Row focus="language" label="Language" htmlFor="settings-language" hint="Applies to menus and labels. Job content stays as written.">
        <Select value={choice} onValueChange={v => { if (isLocaleChoice(v)) applyWithUndo(`Language set to ${LOCALE_NAMES[v]}`, choice, v as LocaleChoice, setChoice) }}>
          <SelectTrigger id="settings-language" aria-label="Language" className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{(['system', ...LOCALES] as LocaleChoice[]).map(l => <SelectItem key={l} value={l}>{LOCALE_NAMES[l]}</SelectItem>)}</SelectContent>
        </Select>
      </Row>
    </Group>
  )
}

function RefreshGroup() {
  const cadence = useRefreshCadence()
  return (
    <Group title="Refresh">
      <Row focus="refresh" label="Refresh cadence" hint="How often Overview, Jobs, Boards and Monitoring re-read data. Slows on battery.">
        <SegTabs options={REFRESH_OPTIONS.map(o => ({ value: o.value, label: o.label }))} value={cadence.value} onChange={v => applyWithUndo(`Refresh set to ${REFRESH_OPTIONS.find(o => o.value === v)?.label}`, cadence.value, v, cadence.setValue)} />
      </Row>
    </Group>
  )
}
