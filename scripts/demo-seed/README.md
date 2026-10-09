# Demo workspace for README screenshots

All data is fictional (candidate Aarav Mehta, made-up companies, `.example` URLs, fake keys).

```sh
npm run build:electron && npm run build:renderer
node scripts/demo-seed/seed.mjs            # /private/tmp/career-ops-demo + /private/tmp/careerloom-demo-profile
CAREERLOOM_NO_BOOTSTRAP=1 node_modules/.bin/electron . --user-data-dir=/private/tmp/careerloom-demo-profile --remote-debugging-port=9444
# once per fresh profile, set three fake keys through the app (keysSet openrouter/openai/groq), then re-run seed.mjs
CDP_PORT=9444 node scripts/demo-seed/capture.mjs --out /private/tmp/shots-raw
python3 scripts/demo-seed/optimise.py /private/tmp/shots-raw docs/screenshots --palette
```
Restart the app after re-seeding (stores are cached in memory).
