import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import type { InstalledSkill, SkillPreview, SkillSource } from '../../../lib/types'
import { Note } from '../../kit/Group'
import { fmtBytes, sourceLabel } from './format'

type Tab = 'git' | 'folder' | 'zip'
type Props = { open: boolean; onOpenChange: (open: boolean) => void; onInstalled: (skill: InstalledSkill) => void; /** Start on this preview (the Update flow). */ preview?: SkillPreview | null }

const Field = ({ id, label, hint, ...rest }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="grid gap-1">
    <label htmlFor={id} className="text-sm font-medium">{label}</label>
    <Input id={id} autoComplete="off" spellCheck={false} {...rest} />
    {hint && <p className="m-0 text-xs text-muted-foreground">{hint}</p>}
  </div>
)

/** Install flow: choose a source → inspect (nothing is copied) → review and consent → install. */
export function InstallDialog({ open, onOpenChange, onInstalled, preview: initial = null }: Props) {
  const [tab, setTab] = useState<Tab>('git')
  const [url, setUrl] = useState('')
  const [ref, setRef] = useState('')
  const [subdir, setSubdir] = useState('')
  const [picked, setPicked] = useState<{ folder: string | null; zip: string | null }>({ folder: null, zip: null })
  const [preview, setPreview] = useState<SkillPreview | null>(initial)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<'inspect' | 'install' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPreview(initial); setConsent(false); setError(null); setBusy(null)
  }, [open, initial])

  const run = async <T,>(kind: 'inspect' | 'install', fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(kind); setError(null)
    try { return await fn() } catch (err) { setError(normalizeCliError(err).message) } finally { setBusy(null) }
  }
  const inspect = async (source: SkillSource) => {
    const p = await run('inspect', () => careerloom.skillsInspect(source))
    if (p) { setPreview(p); setConsent(false) }
  }
  const pick = async (kind: 'folder' | 'zip') => {
    const path = await run('inspect', () => careerloom.skillsPick(kind))
    if (!path) return
    setPicked(cur => ({ ...cur, [kind]: path }))
    await inspect({ kind, path })
  }
  const gitSource = (): SkillSource => ({ kind: 'git', url: url.trim(), ...(ref.trim() ? { ref: ref.trim() } : {}), ...(subdir.trim() ? { subdir: subdir.trim() } : {}) })
  const install = async () => {
    if (!preview) return
    const skill = await run('install', () => careerloom.skillsInstall(preview.source, { confirmedScripts: consent }))
    if (skill) { onInstalled(skill); onOpenChange(false) }
  }
  const needsConsent = (preview?.scripts.length ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{preview ? (preview.replaces ? `Update ${preview.name}` : `Install ${preview.name}`) : 'Install a skill'}</DialogTitle>
          <DialogDescription>{preview ? 'Nothing is installed until you confirm. Review what this skill contains.' : 'A skill is a folder with a SKILL.md. Choose where to get it; you review it before anything is installed.'}</DialogDescription>
        </DialogHeader>

        {!preview && (
          <Tabs value={tab} onValueChange={v => { setTab(v as Tab); setError(null) }}>
            <TabsList>
              <TabsTrigger value="git">GitHub or git URL</TabsTrigger>
              <TabsTrigger value="folder">Local folder</TabsTrigger>
              <TabsTrigger value="zip">.zip file</TabsTrigger>
            </TabsList>
            <TabsContent value="git" className="grid gap-3 pt-3">
              <Field id="skill-git-url" label="Repository" placeholder="owner/repo or https://github.com/owner/repo" value={url} onChange={e => setUrl(e.target.value)} hint="Add a subfolder below when the repository holds several skills." />
              <div className="grid grid-cols-2 gap-3">
                <Field id="skill-git-subdir" label="Subfolder (optional)" placeholder="skills/cover-letter" value={subdir} onChange={e => setSubdir(e.target.value)} />
                <Field id="skill-git-ref" label="Branch or tag (optional)" placeholder="main" value={ref} onChange={e => setRef(e.target.value)} />
              </div>
              <div><Button disabled={!url.trim() || busy !== null} onClick={() => void inspect(gitSource())}>{busy === 'inspect' ? 'Fetching…' : 'Inspect'}</Button></div>
            </TabsContent>
            {(['folder', 'zip'] as const).map(kind => (
              <TabsContent key={kind} value={kind} className="grid gap-3 pt-3">
                <p className="m-0 text-sm text-muted-foreground">{kind === 'folder' ? 'Pick a folder that contains SKILL.md. It is read in place and copied only when you install.' : 'Pick a .zip with SKILL.md at the top or inside a single folder.'}</p>
                {picked[kind] && <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">Last chosen: {picked[kind]}</p>}
                <div><Button disabled={busy !== null} onClick={() => void pick(kind)}>{busy === 'inspect' ? 'Reading…' : kind === 'folder' ? 'Choose folder…' : 'Choose .zip…'}</Button></div>
              </TabsContent>
            ))}
          </Tabs>
        )}

        {preview && (
          <div className="grid gap-3 text-sm">
            <div>
              <p className="m-0 font-medium">{preview.name}{preview.version && <span className="ml-2 text-xs font-normal text-muted-foreground">v{preview.version}</span>}</p>
              <p className="m-0 mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">{preview.description}</p>
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-muted-foreground">
              <dt>Source</dt><dd>{sourceLabel(preview.source)}</dd>
              <dt>Size</dt><dd>{fmtBytes(preview.sizeBytes)} in {preview.fileCount} file{preview.fileCount === 1 ? '' : 's'}</dd>
              <dt>Provides</dt><dd>{preview.provides.length ? preview.provides.join(', ') : 'Instructions only'}</dd>
            </dl>
            {preview.replaces && <Note>This replaces the installed copy. Whether it is switched on stays as it is.</Note>}
            {preview.warnings.length > 0 && (
              <Note tone="warn"><span className="font-medium">Heads up</span><ul className="m-0 mt-1 list-disc pl-4">{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul></Note>
            )}
            {needsConsent && (
              <div className="grid gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="m-0 font-medium">This skill contains scripts</p>
                <p className="m-0 text-xs text-muted-foreground">Careerloom never runs them itself. The agent you pick may run them with its own permissions, so only install skills you trust.</p>
                <ul className="m-0 max-h-28 list-none overflow-y-auto p-0 font-mono text-xs [overflow-wrap:anywhere]">{preview.scripts.map(s => <li key={s}>{s}</li>)}</ul>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} className="mt-0.5" />
                  <span>I reviewed these scripts and trust this skill</span>
                </label>
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="m-0 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm [overflow-wrap:anywhere]">{error}</p>}

        <DialogFooter>
          {preview && !initial && <Button variant="outline" disabled={busy !== null} onClick={() => { setPreview(null); setError(null) }}>Back</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {preview && <Button disabled={busy !== null || (needsConsent && !consent)} onClick={() => void install()}>{busy === 'install' ? 'Installing…' : preview.replaces ? 'Update skill' : 'Install skill'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
