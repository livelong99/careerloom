# Contributing to Careerloom

Thanks for helping. Bug reports, fixes, docs and board presets are all welcome.

## Setup

```bash
git clone https://github.com/livelong99/careerloom.git
cd careerloom
npm ci
npm run dev        # Vite + Electron with hot reload
```

Node 22. Before opening a PR, run what CI runs:

```bash
npm run typecheck && npm test && npm run build
```

## Ground rules

- **Small, focused PRs.** One change per PR; explain the why in the description.
- **Tests with code.** New logic gets a test next to it (`*.test.ts`); fix a bug with a test that fails first.
- **Conventional commits:** `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- **Keep files small** (under ~500 lines) and reuse existing helpers before adding new ones.
- **Never touch real data in tests.** Use fakes; QA on a cloned profile, not your own career-ops folder.
- **No secrets** in code, tests or screenshots. Test keys must be obvious sentinels.
- **Licences.** Only add code or data under a licence compatible with MIT, and list it in
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Do not copy from AGPL/GPL or non-commercial projects.
- **Nothing ML in installers.** Models and runtimes are installed by the user on demand.

## Finding something to work on

Look for [`good first issue`](https://github.com/livelong99/careerloom/labels/good%20first%20issue) and
[`help wanted`](https://github.com/livelong99/careerloom/labels/help%20wanted). Comment on an issue before starting
anything large so we can agree on the approach.

## Reporting bugs and security issues

Use the issue templates. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

By contributing you agree that your work is released under the [MIT License](LICENSE).
