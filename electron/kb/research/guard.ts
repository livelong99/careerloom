// WP2 owns this file. Injection markers, URL/markdown stripping, evidence-span check (plan §9).
import { todo } from '../todo'
import type { Candidate } from './extract'

export const hasInjection = (_pageText: string): boolean => todo('WP2')
export const sanitize = (_text: string): string => todo('WP2')
export const evidenceHolds = (_candidate: Candidate, _pageText: string): boolean => todo('WP2')
