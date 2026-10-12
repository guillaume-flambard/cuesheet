# P1 proof: intent recorded before executing a tool — 2026-10-12

Status: proposed change on `fix/core-intent-before-effect-20261012`; code and tests remain subject to GitHub CI, required checks, and merge. This is one invariant, not a complete durable effects subsystem.

## Failure reproduced

The generic core loop in `src/core/loop.ts` used to execute `await tools.run(call)` **before** appending the `action` event. If a tool crashed/disconnected after an external side effect, the only persisted trace might omit the action entirely, making a later retry unsafe.

Pre-fix, `node --test test/core-intent-before-effect.test.ts` returned **0/3 PASS**:
- Tool runtime could see no prior action in EventStore while handling a side effect.
- A tool exception left no recorded intent.
- An onEvent durability failure was discovered only **after** the tool had been run.

## Minimal fix and acceptance test

The loop now appends the action before dispatch. The request is journaled before an observation appears; tool execution follows only after any `onEvent` persistence callback returned successfully. A crash leaves an unpaired action (uncertainty) rather than silently erasing a request. A failed persistence callback prevents tool dispatch.

Post-fix, `node --test test/core-intent-before-effect.test.ts test/loop.test.ts` reported **18/18 PASS** locally on Mac.

## What is NOT proven

- The core `EventStore` alone is not disk durable; the caller's `onEvent` callback must durably persist or reject. The existing terminal journal has a separate admission/effect-receipt path.
- An unpaired action is only a recorded *possible* side effect. It must **not** be assumed to have succeeded or failed.
- Safe resume/reconciliation of a generic core orphan action, idempotency keys, external effect probing and live multi-provider tests remain future work. Never replay an orphan mutating call without inspecting its actual effects.
- This fix does not bypass Linux/macOS sandbox limits or validate the acceptance criterion. A successful `exit:0` observation is still not independent evidence that a goal is done.

Proposed next P1 slice: `core.hasUnreconciledEffect` read-only projection keyed by subject and action/receipt identity; prevent blind replay on resume and model switch; a controller owner must supply an independent observation for resolution. Add failure fixtures for process death between intent/dispatch and dispatch/receipt.

References: `docs/harness/REFERENCE-DEEP-DIVE-2026-10.md`, `IMPLEMENTATION-GATES-2026-10.md`, `docs/harness/09-RELIABILITY.md`. Source of truth remains the immutable log and tests, not this note.
