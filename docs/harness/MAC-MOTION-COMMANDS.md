# Mac motion and commands

Owner request 2026-10-03: Mac usage, smooth animations, many missing commands. Canonical product/design sources already read; continue one surface with nonblocking semantic SPAWN/ROUTE/SETTLE.

Requirements and acceptance:
MC01: centralized slash catalog exposes existing real UI/runtime actions, prefix completion with Tab, searchable command palette. Unknown slash and invalid UI args refuse locally without model inference; native memory/context/check commands preserve their controller authority. Menu ordering remains compatible. Commands: commands/help/model(s)/agents/agent-models/context/situation/notifications/workspaces/check/log(history)/sessions/new/resume/stop/steer/memory/motion/quit. Do not advertise nonexistent tools.
MC02: Mac word-left/right/delete support Meta b/f/backspace and CSI Option-arrow sequences; Unicode graphemes and AZERTY symbols preserved. Control shortcuts remain because Command shortcuts may be handled by host terminal; do not alter terminal preferences. Official reference: https://support.apple.com/en-lamr/guide/terminal/trmlkbrd/mac (Option as Meta).
MC03: 240ms model-route and worker spawn/settle color transitions, 25Hz presentation clock only while active, no artificial typing delay, UI/runtime input immediate. Motion off/env reduced-motion gives stable identical content and stops timers. No fabricated proof or progress.

System: registry -> App submit / Composer completion / Help / Palette dispatch. UI commands operate store/producer inspection methods; native commands stay producer-owned. Motion React context -> local hooks in Header/WorkContext/Activity. No schema/permission/provider/auth/network changes; motion choice terminal-local, startup respects CUESHEET_REDUCE_MOTION.

Finite graph: MC-DISCOVER DONE; MC-COMMANDS DONE; MC-MAC DONE; MC-MOTION DONE; MC-VERIFY IN_PROGRESS (native appearance and upstream static errors remain); MC-ACCEPT TODO manual native appearance. Scoped phase VERIFYING; global product remains IMPLEMENTING.

Coverage: empty/loading/error/cancellation/retry/persistence/backward compatibility/privacy/security/accessibility/performance keyboard/state interactions applicable. No new auth/API/migration/deploy/offline behavior; existing journal retained. Tests: actual rendered command dispatch, no inference for unknown/local commands, preserved draft, Mac word editing and fragmented CSI, timer reduction, input during pulse, real installed slash/menu/catalog/resize, required PTY render matrix. Build/typecheck reports pre-existing upstream errors separately. Source metadata and dirty changes preserved; no commit/reset.

Risks: hijacking slash-shaped natural content (mitigate explicit catalog/help local rejection), stale async inspection or double confirmation (unchanged authority), terminal render frame cost (bounded local hooks, no idle loops), unavailable native Cmd delivery (do not promise it), long command help clip (scroll/paging), reduced motion ignored (one context controlling timer hooks).

Verification evidence (2026-10-03):
- Installed terminal journey PASS: `/Users/memo/projects/_reports/cuesheet-mac-commands-2026-10-03/result.json`. Real help, completion, agents page, searchable menu, motion toggle, unknown-command refusal, Unicode word deletion, new session and quit. Two journals retained; no model inference for local actions. Default remains opencode-go/deepseek-v4.1-flash.
- First installed attempt failed because driver typed before raw-mode readiness. Second exposed an actual Ink Meta+Delete mapping defect: forward character deletion instead of previous-word deletion. Composer now handles Meta+Delete and Meta+Backspace together; installed third attempt passes. Earlier sessions preserved.
- Targeted terminal/UI regression suite: 30 passed. Final Mac/input suite after key fix: 8 passed, including actual ESC b / ESC DEL and fragmented Option CSI input.
- Required terminal render matrix passes 80x24, 120x30, 160x50, 240x70. Final build emits successfully; diff whitespace check passes.
- Strict static validation remains blocked by 3 preexisting upstream errors (shell defaultCwd, memory optional fields, store spread). Build reports 25 preexisting errors; neither strict typecheck nor overall product readiness is claimed.
- Actual component animation export: `/Users/memo/projects/_reports/cuesheet-mac-commands-2026-10-03/motion-frames.json`. Illustrative worker scenario, not delegated live work. Rendered component tests confirm intermediate frames, immediate input, and no animation repaint loop with motion off.
- Native Mac visual acceptance remains unverified because native app access was denied. PTY rendering and exported component frames do not replace that acceptance. No critical new implementation risk found in bounded checks; overall self-host/recovery acceptance remains outside this completed implementation slice.
