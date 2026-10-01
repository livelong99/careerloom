import { useState } from 'react'
import { BookOpen, FileText, LayoutDashboard, User } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ContextPreview } from '@/lib/types'
import { Group } from './Group'

const tokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

export function ContextTiles({ preview }: { preview: ContextPreview | null }) {
  const [open, setOpen] = useState(false)
  const tile = (icon: React.ReactNode, label: string, value: string, sub: string) => (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</div>
      <div className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
  return (
    <Group title="What the copilot will know" action={preview && <>
      <Badge variant="success">≈ {tokens(preview.tokens)} tokens</Badge>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Preview context</Button>
    </>}>
      {!preview ? <p className="m-0 text-sm text-muted-foreground">Pick a job to see what the copilot can draw on.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tile(<FileText className="size-3.5" aria-hidden />, 'Posting', String(preview.posting), 'requirements')}
          {tile(<LayoutDashboard className="size-3.5" aria-hidden />, 'Evaluation report', `${preview.strengths} + ${preview.gaps}`, 'strengths · gaps to handle')}
          {tile(<User className="size-3.5" aria-hidden />, 'Résumé facts', String(preview.facts), 'from cv.md')}
          {tile(<BookOpen className="size-3.5" aria-hidden />, 'STAR stories', String(preview.stories), "from the report's interview plan")}
        </div>
      )}
      <p className="m-0 mt-3 text-xs text-muted-foreground">Answers may quote your résumé and stories. Numbers that aren't in them are blocked, not guessed.</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>What the copilot will know</DialogTitle><DialogDescription>The text the answer engine is given about this job and you.</DialogDescription></DialogHeader>
          <pre className="m-0 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs">{preview?.text}</pre>
        </DialogContent>
      </Dialog>
    </Group>
  )
}
