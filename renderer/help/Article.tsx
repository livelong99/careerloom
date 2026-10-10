import { forwardRef } from 'react'

import { Icon } from '../components/icons'
import { navigate } from '../lib/nav'
import { modKeyLabel } from '../lib/platform'
import { GROUPS, type Topic } from './types'

const List = ({ title, items }: { title: string; items: string[] }) => (
  <section className="flex flex-col gap-2">
    <h3 className="m-0 text-sm font-semibold">{title}</h3>
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {items.map(s => <li key={s} className="relative pl-4 text-sm leading-relaxed before:absolute before:top-[0.6em] before:left-0 before:size-1.5 before:rounded-full before:bg-[var(--thread)] before:content-['']">{s}</li>)}
    </ul>
  </section>
)

type Props = { topic: Topic; prev?: Topic; next?: Topic; onPick: (id: string) => void }

/** One topic: what it is for, when to reach for it, how to use it, then a way to open the real screen. */
export const Article = forwardRef<HTMLHeadingElement, Props>(function Article({ topic: t, prev, next, onPick }, ref) {
  const group = GROUPS.find(g => g.id === t.group)!.label
  return (
    <article className="flex max-w-[72ch] flex-col gap-6 pb-8">
      <header className="flex flex-col gap-2">
        <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground"><Icon name={t.icon} className="size-3.5 text-[var(--accent-text)]" aria-hidden />{group}</p>
        <h2 ref={ref} tabIndex={-1} className="m-0 text-2xl font-semibold tracking-tight outline-none">{t.title}</h2>
        <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">{t.summary}</p>
        {t.go?.length ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {t.go.map((g, i) => (
              <button key={g.label} type="button" className={i === 0 ? 'btnp btnp-primary' : 'btnp'} onClick={() => navigate(g.section, g.page ? { page: g.page } : {})}>
                {g.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <List title="Use it when" items={t.when} />

      {t.steps.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-sm font-semibold">How it works</h3>
          <ol className="m-0 ml-1 flex list-none flex-col border-l border-[color-mix(in_srgb,var(--accent)_45%,transparent)] p-0">
            {t.steps.map(s => (
              <li key={s.title} className="relative pb-4 pl-5 last:pb-0">
                <span aria-hidden className="absolute top-1.5 left-[-5px] size-2.5 rounded-full border-2 border-[var(--accent)] bg-[var(--page)]" />
                <h4 className="m-0 text-sm font-medium">{s.title}</h4>
                <p className="m-0 mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {t.keys && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">Shortcuts</h3>
          <dl className="m-0 grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-2">
            {t.keys.map(k => (
              <div key={k.k} className="contents">
                <dt><kbd className="inline-block min-w-8 rounded bg-muted px-1.5 py-0.5 text-center text-xs font-medium">{k.k.replace('{mod}', modKeyLabel())}</kbd></dt>
                <dd className="m-0 text-sm">{k.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {t.faq && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">Common problems</h3>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {t.faq.map(f => (
              <details key={f.q} className="group px-3 py-2.5">
                <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium outline-offset-2 [&::-webkit-details-marker]:hidden">
                  {f.q}<Icon name="chevron-down" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {t.tips && <List title="Good to know" items={t.tips} />}

      <nav aria-label="Previous and next topic" className="mt-2 flex items-stretch justify-between gap-3 border-t border-border pt-4">
        {prev ? <button type="button" onClick={() => onPick(prev.id)} className="btnp"><Icon name="chevron-left" />{prev.title}</button> : <span />}
        {next ? <button type="button" onClick={() => onPick(next.id)} className="btnp">{next.title}<Icon name="chevron-right" /></button> : <span />}
      </nav>
    </article>
  )
})
