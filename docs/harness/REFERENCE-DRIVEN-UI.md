# Reference driven terminal refinement

Owner approved implementation after visual comparison, 2026-10-03. Goal: understand the active intention, real work and published reasoning without losing input or context. This is a bounded correction of the working terminal, not a new product architecture.

References inspected in the browser: OpenCode homepage demo https://opencode.ai/ shows differentiated operation groups, inline agent activity, input and model context. Claude Code official terminal capture https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously shows deliberate hierarchy and a clearly separated composer. Codex product documentation https://openai.com/index/introducing-the-codex-app/ supports reviewable changes; its visual page was unavailable, so no screenshot observation is claimed. Borrow hierarchy and progressive disclosure; preserve the owner's single flowing surface and no permanent sidebars. Existing master design remains canonical. Latest explicit owner request authorizes published reasoning display despite the older source's no-chain-of-thought preference.

Design tokens retained: body #d6dbe4, muted #b5becd, quiet #a0aaba, activity #74a8fc, brand/evidence #7dd3c0, failure #e06c75. Font remains user's terminal monospace. One centered character column; intent at top during work, compact operation branches, bounded latest reasoning beneath, outcome history below, anchored input. No added cards, panels or modes. Review: a sidebar would conflict with master, so context remains inline; an unbounded reasoning paragraph would reproduce the defect, so keep the full stream in temporary inspection.

System: optional provider progress -> ephemeral store -> active Timeline header -> bounded wrapped live text; observed action entries -> compact tree; Tab -> scrollable full stream while active. Settling clears ephemeral progress and returns normal exactly-once timeline. No provider/model/agent defaults change, persistence schema, network/auth or deployment change.

Requirements and acceptance:
RF01: Active intention remains visible when reasoning exceeds screen height. Verify rendered frame after long Unicode reasoning, including 80x24.
RF02: Published reasoning stays readable in a bounded tail, separate from response text; full stream inspectable with Tab then PageUp/PageDown. Verify actual input controls and overlays.
RF03: Recent operations carry actual labels and certainty glyphs, never invented steps or agents. Verify mixed active/confirmed/failed fixtures and empty waiting state.
RF04: Composer remains visible and editable; normal final answer identity, model selection, resize and history retained. Verify existing render proof and provider UI tests; real PTY stream capture and draft editing.

Finite graph: RF-LAYOUT P1 DONE (RF01,RF03); RF-STREAM P1 DONE (RF02); RF-INSPECT P1 DONE (RF02); RF-VERIFY P1 VERIFYING depends all (RF01-RF04). Evidence pending.
Risks: rendering height hides input (high until four-size proof); stale progress already guarded by producer tests; duplicate status (mitigate single compact footer); hiding reasoning without access (mitigate scrollable inspection); native Mac behavior pending manual acceptance. Storage/security/migration/offline semantics N/A, UI projection only. Static check baseline has three unrelated terminal type errors; build baseline 25 unrelated errors. Performance bounds: stream 16K existing limit, visible tail bounded, no new timers. Rollback source edits only, no durable data changes.

Discovered RF-SHORTCUT P2 FOLLOW_UP: Ctrl+L did not open live inspection in the actual PTY captures; Tab did. The public hint therefore uses the exercised Tab shortcut, while existing Ctrl+L handling remains intact. No claim of Ctrl+L runtime verification. Tab on a slash draft retains command completion; clear the slash prefix or use the command palette to inspect.


Evidence and closure, 2026-10-03:
- RF-LAYOUT DONE: test/live-work-render.test.ts renders a 100-line Unicode stream at 80x24, 120x30, 160x50, 240x70; intention, latest reasoning, observed action marks and composer all remain visible inside height bounds.
- RF-STREAM DONE: same rendered integration test plus real default DeepSeek Flash captures reference-final-live-80.png, reference-final-draft-80.png, reference-final-live-120.png show changing published reasoning, persistent intention, editable draft and resize. The first two 80-column images were visually inspected. All captures in /Users/memo/projects/_reports/cuesheet-redesign-2026-10-03/.
- RF-INSPECT DONE: real Tab opens Published reasoning during inference, PgUp reveals earlier text, Esc returns with draft intact. Evidence reference-final-inspection.png, reference-final-inspection-up.png (visually inspected), reference-final-live-120.png. Rendered integration additionally verifies PgDown returns to latest text. Reading position is preserved as new wrapped lines arrive.
- RF-VERIFY VERIFYING: eight targeted UI/progress tests pass, four Mac command/motion tests pass, four-size main render proof passes, diff whitespace check passes, final build succeeds. Strict terminal typecheck still fails only on preexisting shell.ts58, memory.ts234, store.ts268 errors; no new terminal type error. Global product is not complete. The required static gate and native manual acceptance remain pending.

Layout risk mitigated by rendered tests and real 80-column captures. No high-risk unverified runtime change introduced. Published stream still capped at 16K by existing state, so inspection offers the full retained stream, not unlimited historical reasoning. Final/cancel clears this ephemeral text; it is not a durable transcript or proof. No claim that generated reasoning is a verified execution step.

Manual acceptance: relaunch cuesheet, send a task, confirm visible intention and progressing text; type a draft, Tab inspect, PgUp/PgDown, Esc, resize, confirm draft intact. Operation tree expands only from observed operations or the existing sourced worker projection. Theme and model defaults unchanged. RF-SHORTCUT P2 remains a follow-up, not claimed fixed. No commit or external publication performed.

Owner acceptance failed, 2026-10-03: attached terminal screenshot shows plan-only replies, claimed unavailable shell and held write prohibition. Owner explicitly rejects interactivity and functional usefulness. Layout/progress tests remain narrow evidence; they do not establish usable self development. Follow-up: EXECUTION-BLOCKER.md.
