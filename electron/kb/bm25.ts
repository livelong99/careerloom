// WP1 owns this file. In-memory BM25 (k1 1.2, b .75) with field boosts (plan §6.1).
import { todo } from './todo'

export type Bm25Doc = { id: string; fields: Array<{ text: string; boost: number }> }
export type Bm25Index = { size: number }
export const tokenize = (_text: string): string[] => todo('WP1')
export const buildIndex = (_docs: Bm25Doc[]): Bm25Index => todo('WP1')
export const scoreQuery = (_index: Bm25Index, _query: string, _k: number): Array<{ id: string; score: number }> => todo('WP1')
