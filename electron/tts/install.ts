// WP5 owns this file. On-demand Kokoro install (pinned pip deps with hashes; prescreen-model.ts pattern). Needs a gate before pins are added.
import { todo } from '../kb/todo'

export const installKokoro = (): { runId: string } => todo('WP5')
