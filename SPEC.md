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
