import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import { errorText, useAsync } from './api'
import { Row } from './Group'

/** Shows only whether a key is saved (shared with the other agents); the key itself never comes back from main. */
export function ApiKeyRow() {
  const settings = useAsync(() => careerloom.getSettings(), [])
  const [editing, setEditing] = useState(false)
  const [key, setKey] = useState('')
  const saved = settings.data?.hasApiKey === true

  async function save(): Promise<void> {
    if (!key.trim()) return
    try {
      await careerloom.setApiKey(key.trim(), 'openrouter')
      setKey(''); setEditing(false); settings.reload()
    } catch (e) { showToast(errorText(e), 'error') }
  }

  return (
    <Row label="API key" htmlFor="cp-api-key" hint="Shared with your other Careerloom agents. Kept in your system keychain.">
      {editing ? (
        <>
          <Input id="cp-api-key" type="password" autoComplete="off" placeholder="Paste key" value={key} onChange={e => setKey(e.target.value)} className="w-64" />
          <Button size="sm" onClick={() => void save()} disabled={!key.trim()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setKey('') }}>Cancel</Button>
        </>
      ) : (
        <>
          <Badge variant={saved ? 'success' : 'warn'}>{saved ? 'Saved' : 'No key yet'}</Badge>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{saved ? 'Replace' : 'Add'}</Button>
        </>
      )}
    </Row>
  )
}
