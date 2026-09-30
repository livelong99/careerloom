// Minimal WP0 version; WP3 extends it (Apple Silicon check for Live, engine availability).
/** Interview Copilot is macOS-only for now (plan §3.1); elsewhere main refuses every copilot* call. */
export function copilotSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin'
}
