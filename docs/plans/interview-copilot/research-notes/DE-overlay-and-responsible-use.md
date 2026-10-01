# Parts D and E: Electron overlay techniques, and responsible use

Research, not legal advice. Date: 2026-10-01. V = verified against a fetched page (fetch tool returns model-written summaries of pages, so quotes are as returned). I = inference. "Vendor blog" sources are competitor or marketing pages; treat as low reliability.

Installed Electron: package.json declares `"electron": "^43.7.0"` (line 58). `node_modules/electron` is NOT present in this worktree, so the installed version is unverified. The caret range would resolve to 43.x only. Docs fetched were "latest", which may be newer than 43.

---
## PART D - Electron overlay window techniques

### D1. Always-on-top levels (z-order)
- V: `setAlwaysOnTop(flag[, level][, relativeLevel])` levels: normal, floating, torn-off-menu, modal-panel, main-menu, status, pop-up-menu, screen-saver, dock (deprecated). Default is `floating`. "from `floating` to `status` included, the window is placed below the Dock on macOS and below the taskbar on Windows. From `pop-up-menu` to a higher it is shown above the Dock on macOS and above the taskbar on Windows." https://www.electronjs.org/docs/latest/api/browser-window
- I: a Windows "level" is a Chromium approximation (topmost band), not a macOS-style window level; no documented difference beyond the taskbar note above. Use `screen-saver` only if the overlay must cover taskbar/Dock; `floating` or `status` is the least intrusive.
- V (third-party, vendor/blog): common stack for overlays is `setAlwaysOnTop(true,'screen-saver',1)` + `setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})`. https://levelup.gitconnected.com/how-i-made-a-desktop-app-invisible-to-screen-sharing-electron-os-level-tricks-5734513c1e67 and https://syobochim.medium.com/electron-keep-apps-on-top-whether-in-full-screen-mode-or-on-other-desktops-d7d914579fce
- Electron PR adding window-above-fullscreen on mac: https://github.com/electron/electron/pull/14122

### D2. Focus: no focus steal
- V: `win.showInactive()` shows without focusing; not supported on Wayland. `win.setFocusable(false)`: "On macOS it does not remove the focus from the window." https://www.electronjs.org/docs/latest/api/browser-window
- V (Tauri spike, transferable concept): a truly non-activating overlay on macOS needs NSPanel with NonactivatingPanel style, `canBecomeKeyWindow=false`, `hidesOnDeactivate=false`, and collection behaviors canJoinAllSpaces/fullScreenAuxiliary; the same issue says Electron's `setAlwaysOnTop`+`setVisibleOnAllWorkspaces` is "more battle-tested" than that plugin, and warns dev vs release builds behave differently for level/collection behavior (test on a signed build). https://github.com/ilyanfraimbault/TrueMain/issues/1673
- I: Electron `type:'panel'` (macOS) is the built-in route to a panel-like window; the BrowserWindow page fetch did not return the exact `type` text, so its precise semantics (non-activating or not) are UNVERIFIED. A search result blog claims panels "float above other apps without stealing the active state" (https://levelup.gitconnected.com/... above, blog-quality). Test empirically.
- I: a no-text-input, mouse/hotkey-only overlay sidesteps most focus problems. Anything with text input should live in a normal window.

### D3. Click-through and hover regions
- V: `setIgnoreMouseEvents(ignore, {forward:true})` (macOS, Windows): forwards mouse-move to Chromium so `mouseleave`/hover work. Documented pattern: renderer detects hover on interactive element, preload IPC to main, main toggles `setIgnoreMouseEvents(true,{forward:true})` off/on. https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- V: transparent windows: "You cannot click through the transparent area" by default; not resizable (setting `resizable:true` "may make a transparent window stop working on some platforms"); transparency disabled when DevTools open; Windows cannot maximize via title bar; macOS no native shadow. https://www.electronjs.org/docs/latest/tutorial/custom-window-styles
- I: standard pattern = start with ignore+forward true; on `mouseenter` of a panel element send IPC to set ignore false; on `mouseleave` set back. Forward is macOS/Windows only (not Linux).

### D4. Draggable regions vs click-through
- V: `-webkit-app-region: drag` areas "ignore pointer events", so buttons inside must be `no-drag`; drag can conflict with text selection (use `user-select:none`); avoid custom context menus on drag regions. https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- I: drag regions are handled at the OS/window level, so they interplay poorly with JS-driven hover toggling of ignore-mouse (hover events in drag region will not fire). Keep the drag handle a small dedicated strip and set ignore=false while the pointer is over it (detect via window bounds/`screen.getCursorScreenPoint` poll if needed). UNVERIFIED by a source; test.
- V: resizing transparent windows is unreliable (above). I: implement resize by `setBounds` from your own grip handle, or keep the window fixed size and resize inner content.

### D5. Opacity
- V: `setOpacity(0.0-1.0)`, clamped. https://www.electronjs.org/docs/latest/api/browser-window . I: prefer CSS alpha for the panel and keep window opacity 1 for legibility and so the hit-test behaves predictably (not source-backed).

### D6. Full-screen apps, Spaces, dock hiding (macOS)
- V: `setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})` shows above fullscreen windows; `skipTransformProcessType` avoids the process type transform that can hide the window/dock icon during the call. `setFullScreenable(false)` makes the green button maximize instead of fullscreen. https://www.electronjs.org/docs/latest/api/browser-window
- V (blog-quality): calling `setVisibleOnAllWorkspaces` with visibleOnFullScreen turns the app into a UIElement-like process and hides the dock icon unless `skipTransformProcessType` is used; fix is `app.dock.show()` afterwards. The fetched docs only confirm the option exists; the dock side effect is I (widely reported, not re-verified here).
- I: for a pure overlay that should not appear in Dock/Cmd-Tab, `app.dock.hide()` plus a tray icon is the common pattern; then you need the tray as the only visible control (see D9).
- I: apps in native macOS fullscreen live in their own Space; only windows with fullScreenAuxiliary collection behavior appear there. Another app in "exclusive" fullscreen on Windows (games) may still hide topmost windows; unverified.

### D7. globalShortcut caveats
- V: `register()` "will silently fail" if another app owns the accelerator; returns false; `isRegistered` also false for conflicts. Media keys on macOS 10.14+ need accessibility trust. Wayland needs portal identity + user consent. Unregister in `will-quit`. https://www.electronjs.org/docs/latest/api/global-shortcut
- I: check the return value and surface "shortcut unavailable, choose another" in settings; allow rebinding; avoid common combos (Cmd+Shift+3/4/5, Cmd+Space, Alt+Tab). Shortcuts only work while the process is alive. Keyboard layouts can change accelerator meaning.

### D8. Windows specifics
- V: Windows levels: floating..status sit below the taskbar; pop-up-menu and higher above it (same doc). Click-through forward works on Windows.
- I: some exclusive-fullscreen DirectX apps ignore topmost overlays; DPI scaling per monitor matters for `setBounds` (use DIP and the `screen` API).

### D9. Multi-monitor
- I (standard Electron API, not fetched): use `screen.getAllDisplays()`, `screen.getDisplayNearestPoint()`, `display-added/removed/metrics-changed` events to re-anchor the overlay; store bounds per display id. UNVERIFIED in this session.

### D10. setContentProtection (hide from capture) - facts and caveats
- V: Windows calls `SetWindowDisplayAffinity`; macOS sets `NSWindow.sharingType = NSWindowSharingNone`. https://www.electronjs.org/docs/latest/api/browser-window
- V: Windows 10 2004+ window is removed from capture entirely; older Windows behaves like `WDA_MONITOR` (black window). https://github.com/electron/electron/pull/24274 (search snippet)
- V: Electron 44 broke protection in Windows remote sessions (Chromium change for Picture-in-Picture); `isContentProtected()` still returned true; fixed via `AllowWindowCaptureExclusionInRemoteSessions` in 44.x, 45.x, 46.x. The PR text says "as it is on version 43", so 43 is not affected. https://github.com/electron/electron/pull/54492
- V: Windows behavior change reported: protected windows appear black vs transparent during capture. https://github.com/electron/electron/issues/45990 (title only)
- V (issue thread, Apple forum claim relayed): on macOS 15+ ScreenCaptureKit ignores `sharingType = .none`; "deliberate change by Apple"; "no known workarounds". So on modern macOS, `setContentProtection(true)` does NOT reliably hide from Zoom/Meet/Teams or other ScreenCaptureKit-based capture. https://github.com/tauri-apps/tauri/issues/14200 (Tauri issue, same underlying API; original Apple forum post not fetched)
- V: Signal Desktop's equivalent protection was bypassed on Windows (IOActive write-up title only). https://www.ioactive.com/signal-windows-desktop-contentprotection-bypass/
- Guarantees: it only stops OS-compositor-level capture. It does not stop a phone camera, hardware capture card, remote-desktop tools using other paths, process/window enumeration, or proctoring software that lists running processes. (I)
- Also affects YOUR product: protected windows appear black/absent in your own QA screenshots and in screen recordings you make for demos.

### D11. Accessibility
- I (no source fetched; standard WCAG practice, not verified here): overlay must be keyboard operable (global shortcuts for show/hide/next/copy; focusable controls when the window is focusable), have text contrast >= 4.5:1 against any backdrop (use a solid or strongly dimmed panel, not bare transparency), honor `prefers-reduced-motion` (no auto-scrolling/fade loops), expose ARIA live region (`aria-live="polite"`) for streaming text so screen readers announce updates, and scale with OS font size. A non-focusable window cannot be reached by screen readers via focus; provide a normal-window "reader view" of the same content.

### D12. Crash/kill-switch patterns
- V: unregister shortcuts in `will-quit` (globalShortcut page above).
- I: (a) panic hotkey that does `win.hide()` + stops capture + stops network, registered separately from normal hotkeys; (b) tray menu item always present ("Stop and hide"); (c) a visible "recording" indicator that is driven by the same state as the audio capture, so UI can never claim off while capture is on; (d) stop audio capture in `before-quit`, `window-all-closed`, `render-process-gone`, and `process.on('uncaughtException')`; (e) main-process watchdog: renderer heartbeat over IPC, kill capture if it stops; (f) a click-through overlay that crashes can leave an invisible full-screen window blocking nothing, but a non-click-through one can block the screen, so keep the window small and always recoverable from tray. All UNVERIFIED design advice.

---
## PART E - RESPONSIBLE USE

### E1. Recording and transcription consent
- V: Federal Wiretap Act one-party rule: lawful for a person not acting under color of law to intercept where they are a party or one party consents, unless for a criminal or tortious purpose. 18 U.S.C. 2511(2)(d), https://www.law.cornell.edu/uscode/text/18/2511
- V: commonly cited all-party (two-party) states:
  - Wikipedia list: California, Connecticut (electronic only), Florida, Hawaii, Illinois, Maryland, Massachusetts, Montana, New Hampshire, Oregon, Pennsylvania, Washington. https://en.wikipedia.org/wiki/Telephone_call_recording_laws (Wikipedia; Oregon and Hawaii have narrower rules, per the page's own qualifiers as summarized)
  - A compliance vendor list: California, Connecticut, Delaware, Florida, Illinois, Maryland, Massachusetts, Montana, Nevada, New Hampshire, Pennsylvania, Washington. https://vibe.us/blog/one-party-two-party-consent-states/ (vendor blog)
  - Lists differ on Delaware, Nevada, Hawaii, Oregon. Safe UI rule: treat the union as all-party and ask the user to confirm the jurisdiction of all participants. Statutes vary on "oral" vs "electronic" vs expectation of privacy; "all-party" is a colloquial label. Multi-state calls: commonly advised to follow the stricter state (I).
- I (key point): audio from an interviewer played through the user's speakers and transcribed, or system audio captured, is a recording of the OTHER party. The user IS a party to the conversation, so federal and one-party states are generally fine; in all-party states, or where participants are in another jurisdiction, the interviewer's consent is needed. Product cannot rely on the user being in a one-party state.
- EU/UK: V: UK GDPR has six lawful bases (consent, contract, legal obligation, vital interests, public task, legitimate interests) plus a seventh "recognised legitimate interest"; special category data needs a lawful basis plus a condition. https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/ . The ICO page did not address voice biometrics. V (Wikipedia): UK "A recording made by one party to a phone call without notifying the other is not prohibited provided that the recording is for their own use" but sharing it with others is. https://en.wikipedia.org/wiki/Telephone_call_recording_laws . I: a recording of a voice is personal data under GDPR; personal use exemption may apply to purely household activity but sending audio to a third-party cloud model (your LLM/transcription provider) makes the provider a processor and pushes toward needing a lawful basis, notice, and a DPA. Voice used to identify someone is biometric special category; transcription alone is generally not (I, unverified; EDPB guidance not retrieved).
- Canada: V (law-firm pages via search): one-party consent under Criminal Code s.184(2); participant may record. https://www.torontodefencelawyers.com/crime-record-a-conversation/ ; Wikipedia adds organizations need meaningful consent under PIPEDA.
- India: V (secondary sources): participant recording generally treated as permissible (R.M. Malkani v State of Maharashtra 1973); privacy/Article 21 and BNS provisions risk for recording others. https://sonetel.com/en/help/help-topics/telephony/free-call-recording/is-it-legal-to-record-calls/is-it-legal-to-record-calls-in-india/ and https://recordinglaw.com/india-recording-laws/ . I: India DPDP Act 2023 obligations not researched here.
- Australia: V (secondary): state-by-state Surveillance Devices Acts; Victoria, Queensland, NT exempt participants; NSW, Tasmania, ACT have a personal-use type exception; WA and SA have no personal-use exception. NSW penalties up to $11,000 and/or 5 years cited. https://recordinglaw.com/australia-recording-laws/ and https://sydneycriminaldefenceandtrafficlawyers.com.au/blog/recording-conversations-in-nsw-when-is-it-illegal-to-record-without-consent/ . Wikipedia's blunter "may not be recorded unless informed" is the conservative reading.
- Platform behavior: V: Zoom shows a recording notification and optional consent dialog for its own recording; AI Companion enablement triggers an "agree/leave" disclaimer for all participants. A local app capturing system audio triggers none of these, which is precisely the consent gap. https://it.umn.edu/services-technologies/good-practices/zoom-ai-companion-risks-third-party-ai , https://it.ucsb.edu/zoom-ai-companion/terms-acceptable-use

### E2. Employer and interviewer policies on AI in live interviews
- V: Amazon (Feb 2025, per Business Insider via Futurism): "To ensure a fair and transparent recruitment process, please do not use GenAI tools during your interview unless explicitly permitted"; disqualification possible. Anthropic job postings (Feb 2025): wants to "understand your personal interest in Anthropic without mediation through an AI system." Goldman Sachs (June 2025, via Fortune): "We want to hear from our applicants in their own voice"; campus recruiting says it prohibits external sources incl. ChatGPT during interviews. https://futurism.com/companies-bragging-ai-job-applicants
- V (vendor blogs, low reliability): Google bans AI in standard loops while piloting Gemini in a code-comprehension round; Meta allows AI in some rounds. https://tryassistly.com/blog/companies-that-allow-or-ban-ai-in-interviews-2026 and https://unchartedcareer.com/blog/companies-that-ban-ai-in-interviews . Also a Johnson and Johnson-style candidate AI policy PDF exists: https://tbcdn.talentbrew.com/company/42859/cms/ai_policy/jh-cc-talentacquisition-fy25-aipoliciesforcandidates.pdf (title only; content not read).
- V: Google, Cisco, McKinsey reintroduced in-person interview rounds over AI-cheating concerns. https://www.entrepreneur.com/business-news/google-mckinsey-reintroduce-in-person-interviews-due-to-ai/496041 , https://www.axios.com/2025/08/12/in-person-job-interview-artificial-intelligence
- V (vendor blogs, stats unverified): detection via eye-gaze/reading-pattern analysis, response timing, process monitoring. https://brighthire.com/blog/detect-ai-cheating-interviews/ ; claims that CodeSignal/HackerRank flag Cluely by OS-level process monitoring come from competitor blogs (https://www.finalroundai.com/blog/does-cluely-work-on-hackerrank), UNVERIFIED independently. Practical read: hiding from screen share does not hide from process monitoring, eye movement, or an in-person round.
- News: V: Roy Lee suspended from Columbia (March 2025) after publicizing use of Interview Coder in an Amazon interview. https://en.wikipedia.org/wiki/Cluely , https://futurism.com/columbia-student-ai-cheating-startup (search snippet). Deepfake/impostor candidate cases: https://www.cnbc.com/2025/04/08/fake-job-seekers-use-ai-to-interview-for-remote-jobs-tech-ceos-say.html . Specific cases of a named candidate being disqualified for using a copilot were not found beyond the Lee/Amazon story; not verified whether Amazon formally rescinded.

### E3. How existing "undetectable" tools frame it, and consequences
- V: Cluely launched as "Cheat on Everything"; Interview Coder claimed to be "completely undetectable"; by late 2025 it removed cheating references and repositioned as a meeting assistant vs Otter; CEO later admitted misrepresenting revenue; seed $5.3M, Series A $15M (a16z). https://en.wikipedia.org/wiki/Cluely , https://www.cnbc.com/2025/03/09/google-ai-interview-coder-cheat.html (403, only via search summary)
- V (vendor blog): "undetectability" is sold as a paid upsell ($149.99/mo plan). https://tldv.io/blog/cluely-review/ (competitor blog, low reliability)
- Consequences (I, combined with the above V): candidate disqualification or rescinded offer; school discipline (Lee); employment termination if discovered later; possible misrepresentation/fraud claims; platform ToS violations; reputational and brand risk for the tool; and in all-party states, potential criminal/civil wiretap liability for covert recording. Also app-store and notarization/distribution risk is plausible but not researched.
- I: marketing stealth as the main selling point invites regulators, employers and press to classify the product as a cheating tool. Careerloom's existing memory says public text stays vendor-neutral and ships nothing hidden; stealth default would contradict a trust-first desktop job tool that holds the user's resume and pipeline.

### E4. Product policy options
| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Practice-only | Mock interviews, recorded locally, AI feedback, no live-call capture | No third-party consent issue, no policy conflict, simplest to ship | Less differentiated; users may seek other tools for real calls |
| B. Live mode, visible indicator + consent + policy acknowledgement | Overlay works on real calls; always-visible "listening" chip; per-session checklist; user confirms they are allowed and have consent | Strong legal posture, clear user responsibility, still useful for legitimate use (prep, meetings the user hosts, permitted-AI interviews) | Users in interviews that ban AI cannot use it without breaking rules; friction |
| C. Live + optional hide-from-capture | B plus a toggle for `setContentProtection` | Serves privacy needs (hiding notes from accidental screenshare of own desktop) | Toggle is exactly the feature that reads as cheating; on macOS 15+ it does not reliably work (V), creating false assurance; ethics and press risk |
| D. Stealth default | Hidden by default, no indicator | Maximal "undetectable" marketing | Highest legal, ethical, reputation, support risk; false promise on macOS; contradicts project values |

**Recommended default: B**, with A as the onboarding path and C not shipped initially (revisit only as a per-session, off-by-default, clearly worded "hide my own overlay from my screen share while I present" option, never marketed as undetectable). Rationale: legal exposure and dependence on platform behavior that Apple removed. (I)

### E5. Consent / acknowledgement UX spec (for option B)
Per-session gate shown before live capture starts (not once-ever):
1. Title: "Before you start a live session".
2. Mode line: "Careerloom will listen to audio from your microphone and, if enabled, from this computer's speakers, and send text to [provider] to suggest answers."
3. Checkbox 1 (required): "I am allowed to use AI assistance in this conversation. I have checked the employer's or interviewer's rules." Link: "What do common employers say?" (short neutral list with dates).
4. Checkbox 2 (required): "Everyone on this call has been told they are being recorded or transcribed, or I've confirmed the law where I and they are allows it." Link to a one-screen summary of one-party vs all-party, with "not legal advice".
5. Jurisdiction picker (optional but recommended): "Where are you and the other participants?" If any selected place is in the all-party list, show a stronger note and require a "Read the consent script" step with a copyable line: "I'm using a transcription tool for my own notes; is that okay?"
6. Audio source toggles default OFF for system audio (only mic on), each with a one-line explanation that system audio records the other party.
7. Buttons: "Start live session" (disabled until 3 and 4 checked) and "Practice instead" (goes to option A).
8. During session: persistent visible chip "Listening - Live" plus elapsed time, red when capturing system audio; chip cannot be hidden in live mode. Panic hotkey and tray item "Stop now" always present. Stopping sets chip to "Stopped" and ends capture before UI changes.
9. After session: "Delete transcript and audio now" default-on option; retention setting (default: delete audio immediately after transcription; keep text 7 days unless saved).
10. Stored (local, `~/.careerloom`, never uploaded unless the user uses cloud model): session id; timestamps; text of the acknowledged statements and their version id; checkbox states; jurisdiction selection; audio sources used; model/provider name; whether transcript saved. Not stored: raw audio by default, interviewer identity, employer name unless user enters it. Provide export and "delete all session records".
11. Disclose provider data flow on screen ("audio is transcribed on this device" vs "sent to X") and link to provider terms.
12. Accessibility: gate is a normal focusable window with labeled checkboxes, keyboard only, screen-reader friendly.

---
## Could not verify
- Installed Electron version (no node_modules); Electron 43-specific doc text; `type:'panel'` exact semantics; dock-hide side effect of `visibleOnFullScreen`; fullscreen-exclusive Windows behavior; multi-monitor and accessibility items are inference from general knowledge.
- Apple's original forum statement about ScreenCaptureKit and `sharingType` (relied on a Tauri issue).
- Electron issue 45990 and IOActive/Signal details (titles only).
- EDPB guidance on voice data; India DPDP Act obligations; statutory text for state wiretap laws; exact Hawaii/Oregon/Delaware/Nevada rules.
- CNBC, Cornell Wikipedia-list-of-states page (404) and some pages returned 403; detection-tool claims are from competitor vendor blogs.
- Whether any candidate was formally disqualified for using a live copilot (beyond the Lee/Amazon story).
