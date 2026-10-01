const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type CoverHead = { name: string; contact: string[]; date: string; company: string; role: string }

/** A plain one-page letter; printed by the same offline window as the résumé (no scripts, no network). */
export function coverHtml(h: CoverHead, paragraphs: string[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(h.name)} cover letter</title>
<style>
  @page { margin: 22mm 20mm; }
  body { font: 11pt/1.55 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; margin: 0; }
  header { margin-bottom: 14mm; } h1 { font-size: 16pt; margin: 0 0 2mm; font-weight: 600; }
  .meta { color: #555; font-size: 9.5pt; } .to { margin: 0 0 7mm; } p { margin: 0 0 4.5mm; }
</style></head><body>
<header><h1>${esc(h.name)}</h1><div class="meta">${h.contact.filter(Boolean).map(esc).join(' · ')}</div></header>
<p class="to">${esc(h.date)}<br>Hiring team, ${esc(h.company)}<br>Re: ${esc(h.role)}</p>
<p>Dear hiring team,</p>
${paragraphs.map(p => `<p>${esc(p)}</p>`).join('\n')}
<p>Regards,<br>${esc(h.name)}</p>
</body></html>`
}
