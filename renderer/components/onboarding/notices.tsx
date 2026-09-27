// Third-party notices for the local pre-screen model (shown in Settings → Local model and the Jobs popover).

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`

export const NOTICES: Array<{ name: string; text: string }> = [
  {
    name: 'ESCO — European Skills, Competences, Qualifications and Occupations',
    text: 'Contains ESCO data. © European Union, ESCO. https://esco.ec.europa.eu — reused under the Commission’s reuse policy (Commission Decision 2011/833/EU on the reuse of Commission documents). The base model was trained on ESCO occupation data; it is not endorsed by the European Commission.',
  },
  { name: 'TechWolf/JobBERT-evaluation-dataset — MIT License', text: `Job titles from the TechWolf JobBERT evaluation dataset (Decorte et al., 2021), MIT License — © TechWolf (training and replay titles).\n\n${MIT}` },
  {
    name: 'Manav2op/verdict-small — Apache License 2.0',
    text: 'The encoder is downloaded from Hugging Face (Manav2op/verdict-small) during setup and used unmodified under the Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0',
  },
]

/** The short attribution plus the full notices behind a disclosure. */
export function ThirdPartyNotices() {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p className="m-0">Base model trained on public data. Contains ESCO data. © European Union, ESCO. https://esco.ec.europa.eu · Job titles from the TechWolf JobBERT evaluation dataset (Decorte et al., 2021), MIT License — © TechWolf</p>
      <details>
        <summary className="cursor-pointer">Third-party notices</summary>
        {NOTICES.map(n => (
          <div key={n.name} className="mt-2">
            <b className="text-foreground">{n.name}</b>
            <p className="m-0 whitespace-pre-line">{n.text}</p>
          </div>
        ))}
      </details>
    </div>
  )
}
