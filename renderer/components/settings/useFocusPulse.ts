import { useEffect, type RefObject } from 'react'

const PULSE = ['ring-2', 'ring-ring', 'ring-offset-2', 'ring-offset-background', 'rounded-lg', 'transition-shadow']
const RETRY_MS = 50
const MAX_TRIES = 20

/** Scrolls the element tagged `data-focus="<focus>"` into view and outlines it for 1.2 s. Re-runs when `nonce` changes
 *  so linking to the same control twice pulses twice. A page that has just mounted (or loads its rows) may not have the
 *  element yet, so the lookup retries for ~1 s. The outline is static (no motion), so reduced-motion needs no special case. */
export function useFocusPulse(root: RefObject<HTMLElement | null>, focus: string | null | undefined, nonce: number, deps: unknown[] = []): void {
  useEffect(() => {
    if (!focus) return
    let tries = 0
    let el: HTMLElement | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = () => {
      el = [...(root.current?.querySelectorAll<HTMLElement>('[data-focus]') ?? [])].find(n => n.dataset.focus === focus)
      if (!el) {
        if (++tries < MAX_TRIES) timer = setTimeout(attempt, RETRY_MS)
        return
      }
      // A control inside a collapsed section (Danger zone) is mounted but hidden: open the section first.
      el.closest<HTMLElement>('[data-slot="collapsible-content"][data-state="closed"]')?.parentElement?.querySelector<HTMLElement>('[data-slot="collapsible-trigger"]')?.click()
      el.scrollIntoView?.({ block: 'center' })
      el.classList.add(...PULSE)
      timer = setTimeout(() => el?.classList.remove(...PULSE), 1200)
    }
    attempt()
    return () => { clearTimeout(timer); el?.classList.remove(...PULSE) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, nonce, ...deps])
}
