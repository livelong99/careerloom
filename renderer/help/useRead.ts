import { useCallback, useState } from 'react'

const KEY = 'careerloom.help.read'

function load(): Set<string> {
  try { const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]'); return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []) } catch { return new Set() }
}

/** Which topics the reader has opened, remembered on this device. */
export function useRead(): [Set<string>, (id: string) => void] {
  const [read, setRead] = useState(load)
  const mark = useCallback((id: string) => setRead(prev => {
    if (prev.has(id)) return prev
    const next = new Set(prev).add(id)
    try { globalThis.localStorage?.setItem(KEY, JSON.stringify([...next])) } catch { /* storage can be unavailable */ }
    return next
  }), [])
  return [read, mark]
}
