import { useEffect, useState } from 'react'

import { careerloom } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { CvTemplate } from '../../lib/types'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Skeleton } from '../ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { act } from './actions'
import { TemplateGallery } from './TemplateGallery'
import { usePdf } from './usePdf'

type Fit = 'FitH' | 'Fit'

/** The paper: the live PDF of the chosen template, or the template gallery. */
export function DocumentStage({ templates, active, stamp, onChanged }: {
  templates: CvTemplate[]
  active: string
  stamp: unknown
  onChanged: () => void
}) {
  const [viewing, setViewing] = useState(active)
  const [gallery, setGallery] = useState(false)
  const [fit, setFit] = useState<Fit>('FitH')
  const [saving, setSaving] = useState(false)
  const pdf = usePdf(viewing, stamp, !gallery)
  const label = (name: string) => templates.find(t => t.name === name)?.displayName ?? name

  const use = (name: string) => act(async () => { await careerloom.setTemplate(name); onChanged() }, `Now using ${label(name)}`)
  const download = () => act(async () => {
    setSaving(true)
    try {
      const path = await careerloom.savePdf(viewing)
      if (path) showToast(`Saved ${path.split(/[\\/]/).pop()}`)
    } finally { setSaving(false) }
  })
  useEffect(() => setViewing(active), [active])

  return (
    <div role="region" aria-label="Résumé preview" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={viewing} onValueChange={v => { setViewing(v); setGallery(false) }}>
          <SelectTrigger size="sm" className="w-44" aria-label="Template"><SelectValue /></SelectTrigger>
          <SelectContent>
            {templates.map(t => <SelectItem key={t.name} value={t.name}>{t.displayName}{t.name === active ? ' (in use)' : ''}</SelectItem>)}
          </SelectContent>
        </Select>
        {viewing !== active && <Button size="sm" variant="outline" className="border-border" onClick={() => void use(viewing)}>Use this template</Button>}
        <Button size="sm" variant={gallery ? 'iconBtnActive' : 'subtle'} aria-pressed={gallery} onClick={() => setGallery(g => !g)}>Templates</Button>
        <div className="flex-1" />
        {!gallery && (
          <ToggleGroup type="single" size="sm" value={fit} onValueChange={v => v && setFit(v as Fit)} aria-label="Zoom">
            <ToggleGroupItem value="FitH">Fit width</ToggleGroupItem>
            <ToggleGroupItem value="Fit">Whole page</ToggleGroupItem>
          </ToggleGroup>
        )}
        <Button size="sm" variant="primary" disabled={saving || !!pdf.error} onClick={() => void download()}>
          {saving ? 'Saving…' : 'Download PDF'}
        </Button>
      </div>

      {gallery ? (
        <TemplateGallery templates={templates} active={active} stamp={stamp} onPick={name => { setViewing(name); setGallery(false) }} onChanged={onChanged} />
      ) : (
        <div className="relative flex justify-center rounded-xl bg-muted p-4 sm:p-6">
          {pdf.error ? (
            <div role="alert" className="flex aspect-[210/297] h-[calc(100vh-190px)] min-h-[560px] max-w-full flex-col items-center justify-center gap-2 rounded-sm bg-card p-8 text-center text-sm shadow-sm">
              <p className="m-0 font-medium text-foreground">Couldn't render the {label(viewing)} template</p>
              <p className="m-0 max-w-sm text-muted-foreground">{pdf.error}</p>
            </div>
          ) : pdf.url ? (
            <iframe
              key={`${pdf.url}#${fit}`}
              src={`${pdf.url}#toolbar=0&navpanes=0&view=${fit}`}
              title={`Your résumé in the ${label(viewing)} template`}
              className="block aspect-[210/297] h-[calc(100vh-190px)] min-h-[560px] w-auto max-w-full rounded-sm border-0 bg-white shadow-[0_1px_2px_rgba(0,0,0,.10),0_10px_28px_-14px_rgba(0,0,0,.28)]"
            />
          ) : (
            <Skeleton aria-label="Rendering your résumé" className="aspect-[210/297] h-[calc(100vh-190px)] min-h-[560px] max-w-full rounded-sm" />
          )}
          {pdf.loading && pdf.url && <span role="status" className="absolute top-3 right-4 rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground shadow">Updating…</span>}
        </div>
      )}
    </div>
  )
}
