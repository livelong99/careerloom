#!/bin/sh
# usage: shoot.sh <out.png> "<query>"   (needs `npx vite --config scripts/fix-models-qa/vite.config.ts` on :5198; one headless Chrome at a time)
OUT="$1"; Q="$2"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rm -f "$OUT"
"$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=/private/tmp/claude-501/chrome-prof-fixmodels --virtual-time-budget=8000 --screenshot="$OUT" --window-size=1100,1500 "http://127.0.0.1:5198/?$Q" >/dev/null 2>&1 &
PID=$!
i=0; while [ $i -lt 40 ]; do sleep 1; i=$((i+1)); [ -s "$OUT" ] && sleep 1 && break; done
kill $PID 2>/dev/null; pkill -f "chrome-prof-fixmodels" 2>/dev/null
echo "$OUT $(stat -f%z "$OUT" 2>/dev/null) in ${i}s"
