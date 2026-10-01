export const Level = ({ n }: { n: number }) => (
  <span role="img" aria-label={`difficulty ${n} of 5`} className="inline-flex gap-[3px] align-middle">
    {[1, 2, 3, 4, 5].map(i => <i key={i} className={`size-1.5 rounded-full ${i <= n ? 'bg-foreground' : 'bg-foreground/20'}`} />)}
  </span>
)
