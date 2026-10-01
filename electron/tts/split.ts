// WP5 owns this file. Sentence splitter for streamed LLM tokens (plan §6.6).
import { todo } from '../kb/todo'

export type SentenceSplitter = { push(token: string): string[]; flush(): string[] }
export const createSplitter = (): SentenceSplitter => todo('WP5')
