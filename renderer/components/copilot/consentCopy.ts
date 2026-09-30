// ALL user-facing consent / responsible-use wording lives here so the legal reviewer reads one file.
// TODO-legal: every string below is a DRAFT for the G-D review; do not treat as final. Bump CONSENT_TEXT_VERSION
// (electron/copilot/consent.ts) whenever any of it changes, so older confirmations are refused by main.
export const CONSENT_COPY = {
  title: 'Before you start a live session',
  intro: (retention: string) => `Careerloom will listen on this computer (audio never leaves it) and send the conversation's text to OpenRouter to suggest answers. Transcripts are kept for ${retention} (change in Privacy). A "Listening" indicator is shown by default.`,
  mic: { title: 'Your microphone', hint: 'Always included in a live session' },
  system: { title: 'System audio (the other person)', hint: 'Records them. Off unless you turn it on.' },
  aiAllowed: "I'm allowed to use AI assistance in this conversation. I've checked the employer's or interviewer's rules.",
  everyoneInformed: "Everyone on this call knows it's being transcribed, or I've confirmed the law where we are allows it.",
  jurisdictionLabel: 'Where is everyone?',
  jurisdictions: ['India', 'California, US', 'United Kingdom', 'European Union', 'Somewhere else'],
  rulesLink: 'What do the rules say?',
  rulesBody: 'Some places require everyone on a call to agree to recording or transcription; others only one person. Check the rules for every place a participant is in.',
  notLegal: `Not legal advice. Some places require everyone's consent. A simple line helps: "I'm using a transcription tool for my own notes. Is that okay?"`,
} as const
