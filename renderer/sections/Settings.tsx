import type { Settings as SettingsData } from '../lib/types'
import { useAttention } from '../components/settings/attention'
import { SettingsShell, type SettingsTarget } from '../components/settings/SettingsShell'

/** Settings screen: shell with the side-nav, search and pages (see components/settings). */
export function Settings({ settings, onChanged, target }: { settings: SettingsData; onChanged: () => void; target?: SettingsTarget }) {
  const attention = useAttention(settings)
  return <SettingsShell settings={settings} onChanged={onChanged} target={target} attention={attention} />
}
