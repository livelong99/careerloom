import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { showToast } from '../../lib/toast'
import { redactLog } from '../../lib/runsView'

export const ROW_H = 18
const OVERSCAN = 20
const STEP_CLASS: Record<string, string> = { '▸': 'text-[var(--accent-text)]', '✓': 'text-[var(--ok)]', '✗': 'text-[var(--bad)]' }

/** A run's log: windowed (only the visible rows are in the DOM, so 100k lines stay smooth), follows the tail
 *  until the user scrolls up, and shows nothing but redacted text — the main process hides credential lines
 *  and this redacts again, since live text can arrive before either has seen it. */
export function LogViewer({ text, name, jumpTo, placeholder }: { text: string; name: string; jumpTo?: { line: number; n: number } | null; placeholder: string }) {
  const lines = useMemo(() => (text ? redactLog(text).replace(/\n$/, '').split('\n') : []), [text])
  const box = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const [height, setHeight] = useState(400)
  const [follow, setFollow] = useState(true)

  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight || 400))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const el = box.current
    if (!el || !follow) return
    el.scrollTop = el.scrollHeight
    setTop(el.scrollTop)
  }, [lines.length, follow])
  useEffect(() => {
    const el = box.current
    if (!el || !jumpTo) return
    setFollow(false)
    el.scrollTop = Math.max(0, (jumpTo.line - 2) * ROW_H)
    setTop(el.scrollTop)
  }, [jumpTo])

  const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN)
  const last = Math.min(lines.length, Math.ceil((top + height) / ROW_H) + OVERSCAN)
  const onScroll = () => {
    const el = box.current!
    setTop(el.scrollTop)
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < ROW_H * 2)
  }
  const copy = () => { void navigator.clipboard?.writeText(redactLog(text)).then(() => showToast('Log copied'), () => showToast('Could not copy the log', 'error')) }
  const download = () => {
    const url = URL.createObjectURL(new Blob([redactLog(text)], { type: 'text/plain' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\w.-]+/g, '-')}.log` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{lines.length.toLocaleString()} {lines.length === 1 ? 'line' : 'lines'}</span>
        <span className="flex-1" />
        <Button size="sm" variant={follow ? 'secondary' : 'outline'} aria-pressed={follow} onClick={() => setFollow(f => !f)}>Follow tail</Button>
        <Button size="sm" variant="outline" disabled={!text} onClick={copy}>Copy</Button>
        <Button size="sm" variant="outline" disabled={!text} onClick={download}>Download</Button>
      </div>
      <div
        ref={box} role="log" aria-label={`Log of ${name}`} aria-live="off" tabIndex={0} onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-[var(--card-inner)] font-mono text-xs"
      >
        {lines.length === 0
          ? <p className="p-3 text-muted-foreground">{placeholder}</p>
          : (
            <div style={{ height: lines.length * ROW_H, minWidth: 'max-content' }}>
              {lines.slice(first, last).map((l, i) => (
                <div key={first + i} className={`absolute right-0 left-0 flex whitespace-pre px-3 ${STEP_CLASS[l[0] ?? ''] ?? ''}`} style={{ top: (first + i) * ROW_H, height: ROW_H, lineHeight: `${ROW_H}px` }}>
                  <span aria-hidden="true" className="mr-3 w-10 shrink-0 text-right text-muted-foreground/60 select-none">{first + i + 1}</span>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
