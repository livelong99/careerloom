import { useEffect, useState } from 'react'

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom } from '../lib/ipc'
import { isModifierChord, shortcutLabel } from '../lib/platform'
import { stageLabel, stageOf } from '../lib/stages'
import { applyTheme, type Theme } from '../lib/theme'
import type { Application } from '../lib/types'
import { goToSettings, openRuns } from '../lib/nav'
import { pageLabel } from './settings/pages'
import { REGISTRY } from './settings/settings-registry'
import { navGroups, type Section } from './Sidebar'

type Props = {
  onNavigate: (section: Section) => void
  onOpenApplication: (app: Application) => void
}

/** ⌘K: jump to a screen, run a career-ops mode, open a tracked role, paste a job to evaluate.
 *  Pattern from paperclip's CommandPalette, rebuilt on Careerloom's own data. */
export function CommandPalette({ onNavigate, onOpenApplication }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { start, evaluate } = useRuns()
  const modes = usePolled(() => careerloom.modes(), [], { intervalMs: null, enabled: open })
  const tracker = usePolled(() => careerloom.getTracker(), [open], { intervalMs: null, enabled: open, memoKey: 'tracker' })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModifierChord(event) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setOpen(value => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const run = (fn: () => void) => { setOpen(false); setQuery(''); fn() }
  const looksLikeJob = /^https?:\/\/\S+$/i.test(query.trim()) || query.trim().length > 200

  return (
    <CommandDialog className="sm:max-w-xl" open={open} onOpenChange={setOpen} title="Command palette" description="Jump to a screen, run the agent, or find a role">
      <CommandInput placeholder="Type a command, company, or paste a job link…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {looksLikeJob && (
          <CommandGroup heading="Job">
            <CommandItem value={`evaluate ${query}`} onSelect={() => run(() => { void evaluate(query.trim()); openRuns() })}>
              Evaluate this job &amp; score fit
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {navGroups().flatMap(g => g.items).map(item => (
            <CommandItem key={item.id} value={`go ${item.label}`} onSelect={() => run(() => onNavigate(item.id))}>
              {item.icon}
              {item.label}
              <CommandShortcut>{shortcutLabel(item.key)}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Run the agent">
          {Object.entries(modes.data ?? {}).filter(([, m]) => !m.input).map(([id, m]) => (
            <CommandItem key={id} value={`run ${m.label} ${id}`} onSelect={() => run(() => { void start(id); openRuns() })}>
              {m.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {(tracker.data?.length ?? 0) > 0 && (
          <CommandGroup heading="Roles">
            {tracker.data!.map(a => (
              <CommandItem key={a.num} value={`role ${a.company} ${a.role} ${a.num}`} onSelect={() => run(() => onOpenApplication(a))}>
                {a.company} — {a.role}
                <CommandShortcut>{stageLabel(stageOf(a.status))}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Settings">
          {REGISTRY.map(r => (
            <CommandItem key={`${r.page}:${r.focus ?? ''}`} value={`settings ${r.label} ${r.keywords.join(' ')}`} onSelect={() => run(() => goToSettings(r.page, r.focus))}>
              Settings: {r.label}
              <CommandShortcut>{pageLabel(r.page)}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Appearance">
          {(['system', 'light', 'dark'] as Theme[]).map(theme => (
            <CommandItem key={theme} value={`theme ${theme}`} onSelect={() => run(() => applyTheme(theme))}>
              Theme: {theme}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
