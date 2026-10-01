// WP5 owns this file.
import { todo } from '../kb/todo'
import type { TtsEngine } from './adapter'

export const createOpenRouterEngine = (): TtsEngine => todo('WP5')
