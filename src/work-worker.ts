/**
 * The temporary worker: several at once, one shared state, no queue.
 *
 * A temporary worker is not a session. It has no lifetime of its own, it holds
 * no state that outlives the current step, and it can die at any point without
 * losing anything anybody else needs. What it does instead of keeping state is
 * read the shared projection, do one step, and commit against the revision it
 * read.
 *
 * ## The crux, and why the code is mostly refusal handling
 *
 * The owner named the case exactly:
 *
 * ```text
 * worker reads revision 127
 * human says "stop, focus Spotlight instead"
 * state is now 128
 * worker tries to commit a decision taken against 127
 * appendIfCurrent(127) is refused
 * worker re-reads, rebases, continues
 * ```
 *
 * The guard is not new. `EventStore.appendIfCurrent` has been there since P10
 * (`src/core/store.ts:209-212`; `docs/EVIDENCE.md:495-511`), and it returns
 * null having written nothing at all, which is why the loser re-reads instead of
 * undoing (CON-03, `docs/INVARIANTS.md:468`). What is new here is the layer that
 * makes the refusal mean something: a worker that has a *step* to abandon and a
 * *derivation* to redo, rather than a command to retry.
 *
 * That is why `step()` returns a report naming what happened rather than a
 * boolean. A boolean would leave the caller unable to distinguish "committed",
 * "refused and rebased" and "stopped because the work is obsolete", and a
 * surface handed those three as one value would have to guess which it is. The
 * repository has already been bitten by exactly that collapse in the work-outcome
 * case (`src/work.ts:6-27`).
 *
 * ## The safe boundary is the step
 *
 * Obsolete work must stop somewhere, and the somewhere has to be a boundary that
 * already exists rather than one invented for this. It is the step, and the
 * reason is observable rather than chosen: `runAgentLoop` appends, then
 * re-compiles the frame from the log on the next iteration
 * (`src/core/loop.ts:183-185`). The log is the only thing the loop consults
 * between inferences, so a worker that checks the projection between steps is
 * checking it exactly where the loop would notice a change anyway.
 *
 * Stopping at the step boundary has one property worth stating, because it is the
 * reason not to stop anywhere finer: everything already appended stays. A worker
 * that has recorded an action and its observation leaves both, and abandoning
 * them would mean rewriting a log whose whole guarantee is that it is append-only
 * (`src/core/store.ts:159-163`). Obsolete work means *no further step*, never
 * *undo*.
 *
 * ## No queue, and no channel
 *
 * Two workers coordinate by reading the projection. There is no inbox, no
 * broadcast, no handle to a peer, and no way to address another worker, because
 * there is nothing here that could carry one: the worker's only collaborator is
 * the store, and the store is a log. `WORK-04` in the test file asserts that
 * structurally, by reading this module's source, so the claim survives a future
 * edit rather than a future intention.
 *
 * A queue would be the wrong shape even if it were easy. Queuing a human message
 * behind a running agent is the behaviour this whole design is against: the
 * message reconfigures the work in flight, and the reconfiguration arrives as a
 * refused commit plus a re-derivation. A queue would defer the correction to
 * after the work it corrects, which is the failure the owner is describing.
 */

import { projectWork, type SharedWorkState } from "./work-state.ts";
import type { Event, NewEvent } from "./core/store.ts";

/**
 * The only thing a worker can do to the world through this module.
 *
 * Supplied by the caller rather than constructed here, for two reasons. It keeps
 * this module free of a model, so the rebase logic is testable with no provider
 * and no credits. And it makes the re-derivation explicit: a producer is handed
 * the *fresh* state every attempt, so a worker that failed to re-read would be
 * visibly handed the same stale state twice rather than quietly getting away
 * with it.
 */
export type WorkProducer = (state: SharedWorkState, attempt: number) => NewEvent | null;

/** The store surface this module needs, and no more. */
export interface WorkLog {
  /** The log, in append order. A fold is all a reader needs. */
  read(): Event[];
  /** The revision, which is the last sequence appended. -1 when empty. */
  revision(): number;
  /** The revision-guarded append. Null is a refusal that wrote nothing. */
  appendIfCurrent(expectedRevision: number, event: NewEvent): Event | null;
}

/**
 * Why a step ended. Four states, and the last two are the ones a boolean would
 * have swallowed.
 */
export type StepOutcome =
  /** The event was appended on the first attempt, at the revision read. */
  | { readonly kind: "committed"; readonly at: number; readonly event: Event }
  /**
   * The guard refused, the worker re-read, re-derived against the new state, and
   * the re-derived event was appended.
   *
   * This is reported as its own outcome rather than as a `committed` that
   * happened later, and the distinction is the whole content of the crux. A
   * report that only said "committed" would be true and useless: it would hide
   * the refusal that the owner asked to see, and a caller reporting it would
   * claim the worker's first decision landed when in fact a different one did.
   *
   * `from` is the revision the refused attempt was made against, `to` the
   * revision it was committed at, so a caller can say how far the world moved
   * while the worker was busy.
   */
  | {
      readonly kind: "rebased";
      readonly from: number;
      readonly to: number;
      readonly event: Event;
    }
  /**
   * The producer returned null, meaning: the state says this work should not
   * happen. Not a failure and not a success, which is why it is its own state
   * rather than a commit with no event.
   */
  | { readonly kind: "declined"; readonly at: number }
  /**
   * The step budget is spent. Separate from `declined` because declining is a
   * judgement about the work and this is a fact about the budget, and a reader
   * that merged them would report a worker that chose to stop as one that ran
   * out of room.
   */
  | { readonly kind: "exhausted"; readonly at: number };

export interface StepReport {
  readonly outcome: StepOutcome;
  /** The state as it stood after the step, so a caller never has to re-read. */
  readonly state: SharedWorkState;
  /** How many attempts the step took, including the successful one. */
  readonly attempts: number;
}

export interface TemporaryWorker {
  /** This worker's own subject. The only identity it has. */
  readonly subject: string;
  /** The shared projection, read fresh. */
  read(): SharedWorkState;
  /**
   * Do one step: read, produce, commit at the revision read, and on a refusal
   * re-read and re-derive.
   *
   * `attempts` bounds the rebase loop. It exists because the re-derivation calls
   * a caller-supplied producer, and a producer that keeps returning an event
   * against a moving log would otherwise spin forever. The bound is on attempts
   * rather than on a timer because a test must be able to reach it.
   *
   * `readAt` is the revision the caller's work was actually derived against, when
   * that is older than the log's current revision. It exists because a step is
   * not always instantaneous: a caller whose work is an `await` read the state
   * before it and commits after it, and the log may have moved in between. That
   * window is the whole of TOCTOU (P10), and without this parameter `step()` would
   * re-read the revision at entry, so a commit made across an await could never
   * be refused and a rebase could never be reported.
   *
   * Omitted, it is the current revision, which is the synchronous case this
   * module was written for and the one every caller before it used.
   */
  step(producer: WorkProducer, attempts?: number, readAt?: number): StepReport;
}

/**
 * Build a temporary worker over a log.
 *
 * Takes the log by interface, so the same worker runs over an in-memory
 * `EventStore` in a test and a durable `SessionStore` in production, and so a
 * test can drive a refusal without a lock file. The house pattern is the same one
 * the producer follows: adapters arrive as parameters, never as construction
 * (`apps/terminal/src/producer/index.ts:100-119`).
 */
export function temporaryWorker(log: WorkLog, subject: string): TemporaryWorker {
  const read = (): SharedWorkState => projectWork(log.read());

  return {
    subject,
    read,

    step(producer, attempts = 3, readAt?): StepReport {
      // The revision this step's work is derived from. Read once, outside the
      // loop, so that every attempt after the first is a genuine re-read rather
      // than a re-use of the number that just got refused.
      //
      // A caller that read before an `await` passes that older revision instead,
      // which is the only way a commit made across the await can be refused.
      let basis = readAt ?? log.revision();
      // The basis the *first* attempt was made against, kept so a rebase can
      // report the distance it travelled. Without it a rebase and a first-try
      // commit are indistinguishable in the report, which is the one thing this
      // slice exists to prevent.
      const origin = basis;
      let made = 0;

      while (made < attempts) {
        made += 1;
        // Re-read before producing, always. On the first attempt this is the
        // basis; after a refusal it is the new state, which is the whole point
        // of handing the producer the state rather than a cached goal.
        const state = read();
        const event = producer(state, made);
        if (event === null) {
          return { outcome: { kind: "declined", at: state.revision }, state, attempts: made };
        }

        // The commit carries the revision it was derived against, so a later
        // reader can tell a decision made in the dark from one made against a
        // state it can name. `against` is read back by `projectWork`.
        const committed = log.appendIfCurrent(basis, { ...event, data: { ...event.data, against: basis } });

        if (committed !== null) {
          const after = read();
          return {
            outcome:
              made === 1
                ? { kind: "committed", at: committed.seq, event: committed }
                : { kind: "rebased", from: origin, to: committed.seq, event: committed },
            state: after,
            attempts: made,
          };
        }

        // Refused. Nothing was written, so there is nothing to undo: the only
        // correct response is to look again (P10, `docs/EVIDENCE.md:505-510`).
        // The new revision is recorded so the report can say the world moved,
        // and the loop re-derives rather than retrying the same event.
        const moved = log.revision();
        if (moved === basis) {
          // The guard refused without the revision changing, which the guard does
          // not do on its own (`src/core/store.ts:210`). Treating it as progress
          // would spin, so it is reported as what it is: the state is unreadable
          // to this worker right now.
          return {
            outcome: { kind: "declined", at: moved },
            state: read(),
            attempts: made,
          };
        }
        basis = moved;
      }

      // The budget of attempts is spent and the log kept moving. Reporting
      // `exhausted` rather than the last refusal is the honest reading: this
      // worker did not decide to stop, it ran out of room.
      const state = read();
      return { outcome: { kind: "exhausted", at: state.revision }, state, attempts: made };
    },
  };
}
