// WP2 owns this file. Normalise + shingle Jaccard ≥ .8 merge with a `seen` count.
import { todo } from '../todo'
import type { KbItem } from '../types'

export const dedupe = (_items: KbItem[]): KbItem[] => todo('WP2')
