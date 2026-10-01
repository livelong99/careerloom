// WP2 owns this file.
import { todo } from '../../todo'
import type { SearchBackend } from './adapter'

export const createSerperBackend = (_opts: { key?: string; baseUrl?: string; fetch?: typeof fetch }): SearchBackend => todo('WP2')
