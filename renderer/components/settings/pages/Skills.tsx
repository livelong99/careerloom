import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import { usePolled } from '../../../hooks/usePolled'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { openHelp } from '../../../lib/nav'
import { showToast } from '../../../lib/toast'
import type { InstalledSkill, SkillPreview } from '../../../lib/types'
import { Icon } from '../../icons'
import { Group, Note } from '../../kit/Group'
import { ConfirmDialog } from '../kit'
import type { PageProps } from '../pages'
import { InstallDialog } from '../skills/InstallDialog'
import { SkillRow } from '../skills/SkillRow'

const EXAMPLES_URL = 'https://github.com/anthropics/skills'

export function SkillsPage(_props: PageProps) {
  const list = usePolled(() => careerloom.skillsList(), [], { intervalMs: null })
  const [installOpen, setInstallOpen] = useState(false)
  const [update, setUpdate] = useState<SkillPreview | null>(null)
  const [removing, setRemoving] = useState<InstalledSkill | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const skills = list.data ?? []

  const act = useCallback(async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id)
    try { await fn() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) } finally { setBusy(null); list.refresh() }
  }, [list])

  const checkUpdate = (skill: InstalledSkill) => act(skill.id, async () => {
    const p = await careerloom.skillsUpdate(skill.id)
    if (p.hash && p.hash === skill.hash) showToast(`${skill.name} is up to date`)
    else { setUpdate(p); setInstallOpen(true) }
  })

  return (
    <>
      <Group title="Agent Skills" focus="skills" action={<Button size="sm" onClick={() => { setUpdate(null); setInstallOpen(true) }}><Icon name="download" />Install a skill</Button>}>
        {list.error && <p role="alert" className="m-0 text-xs text-muted-foreground">Could not read your skills: {list.error.message}</p>}
        {list.data === null && !list.error && <p className="m-0 text-xs text-muted-foreground">Loading…</p>}
        {list.data && skills.length === 0 && (
          <div className="grid gap-3 py-2">
            <div className="flex items-start gap-3">
              <Icon name="puzzle" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="m-0 text-sm font-medium">No skills installed yet</p>
                <p className="m-0 mt-1 max-w-prose text-xs text-muted-foreground">A skill is a folder of instructions (a SKILL.md, plus optional references and scripts) that teaches an agent how to do one job well, such as writing a cover letter or preparing for a system-design round. Install one and every agent run can use it.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void careerloom.openExternal(EXAMPLES_URL)}>Browse example skills</Button>
              <Button size="sm" variant="outline" onClick={() => openHelp('skills')}>How skills work</Button>
            </div>
          </div>
        )}
        {skills.length > 0 && (
          <ul aria-label="Installed skills" className="m-0 list-none p-0">
            {skills.map(s => (
              <SkillRow key={s.id} skill={s} busy={busy === s.id}
                onToggle={on => void act(s.id, () => careerloom.skillsSetEnabled(s.id, on))}
                onUpdate={() => void checkUpdate(s)}
                onRemove={() => setRemoving(s)} />
            ))}
          </ul>
        )}
      </Group>
      <Note>Enabled skills reach every runner: Claude Code, Codex, Antigravity and OpenCode find them as files in the working folder, and OpenCode Zen reads them on demand. Skills are only changed when you update them here.</Note>

      <InstallDialog open={installOpen} onOpenChange={setInstallOpen} preview={update} onInstalled={s => { showToast(`${s.name} installed`); list.refresh() }} />
      <ConfirmDialog open={removing !== null} onOpenChange={o => { if (!o) setRemoving(null) }} title={`Remove ${removing?.name ?? 'skill'}?`}
        description="Its files are deleted from Careerloom. The original folder or repository is not touched."
        confirmLabel="Remove skill" onConfirm={async () => { const s = removing; setRemoving(null); if (s) await act(s.id, () => careerloom.skillsRemove(s.id)) }} />
    </>
  )
}
