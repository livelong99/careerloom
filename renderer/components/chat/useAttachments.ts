import { useCallback, useState } from 'react'

import { checkCandidate } from '../../../electron/image-support'

export type PendingImage = { id: string; name: string; bytes: number; mime: string; dataUrl: string; data: Uint8Array }
export type AttachIssue = { id: string; name: string; reason: string }

const readFile = (file: File) => new Promise<{ dataUrl: string; data: Uint8Array }>((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('could not read the file'))
  reader.onload = () => {
    const dataUrl = String(reader.result)
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
    resolve({ dataUrl, data: Uint8Array.from(bin, c => c.charCodeAt(0)) })
  }
  reader.readAsDataURL(file)
})

let seq = 0

/** Images waiting to be sent with the next message, plus the problems with files that were turned away. */
export function useAttachments() {
  const [items, setItems] = useState<PendingImage[]>([])
  const [issues, setIssues] = useState<AttachIssue[]>([])

  const add = useCallback(async (files: File[]) => {
    let count = items.length
    const found: AttachIssue[] = []
    const accepted: PendingImage[] = []
    for (const file of files) {
      const reason = checkCandidate(file, count)
      const id = `p${++seq}`
      if (reason) { found.push({ id, name: file.name || 'pasted image', reason }); continue }
      try {
        const { dataUrl, data } = await readFile(file)
        accepted.push({ id, name: file.name || 'pasted image', bytes: file.size, mime: file.type, dataUrl, data })
        count++
      } catch (err) {
        found.push({ id, name: file.name || 'pasted image', reason: err instanceof Error ? err.message : 'could not read the file' })
      }
    }
    setItems(cur => [...cur, ...accepted])
    setIssues(found)
  }, [items.length])

  const remove = useCallback((id: string) => setItems(cur => cur.filter(i => i.id !== id)), [])
  const dismissIssue = useCallback((id: string) => setIssues(cur => cur.filter(i => i.id !== id)), [])
  const clear = useCallback(() => { setItems([]); setIssues([]) }, [])
  return { items, issues, add, remove, dismissIssue, clear }
}
