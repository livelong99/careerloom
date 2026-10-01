#!/bin/sh
# usage: shoot.sh <out.png> "<query string>"   (one headless Chrome at a time; needs the harness server on :5198)
OUT="$1"; Q="$2"; W="${3:-1440,1000}"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rm -f "$OUT"
"$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=/private/tmp/claude-501/chrome-prof-kbwp4 --virtual-time-budget=6000 --screenshot="$OUT" --window-size="$W" "http://127.0.0.1:5198/?$Q" >/dev/null 2>&1 &
PID=$!
i=0; while [ $i -lt 40 ]; do sleep 1; i=$((i+1)); [ -s "$OUT" ] && sleep 1 && break; done
kill $PID 2>/dev/null; pkill -f "chrome-prof-kbwp4" 2>/dev/null
echo "$OUT $(stat -f%z "$OUT" 2>/dev/null) in ${i}s"
