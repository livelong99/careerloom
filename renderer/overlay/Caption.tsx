/** The question as text, always: a polite live region so a screen reader announces each new question once. */
export function Caption({ text }: { text: string | null }) {
  return <p className="ivcap" aria-live="polite" aria-atomic="true">{text ?? 'The interviewer will ask the first question in a moment…'}</p>
}
