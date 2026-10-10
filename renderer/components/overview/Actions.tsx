import { Icon, type IconName } from '../icons'

export type NextAction = { id: string; icon: IconName; title: string; sub: string; label: string; run: () => void }

/** Next best actions, each one click. */
export function Actions({ items }: { items: NextAction[] }) {
  return (
    <ul className="ovx-actions">
      {items.map(a => (
        <li key={a.id}>
          <Icon name={a.icon} />
          <div><b>{a.title}</b><small>{a.sub}</small></div>
          <button type="button" className="btnp" onClick={a.run} aria-label={`${a.label}: ${a.title}`}>{a.label}</button>
        </li>
      ))}
    </ul>
  )
}
