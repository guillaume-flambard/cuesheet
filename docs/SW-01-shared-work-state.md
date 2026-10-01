# SW-01 — a Shared Work State, and the revision rebase that proves it

## WHY

Cuesheet has one durable reality: the append-only log in `src/core/store.ts`,
folded to a session. It has one long-lived worker: `runAgentLoop` in
`src/core/loop.ts`. Between them there is no shared *work* state and no notion of
a second worker, so two facts are currently unreachable.

First, a temporary worker cannot pick up where another left off. It would need
the transcript, and a transcript is the thing this repository exists to stop
depending on. The substitution the owner named — a worker dies, another arrives,
reads goal, decisions, evidence, artifacts and open questions, and does not need
300 messages of context — has nothing to read *from* today.

Second, and this is the load-bearing one, the semantics of a mid-flight
correction are unproven. The owner put it plainly:

> Si un agent travaille à la révision 127 et que j'écris "stop, focus Spotlight
> instead", le Shared Work State passe à 128. Si le builder essaie ensuite de
> committer une décision prise contre 127, `appendIfCurrent(127)` est rejected.
> Il doit relire et se réaligner.

The guard already exists. `EventStore.appendIfCurrent(expectedRevision, event)`
returns `null` when the journal moved, and wrote nothing at all, which is CON-03
(`docs/INVARIANTS.md:468`). `docs/EVIDENCE.md:495-511` records P10 as the
milestone that built it, with two controllers in one process and two processes
in one file. So the primitive is not the work here. The work is the *layer above
it* that makes the refusal mean something: a worker must be able to say what it
was working on, find that its basis is stale, and re-derive against the new state
rather than overwrite or give up.

`docs/EVIDENCE.md:1054-1058` lists "multi-agent runtime semantics" under NOT
YET NEEDED, on the grounds that one goal, one session, one producer, one artifact
and one verifier has covered every result in the file. This slice is not that
claim. It adds no scheduler, no coordinator, no runtime supervision, and no new
core primitive. It adds a projection and the *handling* of a refusal, so that
the admission question changes from "would multi-agent semantics help" to "here
is the semantics, and here is what a stale commit does inside them".

## BEFORE

- `src/core/store.ts` projects the log to a `Session` carrying `goal`,
  `directives`, `evidence`, `models`, `capabilities`. It ignores `action`,
  `observation`, `effect_requested`, `effect_observed`, `work_produced` and
  `work_verified` entirely (`src/core/store.ts:287-292`, deliberately).
- `runAgentLoop` emits `capability`, `goal`, `observation` and `action` events.
  It never emits a control and never reads a revision of its own.
- A session has exactly one `Goal`, overwritten by each new `goal` event.
- Two `EventStore` objects in one process are two logs, not one shared log. The
  only shared store today is `SessionStore` on disk, which does I/O and is an
  adapter.
- Nothing in `src/` projects the log into a work language. There is no Goal /
  Question / Claim / Decision / Constraint / Task / Artifact vocabulary, and no
  `ContextSource` at all.
- A repository is the only context source, and it is chosen by directory through
  `bindProject` (`src/adapters/project-binding.ts:211`).

## AFTER

- `src/work.ts` — the work language and `projectWork(events)`, a pure fold from
  an event list to a `SharedWorkState`. It reads every event kind, including the
  six the core session fold ignores. It imports `./core/store.ts` and nothing
  else.
- `src/work-context.ts` — `ContextSource` as a closed union over `repository`,
  `web`, `file`, `artifact`, `scratch`, `previous_session`, plus
  `contextSourcesFrom(bindings)`. No repository is required for a state to be
  non-empty.
- `src/work-worker.ts` — `TemporaryWorker`: reads the state, records the
  revision it read, produces through a caller-supplied `WorkProducer`, and
  commits with `appendIfCurrent`. A refusal is handled by re-reading and
  re-deriving. It has no parameter, field, or import through which another
  worker could be addressed.
- A worker's unit of work is one *step*, and the step boundary is the safe
  boundary. Nothing already appended is undone, and no half-written decision is
  recorded.
- Tests prove: the projection; the substitution; the crux (stale commit refused,
  rebase, continue); that obsolete work stops at a step boundary; and that no
  worker-to-worker channel exists.

## ACCEPTANCE

1. `npm test` stays green and grows. Baseline at `2ad1c45` is 552 tests, 550
   pass, 0 fail, 2 skipped.
2. `cd apps/terminal && ./node_modules/.bin/tsc --noEmit` still exits 2 with
   exactly the same 4 errors, all inherited from `../../src/` (`shell.ts`,
   `loop.ts`, `memory.ts`, `store.ts`). Zero errors in `apps/terminal/src`,
   zero new errors anywhere.
3. `npm run build` still succeeds, and `test/typecheck-guard.test.ts` reports no
   new diagnostic pair. The new modules are type-clean; nothing is added to the
   `KNOWN` baseline.
4. SW-01: the projection is a pure function of the event list. The same events
   project the same state, and appending one event changes it.
5. SW-02: a worker commits at the revision it read. `appendIfCurrent` at a stale
   revision returns `null`, the log is byte-identical, and the worker re-reads
   and re-derives rather than overwriting.
6. SW-03: the crux. A worker reads at revision *R*, a human message bumps the
   state to *R+1*, the worker's commit is refused, it re-reads, re-derives
   against the new state, and the re-derived decision is committed. Asserted
   end to end in one test.
7. SW-04: two temporary workers over one projection, each seeing the other's
   output through the state and never through each other.
8. SW-05: work that became obsolete stops at a step boundary. Everything the
   worker had already appended is still there, and it records nothing further.
9. SW-06: no worker-to-worker channel. Asserted structurally over the worker's
   source, not by comment.
10. Nothing under `src/core/**` is modified. `git diff` on that path is empty.
11. No new dependency. `src/work*.ts` imports no `node:` module, matching the
    PORT-01 discipline even though PORT-01 does not scan this path.
12. Every type added is produced or consumed by a worker in this slice. Any that
    is not is deleted, and the deletion is reported.

## NON-GOALS

- The human-facing interruption UX. A later slice renders SW-01. Nothing here
  draws anything.
- A scheduler, a coordinator, a queue, a retry engine, a lease, a supervisor, or
  a process pool. `docs/EVIDENCE.md:334` records the standing answer ("No
  retries, no queue, no scheduler") and this slice does not reopen it.
- Modifying `src/core/**`, including to add a work event kind. The fold reads
  the existing twelve kinds. A new kind would need the core to change, and the
  core is frozen.
- Any claim that the semantics are *complete*. The two refusals that
  `SessionStore.appendIfCurrent` throws rather than returns (a held lock, a
  damaged disk, `docs/store-adversary.md`) are not handled here, and saying so
  is part of the result.
- Persistence. `SessionStore` is the durable store and is untouched; this slice
  is the projection and the refusal handling above whatever store is passed in.
- The terminal UI. `apps/terminal/**` is not modified at all.

## STOP

Stop at the first of these, and report it rather than working around it:

- A new type in this slice that no worker here produces or consumes. Delete it
  and report the cut, rather than justifying it.
- A safe boundary that can only be expressed by modifying `src/core/**`. The
  boundary is the step, because the step is what `runAgentLoop` already makes
  observable. If that is not enough, the slice is too big; report it.
- Any worker coordination that needs a channel. If two workers cannot be
  connected through the state alone, the state is wrong. Report that instead of
  adding a channel.
- A test that cannot fail without the change. Per `CONTRIBUTING.md`, that is
  documentation with a build step, and it does not get merged.
