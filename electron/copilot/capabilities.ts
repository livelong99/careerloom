/** Interview Copilot is macOS-only for now (plan §3.1); elsewhere main refuses every copilot* call. */
export function copilotSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin'
}

/** Live sessions need Apple Silicon until the bake-off shows an engine that also passes on Intel (plan §3.1). */
export function liveSupported(platform: NodeJS.Platform = process.platform, arch: string = process.arch): boolean {
  return copilotSupported(platform) && arch === 'arm64'
}

export type Capabilities = { copilot: boolean; live: boolean; reason: string | null }

export function capabilities(platform: NodeJS.Platform = process.platform, arch: string = process.arch): Capabilities {
  const copilot = copilotSupported(platform), live = liveSupported(platform, arch)
  return { copilot, live, reason: !copilot ? 'Interview Copilot is available on macOS only' : !live ? 'Live sessions need a Mac with Apple silicon' : null }
}

/** Refusal used by handlers: throws when the platform (or, for live, the chip) cannot run the feature. */
export function assertSupported(live = false, platform: NodeJS.Platform = process.platform, arch: string = process.arch): void {
  const c = capabilities(platform, arch)
  if (!c.copilot || (live && !c.live)) throw new Error(c.reason ?? 'Interview Copilot is unavailable')
}
