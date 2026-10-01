#!/bin/sh
# usage: shoot.sh <out.png> <W,H> <relative-url>   (one headless Chrome at a time; killed as soon as the PNG lands)
cd "$(dirname "$0")"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rm -f "shots/$1"
"$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=/private/tmp/claude-501/chrome-prof --screenshot="shots/$1" --window-size="$2" "file://$PWD/$3" >/dev/null 2>&1 &
PID=$!
i=0; while [ $i -lt 40 ]; do sleep 1; i=$((i+1)); [ -s "shots/$1" ] && sleep 2 && break; done
kill $PID 2>/dev/null; pkill -f "chrome-prof" 2>/dev/null
echo "$1 $(stat -f%z shots/$1 2>/dev/null) in ${i}s"
