import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import type { InstalledSkill } from '../../../lib/types'
import { Icon } from '../../icons'
import { fmtBytes, sourceLabel } from './format'

type Props = { skill: InstalledSkill; busy: boolean; onToggle: (on: boolean) => void; onUpdate: () => void; onRemove: () => void }

/** One installed skill: name and badges, what it is for, where it came from, and its controls. */
export function SkillRow({ skill, busy, onToggle, onUpdate, onRemove }: Props) {
  return (
    <li data-setting-id={`skill:${skill.id}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-56 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{skill.name}</span>
          {skill.version && <Badge variant="neutral">v{skill.version}</Badge>}
          {skill.hasScripts && <Badge variant="warn"><Icon name="triangle-alert" className="size-3" />Has scripts</Badge>}
          {!skill.enabled && <Badge variant="neutral">Off</Badge>}
        </div>
        <p className="m-0 mt-0.5 line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{skill.description}</p>
        <p className="m-0 mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
          <span title={skill.source.kind === 'git' ? skill.source.url : skill.source.path}>{sourceLabel(skill.source)}</span> · {fmtBytes(skill.sizeBytes)}
          {skill.provides.length > 0 && <> · provides {skill.provides.join(', ')}</>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onUpdate} aria-label={`Check ${skill.name} for updates`}><Icon name="refresh-cw" />Update</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onRemove} aria-label={`Remove ${skill.name}`}><Icon name="trash-2" />Remove</Button>
        <ToggleSwitch checked={skill.enabled} disabled={busy} onCheckedChange={onToggle} aria-label={`Use ${skill.name} in agent runs`} />
      </div>
    </li>
  )
}
