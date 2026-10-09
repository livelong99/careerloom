// Model id for one runner (main or helper tier): a dropdown filled from the runner's own list, any id allowed, empty = default.
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { ModelRunner } from '../../lib/types'
import { ModelCombobox, MODEL_ID } from './ModelCombobox'

export { MODEL_ID }

export function ModelField({ runner, value, helper = false, onSaved }: { runner: ModelRunner; value: string; helper?: boolean; onSaved: () => void }) {
  const kind = helper ? 'Helper model' : 'Model'
  const save = async (next: string) => {
    try {
      await (helper ? careerloom.setHelperModel : careerloom.setModel)(runner, next || null)
      showToast(next ? `${kind} set to ${next}` : helper ? 'Using the built-in helper model' : 'Using the default model')
      onSaved()
    } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{kind}</span>
      <ModelCombobox ariaLabel={`${kind} for ${runner}`} value={value} defaultLabel={helper ? 'Built-in cheap model' : 'Default'} scope={runner}
        load={() => careerloom.listModels(runner)} onChange={id => void save(id)} />
    </div>
  )
}
