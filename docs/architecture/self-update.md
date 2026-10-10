# Self-update

Settings › Updates keeps Careerloom current from GitHub Releases. Builds are unsigned, so Squirrel and
electron-updater are not used; the app verifies and installs the release itself.

## Flow

1. **Check** (`electron/updates.ts`): read the latest release from `livelong99/careerloom` through the REST API.
   Drafts and pre-releases are skipped. The result carries notes, publish date, the asset for this machine and any
   blocker.
2. **Pick the asset** (`electron/self-update/release.ts`): macOS `.zip` for the CPU architecture; Windows
   `Careerloom-Setup-<version>.exe`.
3. **Download** (`updater.ts`): only from `github.com/livelong99/careerloom/releases/download/…`. Redirects are
   followed only to `github.com` or `*.githubusercontent.com`. Cap 800 MB. Progress is streamed to the page and can be
   cancelled.
4. **Verify**: SHA-256 of the download must equal the `digest` GitHub publishes for that asset. A missing or
   mismatched digest refuses the install.
5. **Install**
   - macOS: unzip with `ditto`, then a detached `/bin/sh` script waits for the app to quit, moves the old bundle to a
     backup, copies the new one in, clears quarantine with `xattr -cr`, relaunches with `open`, and restores the backup
     if the copy fails (`mac-install.ts`).
   - Windows: run the NSIS installer silently (`/S --updated`) and quit.
6. If runs are active the user is asked first; **Update now** is refused with `runs-active` unless confirmed.

## When in-place update is unavailable

The page explains why and links the release: development builds, an app that is not a bundle, running from a mounted
disk image or a translocated path, an application folder that is not writable, Linux, and Store-managed installs.

## Releasing

Bump `package.json`, add `docs/releases/v<version>.md`, merge, then tag `v<version>`. `release.yml` builds the macOS and
Windows installers and attaches them to a draft release; publish the draft. GitHub computes each asset's digest on
upload, which the updater relies on.

## Not covered by automated tests

A real end-to-end update (needs a published release newer than the running build) and the Windows installer path.
