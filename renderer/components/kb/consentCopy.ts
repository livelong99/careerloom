// All first-run web-research consent wording lives here so the legal reviewer reads one file.
// TODO-legal: every string below is a DRAFT; counsel to review wording and each fetched source's terms before release.
// Bump CONSENT_VERSION whenever any of it changes: the stored acknowledgement (interview.json research.consentVersion) then stops matching and the dialog shows again.
export const CONSENT_VERSION = '2026-10-v1'

export const KB_CONSENT = {
  title: 'Before Careerloom researches the web for this job',
  intro: 'Research builds your question base from public pages. Here is exactly what leaves this computer:',
  points: (provider: string): string[] => [
    `Search queries go to ${provider}. They contain the role, skills and company only, never your résumé text, contact details or story content.`,
    'Public pages those results point to (documentation, engineering blogs, GitHub, Q&A sites, company pages) are fetched from this computer. Careerloom follows each site’s robots.txt and never fetches login-only or paywalled pages.',
    'Text from those pages is sent to the model you chose for reading pages (Settings, Interview prep), which is billed to your own key. Page text is not stored; only short notes, links and a content hash are kept.',
    'Questions are labelled Sourced (with a link) or Generated (no source, practice only). Check a source’s own terms before reusing its wording.',
  ],
  notLegal: 'Not legal advice. You can stop a run at any time from here or in Runs, and delete a question base from this tab.',
  agree: 'Agree and continue',
  review: 'Review and agree',
  notice: 'Research needs your OK first. Review what is sent and where, then agree to turn it on.',
} as const

export const PROVIDER_NAME: Record<string, string> = { brave: 'your Brave Search account', exa: 'your Exa account', serper: 'your Serper account', searxng: 'your SearXNG server', none: 'no search provider (this run reads the posting only)' }
