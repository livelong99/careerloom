import { useEffect, useRef, useState } from 'react'

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { pageLabel, type PageId } from './pages'
import { searchRegistry } from './settings-registry'

/** Search box over the registry (cmdk). Enter or click jumps to the page and pulses the control. `/` or ⌘F focuses it. */
export function SettingsSearch({ onPick }: { onPick: (page: PageId, focus?: string) => void }) {
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f')) {
        e.preventDefault()
        box.current?.querySelector('input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const results = searchRegistry(q).slice(0, 8)
  const pick = (page: PageId, focus?: string) => { setQ(''); onPick(page, focus) }
  return (
    <div ref={box} data-settings-search className="relative">
      <Command shouldFilter={false} label="Search settings" className="overflow-visible bg-transparent">
        <CommandInput aria-label="Search settings" placeholder="Search settings" value={q} onValueChange={setQ} onKeyDown={e => { if (e.key === 'Escape') setQ('') }} />
        {q.trim() && (
          <CommandList className="absolute left-0 top-full z-30 mt-1 w-80 rounded-lg border border-border bg-popover shadow-lg">
            <CommandEmpty>No settings match.</CommandEmpty>
            {results.map(r => (
              <CommandItem key={`${r.page}:${r.focus ?? ''}`} value={`${r.page}:${r.focus ?? ''}`} onSelect={() => pick(r.page, r.focus)}>
                <span className="truncate">{r.label}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{pageLabel(r.page)}</span>
              </CommandItem>
            ))}
          </CommandList>
        )}
      </Command>
    </div>
  )
}
