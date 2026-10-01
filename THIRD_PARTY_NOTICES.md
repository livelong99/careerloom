# Third-party notices

Careerloom is licensed under the MIT License (see [LICENSE](LICENSE)), except where noted below.
This file lists the code, data and models Careerloom derives from, bundles, or downloads at runtime.

## Code derived from other projects

### codeburn — MIT License
The desktop shell (Electron main/preload structure, packaging, dashboard layout and charts) is derived from
[getagentseal/codeburn](https://github.com/getagentseal/codeburn).

Copyright (c) 2026 AgentSeal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Open-Cluely — the repository owner's own project
The Interview Copilot (`electron/copilot/**`, `renderer/overlay/**`) ports parts of Open-Cluely, written by the same
owner as Careerloom and reused by them under Careerloom's MIT License: overlay window handling, global shortcut set,
panic/emergency hide (as a real kill switch), rolling transcript window and request queue, prompt domain routing,
model-rotation failover, PCM capture worklet and audio pipeline. Each ported file carries the header
`// Ported from Open-Cluely (owner's project), adapted for Careerloom`. Its process/app-identity disguise,
near-invisible window tricks, plaintext key file and LAN companion are not ported.

### Paperclip — MIT License
Chat, command palette, board and card components are adapted from [Paperclip](https://github.com/paperclipai/paperclip).

Copyright (c) 2025 Paperclip AI — licensed under the MIT License (same terms as above).

### VoiceStudio — AGPL-3.0-only (pending replacement)

> [!WARNING]
> The files below are adapted from VoiceStudio (Copyright 2024-present Palash Debnath and VoiceStudio contributors),
> which is licensed under the **GNU Affero General Public License v3.0 only**. The MIT License in this repository
> **does not apply to these files**; they remain under AGPL-3.0 until they are replaced with MIT-licensed
> equivalents (e.g. upstream [shadcn/ui](https://github.com/shadcn-ui/ui)). Replacing them is tracked as a
> known issue. Do not distribute builds that include them under terms incompatible with the AGPL-3.0.

- `renderer/components/ui/badge.tsx`
- `renderer/components/ui/button.tsx`
- `renderer/components/ui/card.tsx`
- `renderer/components/ui/dialog.tsx`
- `renderer/components/ui/dropdown-menu.tsx`
- `renderer/components/ui/input.tsx`
- `renderer/components/ui/progress.tsx`
- `renderer/components/ui/select.tsx`
- `renderer/components/ui/slider.tsx`
- `renderer/components/ui/table.tsx`
- `renderer/components/ui/tabs.tsx`
- `renderer/components/ui/textarea.tsx`
- `renderer/components/ui/toggle-group.tsx`
- `renderer/components/ui/toggle.tsx`
- `renderer/components/ui/tooltip.tsx`
- `renderer/lib/utils.ts`
- `renderer/styles/tw.css`

## Bundled dependencies

| Package | License |
|---|---|
| [yaml](https://github.com/eemeli/yaml) | ISC |
| [tldts](https://github.com/remusao/tldts) | MIT |
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`, legacy build only; reads the text layer of your rendered résumé for the ATS parse check) | Apache-2.0 |
| [Electron](https://github.com/electron/electron) and its Chromium runtime | MIT and bundled third-party licenses (shipped as `LICENSES.chromium.html` in the app) |

Development-only dependencies (React, Vite, Tailwind CSS, Radix UI, TanStack, dnd-kit and others) are listed in
`package.json` under their own licenses; they are compiled into the renderer bundle where used.

### shadcn/ui registry components — MIT License
`renderer/components/ui/{accordion,alert,button-group,empty,field,hover-card,item,kbd,radio-group,resizable,sonner,spinner}.tsx`
were added from the official [shadcn/ui](https://ui.shadcn.com) registry (© shadcn, MIT), adapted to import `cn` from
`@/lib/utils` and to read Careerloom's theme. They use `sonner` (© Emil Kowalski, MIT) and `react-resizable-panels`
(© Brian Vaughn, MIT).

The ATS engine's skill vocabulary, scoring weights and prompts are written for this app. No OpenResume code, pyresparser
or Lightcast data is used, and no ESCO or O*NET data is used by the ATS engine.

## Data and model

### Pre-screen base model
The job pre-screen ships a small classifier head (`electron/fit-base-head.ts`) trained on public data:

- **ESCO** — Contains ESCO data. © European Union, ESCO, https://esco.ec.europa.eu — reused under the
  Commission Decision 2011/833/EU reuse policy. Occupation codes via
  [serbog/esco_occupations_details_multilingual](https://huggingface.co/datasets/serbog/esco_occupations_details_multilingual).
- **TechWolf JobBERT evaluation dataset** — Job titles from the TechWolf JobBERT evaluation dataset
  (Decorte et al., 2021), MIT License — © TechWolf.
  [TechWolf/JobBERT-evaluation-dataset](https://huggingface.co/datasets/TechWolf/JobBERT-evaluation-dataset)

### Downloaded at runtime (not bundled)
These are installed on the user's machine only when the user opts in, each under its own license:

| Component | License | When |
|---|---|---|
| [Manav2op/verdict-small](https://huggingface.co/Manav2op/verdict-small) | Apache-2.0 | Onboarding → Local model |
| PyTorch, Transformers, scikit-learn, NumPy, SciPy | BSD-3-Clause / Apache-2.0 | Onboarding → Local model |
| [@playwright/mcp](https://github.com/microsoft/playwright-mcp) | Apache-2.0 | Browser job boards |
| [Firecrawl](https://github.com/firecrawl/firecrawl) (self-hosted, separate program) | AGPL-3.0 | Integrations → Firecrawl |
| [career-ops](https://github.com/career-ops-hq/career-ops) | MIT | The user's own career-ops folder |
| [moonshine-voice](https://pypi.org/project/moonshine-voice/) `==0.1.5` (pinned) | MIT | Copilot → Transcription → Install local speech model |
| Moonshine speech models (`tiny`, `small`, `medium` English streaming models, fetched by the package from Moonshine AI) | Released by Moonshine AI for English under the MIT License; re-check each model card when the pin or model list changes (non-English Moonshine models use a separate community license and are not used) | Same install step |
| [mlx-whisper](https://github.com/ml-explore/mlx-examples) and [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | MIT | **Not installed yet**: the Whisper engines are listed as alternates in settings but have no adapter; nothing is downloaded for them |

### Humanizer skill (bundled text)
`electron/humanizer/SKILL.md` (mirrored in `skill.ts`) is the **humanizer** Agent Skill, version 3.1.0, from
[blader/humanizer](https://github.com/blader/humanizer), MIT License, Copyright (c) 2025 Siqi Chen.
It is used unmodified as instructions for an optional second pass over generated prose; its license text is
kept in `electron/humanizer/LICENSE`:

> MIT License
>
> Copyright (c) 2025 Siqi Chen
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
> to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above
> copyright notice and this permission notice shall be included in all copies or substantial portions of the
> Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
> LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
> SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
> OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
> DEALINGS IN THE SOFTWARE.
