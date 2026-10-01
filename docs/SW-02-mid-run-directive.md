# SW-02 — a mid-run sentence is a fact, not a second run

## WHY

The owner's architectural constraint, number one:

> Le message n'attend pas que les agents aient fini. Il devient immédiatement
> un nouveau fait dans le Shared Work State. Il n'y a jamais : message 4 queued
> behind agent response 3. Le composer doit toujours être disponible. Jamais
> "Please wait for the current response to finish". Jamais bouton Stop
> obligatoire juste pour pouvoir reparler.

SW-01 built the Shared Work State and proved a worker rebases when its basis is
stale (`docs/SW-01-shared-work-state.md`). But nothing in the running
application could ever deliver that directive, because of a defect the brief for
this slice got wrong in an interesting way.

**Measured first, then written.** The premise "a run in progress is a run you
wait out" is false, and the truth is worse. Driving the real producer with a
model that blocks inside `infer`:

```text
producer.say("first sentence")          -> model blocks inside infer
producer.say("stop, focus Spotlight")   -> accepted immediately, mid-run
```

The composer accepted it. The keystroke was delivered. Nothing was queued. But
the log says what actually happened:

```text
[effect_requested] E-probe-1 RunAgent cuesheet
[goal] builder {"text":"first sentence"}
[effect_requested] E-probe-2 RunAgent cuesheet        <- a SECOND run
[goal] builder {"text":"stop, focus Spotlight instead"}
```

and `frame.directives` was `[]` on **every** frame of **both** runs, across 16
inferences instead of 8.

So the sentence is not queued behind the response. It is **dropped into a second,
concurrent, independent run that does not share a log with the first**. The
in-flight work never learns the direction changed. Worse, the fork damages the
surface: `E-probe-1` is orphaned (only `E-probe-2` is ever observed), the two
runs' steps interleave in one log, and `busy` is a single boolean that the first
run to finish clears while the second is still running.

The cause is one line. `apps/terminal/src/producer/index.ts:175` creates the
`EventStore` **inside** `start()`, so every run gets a private log. There is no
shared log for a message to join, which is why the message cannot be a fact.

## BEFORE

- One `EventStore` per run, constructed at `producer/index.ts:175`. Two runs,
  two logs, two revisions that cannot see each other.
- `say()` calls `resolveScope` then `runWith` unconditionally
  (`producer/index.ts:273-281`). Mid-run, `runWith` sends `began` and starts a
  second `runAgentLoop`.
- The in-flight run never sees the sentence. Proven: `frame.directives` empty on
  all 16 frames.
- `pendingRequest`, `pendingAction`, `pendingAt` are single mutable slots
  (`producer/index.ts:124-134`) shared by both runs. The first run's
  `effect_requested` is orphaned.
- `busy` is one boolean. The first run to finish sends `ended`, so the surface
  reports idle while a run is still going.
- `TemporaryWorker.step` refuses and rebases (`src/work-worker.ts:177-241`), but
  `step` is synchronous: it reads its basis and commits in one block, so a
  refusal only happens if the producer callback appends. **Nothing in the
  application calls it.** `rg '\.step\(' src apps` returns nothing.

## AFTER

- One `EventStore` per producer, created in `createProducer` and passed to every
  run. One log, one revision counter, shared by every run in the session.
- `say()` while a run is in flight appends a `directive` to that log **at once**
  and starts nothing. The revision advances before `say` returns. No queue, no
  buffer, no pending field.
- The in-flight loop re-reads the log at the top of every step and recompiles the
  frame (`src/core/loop.ts:184-185`), so the directive appears in
  `frame.directives` on the next inference. Already true of the core, and proven
  by test here; it was unreachable only because the log was not shared.
- The producer wraps the injected `ModelAdapter`. **`infer` is the safe
  boundary**: the loop has just recompiled its frame and is about to do a step
  against it (`loop.ts:187`). The producer reads the revision on the way in and
  commits the step's record on the way out, guarded by `appendIfCurrent`.
- Nothing is killed mid-write. The loop finishes its current step; the
  decision is taken at the next boundary. That is what "safe boundary" means
  here, and it is read off the loop rather than invented.
- A refusal is reported as `rebased` with `from` and `to`, reusing the existing
  `StepOutcome` from `src/work-worker.ts`. Never laundered into `committed`.

## ACCEPTANCE

1. `npm test` stays green and grows. Baseline at `4e87989` is 577 tests, 575
   pass, 0 fail, 2 skipped.
2. `cd apps/terminal && ./node_modules/.bin/tsc --noEmit` still exits 2 with
   exactly the same 4 errors in `../../src/`, and zero in `apps/terminal/src`.
3. `npm run build` still succeeds.
4. **The crux.** A real `runAgentLoop`, driven through the real producer, with a
   model that blocks inside `infer`. While blocked: `producer.say` from the
   composer path. Asserts all five:
   - the log advanced, and the only thing in it is the directive (no second
     `effect_requested`, no second `goal`);
   - the worker's commit was refused and reported `rebased`, with `from` and `to`
     naming real revisions;
   - the committed record was re-derived, not retried: it names the new
     sentence, which can only happen if it read it;
   - the model saw the directive in a later `frame.directives`;
   - a second `say` immediately after was accepted and also landed.
5. Nothing is killed mid-write: while the model is blocked, the producer has
   committed nothing. The refusal is observed, not asserted in a comment.
6. Two submissions in quick succession both land, in order, and neither is lost.
7. **Queue-free, structurally.** Comments stripped, no `queue`, `buffer`,
   `inbox`, `backlog`, `deferred`, or pending-message field in any file under
   `apps/terminal/src`. A test that fails if one is reintroduced.
8. The composer has no busy guard and `derive` does not drop a `submit` that
   arrives while busy. Structural, over the real source.
9. One store per producer, asserted by reading the source: `new EventStore` is
   not inside `start`.
10. Visibility in surface words: a `status` entry shows the direction changed.
    `rebased`, `revision`, and `against` appear in the `/inspect` log and
    **nowhere** in what a person reads on the timeline.
11. Nothing under `src/core/**` is modified. `git diff` on that path is empty.
12. No new dependency, no rendering-engine change, PORT-01 keeps passing.
13. `app/state.ts` stays pure and imports nothing. The only new control is
    producer-only, and the only new state field is one the producer sets.

## NON-GOALS

- **A stop rule.** `declined` is reachable in `StepOutcome` but nothing here
  produces it. Deciding that a sentence means "stop" is a classifier over
  phrases, which is the defect OBS-1 and V2 removed, and no observed failure
  yet shows what a run should do about a sentence it reads as a contradiction.
  Inventing one would be speculation with a test written to match it.
- Acknowledging the directive. A `note` with `acknowledges` would clear it from
  `openDirectives` (`src/core/store.ts:249-253`), but a run that has not
  demonstrably applied an instruction must not claim it has. The directive stays
  open and is carried in every later frame.
- Multiple concurrent agents, work regimes, web research, artifact generation.
  Later slices.
- Persistence. `SessionStore` is untouched.
- Modifying `src/core/**`, including to make the loop guard itself.
- A scheduler, a coordinator, a queue, a retry engine, a lease, a supervisor.
  `docs/EVIDENCE.md:334` records the standing answer.

## STOP

Stop at the first of these, and report it rather than working around it:

- A type added here that nothing in this slice produces or consumes. Delete it
  and report the cut.
- A safe boundary that can only be expressed by modifying `src/core/**`.
- A test that cannot fail without the change (`CONTRIBUTING.md`).
- The fork reappearing in any form: a second `EventStore`, a second `began`, or
  a `say` that starts a run while one is in flight.

## WHAT I EXPECT NOT TO PROVE

- **Not driven through a real terminal.** Every assertion here is headless, with
  the real producer, the real loop, the real store, and a fake model. Ink's
  keystroke delivery is argued from the code path and asserted structurally over
  `Composer.tsx`, not observed in a TTY.
- **Not a stop.** See NON-GOALS. `declined` has no producer here.
- **One boundary only.** `infer` is the boundary. A directive landing during
  `tools.run` is absorbed at the next `infer`, which is the next boundary, but
  the tool call itself is not separately guarded.