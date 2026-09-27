// `fetch: browser` web boards: the user's CLI drives Playwright MCP (their own
// Chrome, an in-memory profile seeded ONLY with the board's cookies) through a
// read-only tool allowlist and prints {"jobs":[…]}. The storage-state file is
// 0600 in a private temp dir, never logged, and deleted after every run.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { careerOpsRoot, launch, readSettings, streamFormat, type RunRecord } from '../context'
import { spawnSpec, type RunnerId } from '../runner'
import { boardOrigins, browserAgentArgs, browserPrompt, playwrightMcp } from './browser-args'
import { registrableDomain, storageState } from './browser-cookies'
import { domainCookies, isAcknowledged } from './browser-login'
import { readRegistry } from './registry'
import type { Source } from './sources'
import { boardUrls, extractJobsJson, MAX_PAGES, validateJobs, type WebJob } from './web-board-core'

export const BROWSER_RUNNER = 'Browser boards need Claude Code or Codex for now — switch runner in Settings'
export const consentMessage = (domain: string) => `Browser scan of ${domain} needs your acknowledgement first`

export const boardDomain = (board: Source): string => registrableDomain(new URL(boardUrls(board)[0]!).hostname)

/** Checks that fail before anything runs (runner, per-domain acknowledgement). */
export function assertBrowserReady(board: Source): void {
  const { runner } = readSettings()
  if (runner !== 'claude' && runner !== 'codex') throw new Error(BROWSER_RUNNER)
  if (!isAcknowledged(boardDomain(board))) throw new Error(consentMessage(boardDomain(board)))
}

function runToEnd(record: Pick<RunRecord, 'mode' | 'label' | 'input'> & { runner: RunnerId }, bin: string, args: string[]): Promise<RunRecord> {
  const root = careerOpsRoot()
  return new Promise((resolve, reject) => {
    try {
      launch(record, [{ spec: spawnSpec(bin, args), cwd: root }], { format: streamFormat(record.runner, root), onExit: resolve })
    } catch (err) {
      reject(err)
    }
  })
}

export async function browserExtract(board: Source, guideline: string | undefined, log: (t: string) => void): Promise<WebJob[]> {
  assertBrowserReady(board)
  const { runner, models } = readSettings()
  const urls = boardUrls(board)
  const domain = boardDomain(board)
  const cfg = readRegistry().browser
  const cookies = await domainCookies(domain)
  log(`  ${cookies.length} ${domain} cookie${cookies.length === 1 ? '' : 's'} from ${cfg.source === 'off' ? 'nowhere (login off — public pages)' : cfg.source}\n`)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-bs-')) // mkdtemp is 0700
  try {
    const stateFile = path.join(dir, 'state.json')
    fs.writeFileSync(stateFile, JSON.stringify(storageState(cookies)), { mode: 0o600, flag: 'wx' })
    const model = runner === 'claude' || runner === 'codex' ? models[runner] : undefined
    const args = browserAgentArgs(runner, browserPrompt(board.name, urls, guideline, MAX_PAGES), playwrightMcp(stateFile, cfg.headless, boardOrigins(urls)), model)
    if (!args) throw new Error(BROWSER_RUNNER)
    log(`  browser agent running ("Browse jobs: ${board.name}" in Runs)\n`)
    const run = await runToEnd({ runner, mode: 'web-board', label: `Browse jobs: ${board.name}`, input: urls[0]! }, runner, args)
    const raw = extractJobsJson(run.log) as { blocked?: unknown } | null
    if (raw === null) throw new Error(`the browser run ${run.status === 'done' ? 'returned no {"jobs":[…]} JSON' : run.status}`)
    if (typeof raw.blocked === 'string' && raw.blocked) log(`  blocked: ${raw.blocked.slice(0, 200)}\n`)
    return validateJobs(raw, urls[0]!)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
