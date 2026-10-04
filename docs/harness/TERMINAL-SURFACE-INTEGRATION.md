# Terminal surface integration

Canonical direction: MASTER-DESIGN-DIRECTION.source.txt. Status: IMPLEMENTING.

Goal: the real Ink terminal presents current intent and sourced work on one
flowing character grid, with permanent input and temporary inspection.
Completion requires runtime evidence at all four prescribed sizes and preserved
editing, scrolling, steering, cancellation and model selection.

System: durable EventStore -> producer projection -> read-only surface snapshot
-> Ink viewport. Existing entry identity and raw inspection remain authoritative.
No component reads files, chooses work or upgrades a proposal into proof.

Requirements and acceptance:

| ID | Requirement and acceptance | Verification |
| --- | --- | --- |
| TS01 | Current original intent and corrections come from objective records; plans from the current objective revision only; workers retain durable IDs and explicit unverified result status. | Projection tests, producer inspection |
| TS02 | One global progress indicator; no project container, path, read counts or repeated working status. Empty state is quiet. | Render tests |
| TS03 | Work renders as compact branches. Successful routine tools contract; failed tools and evidence remain readable. Arbitrary model text is never promoted to Human Delta or proof. | Render and projection tests |
| TS04 | Input, draft, history, menus, scrolling, cancellation and live steering survive. | Existing UX integration suite |
| TS05 | Input and current intent survive 80x24,120x30,160x50,240x70 and resizing. | Real PTY plus rendered frames |
| TS06 | Typecheck delta, build and relevant regression suite have recorded results. | Commands and evidence ledger |

Finite graph: T1/P0 projection (TS01); T2/P0 layout and branches (TS02,TS03,
depends T1); T3/P1 behavioral regressions (TS04, depends T2); T4/P1 terminal
proof (TS05, depends T3); T5/P1 static/build/closure (TS06, depends T4).
All currently IN_PROGRESS or pending verification. No DONE without evidence.

Risks: stale plans misrepresented as running (high, reject revision mismatch);
proposals misrepresented as proven (high, explicit labels); narrow viewport
losing intent/input (high, bounded current-context budget); inherited dirty tree
regressions (high, preserve changes and run regression checks).

Coverage: UX/loading/empty/error/cancel/restore/idempotency/accessibility,
performance/contracts/logging/diagnostics/testing/build/rollback applicable.
Authentication, authorization, networking, persistence and privacy retain existing
boundaries; this read-only projection introduces no credentials, effects or schema
migration. Packaging is existing source launcher. No deployment needed. Rollback
is limited to this integration's diff, never reset the inherited working tree.

Known product gaps: no typed Human Delta stream or knowledge routing event exists
in the present producer. Do not fabricate either. Full scheduler, resource mesh,
peer-to-peer and agent assistance remain separate product work.

Manual acceptance after automated proof: launch Cuesheet, give a real intent,
correct during execution, inspect evidence, browse history, select a model and
resize. Judge coherence against the master, not the rejected HTML prototype.

## Verification progress

2026-10-03: projection tests 2/2 PASS; surface quality tests 5/5 PASS
before multiline extension; terminal behavioral/model/exactly-once suite 24/24
PASS; real PTY render proof PASS at all four master sizes. Build PASS with
32 documented inherited root diagnostics. Terminal typecheck retains three
inherited diagnostics in shell.ts, memory.ts and store.ts, none in the new
projection or modified components. git diff --check PASS.

T1, T2 and T3 have implementation and partial behavioral evidence. T4 has
four-size PTY evidence, pending final multiline verification. T5 remains
VERIFYING. Broad regression initially failed old French string assertions in
agent consultation, shared context and workspace pages. English oracles were
updated without changing behavior assertions. A targeted workspace test also
exceeded its 10-second wait during heavy concurrent load; isolated rerun pending.
These are not grounds for READY_FOR_MANUAL_ACCEPTANCE yet.

Added required verification repair T6/P1: reconcile translated UI test oracles
and classify rerun failures (depends T3; acceptance TS04 and TS06).

Current unresolved product limitations remain explicit: no native typed Human
Delta production stream and no Knowledge Delta Routing. The renderer only gives
a distinct appearance to an explicitly delivered human-delta status; it never
extracts one from free-form model prose. No claim of full master implementation.

Mac keyboard steering: canonical newline is Control+O, which emits a distinct
control byte without terminal Option configuration. Option+Enter is an alias
when the terminal sends ESC+CR. UI labels use Control+O, never an unlabeled Alt
key. Return remains send; multiline paste retains normalized line breaks.

Latest verification note: broad run stopped by the agent after machine load
rose above 170. It is not a PASS. Log: terminal-integration-tests.log. Known
remaining reruns include installed recovery (old French labels corrected),
provider selector timeout under load, and final Control+O runtime proof. No
other application was stopped or reconfigured. Prior four-size render and
24-case behavior evidence remain historical evidence for the tested revision,
not a blanket PASS for the latest edit.

Control+O runtime proof subsequently PASS: current-intent render test exercises
Control+O, ESC+Return alias, paste and all four master sizes; editor grapheme
regression PASS after preserving line breaks. Final affected UI suite runs in
series and records terminal-integration-targeted.log.

T7/P1 verification harness repair: external renderer-process deadlines in the
affected UI fixtures increase to 30 seconds (matching the existing exactly-once
harness) after repeatable 143/SIGTERM child timeouts at 10, 15 and 20 seconds
under host saturation. No interaction delay, model/tool deadline, state assertion
or application timeout is relaxed. Runtime latency is not claimed from these
fixtures. T7 remains VERIFYING until the same behavior assertions pass.

T8/P0 defect discovered in real PTY: literal-CR handling for ESC+CR also
intercepted ordinary Return. Fix distinguishes key.return from the stripped
Option sequence. TS07 acceptance: Control+O and ESC+CR insert line breaks;
ordinary CR submits the intact multiline draft once and clears it. New rendered
input test asserts all three paths, and existing real PTY cancellation/resubmit
checks remain required. Status VERIFYING, evidence pending final serial rerun.

Final affected suite: 39/39 PASS on the latest keyboard/semantic surface source
(terminal-integration-targeted-final.log). Build refreshed PASS, root baseline
32 diagnostics retained; terminal three known diagnostics retained, no new
changed-file errors. Final PTY rerun under load missed markers after 9 seconds
and coalesced input in one case. Driver now waits for visible composer receipt
before Return, fails immediately on absent receipt/result, and cleans up its PTY
in finally. A second four-size proof is running.

Discovered open P1 input-boundary risk: Ink interprets each stream read as one
keypress. Under prolonged host stalls, text and Return can coalesce and become
draft text. The deterministic driver handshake prevents accidental test-step
coalescing, but is not a production fix. Production framing requires keyboard
vs bracketed-paste boundaries so multiline paste is never accidentally sent.
This is T9/P1 REQUIRED_FOR_COMPLETION for robust overloaded-terminal input,
currently TODO. Do not claim full input maturity from the handshake proof.

T9 implementation gate: input adapter produces object-mode logical keyboard
packets, preserving CSI keys and UTF-8 fragments; bracketed paste carries a
sideband marker so Return/tab/control bytes inside paste cannot act as commands.
Composer keeps a synchronous editor ref for sequential packets read in one
turn; App ignores global shortcuts on paste. Production and PTY fixture enable
and restore bracketed-paste mode. Acceptance: batched text+Return submits once;
batched steering preserves each human identity; fragmented Unicode stays intact;
fragmented multiline paste changes draft only; Escape/mouse keys retain behavior.
Unit adapter tests plus real rendered input and the existing 39-case suite are
required. No journal schema, authorization, model or provider setting changes.

## Current closure, supersedes pending notes above

Bounded integration status: READY_FOR_MANUAL_ACCEPTANCE. Parent product remains
IMPLEMENTING. Automated checks are complete for this change, human experiential
acceptance remains pending. T1 through T9 are verified for this bounded scope:

| Work | Evidence |
| --- | --- |
| T1 projection | work-surface and agent-consultation tests |
| T2 flowing layout | surface-quality tests and four-size PTY |
| T3 interaction regressions | terminal-ux, model UI, shared context and exactly-once tests |
| T4 viewport and resizing | surface-quality test plus 80x24,120x30,160x50,240x70 PTY |
| T5 static/build | build PASS, diff check PASS, terminal typecheck baseline unchanged |
| T6 translated oracles and workspace recovery | runtime suite 14/14 plus installed recovery 1/1 |
| T7 renderer deadlines | final affected renderer suite PASS with assertions retained |
| T8 Return vs newline | ordinary Return, Control+O and ESC+CR rendered assertions PASS |
| T9 input packet boundaries | four adapter tests and real rendered burst/paste assertions PASS |

Latest final source evidence:
- terminal-integration-packets-final.log: 38/38 PASS.
- terminal-integration-runtime-final.log: 14/14 PASS.
- terminal-integration-recovery-final.log: installed recovery 1/1 PASS at both widths.
- terminal-integration-pty-final.log: four master sizes PASS. This uses a scripted
  producer with the real Ink/PTY shell, not a live provider or production Human Delta.
- terminal-integration-build-final.log: packaging build PASS, 32 inherited root
  diagnostics emitted. terminal-integration-typecheck-final.log: exit 2 from
  three inherited diagnostics in shell.ts, memory.ts, store.ts; none in changed
  files. This is a differential verification, not a clean repository typecheck.
- git diff --check PASS.

Input EOF cancels the Escape timer and flushes pending input without pushing
past EOF. Recovery menu verification now waits for each selected row before
sending the next key, and does not confuse inline interrupted workers with
successful Agents navigation. Existing provenance/cost/private-journal assertions
remain intact.

All four integration risks above have automated mitigation evidence. Remaining
limits: full broad suite was interrupted and is not a PASS; native Ghostty control
is unavailable in this session, so owner live acceptance is pending; typed Human
Delta, routing, scheduler, resource mesh and P2P are not implemented by this
surface integration. No parent/global DONE or full product completion is claimed.

Mac QWERTY reference: Return sends; Control+O inserts a newline; Control+P opens
models; Control+K opens commands. Option is optional, no Alt-labelled default.
Reload the source launcher to use the updated runtime; running sessions are not
killed or silently restarted.
