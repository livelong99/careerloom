// A searchable model dropdown fed by a loader (a provider's models endpoint or a CLI's own list).
// Loads on first open, shows loading / error + retry, and still accepts any typed id (the loader may be incomplete).
import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ModelOption } from '../../lib/types'

export const MODEL_ID = /^[\w.:/@-]{1,100}$/

type Props = {
  value: string
  onChange: (id: string) => void
  load: () => Promise<ModelOption[]>
  /** Shown for an empty value; picking it clears the choice. */
  defaultLabel: string
  ariaLabel: string
  /** Changing this (e.g. the provider) discards the loaded list. */
  scope?: string
  disabled?: boolean
}

export function ModelCombobox({ value, onChange, load, defaultLabel, ariaLabel, scope, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; options: ModelOption[]; message?: string }>({ status: 'idle', options: [] })
  useEffect(() => setState({ status: 'idle', options: [] }), [scope])

  const fetchList = () => {
    setState(s => ({ ...s, status: 'loading' }))
    load().then(options => setState({ status: 'ready', options }), e => setState({ status: 'error', options: [], message: e instanceof Error ? e.message : String(e) }))
  }
  const onOpenChange = (next: boolean) => { setOpen(next); setQuery(''); if (next && state.status === 'idle') fetchList() }
  const pick = (id: string) => { setOpen(false); if (id !== value) onChange(id) }
  const typed = query.trim()
  const canUseTyped = typed !== '' && MODEL_ID.test(typed) && !state.options.some(o => o.id === typed)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label={ariaLabel} disabled={disabled} className="h-8 w-72 justify-between font-normal">
          <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>{value || defaultLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or type a model id" value={query} onValueChange={setQuery} />
          <CommandList>
            {state.status === 'loading' && <p className="m-0 px-3 py-2 text-xs text-muted-foreground">Loading models…</p>}
            {state.status === 'error' && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground" role="alert">
                <span>Couldn’t load the list: {state.message}</span>
                <Button size="sm" variant="ghost" onClick={fetchList}>Retry</Button>
              </div>
            )}
            {state.status === 'ready' && state.options.length === 0 && <p className="m-0 px-3 py-2 text-xs text-muted-foreground">No models listed. Type an id instead.</p>}
            <CommandEmpty>{canUseTyped ? ' ' : 'No match'}</CommandEmpty>
            <CommandItem value="__default" onSelect={() => pick('')}><Check className={value === '' ? 'h-4 w-4' : 'h-4 w-4 opacity-0'} />{defaultLabel}</CommandItem>
            {canUseTyped && <CommandItem value={`__use ${typed}`} onSelect={() => pick(typed)}>Use “{typed}”</CommandItem>}
            {state.options.map(o => (
              <CommandItem key={o.id} value={`${o.id} ${o.label}`} onSelect={() => pick(o.id)}>
                <Check className={value === o.id ? 'h-4 w-4' : 'h-4 w-4 opacity-0'} />
                <span className="truncate">{o.id}</span>
                {o.label !== o.id && <span className="ml-2 truncate text-xs text-muted-foreground">{o.label}</span>}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
