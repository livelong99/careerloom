import { useEffect, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import { careerloom, normalizeCliError } from '../../lib/ipc'

/** A generated PDF (by its path in the career-ops folder) shown inline; `stamp` reloads it after regeneration. */
export function DocPdf({ rel, stamp, title }: { rel: string; stamp: number; title: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    let made: string | null = null
    setError(null)
    careerloom.docsReadPdf(rel).then(bytes => {
      if (!live) return
      made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      setUrl(made)
    }, err => { if (live) setError(normalizeCliError(err).message.split('\n')[0]!) })
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [rel, stamp])
  if (error) return <p role="alert" className="m-0 text-sm text-destructive">{error}</p>
  if (!url) return <Skeleton aria-label="Loading the preview" className="aspect-[210/297] h-[560px] max-w-full rounded-sm" />
  return <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={title} className="block aspect-[210/297] h-[640px] max-w-full rounded-sm border-0 bg-white shadow-sm" />
}
