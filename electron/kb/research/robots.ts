// WP2 owns this file. robots.txt (RFC 9309) with a 24 h cache.
import { todo } from '../todo'

export const robotsAllows = (_url: string, _userAgent: string, _fetchText: (url: string) => Promise<string | null>): Promise<boolean> => todo('WP2')
