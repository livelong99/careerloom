import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { goToSettings } from '@/lib/nav'
import { useAsync } from './api'
import { Row } from './Group'

/** Shows only whether a key is saved; keys are added and replaced in Settings › API keys (the one editor). */
export function ApiKeyRow() {
  const settings = useAsync(() => careerloom.getSettings(), [])
  const saved = settings.data?.hasApiKey === true
  return (
    <Row label="API key" hint="Shared with your other Careerloom agents. Kept in your system keychain.">
      <Badge variant={saved ? 'success' : 'warn'}>{saved ? 'Saved' : 'No key yet'}</Badge>
      <Button size="sm" variant="outline" onClick={() => goToSettings('keys', 'key:openrouter')}>Manage in Settings</Button>
    </Row>
  )
}
