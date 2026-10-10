import { useEffect, useRef } from 'react'
import { Settings2, Sparkles } from 'lucide-react'

import type { InstalledSkill } from '../../../electron/skills/types'

export const SLASH_LIST_ID = 'agent-skill-menu'
export const slashOptionId = (id: string) => `agent-skill-${id}`

type Props = { skills: InstalledSkill[]; active: number; hasAny: boolean; onPick: (skill: InstalledSkill) => void; onHover: (i: number) => void; onManage: () => void }

/** Listbox of installed skills opened by typing `/` in the composer (the textarea owns focus: combobox pattern). */
export function SlashMenu({ skills, active, hasAny, onPick, onHover, onManage }: Props) {
  const current = useRef<HTMLLIElement>(null)
  useEffect(() => { current.current?.scrollIntoView?.({ block: 'nearest' }) }, [active])
  return (
    <div className="absolute right-0 bottom-full left-0 z-20 mb-2 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
      <ul id={SLASH_LIST_ID} role="listbox" aria-label="Skills" className="m-0 max-h-56 list-none overflow-y-auto p-1">
        {skills.map((s, i) => (
          <li
            key={s.id}
            id={slashOptionId(s.id)}
            ref={i === active ? current : undefined}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => onHover(i)}
            onMouseDown={e => { e.preventDefault(); onPick(s) }}
            className={`flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-1.5 ${i === active ? 'bg-accent text-accent-foreground' : ''}`}
          >
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[var(--thread)]" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{s.name}</span>
              {s.description && <span className="line-clamp-2 text-xs text-muted-foreground">{s.description}</span>}
            </span>
          </li>
        ))}
        {!skills.length && (
          <li role="presentation" className="px-2.5 py-2 text-xs text-muted-foreground">
            {hasAny ? 'No installed skill matches.' : 'No skills installed yet. Add some in Settings to use them here.'}
          </li>
        )}
      </ul>
      <button type="button" onMouseDown={e => { e.preventDefault(); onManage() }} className="flex w-full cursor-pointer items-center gap-1.5 border-0 border-t border-border bg-transparent px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <Settings2 className="size-3.5" aria-hidden /> Manage skills
      </button>
    </div>
  )
}
