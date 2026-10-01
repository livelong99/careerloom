#!/bin/sh
# usage: shoot.sh <out.png> "<query>"   (needs `npx vite --config scripts/kb-wp7-shots/vite.config.ts` on :5199; one headless Chrome at a time)
OUT="$1"; Q="$2"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rm -f "$OUT"
"$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=/private/tmp/claude-501/chrome-prof-kbwp7 --virtual-time-budget=8000 --screenshot="$OUT" --window-size=500,520 "http://127.0.0.1:5199/?$Q" >/dev/null 2>&1 &
PID=$!
i=0; while [ $i -lt 40 ]; do sleep 1; i=$((i+1)); [ -s "$OUT" ] && sleep 1 && break; done
kill $PID 2>/dev/null; pkill -f "chrome-prof-kbwp7" 2>/dev/null
echo "$OUT $(stat -f%z "$OUT" 2>/dev/null) in ${i}s"
