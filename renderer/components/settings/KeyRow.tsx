// One provider in the key manager: masked status, add/replace/remove, test. The renderer only ever holds
// `KeyInfo` (presence + last four characters); a typed secret lives inside <KeyField> until it is saved.
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { KeyInfo, KeyTest, RunnerId } from '../../lib/types'
import { ConfirmDialog, ReadinessBadge, TestResult } from './kit'
import { KeyField } from './KeyField'

export function KeyRow({ info, activeRunner, onChanged }: { info: KeyInfo; activeRunner: RunnerId; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState<KeyTest | null>(null)
  const [removing, setRemoving] = useState(false)
  const needed = info.neededByRunners.includes(activeRunner)
  const result = tested ?? info.lastTest

  const save = async (value: string) => {
    await careerloom.keysSet(info.id, value)
    setEditing(false); setTested(null)
    showToast(`${info.label} key saved to your keychain`)
    onChanged()
  }
  const test = async () => {
    setTesting(true)
    try { setTested(await careerloom.keysTest(info.id)); onChanged() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) } finally { setTesting(false) }
  }
  const remove = async () => {
    setRemoving(false)
    try { await careerloom.keysSet(info.id, null); setTested(null); showToast(`${info.label} key removed`); onChanged() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }

  return (
    <div data-setting-id={`key:${info.id}`} className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-sm font-semibold">{info.label}</h3>
            <ReadinessBadge state={info.hasKey ? 'ready' : 'off'} label={info.hasKey ? 'Saved' : 'Not set'} />
            {info.tail && <code className="text-xs text-muted-foreground" aria-label={`ends in ${info.tail}`}>••••{info.tail}</code>}
            {needed && <ReadinessBadge state={info.hasKey ? 'ready' : 'needs-setup'} label="Needed for your active runner" />}
            {info.optional && !needed && <span className="text-xs text-muted-foreground">Optional</span>}
          </div>
          <p className="m-0 mt-1 text-xs text-muted-foreground">Used by: {info.usedBy.join(' · ')}</p>
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            {info.hasKey || info.id === 'firecrawl' || info.id === 'custom' ? <Button size="sm" variant="outline" disabled={testing} onClick={() => void test()}>{testing ? 'Testing…' : 'Test'}</Button> : null}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{info.hasKey ? 'Replace' : 'Add key'}</Button>
            {info.hasKey && <Button size="sm" variant="outline" onClick={() => setRemoving(true)}>Remove</Button>}
          </div>
        )}
      </div>
      {editing && (
        <KeyField id={`key-${info.id}`} autoFocus label={`${info.label} API key`} placeholder={info.hasKey ? 'Paste a new key to replace the saved one' : 'Paste your key'} hint={<>{info.formatHint}{info.helpUrl && <> · <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => void careerloom.openExternal(info.helpUrl!)}>Get a key</button></>}</>} onSubmit={save} onCancel={() => setEditing(false)} />
      )}
      {(testing || result) && <div><TestResult result={result} running={testing} /></div>}
      <ConfirmDialog open={removing} onOpenChange={setRemoving} title={`Remove the ${info.label} key?`} description={<>{info.usedBy.join(' and ')} will stop working until you add a key again. The key is deleted from your keychain and cannot be recovered, so keep your own copy if you need it.</>} confirmLabel="Remove key" onConfirm={remove} />
    </div>
  )
}
