import { useCallback, useEffect, useState } from 'react'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import type { Artifact, DocKind, DocsEvent, DocsOptions } from '../../lib/types'

export type DocState = { running: boolean; message: string; error: string | null }
const IDLE: DocState = { running: false, message: '', error: null }

/** This job's generated documents, plus live progress for each kind from the `docs` push channel. */
export function useDocs(jobId: string) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [state, setState] = useState<Record<DocKind, DocState>>({ resume: IDLE, cover: IDLE })
  const refresh = useCallback(() => { void careerloom.docsList(jobId).then(setArtifacts, () => setArtifacts([])) }, [jobId])
  useEffect(() => { setState({ resume: IDLE, cover: IDLE }); refresh() }, [jobId, refresh])
  useEffect(() => careerloom.onDocs((e: DocsEvent) => {
    if (e.jobId !== jobId) return
    setState(s => ({ ...s, [e.kind]: { running: e.phase !== 'done' && e.phase !== 'error', message: e.message, error: e.phase === 'error' ? e.message : null } }))
    if (e.phase === 'done') refresh()
  }), [jobId, refresh])

  const generate = useCallback(async (kind: DocKind, options?: DocsOptions) => {
    setState(s => ({ ...s, [kind]: { running: true, message: 'Starting', error: null } }))
    try { await careerloom.docsGenerate(jobId, kind, options) } catch (err) {
      setState(s => ({ ...s, [kind]: { running: false, message: '', error: normalizeCliError(err).message } }))
    }
  }, [jobId])
  return { artifacts, state, generate }
}
