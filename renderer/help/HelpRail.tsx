import type { RefObject } from 'react'

import { Icon } from '../components/icons'
import { cn } from '@/lib/utils'
import { GROUPS, type Topic } from './types'

type Props = { topics: Topic[]; searching: boolean; activeId: string | null; read: Set<string>; query: string; onQuery: (q: string) => void; onPick: (id: string) => void; onHome: () => void; searchRef: RefObject<HTMLInputElement | null> }

function Row({ t, active, done, onPick }: { t: Topic; active: boolean; done: boolean; onPick: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        onClick={() => onPick(t.id)}
        className={cn('group relative flex min-h-8 w-full items-center gap-2 rounded-md py-1 pr-2 pl-5 text-left text-[13px] outline-offset-1 transition-colors hover:bg-muted', active && 'bg-[var(--nav-on)] font-medium text-[var(--nav-ink)]')}
      >
        {/* The knot on the thread: hollow = unread, filled = opened. State is also in the label for screen readers. */}
        <span aria-hidden className={cn('absolute left-[-4px] size-2 rounded-full border border-[var(--accent)] bg-[var(--page)]', done && 'bg-[var(--accent)]', active && 'scale-125')} />
        <span className="truncate">{t.title}</span>
        {done && <span className="sr-only">(read)</span>}
      </button>
    </li>
  )
}

/** Contents rail: a search box and the topics hung on one teal thread. */
export function HelpRail({ topics, searching, activeId, read, query, onQuery, onPick, onHome, searchRef }: Props) {
  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col gap-3 md:w-64" aria-label="Help contents">
      <label className="relative block">
        <span className="sr-only">Search help</span>
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={e => onQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && topics[0]) onPick(topics[0].id); if (e.key === 'Escape') { onQuery(''); e.currentTarget.blur() } }}
          placeholder="Search help"
          className="h-8 w-full rounded-md border border-border bg-card pr-8 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded bg-muted px-1 text-[11px] text-muted-foreground" aria-hidden>/</kbd>
      </label>
      <nav className="min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Help topics">
        {!searching && (
          <button type="button" aria-current={activeId === null ? 'page' : undefined} onClick={onHome}
            className={cn('mb-3 flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium hover:bg-muted', activeId === null && 'bg-[var(--nav-on)] text-[var(--nav-ink)]')}>
            <Icon name="layout-dashboard" className="size-3.5" aria-hidden />Start page
          </button>
        )}
        {searching ? (
          topics.length ? (
            <ul className="m-0 list-none border-l border-[color-mix(in_srgb,var(--accent)_45%,transparent)] p-0">{topics.map(t => <Row key={t.id} t={t} active={t.id === activeId} done={read.has(t.id)} onPick={onPick} />)}</ul>
          ) : <p role="status" className="m-0 px-1 text-[13px] text-muted-foreground">No topic matches “{query}”. Try a screen name, such as boards or resume.</p>
        ) : GROUPS.map(g => {
          const items = topics.filter(t => t.group === g.id)
          if (!items.length) return null
          return (
            <section key={g.id} className="mb-3">
              <h3 className="m-0 mb-1 px-1 text-xs font-semibold text-muted-foreground">{g.label}</h3>
              <ul className="m-0 ml-1 list-none border-l border-[color-mix(in_srgb,var(--accent)_45%,transparent)] p-0">{items.map(t => <Row key={t.id} t={t} active={t.id === activeId} done={read.has(t.id)} onPick={onPick} />)}</ul>
            </section>
          )
        })}
      </nav>
    </aside>
  )
}
