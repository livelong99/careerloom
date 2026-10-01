import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { KeyField } from '../settings/KeyField'
import { useAsync } from './api'
import { Row } from './Group'

/** Shows only whether a key is saved (shared with the other agents); the key itself never comes back from main. */
export function ApiKeyRow() {
  const settings = useAsync(() => careerloom.getSettings(), [])
  const [editing, setEditing] = useState(false)
  const saved = settings.data?.hasApiKey === true

  return (
    <Row label="API key" htmlFor="cp-api-key" hint="Shared with your other Careerloom agents. Kept in your system keychain.">
      {editing ? (
        <div className="w-96">
          <KeyField id="cp-api-key" label="OpenRouter API key" placeholder="Paste key" submitLabel="Save" onSubmit={async v => { await careerloom.setApiKey(v, 'openrouter'); setEditing(false); settings.reload() }} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <>
          <Badge variant={saved ? 'success' : 'warn'}>{saved ? 'Saved' : 'No key yet'}</Badge>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{saved ? 'Replace' : 'Add'}</Button>
        </>
      )}
    </Row>
  )
}
