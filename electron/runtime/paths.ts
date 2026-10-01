// Where Careerloom's own node / python / git / npm-global CLIs live. Bundled (Windows installer) first,
// then ~/.careerloom/runtime (downloaded at first launch), then the npm global prefix for agent CLIs.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type Tool = 'node' | 'python' | 'git'
type Os = NodeJS.Platform

/** Dirs inside a tool's root that hold its executables (internal layout is fixed by the runtime contract). */
export function toolBinSubdirs(tool: Tool, platform: Os = process.platform): string[] {
  if (platform !== 'win32') return ['bin']
  return tool === 'git' ? ['cmd', path.join('usr', 'bin')] : [''] // MinGit has no mingw64/; python: pip runs as `python -m pip`
}

export const bundledRuntimeDir = (): string | null => {
  const res = (process as { resourcesPath?: string }).resourcesPath
  return res ? path.join(res, 'runtime') : null
}
export const userRuntimeDir = (home = os.homedir()) => path.join(home, '.careerloom', 'runtime')
export const npmPrefix = (home = os.homedir()) => path.join(userRuntimeDir(home), 'npm')
export const npmBinDir = (platform: Os = process.platform, home = os.homedir()) => (platform === 'win32' ? npmPrefix(home) : path.join(npmPrefix(home), 'bin'))
export const toolRoot = (base: string, tool: Tool) => path.join(base, tool)

const isDir = (p: string) => { try { return fs.statSync(p).isDirectory() } catch { return false } }

/** Existing bin dirs, in lookup order: bundled, user-dir, npm prefix. */
export function runtimeBinDirs(): string[] {
  const bases = [bundledRuntimeDir(), userRuntimeDir()].filter((b): b is string => !!b)
  const dirs = bases.flatMap(base => (['node', 'python', 'git'] as const).flatMap(t => toolBinSubdirs(t).map(s => path.join(toolRoot(base, t), s))))
  return [...new Set([...dirs, npmBinDir()])].filter(isDir)
}

/** True when a managed copy of the tool has its main executable. */
export function hasManagedTool(tool: Tool, platform: Os = process.platform): boolean {
  const exe = tool === 'python' ? (platform === 'win32' ? 'python.exe' : 'python3') : platform === 'win32' ? `${tool}.exe` : tool
  return [bundledRuntimeDir(), userRuntimeDir()].some(base => !!base && toolBinSubdirs(tool, platform).some(s => fs.existsSync(path.join(toolRoot(base, tool), s, exe))))
}
