// WP2 owns this file. Allow-list tiers, the never-fetch list (a code constant, not a setting), licence tags, attribution (plan §9).
import { todo } from './todo'
import type { SourceKind } from './types'

export type SourceClass = { allowed: boolean; kind: SourceKind; trust: 0 | 1 | 2; licence: string | null }
export const NEVER_FETCH: readonly string[] = []
export const classifyHost = (_url: string): SourceClass => todo('WP2')
export const attribution = (_licence: string | null, _title: string, _url: string): string => todo('WP2')
