import { Marked } from 'marked'
import { useMemo, type MouseEvent } from 'react'

import { careerloom } from '../lib/ipc'

// Reports embed text scraped from job pages, so raw HTML in the markdown is
// dropped rather than rendered. The CSP (script-src 'self') is the second wall.
const marked = new Marked({ gfm: true, async: false, renderer: { html: () => '' } })
// Agents (Antigravity especially) cite local files as file:// links, which can't open here —
// show the file name as code instead of a dead link.
marked.use({
  renderer: {
    link({ href, tokens }) {
      if (!/^file:/i.test(href)) return false // default rendering
      return `<code>${this.parser.parseInline(tokens)}</code>`
    },
  },
})

/** Rendered career-ops markdown. Links open in the system browser (main allows http(s) only). */
export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => marked.parse(source) as string, [source])
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a')
    if (!link) return
    event.preventDefault()
    void careerloom.openExternal(link.getAttribute('href') ?? '')
  }
  return <div className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
