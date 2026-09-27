import { useEffect, useRef, useState } from 'react'

import { careerloom, normalizeCliError } from '../../lib/ipc'

// One render at a time: each is a node script + a hidden print window in main.
let queue: Promise<unknown> = Promise.resolve()
const render = (name: string) => {
  const next = queue.then(() => careerloom.renderTemplatePdf(name))
  queue = next.catch(() => {})
  return next
}

type PdfState = { url: string | null; error: string | null; loading: boolean }

/** Blob URL of template `name` as PDF. Re-renders when `stamp` changes; the previous
 *  page stays up until the new one is ready, and every URL is revoked when replaced. */
export function usePdf(name: string | null, stamp: unknown, enabled = true): PdfState {
  const [state, setState] = useState<PdfState>({ url: null, error: null, loading: false })
  const current = useRef<string | null>(null)
  const swap = (url: string | null) => {
    if (current.current) URL.revokeObjectURL(current.current)
    current.current = url
  }
  useEffect(() => () => swap(null), [])
  useEffect(() => {
    if (!name || !enabled) return
    let live = true
    setState(s => ({ ...s, loading: true, error: null }))
    render(name).then(
      bytes => {
        if (!live) return
        swap(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })))
        setState({ url: current.current, error: null, loading: false })
      },
      err => { if (live) setState(s => ({ ...s, error: normalizeCliError(err).message.split('\n')[0]!, loading: false })) },
    )
    return () => { live = false }
  }, [name, stamp, enabled])
  return state
}
