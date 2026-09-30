// Contract stub (WP0): interface only. The owning work package implements it in this file.
/** Owner: WP2. Replaces names/emails/phones in transcript text with tokens before any LLM call (regex MVP). */
export type Redactor = (text: string) => string
