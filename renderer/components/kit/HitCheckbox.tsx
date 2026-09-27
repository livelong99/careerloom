import type { ComponentProps } from 'react'

import { Checkbox } from '@/components/ui/checkbox'

/** The 16 px checkbox inside a 24 px hit area (WCAG 2.5.8): the wrapping label forwards clicks to it. */
export function HitCheckbox(props: ComponentProps<typeof Checkbox>) {
  return (
    <label className="-m-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-sm" onClick={e => e.stopPropagation()}>
      <Checkbox {...props} />
    </label>
  )
}
