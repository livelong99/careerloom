import type { KeyboardEvent } from 'react'

import type { Anchor } from '@/lib/types'
import { cn } from '@/lib/utils'

const ORDER: readonly Anchor[] = ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br']
const NAME: Record<Anchor, string> = { tl: 'Top left', tc: 'Top center', tr: 'Top right', ml: 'Middle left', c: 'Center', mr: 'Middle right', bl: 'Bottom left', bc: 'Bottom center', br: 'Bottom right' }

/** 3×3 position picker: one radiogroup, arrow keys move by cell (clamped at the edges), one tab stop. */
export function AnchorGrid({ value, onChange }: { value: Anchor; onChange: (a: Anchor) => void }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    const col = i % 3, row = Math.floor(i / 3)
    const [dc, dr] = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key] ?? [0, 0]
    if (!dc && !dr) return
    e.preventDefault()
    const c = col + dc, r = row + dr
    if (c < 0 || c > 2 || r < 0 || r > 2) return
    const next = ORDER[r * 3 + c]!
    onChange(next)
    ;(e.currentTarget.parentElement?.children[r * 3 + c] as HTMLElement | undefined)?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Overlay position" className="grid w-fit grid-cols-3 gap-1.5">
      {ORDER.map((a, i) => (
        <button
          key={a} type="button" role="radio" aria-checked={a === value} aria-label={NAME[a]} tabIndex={a === value ? 0 : -1}
          onClick={() => onChange(a)} onKeyDown={e => onKey(e, i)}
          className={cn('h-7 w-10 cursor-pointer rounded-md border outline-none focus-visible:ring-3 focus-visible:ring-ring/50', a === value ? 'border-(--accent,currentColor) bg-primary' : 'border-border bg-transparent hover:bg-muted')}
        />
      ))}
    </div>
  )
}
