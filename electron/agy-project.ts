// Antigravity (`agy`) print mode auto-denies any tool that needs a permission it
// cannot prompt for. Claude gets an explicit `--allowedTools` list; agy's
// equivalent is a project config with permission grants. Careerloom keeps one
// dedicated agy project scoped to the career-ops folder (+ installed skills) and
// passes `--project careerloom`, so the user's global agy settings stay untouched.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const AGY_PROJECT_ID = 'careerloom'

/** Same capabilities Claude gets: files in the workspace, career-ops' node scripts, web reads. */
export function agyProject(root: string, skillDirs: string[]): Record<string, unknown> {
  const dirs = [root, ...skillDirs]
  return {
    id: AGY_PROJECT_ID,
    name: 'Careerloom (career-ops)',
    projectResources: { resources: dirs.map(d => ({ folderUri: pathToFileURL(d).href })) },
    permissionGrants: {
      permissionGrants: {
        allow: [
          `read_file(${root})`,
          `write_file(${root})`,
          ...skillDirs.map(d => `read_file(${d})`),
          'command(node)',
          'command(npm run)',
          'read_url(*)',
        ],
      },
    },
    settings: {
      fileAccessPolicy: 'AGENT_SETTING_POLICY_ASK', // the grants above answer it for the workspace
      internetPolicy: 'AGENT_SETTING_POLICY_ALLOW',
      autoExecutionPolicy: 'CASCADE_COMMANDS_AUTO_EXECUTION_OFF', // only granted commands run
    },
  }
}

/** Write (or refresh) the project file; returns the id to pass as `--project`. */
export function ensureAgyProject(root: string, skillDirs: string[], home = os.homedir()): string {
  const file = path.join(home, '.gemini', 'config', 'projects', `${AGY_PROJECT_ID}.json`)
  const text = JSON.stringify(agyProject(root, skillDirs), null, 2) + '\n'
  let current: string | null = null
  try { current = fs.readFileSync(file, 'utf8') } catch { /* first run */ }
  if (current !== text) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  return AGY_PROJECT_ID
}

/** agy exits 0 even when headless mode denied every tool; treat that as a failure. */
export const agyDenied = (log: string) => /headless mode cannot prompt for|no output produced/.test(log)
