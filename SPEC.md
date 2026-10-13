# Cuesheet — usability relay

## Goal
Launch `cuesheet`, select an actually configured model, submit a natural request, and receive the motor's response in a polished, responsive French terminal.

## Single task in this relay — P0-MODEL-PRIORITY
OpenCode v2 shows catalog models from providers without configured credentials. Prioritize models backed by a locally declared account **without claiming auth success** or spending credits. Preserve the manual entry and provider switch.

## Remaining separate slices
- P0-LIVE: real first-turn inference with user-authorized provider usage.
- P0-RESIZE: live PTY resizing across 40×14, 80×24 and 120×40.
- P0-VISUAL: coherent French labels and restrained human-first typography, including terminal screenshots.
- P0-INSTALL: reliable clean runtime upgrades and visible build revision.

## Acceptance for this slice
- Reads OpenCode auth metadata in a safe and bounded subprocess.
- Marks only explicit provider matches and never exposes credentials.
- Unmatched models remain searchable, not silently hidden.
- No account is described as verified until a real inference succeeds.
- Tests and TypeScript succeed.

## Relay 2 — P0-NARROW-PTY (2026-10-13)
At 40×14, the fixed focus line truncated the evidence identifier even though the timeline contained it; the PTY proof failed. Make the focus adaptive by omitting redundant prefix segments and preserving the result, and change the "you" label to French. Do not change the engine or hide the full timeline.
Acceptance: `node scripts/ui/verify.mjs 40 14`, `80 24`, `120 40` all pass, and terminal TypeScript passes.

## Live owner-Mac E2E P0 relay — 2026-10-13
- Use a clean isolated worktree and separate CUESHEET_SESSIONS. Open the actual Ink terminal under node-pty; choose the OpenCode Go free-preview model, save *session-only*, type a harmless no-file request, resize 100×30→40×14→120×40, inspect the rendered grid.
- A catalog entry is not proof of an accepted model route: OpenCode `opencode/cat-jam-free` returned HTTP 403 when invoked via Cuesheet's custom proposer; `google/gemini-2.5-flash-lite` gave provider.no-route. Explicit OpenCode Go `opencode-go/longcat-2.5-preview-free` returned a real reply.
- Identical model-only replies are not verification. Stop repeating after a second identical no-tool answer, emit only one observation, leave the goal open with a distinct stagnation record, and render an honest neutral status.
- Fix v2 typed provider errors safely without printing provider bodies, and remove misleading terminal claims about execution route.
- Open P0 issue: project-token binding can switch a scratch request to a project merely because its name appears inside a hyphenated phrase. Preserve current scope until explicitly resolved; do not auto-change this binding policy without a separate review.

## P0 CI correction relay
- Keep this PR scoped to runtime repeat guard, actual execution journal and OpenCode v2 typed failures. Revert unrelated French palette/status styling; those belong in a separate UI PR because fixture coverage depends on stable strings.
- Update old fixtures that expected eight duplicate text-only inferences to expect one durable reply, two provider inferences and an honest unverified stagnation stop.
- On Mac: 123 impacted tests PASS using isolated XDG configuration and terminal TypeScript PASS. CI must establish the full clean baseline.

## Live Mac E2E relay — correctness before polish
- P0: A safe scratch request containing BONJOUR-CUESHEET-OK must remain inside the scratch cwd, never silently bind to the Cuesheet repo. Explicit mentions of whole project names (including hyphenated names) still bind.
- P0: Display the effective tool-route policy, not a hardcoded container claim.
- Human UI: French palette labels and navigation, with legacy English search aliases.
- 40-column header: never let the long project name overlap the product name/status.
- Acceptance: isolated model selection, one real live provider reply, settled run, 40×14/80×24/120×40 PTY screenshots, and focused regression tests.

## UX5 relay 2026-10-13 — model selection clarity
- Browse 500+ OpenCode catalog references without repeating a badge on every row.
- Show filtered result count alongside total, and selected model's *declared but unverified* credential status (never imply successful inference).
- Keep the selection arrow in the usable list viewport at any row count.
- Enter during catalogue loading never applies a partial identifier; a no-match query never becomes an implicit free-text model ID. Tab remains an explicit manual-entry opt-in.
- Gate: real Ink keyboard render, real Mac node-pty 80×24→40×14, typecheck and clean CI. Preserve shell, existing sessions and real model credentials.

## UX1b relay 2026-10-13 — bracketed paste boundary
- Real macOS PTY revealed literal bracketed paste wrappers leaking into the composer draft and eventual model input. A valid pasted multiline block must retain line structure, whitespace, and Unicode graphemes without shell framing or ANSI injection.
- The frontend shall remove terminal control framing before draft edit, preserving CRLF (normalized by the existing editor) and tabs.
- Paste must not submit a turn; only a subsequent explicit bare Enter may send. No filesystem reads/tools during React render.
- Verify both pure edits/Ink and real Mac PTY before/after, plus 40×14/80×24/120×40 shell proof and clean CI.
