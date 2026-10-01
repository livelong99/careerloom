// WP5 owns this file.
import { todo } from '../kb/todo'
import type { TtsEngine } from './adapter'

export const createKokoroEngine = (): TtsEngine => todo('WP5')
