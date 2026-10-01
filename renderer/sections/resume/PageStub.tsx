import type { ReactNode } from 'react'

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

/** Shared page frame: title, one-line purpose, then the page body. */
export function Page({ title, blurb, children }: { title: string; blurb: string; children?: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 p-6">
      <header>
        <h2 className="m-0 text-lg font-semibold text-foreground">{title}</h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{blurb}</p>
      </header>
      {children}
    </section>
  )
}

export function Soon({ children }: { children: string }) {
  return (
    <Empty className="border border-border">
      <EmptyHeader>
        <EmptyTitle>Coming together</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
