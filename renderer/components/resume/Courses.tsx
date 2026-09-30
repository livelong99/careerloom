import { ExternalLink } from 'lucide-react'

import { careerloom } from '../../lib/ipc'
import type { Course } from '../../lib/types'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '../ui/item'
import { when } from './format'

/** Courses whose link answered when we checked. Nothing here is ever invented by the agent. */
export function Courses({ courses }: { courses: Course[] }) {
  return (
    <ItemGroup className="gap-2">
      {courses.map(c => (
        <Item key={c.url} variant="outline">
          <ItemContent>
            <ItemTitle>{c.title}<Badge variant={c.free ? 'success' : 'neutral'}>{c.free ? 'Free' : 'Paid'}</Badge>{c.hours ? <Badge variant="neutral">{c.hours} h</Badge> : null}</ItemTitle>
            <ItemDescription className="line-clamp-none">{c.provider} · for {c.skill}. {c.why}</ItemDescription>
            <p className="m-0 text-xs text-muted-foreground">Link verified {when(c.verified_at)}</p>
          </ItemContent>
          <ItemActions><Button size="sm" variant="outline" className="border-border" onClick={() => void careerloom.openExternal(c.url)}>Open <ExternalLink className="size-3.5" aria-hidden="true" /></Button></ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}
