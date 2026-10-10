import { useCallback, useState } from 'react'

import { isRangeId, type RangeId } from '../../lib/overviewData'

const KEY = 'careerloom.overview.range'

function load(): RangeId {
  try { const v = localStorage.getItem(KEY); return isRangeId(v) ? v : '30d' } catch { return '30d' }
}

/** The Overview's global range, remembered across launches. */
export function useRange(): [RangeId, (r: RangeId) => void] {
  const [range, setState] = useState<RangeId>(load)
  const set = useCallback((r: RangeId) => {
    setState(r)
    try { localStorage.setItem(KEY, r) } catch { /* storage can be unavailable */ }
  }, [])
  return [range, set]
}
