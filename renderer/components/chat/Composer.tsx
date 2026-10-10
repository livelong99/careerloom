import { forwardRef, useId, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowUp, ImagePlus, Info, Sparkles, Square, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ATTACHMENT_LIMITS } from '../../../electron/skills/types'
import type { InstalledSkill } from '../../../electron/skills/types'
import { AttachmentStrip } from './AttachmentStrip'
import { SLASH_LIST_ID, SlashMenu, slashOptionId } from './SlashMenu'
import { filterSkills, slashQuery } from './skills'
import { useAttachments, type PendingImage } from './useAttachments'

export type Outgoing = { attachments: PendingImage[]; skills: string[] }

type Props = {
  value: string
  onChange: (value: string) => void
  /** Resolve true when the message was accepted, so the queued images and skill chips can be cleared. */
  onSend: (extras: Outgoing) => Promise<boolean>
  onStop: () => void
  running: boolean
  disabled?: boolean
  sending?: boolean
  /** Whether the active runner/model can read images; unsupported + images queued = Send is blocked with the reason. */
  imageSupport?: { ok: boolean; reason?: string }
  /** Installed, enabled skills offered by the `/` menu. */
  skills?: InstalledSkill[]
  /** Skills picked for this message (shown as chips); owned by the screen so the empty state can add to them too. */
  chosen: InstalledSkill[]
  onChosen: (skills: InstalledSkill[]) => void
  onManageSkills?: () => void
}

const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')

/** Message box: Enter sends, Shift+Enter adds a line, Esc stops a running reply, `/` picks skills, images by paste, drop or picker. */
export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer({ value, onChange, onSend, onStop, running, disabled, sending, imageSupport, skills = [], chosen, onChosen, onManageSkills }, ref) {
  const files = useAttachments()
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [menuOff, setMenuOff] = useState(false)
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const id = useId()

  const unsupported = files.items.length > 0 && imageSupport?.ok === false
  const canSend = !running && !disabled && !unsupported && (value.trim().length > 0 || files.items.length > 0)

  const slash = slashQuery(value, caret)
  const options = slash ? filterSkills(skills.filter(s => !chosen.some(c => c.id === s.id)), slash.query) : []
  const menuOpen = !!slash && !menuOff && !disabled
  const activeOption = options[Math.min(active, Math.max(0, options.length - 1))]

  const send = async () => {
    if (!canSend) return
    if (await onSend({ attachments: files.items, skills: chosen.map(s => s.id) })) { files.clear(); onChosen([]) }
  }

  const pick = (skill: InstalledSkill) => {
    if (!slash) return
    onChange(value.slice(0, slash.start) + value.slice(caret))
    setCaret(slash.start)
    onChosen([...chosen, skill])
    setActive(0)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (menuOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (options.length) setActive(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && activeOption) { e.preventDefault(); pick(activeOption); return }
      if (e.key === 'Escape') { e.preventDefault(); setMenuOff(true); return }
    }
    if (e.key === 'Escape' && running) { e.preventDefault(); onStop(); return }
    if (e.key === 'Backspace' && !value && chosen.length) { onChosen(chosen.slice(0, -1)); return }
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    void send()
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = [...e.clipboardData.files].filter(f => f.type.startsWith('image/'))
    if (!images.length) return
    e.preventDefault()
    void files.add(images)
  }

  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDragging(false)
    if (!disabled) void files.add([...e.dataTransfer.files])
  }

  const hint = unsupported ? imageSupport?.reason : null
  return (
    <form
      className="shrink-0 border-t border-border p-3"
      onSubmit={e => { e.preventDefault(); void send() }}
      onDragOver={e => { if (hasFiles(e)) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={onDrop}
    >
      <label htmlFor={`${id}-field`} className="mb-1 block text-xs font-medium text-muted-foreground">Ask the agent</label>
      <div className={cn('relative rounded-lg border border-input bg-[var(--card-inner)] p-2 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30', dragging && 'border-primary ring-[3px] ring-primary/30')}>
        {menuOpen && <SlashMenu skills={options} active={Math.min(active, Math.max(0, options.length - 1))} hasAny={skills.length > 0} onPick={pick} onHover={setActive} onManage={onManageSkills ?? (() => {})} />}
        {dragging && <p className="pointer-events-none absolute inset-0 z-10 m-0 flex items-center justify-center rounded-lg bg-background/80 text-sm font-medium text-primary">Drop images to attach</p>}
        <AttachmentStrip items={files.items} issues={files.issues} onRemove={files.remove} onDismiss={files.dismissIssue} />
        {chosen.length > 0 && (
          <ul aria-label="Skills for this message" className="m-0 mb-2 flex list-none flex-wrap gap-1.5 p-0">
            {chosen.map(s => (
              <li key={s.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--thread)]/15 py-0.5 pr-1 pl-2 text-xs font-medium text-foreground">
                <Sparkles className="size-3 text-[var(--thread)]" aria-hidden /> {s.name}
                <Button type="button" variant="subtle" size="icon-xs" className="size-4 rounded-full" aria-label={`Remove skill ${s.name}`} onClick={() => onChosen(chosen.filter(c => c.id !== s.id))}><X aria-hidden /></Button>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          ref={ref}
          id={`${id}-field`}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? SLASH_LIST_ID : undefined}
          aria-activedescendant={menuOpen && activeOption ? slashOptionId(activeOption.id) : undefined}
          aria-autocomplete="list"
          value={value}
          onChange={e => { onChange(e.target.value); setCaret(e.target.selectionStart); setActive(0); setMenuOff(false) }}
          onSelect={e => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={disabled}
          maxLength={20_000}
          rows={1}
          placeholder={running ? 'The agent is working — you can draft your next message' : 'Describe what you want done, or type / for skills'}
          aria-describedby={`${id}-hint`}
          className="max-h-48 min-h-10 resize-none border-0 bg-transparent p-1 font-sans shadow-none placeholder:font-sans focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="mt-1 flex items-center gap-1">
          <input
            ref={picker}
            type="file"
            hidden
            multiple
            accept={ATTACHMENT_LIMITS.mimes.join(',')}
            aria-label="Choose images"
            onChange={e => { void files.add([...(e.target.files ?? [])]); e.target.value = '' }}
          />
          <Button type="button" variant="subtle" size="icon-sm" aria-label="Attach images" title="Attach images (or paste / drop)" disabled={disabled || files.items.length >= ATTACHMENT_LIMITS.maxFiles} onClick={() => picker.current?.click()}><ImagePlus aria-hidden /></Button>
          <Button type="button" variant="subtle" size="icon-sm" aria-label="Pick a skill" title="Skills (type /)" disabled={disabled} onClick={() => { onChange(`${value}${value && !/\s$/.test(value) ? ' ' : ''}/`); setCaret(value.length + (value && !/\s$/.test(value) ? 2 : 1)); setMenuOff(false) }}><Sparkles aria-hidden /></Button>
          <span id={`${id}-hint`} className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground">
            <Kbd>Enter</Kbd> send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line · <Kbd>/</Kbd> skills{running && <> · <Kbd>Esc</Kbd> stop</>}
          </span>
          {running
            ? <Button type="button" variant="danger" size="sm" onClick={onStop}><Square aria-hidden /> Stop</Button>
            : <Button type="submit" variant="primary" size="sm" disabled={!canSend}><ArrowUp aria-hidden /> {sending ? 'Sending…' : 'Send'}</Button>}
        </div>
      </div>
      {hint && <p role="alert" className="mt-1.5 mb-0 flex items-center gap-1.5 text-xs text-warning"><Info className="size-3.5 shrink-0" aria-hidden /> {hint}. Remove the images or change the runner in Settings.</p>}
    </form>
  )
})
