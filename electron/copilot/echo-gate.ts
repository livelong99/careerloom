// WP5 owns this file. Half-duplex gate: idle → speaking → tail → listening; push-to-interrupt; headphone barge-in (plan §6.5).
import { todo } from '../kb/todo'

export type GatePhase = 'idle' | 'speaking' | 'tail' | 'listening'
export interface EchoGate {
  phase(): GatePhase
  /** True when the mic frame must be dropped. */
  drops(): boolean
  onPlayback(phase: 'started' | 'ended' | 'cancelled'): void
}
export const createEchoGate = (_opts: { echo: 'speakers' | 'headphones'; tailMs: number; now?: () => number }): EchoGate => todo('WP5')
