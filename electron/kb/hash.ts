// WP1 owns this file. Stable ids and cache keys (plan §5).
import { todo } from './todo'

export const itemId = (_text: string): string => todo('WP1')
export const inputHash = (_parts: { jd: unknown; gaps: unknown; role: string; company: string }): string => todo('WP1')
export const contentHash = (_text: string): string => todo('WP1')
export const queryKey = (_backend: string, _query: string): string => todo('WP1')
export const pageKey = (_url: string): string => todo('WP1')
