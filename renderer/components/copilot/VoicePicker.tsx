import { Play } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { VoiceInfo } from '@/lib/types'
import { cn } from '@/lib/utils'

const meta = (v: VoiceInfo): string => [...new Set([v.lang, v.offline ? 'works offline' : 'needs internet', v.engine === 'system' ? 'system voice' : v.engine, !v.installed && v.sizeMb ? `installs ${v.sizeMb} MB` : null, v.note].filter(Boolean))].join(' · ')

/** Voices main reports (Indian-English system voices first). Without any, captions are the whole interviewer: say so. */
export function VoicePicker({ voices, value, onChange, onPreview }: { voices: VoiceInfo[]; value: string | null; onChange: (id: string) => void; onPreview: (v: VoiceInfo) => void }) {
  if (voices.length === 0) return <p role="note" className="m-0 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">The interviewer voice is not available in this build yet. Questions appear as captions and you can type or speak your answers.</p>
  const chosen = voices.find(v => v.id === value && v.installed)?.id ?? voices.find(v => v.installed)?.id
  return (
    <div className="grid w-full gap-2">
      <div role="radiogroup" aria-label="Interviewer voice" className="grid gap-2">
        {voices.map(v => (
          <div key={`${v.engine}:${v.id}`} className={cn('flex items-center gap-3 rounded-lg border p-3', v.id === chosen ? 'border-primary bg-primary/5' : 'border-border', !v.installed && 'opacity-80')}>
            <button type="button" aria-label={`Preview ${v.name}`} disabled={!v.installed} onClick={() => onPreview(v)} className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed"><Play className="size-3.5" aria-hidden /></button>
            <button type="button" role="radio" aria-checked={v.id === chosen} disabled={!v.installed} onClick={() => onChange(v.id)} className="min-w-0 flex-1 bg-transparent p-0 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed">
              <span className="block truncate text-sm font-medium text-foreground">{v.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{meta(v)}</span>
            </button>
            {v.id === chosen ? <Badge variant="success">Selected</Badge> : !v.installed ? <Badge>Not installed</Badge> : null}
          </div>
        ))}
      </div>
      <p className="m-0 text-xs text-muted-foreground">The interviewer voice is AI-generated.</p>
    </div>
  )
}
