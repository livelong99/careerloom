import { usePolled } from '../../../hooks/usePolled'
import { careerloom } from '../../../lib/ipc'
import type { KeyInfo, RunnerId } from '../../../lib/types'
import { Note } from '../../kit/Group'
import { KeyRow } from '../KeyRow'
import type { PageProps } from '../pages'

/** Keys the active runner needs come first; everything else keeps registry order. */
const sorted = (keys: KeyInfo[], runner: RunnerId): KeyInfo[] => [...keys].sort((a, b) => Number(b.neededByRunners.includes(runner)) - Number(a.neededByRunners.includes(runner)))

export function KeysPage({ settings, onChanged }: PageProps) {
  const keys = usePolled(() => careerloom.keysList(), [settings.hasApiKey, settings.hasOpencodeKey], { intervalMs: null })
  const refresh = () => { keys.refresh(); onChanged() }
  const list = keys.data ?? []
  const missingNeeded = list.filter(k => k.neededByRunners.includes(settings.runner) && !k.hasKey)

  return (
    <>
      {keys.error && <Note tone="warn">Not available yet: {keys.error.message}</Note>}
      {keys.loading && !keys.data && <p className="m-0 text-xs text-muted-foreground">Loading…</p>}
      {missingNeeded.length > 0 && <Note tone="warn">Your active runner needs: {missingNeeded.map(k => k.label).join(', ')}. Add it below.</Note>}
      {list.length > 0 && list.every(k => !k.hasKey) && <Note>No keys yet. Which do I need? Only the key for your active runner; the rest are optional.</Note>}
      {sorted(list, settings.runner).map(k => <KeyRow key={k.id} info={k} activeRunner={settings.runner} onChanged={refresh} />)}
    </>
  )
}
