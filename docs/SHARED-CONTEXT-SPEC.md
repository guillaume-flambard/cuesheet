# Shared context in the terminal

Full product specs and remaining execution order: [harness/README.md](harness/README.md)
and [harness/TODO.md](harness/TODO.md). This document records the initial slice.

The product direction stays the same: intentions become maintainable objectives,
with durable memory and agents reading a common state. Model changes must preserve
the state and the acceptance standard. They cannot guarantee equal model ability.

## First slice

Before each terminal inference, compile the existing shared-work projection from
the complete durable journal. Include its revision, sourced decisions, constraints,
questions, tasks and artifacts as a provider-neutral context directive. Include
the canonical session goal and evidence separately: those remain authoritative.
The projection describes historical records, not permission to repeat effects.
Rebuild after a human correction and on explicit resume. Never persist the derived
snapshot as another fact, and never infer completion from model prose.

## Acceptance

- A replacement model sees prior work and its sources without a transcript summary.
- A new directive changes the next snapshot; a stale snapshot is not reused.
- Repeated compilation adds no events and does not change the input frame.
- Tool observations, model claims and verification records stay distinguishable.

## Following slices

- [ ] Edit intention, objectives and acceptance criteria through a simple interface.
- [x] Record explicit decisions and answer questions without deleting their history via `/memory` (see WORK-MEMORY.md).
- [x] Offer automatic organization, specs, checklists, sourced memory and session skills to the model (see AUTONOMOUS-WORK.md).
- [ ] Provide a visual editor for these records.
- [ ] Give multiple workers the same durable state with revision-checked commits.
- [ ] Rebuild bounded context while retaining access to omitted evidence and sources.
- [ ] Exercise a weak and a strong model against the same independent acceptance check.
- [ ] Separate an execution budget from the lifetime of the objective in the UI.

The first slice is context delivery only. It does not introduce concurrent terminal
writers, a scheduler, automatic continuation, or a new core primitive.

## Implemented and checked

`src/adapters/shared-context.ts` supplies the snapshot at the terminal's model
boundary. A session restart test changes providers and checks delivery of the
previous correction in the sourced snapshot. Pure compilation tests check source
identity, unchanged input, refreshed revision and separation of claims/evidence.
The full suite reports 669 tests, 667 passing, 2 skipped and no failures;
the differential type guard reports no new diagnostics.

This snapshot currently includes all projected records and duplicates some of the
history already in the frame. Long-session token cost is unresolved. It must be
measured before claiming efficient context rebuilding or model-independent quality.
