# Provider UX todo

The consolidated remaining product backlog is [harness/TODO.md](harness/TODO.md).
This file records the completed provider slice and its historical validation.

- [x] Write scope and acceptance criteria in PROVIDER-UX-SPEC.md.
- [x] Load and atomically save non-secret provider preferences.
- [x] Define precedence and prevent model leakage across providers.
- [x] Switch adapter while idle without recreating the producer or log.
- [x] Read live catalogs with cancellation, timeout and manual fallback.
- [x] Add a keyboard selector to Ctrl+K, including missing-provider recovery.
- [x] Verify persistence, switching, errors, async races and actual terminal UI.
- [x] Review, run the full suite and commit the completed slice.

Follow-up milestones (not implemented in this slice):

- [x] Persist terminal sessions and resume after process restart (see TERMINAL-SESSIONS-TODO.md).
- [ ] Add direct Anthropic and explicitly configured subscription auth.
- [ ] Stream model output and expose full tool results.
- [ ] Benchmark multi-file real-repository tasks against the existing workflow.

Validation on 2026-10-01: full suite 660 tests, 658 passed, 2 skipped. After
reviewing preference coherence, the 11 affected provider/UI/type-guard tests
passed again. No new type diagnostics; the terminal compiler still reports its
four pre-existing diagnostics in shared source files. No changes to src/core.
Real metadata reads: OpenCode 540 IDs; OpenRouter 396 filtered IDs. Direct
inference routing is covered by simulated responses; provider-specific paid
inference trials remain pending. No remote push.

Review fixes: preserve the current model as the initial catalog choice; offer
OpenCode's configured model explicitly; discard provider-specific saved defaults
when another provider is selected; reject an unsupported output ceiling for the
OpenCode transport; display the compatible endpoint separately before applying.
