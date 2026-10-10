import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'

import { careerloom } from '../../lib/ipc'
import type { Attachment } from '../../../electron/skills/types'

const cache = new Map<string, string>()

function Thumb({ threadId, attachment }: { threadId: string; attachment: Attachment }) {
  const key = `${threadId}/${attachment.id}`
  const [src, setSrc] = useState<string | null>(cache.get(key) ?? null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (src) return
    let live = true
    careerloom.attachmentData(threadId, attachment.id).then(url => {
      cache.set(key, url)
      if (live) setSrc(url)
    }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [key, src, threadId, attachment.id])
  if (failed) {
    return <span role="img" aria-label={`${attachment.name} is no longer available`} className="flex size-24 items-center justify-center rounded-md border border-border bg-[var(--card-inner)] text-muted-foreground"><ImageOff className="size-5" aria-hidden /></span>
  }
  return src
    ? <img src={src} alt={attachment.name} className="max-h-40 max-w-48 rounded-md border border-border object-cover" />
    : <span className="size-24 rounded-md bg-muted motion-safe:animate-pulse" aria-label={`Loading ${attachment.name}`} role="img" />
}

/** The images that went with a user message. */
export function MessageImages({ threadId, attachments }: { threadId: string; attachments: Attachment[] }) {
  return (
    <ul aria-label="Attached images" className="m-0 mb-2 flex list-none flex-wrap justify-end gap-2 p-0">
      {attachments.map(a => <li key={a.id}><Thumb threadId={threadId} attachment={a} /></li>)}
    </ul>
  )
}
