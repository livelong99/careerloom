#!/bin/zsh
# QA only: launch ONE Electron on the cloned profile ($QA) and record its PID in $QA/app.pid. Never kill by name: kill "$(cat $QA/app.pid)".
: ${QA:?set QA to the scratch dir with profile/, career-ops/, e2e.json}
: ${ELECTRON:?set ELECTRON to an Electron binary}
[ -f "$QA/app.pid" ] && kill -0 "$(cat $QA/app.pid)" 2>/dev/null && { echo "already running: $(cat $QA/app.pid)"; exit 1; }
rm -f $QA/profile/SingletonLock $QA/profile/SingletonCookie $QA/profile/SingletonSocket
CL_COPILOT_E2E=$QA/e2e.json CL_KB_E2E=1 $ELECTRON . --user-data-dir=$QA/profile --remote-debugging-port=${CDP_PORT:-9341} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --disable-features=AudioServiceSandbox > $QA/app.log 2>&1 &
echo $! > $QA/app.pid
echo "started $(cat $QA/app.pid)"
