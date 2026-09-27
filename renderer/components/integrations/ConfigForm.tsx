import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import type { ConfigField } from '../../lib/types'

type Props = {
  fields: ConfigField[]
  saving: boolean
  onSave: (patch: Record<string, string | boolean | null>) => void
}

/** Renders an Integration's ConfigField[] as a small form. Secret fields never
 *  show their value — only whether one is set — and are left untouched unless
 *  the user types a new one. */
export function ConfigForm({ fields, saving, onSave }: Props) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>({})
  if (fields.length === 0) return null

  const set = (key: string, value: string | boolean) => setDraft(prev => ({ ...prev, [key]: value }))
  const save = () => { onSave(draft); setDraft({}) }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      {fields.map(field => (
        <div key={field.key} className="flex items-center gap-2">
          <label className="w-40 shrink-0 text-sm text-muted-foreground" htmlFor={`cfg-${field.key}`}>{field.label}</label>
          {field.type === 'boolean' ? (
            <ToggleSwitch id={`cfg-${field.key}`} checked={Boolean(draft[field.key] ?? field.value)} onCheckedChange={v => set(field.key, v)} />
          ) : field.options ? (
            <select
              id={`cfg-${field.key}`}
              value={typeof draft[field.key] === 'string' ? (draft[field.key] as string) : String(field.value ?? '')}
              onChange={e => set(field.key, e.target.value)}
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {field.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <Input
              id={`cfg-${field.key}`}
              type={field.type === 'secret' ? 'password' : 'text'}
              placeholder={field.type === 'secret' ? (field.value ? 'Set — type to replace' : 'Not set') : undefined}
              value={typeof draft[field.key] === 'string' ? (draft[field.key] as string) : (field.type === 'secret' ? '' : String(field.value ?? ''))}
              onChange={e => set(field.key, e.target.value)}
              className="flex-1"
            />
          )}
        </div>
      ))}
      {fields.some(f => f.help) && (
        <ul className="text-xs text-muted-foreground">
          {fields.filter(f => f.help).map(f => <li key={f.key}>{f.label}: {f.help}</li>)}
        </ul>
      )}
      <div>
        <Button size="sm" disabled={saving || Object.keys(draft).length === 0} onClick={save}>Save</Button>
      </div>
    </div>
  )
}
