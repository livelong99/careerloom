// WP5 owns this file. Engine selection + fallback chain, prefetch of sentence N+1, cancel (plan §6.6).
import { todo } from '../kb/todo'

export interface TtsService {
  speak(utteranceId: string, sentence: string): void
  cancel(): void
}
export const createTtsService = (): TtsService => todo('WP5')
