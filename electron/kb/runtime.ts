// The one KB store of the app (electron main): userData/kb, bound for retrieval and the interviewer pool.
import { userFile } from '../context'
import { bindKbStore } from './retrieve'
import { openKbStore, type KbStore } from './store'

let store: KbStore | null = null
export function getKbStore(): KbStore {
  if (!store) { store = openKbStore(() => userFile('kb')); bindKbStore(store) }
  return store
}
