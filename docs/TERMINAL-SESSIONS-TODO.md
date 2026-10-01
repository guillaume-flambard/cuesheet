# Durable sessions todo

- [x] Define scope and acceptance in TERMINAL-SESSIONS-SPEC.md.
- [x] Add write-through core and view persistence using SessionStore.
- [x] Enforce single live writer and recover dead process claims.
- [x] Restore display, directives, observations and pinned criterion.
- [x] Record tool intent before effects and refuse work after storage failure.
- [x] Add startup session loading and keyboard session/new/resume controls.
- [x] Verify restart, killed work, continuation, proof pinning, damage and errors.
- [x] Review, run checks, update documentation and commit.

Validation on 2026-10-01: 668 tests, 666 passed, zero failed, 2 skipped using
node --test --test-skip-pattern='MB-01 a real run against the installed binary'
--test-reporter=spec 'test/**/*.test.ts'. Differential typecheck guard passes;
the terminal compiler retains four pre-existing diagnostics in shared files
and no new terminal diagnostic. git diff --check passes; src/core is unchanged.

Eight new regressions cover write-through/reopen/continuation, damaged/missing
and live-owned sessions, core write refusal, killed-process recovery, pinned
criteria and closed goals, production cross-process proof pinning, view write
refusal and the keyboard load/new/resume flow. Provider inference is simulated.
The PTY log test now checks the boot session record rather than claiming an
empty journal. The portability guard recognizes a required injected root.

Review also moved user directives before presentation, kept an unadmitted user
request resumable, reconstructed full core log lines on restore, marked archived
verification as historical, and preserved navigation after a storage failure.
No remote push.

Next replacement milestones:

- [ ] Direct Anthropic and explicitly configured subscription authentication.
- [ ] Stream output and expose complete tool results interactively.
- [ ] Measure multi-file real-repository tasks against the current workflow.
- [ ] Add explicit recovery tooling for damaged journals, preserving originals.
