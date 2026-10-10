import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { userFile } from './context'
import { EXT, sniffMime } from './image-support'
import { ATTACHMENT_LIMITS, type Attachment } from './skills/types'

// Images attached to Agent messages live in <userData>/attachments/<threadId>/ and go with the thread.

/** What the renderer sends: a name for display and the raw bytes. The type is decided here, from the bytes. */
export type AttachmentInput = { name: string; data: Uint8Array }

const ID_RE = /^[0-9a-f-]{36}$/
const root = () => userFile('attachments')

export function attachmentDir(threadId: string): string {
  if (!ID_RE.test(threadId)) throw new Error('Invalid thread id')
  return path.join(root(), threadId)
}

/** Display name only: no path parts, bounded length. */
const cleanName = (name: unknown) => (typeof name === 'string' ? path.basename(name.replace(/\\/g, '/')).replace(/[^\w .()-]/g, '_').slice(0, 80) : '') || 'image'

/** Validate every input (count, size, magic bytes) before writing any, so a bad file never leaves a partial set. */
export function saveAttachments(threadId: string, inputs: unknown): Attachment[] {
  if (inputs === undefined || inputs === null) return []
  if (!Array.isArray(inputs)) throw new Error('attachments must be a list')
  if (inputs.length > ATTACHMENT_LIMITS.maxFiles) throw new Error(`Only ${ATTACHMENT_LIMITS.maxFiles} images per message`)
  const checked = inputs.map(raw => {
    const name = cleanName((raw as AttachmentInput | null)?.name)
    const data = (raw as AttachmentInput | null)?.data
    if (!(data instanceof Uint8Array)) throw new Error(`${name}: could not read the file`)
    if (data.byteLength === 0) throw new Error(`${name}: the file is empty`)
    if (data.byteLength > ATTACHMENT_LIMITS.maxBytes) throw new Error(`${name}: larger than ${ATTACHMENT_LIMITS.maxBytes / 1024 / 1024} MB`)
    const mime = sniffMime(data)
    if (!mime) throw new Error(`${name}: not a PNG, JPEG, WebP or GIF image`)
    return { name, data, mime }
  })
  if (!checked.length) return []
  const dir = attachmentDir(threadId)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  return checked.map(({ name, data, mime }) => {
    const id = randomUUID()
    const file = path.join(dir, `${id}.${EXT[mime]}`)
    fs.writeFileSync(file, data, { mode: 0o600 })
    return { id, name, mime, bytes: data.byteLength, path: file }
  })
}

export function removeAttachments(threadId: string): void {
  fs.rmSync(attachmentDir(threadId), { recursive: true, force: true })
}

/** A stored attachment as a data: URL (the renderer CSP allows only 'self' and data: images). */
export function attachmentDataUrl(threadId: unknown, attachmentId: unknown): string {
  if (typeof threadId !== 'string' || typeof attachmentId !== 'string' || !ID_RE.test(attachmentId)) throw new Error('Invalid attachment')
  const dir = attachmentDir(threadId)
  const name = fs.readdirSync(dir).find(f => f.startsWith(`${attachmentId}.`))
  if (!name) throw new Error('That image is no longer available')
  const bytes = fs.readFileSync(path.join(dir, name))
  const mime = sniffMime(bytes)
  if (!mime) throw new Error('That image is no longer available')
  return `data:${mime};base64,${bytes.toString('base64')}`
}
