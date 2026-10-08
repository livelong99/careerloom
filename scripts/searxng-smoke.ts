// Live check of the bundled SearXNG compose (needs Docker): npx vite-node scripts/searxng-smoke.ts -- <dir>
import fs from 'node:fs'
import path from 'node:path'
import { newSearxngSecret, searxngCompose, searxngSettings } from '../electron/integrations/searxng-compose'
const dir = path.resolve(process.argv.at(-1)!)
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'settings.yml'), searxngSettings(newSearxngSecret()))
fs.writeFileSync(path.join(dir, 'compose.yml'), searxngCompose(dir))
console.log(path.join(dir, 'compose.yml'))
