import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// A temp career-ops data folder with one uploaded résumé; the agent launch is stubbed.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-resume-'))
fs.mkdirSync(path.join(root, 'documents', 'cv'), { recursive: true })
fs.writeFileSync(path.join(root, 'documents', 'cv', 'cv.md'), '# Me')
const upload = path.join(os.tmpdir(), 'My CV.md')
fs.writeFileSync(upload, '# Me')

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [upload] })) },
  shell: {},
  app: { getPath: () => os.tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {},
}))
const startAgentPrompt = vi.fn((_label: string, _mode: string, _prompt: string, input: string | null) => ({ id: 'run', input }))
vi.mock('./context', async importOriginal => ({ ...(await importOriginal<object>()), dataRoot: () => root, startAgentPrompt }))

const { extractResume } = await import('./resume-agent')
const { resumeHandlers } = await import('./resume')

describe('résumé upload → extract (Windows paths)', () => {
  it('accepts a bare name or the source path with either separator', async () => {
    for (const file of ['cv.md', 'documents/cv/cv.md', 'documents\\cv\\cv.md']) {
      await extractResume(file)
      expect(startAgentPrompt).toHaveBeenLastCalledWith('Extract résumé', 'intake', expect.any(String), 'documents/cv/cv.md')
    }
  })

  it('still refuses anything outside documents/cv', async () => {
    await expect(extractResume('../secret.md')).rejects.toThrow(/documents\/cv/)
    await expect(extractResume('documents/cv/../../secret.md')).rejects.toThrow(/documents\/cv/)
  })

  it('reports an uploaded file with / separators on every OS', async () => {
    const source = await (resumeHandlers.importResume as () => Promise<{ file: string }>)()
    expect(source.file).toMatch(/^documents\/cv\/[^/\\]+\.md$/)
  })
})
