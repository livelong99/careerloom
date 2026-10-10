// macOS install: unzip the downloaded build, then a detached shell script waits for this process to
// exit, swaps the app bundle (keeping a backup until the copy succeeds), clears the download
// quarantine flag and relaunches. Everything reaches the script as argv, never interpolated.

export const MAC_SWAP_SCRIPT = `#!/bin/sh
PID="$1"; NEW="$2"; DEST="$3"; BACKUP="$4"; LOG="$5"
exec >>"$LOG" 2>&1
echo "update: waiting for $PID"
i=0; while kill -0 "$PID" 2>/dev/null && [ $i -lt 100 ]; do sleep 0.3; i=$((i+1)); done
rm -rf "$BACKUP"
mv "$DEST" "$BACKUP" || { echo "update: cannot move old app"; open "$DEST"; exit 1; }
if ditto "$NEW" "$DEST"; then
  xattr -cr "$DEST"
  rm -rf "$BACKUP"
  echo "update: done"
else
  echo "update: copy failed, restoring"
  rm -rf "$DEST"; mv "$BACKUP" "$DEST"
fi
WORK="$(dirname "$(dirname "$NEW")")"
case "$(basename "$WORK")" in careerloom-update-*) rm -rf "$WORK" ;; esac
open "$DEST"
`
