# Cuesheet engineering relay

## Status
- Source: clean branch based on `origin/main` c60f709, detached installed runtime unchanged.
- Current focus: P0-MODEL-PRIORITY, one isolated UI + catalog slice.
- Upstream: PR #51 (v2 models), #53 (transport), #54 (picker), #55 (responsive FR), #56 (version) merged.
- Caveat: OpenCode's `models` lists catalog availability, **not** authenticated inference.
- Connected Mac auth list reports OpenCode Go, GitHub Copilot, Google, Nvidia, OpenCode Console and OpenRouter. This only proves credential declarations.

## Verification results (2026-10-13)
- Local OpenCode 2.0.27: 577 catalog entries; 547 associated with declared credentials, 30 unknown. No inference or credit usage.
- Five focused UI/catalog tests pass; `pnpm terminal:typecheck` and `git diff --check` pass.
- The full parallel `pnpm test` run failed on five tests while multiple Mac tasks were competing for resources: one agent-selector assertion used the previous footer copy (updated and now passes), two binary-model tests inherited the owner's global model preference, two worker integration tests timed out.
- Separate reruns prove: agent selector + UI/catalog 5/5; binary adapter 40/40 with 2 live-skipped in isolated XDG config; workers 8/8 with concurrency 1.
- Full suite still requires CI's clean environment to establish a green baseline.
- Manual live owner inference and visual review remain separate P0-LIVE/P0-VISUAL slices.

## Resumption rule
Read SPEC.md and this note; choose one slice, don't overwrite the dirty main checkout.

## Relay 2 — narrow PTY evidence
- Parent: #52 and #31. Initial proof on installed c60f709: 40×14 FAIL (RENDER_PROOF_HUMAN_DELTA truncated), 80×24 and 120×40 have to remain stable.
- Change: compact WorkFocus strips redundant left context until the meaningful evidence fits the small viewport; Timeline actions abbreviate labels at narrow widths, and user attribution is now "vous".
- Proof after change: 40×14 PASS, 80×24 PASS, 120×40 PASS. TypeScript PASS; diff check PASS.
- Do not claim a real owner visual review or authenticated model response. The actual local installed runtime still needs refresh after green CI.

## 2026-10-13 real Mac E2E / visual proof
- Owner Mac: OpenCode v2.0.27, Cuesheet on real node-pty with keyboard model selection, submit, resize and cancellation.
- Baseline defect: OpenCode model free-tier 403 and Google no-route both reported as generic provider error; initial actual model responded three times while terminal remained busy.
- Corrected source: OpenCode Go free-preview returns `BONJOUR-CUESHEET-OK` exactly once. Early journal `stagnation` accepts real step count 2 (previous validator erroneously expected 8, causing Invalid execution record). UI returns to `prêt`, while keeping goal non-verified.
- Screenshots generated from the PTY's rendered ANSI character grid (text contrast approximation, not macOS desktop capture): `/Users/memo/projects/_scratch/cuesheet-e2e-owner-20261013/screenshot-*.png`.
- Mac saved preference was inadvertently changed by first UI test; restored from earlier durable session to openrouter/google/gemma-4-26b-a4b-it:free. Later selector tests toggle session-only explicitly.
- Focused isolated tests: 72 pass, 2 live skipped. Typecheck green. Full parallel suite and GitHub CI pending.
- Outstanding: project-name auto-bind false positive; visual polish and real-terminal resize during an active run warrant another focused relay.

## P0 CI correction relay
- Keep this PR scoped to runtime repeat guard, actual execution journal and OpenCode v2 typed failures. Revert unrelated French palette/status styling; those belong in a separate UI PR because fixture coverage depends on stable strings.
- Update old fixtures that expected eight duplicate text-only inferences to expect one durable reply, two provider inferences and an honest unverified stagnation stop.
- On Mac: 123 impacted tests PASS using isolated XDG configuration and terminal TypeScript PASS. CI must establish the full clean baseline.

## Live E2E follow-up — 2026-10-13 afternoon
- Baseline b1cabae reproduced real OpenCode Go reply BONJOUR-CUESHEET-OK, but falsely bound the run to /Users/memo/projects/cuesheet from an isolated scratch cwd, and incorrectly claimed container isolation in local mode.
- Fixed lexical binding for hyphenated markers; real reply after fix showed the correct scratch path. No user repo mutations.
- Local tool status now uses the actual declared ToolRoute reason (explicitly states no OS confinement for local).
- Palette and project navigation translated to French while retaining search aliases.
- Narrow header hides the project label below 64 columns; model name and status remain visible.
- Evidence: /Users/memo/projects/_scratch/cuesheet-e2e-fixed-20261013 (terminal ANSI screenshots, not native desktop capture).
- Repeat live test in /Users/memo/projects/_scratch/cuesheet-e2e-complete-20261013 waits for run completion; record outcome before declaring full pass.
- Completed isolated live E2E via actual OpenCode Go provider: selected session-only, got BONJOUR-CUESHEET-OK, correct scratch cwd, true local tool route, final ready state, palette reopened, 40x14 and 120x40 resizes after inference. Terminal grid screenshots: /Users/memo/projects/_scratch/cuesheet-e2e-complete-20261013/screenshot-*.png.
- Post-fix focused suites: project binding + palette + human UX 24/24, scope-runtime/scope-resume/surface-v2 40/40, header new regression 1/1; terminal typecheck and 40x14 PTY proof passed. These screenshots are ANSI-grid approximations, not native macOS desktop images.

## 2026-10-13 model picker clarity — implemented in isolated branch
- Observed Mac OpenCode v2 catalog now at 579 entries, two matching longcat-2.5-preview-free.
- At 80×24 rendered two results, focused matching route and 2 sur 579 modèles; at 40×14 focused result remains visible. The compact viewport may show one item at once; arrows scroll and selection stays visible.
- Removed a repeated dot on every model, retained a single explicit 'compte déclaré, connexion non testée' line associated with selection.
- Regression: deferred catalog, premature Enter, scroll to last slot, no-match + failed implicit ID, manual opt-in. Existing first-run and agent-model fixtures updated.
- ANSI PTY grid screenshots stored at /Users/memo/projects/_scratch/cuesheet-model-picker-clarity-20261013/screenshot-models-{open,search,compact}.png (not macOS desktop captures).
- No real model inference in this slice; previous P0-LIVE evidence remains as recorded. UI layer only.

## 2026-10-13 UX1b actual macOS bracketed paste
- Reproduction before fix in scratch /Users/memo/projects/_scratch/cuesheet-composer-paste-pty-20261013: pasted string was polluted with [200~ and ESC[201~; no premature submit.
- After fix in /Users/memo/projects/_scratch/cuesheet-composer-paste-fixed-20261013: draft was 'Débutconst x=1;\nconsole.log(x);\n// fin'; transport markers absent and submits array stayed empty until bare Enter. The preceding 'Début' was deliberately already in the draft.
- Composer now strips OSC/CSI terminal-control framing but retains lines, tabs, and safe printable text. Existing Unicode editor and history semantics unchanged.
- Scoped to frontend; no real provider inference or owner preference mutation.
