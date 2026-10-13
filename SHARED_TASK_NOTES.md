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
