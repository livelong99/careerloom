export function QuestionBanner({ type, text }: { type: string; text: string }) {
  return <div className="qb"><span className="tb">{type}</span><span className="tx">{text}</span></div>
}

export function WaitingBanner() {
  return <div className="qb wait"><span className="tx">Waiting for a question… I'll flag one when the interviewer finishes speaking.</span></div>
}
