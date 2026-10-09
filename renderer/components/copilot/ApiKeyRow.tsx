import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { goToSettings } from '@/lib/nav'
import type { ProviderId } from '@/lib/types'
import { useAsync } from './api'
import { Row } from './Group'

/** Shows only whether a key is saved; keys are added and replaced in Settings › API keys (the one editor). */
export function ApiKeyRow({ provider = 'openrouter' }: { provider?: ProviderId }) {
  const rows = useAsync(() => careerloom.llmProviders(), [provider])
  const row = (Array.isArray(rows.data) ? rows.data : []).find(r => r.id === provider)
  const saved = row ? row.hasKey : false
  return (
    <Row label={`${row?.label ?? 'API'} key`} hint="Shared with your other Careerloom agents. Kept in your system keychain.">
      <Badge variant={saved ? 'success' : row?.keyOptional ? 'neutral' : 'warn'}>{saved ? 'Saved' : row?.keyOptional ? 'Optional' : 'No key yet'}</Badge>
      <Button size="sm" variant="outline" onClick={() => goToSettings('keys', `key:${provider}`)}>Manage in Settings</Button>
    </Row>
  )
}
