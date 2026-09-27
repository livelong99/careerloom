// cv.md ⇄ editable parts: the header (everything before the first `## `) and one
// part per `## Section`. Round-trips byte-for-byte when nothing is edited.
export type CvPart = { title: string; body: string }

export function splitCv(md: string): { header: string; parts: CvPart[] } {
  const [header = '', ...chunks] = md.split(/^(?=## )/m)
  if (/^## /.test(header)) chunks.unshift(header)
  const parts = chunks.map(chunk => {
    const nl = chunk.indexOf('\n')
    return nl < 0 ? { title: chunk.slice(3), body: '' } : { title: chunk.slice(3, nl), body: chunk.slice(nl + 1) }
  })
  return { header: /^## /.test(header) ? '' : header, parts }
}

const endNl = (s: string) => (s === '' || s.endsWith('\n') ? s : `${s}\n`)

export function joinCv(header: string, parts: CvPart[]): string {
  return endNl(header) + parts.map(p => `## ${p.title}\n${endNl(p.body)}`).join('')
}
