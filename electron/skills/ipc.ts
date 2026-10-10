// Binds the skills IPC to the app: userData storage, native pickers, and the run-time skill provider.
import { app, BrowserWindow, dialog } from 'electron'

import { createSkillsHandlers, type PickKind } from './handlers'
import { setInstalledSkills } from './inject'
import { createRegistry, type SkillRegistry } from './registry'

let registry: SkillRegistry | null = null
const get = (): SkillRegistry => (registry ??= createRegistry(app.getPath('userData')))

setInstalledSkills(() => get().list())

async function pick(kind: PickKind): Promise<string | null> {
  const options: Electron.OpenDialogOptions = kind === 'folder'
    ? { title: 'Choose a skill folder', properties: ['openDirectory'] }
    : { title: 'Choose a skill .zip', properties: ['openFile'], filters: [{ name: 'Zip archive', extensions: ['zip'] }] }
  const win = BrowserWindow.getFocusedWindow()
  const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return res.canceled ? null : res.filePaths[0] ?? null
}

export const skillsHandlers = createSkillsHandlers({ registry: get, pick })
