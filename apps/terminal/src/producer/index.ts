/**
 * The producer. The thing that makes the surface able to act.
 *
 * V1 had none. `app/state.ts:125` said so, honestly:
 *
 * ```text
 * // The surface has no model yet, so it cannot promise work it has not started.
 * ```
 *
 * This module is that producer. It is the only writer of the surface's state, and
 * it does four things a component is forbidden to do:
 *
 * 1. **Resolves the scope of a sentence from the environment** (`context.ts`),
 *    so no person is asked to name a project the machine already knows.
 * 2. **Runs the real agent loop** (`src/core/loop.ts`), through injected
 *    `ModelAdapter` and `ToolRunner` interfaces so a test can drive it with
 *    fakes and no credits.
 * 3. **Translates each event once** (`translate.ts`) into the surface's own
 *    vocabulary, so the work is visible without the bookkeeping.
 * 4. **Owns the admission.** The effect request and its conditional append
 *    (`appendIfCurrent`) that `src/chat.ts:432-467` holds for the diagnostic
 *    chat are here for the same reason: the emission is not the outcome, and a
 *    run that never starts must not be recorded as one that did.
 *
 * ## Why the loop's own stop reason decides what the surface says
 *
 * `runAgentLoop` returns `goal-closed`, `budget-exhausted` or `blocked`, and it
 * never ends because a model claimed to be done (`src/core/loop.ts:8-22`). The
 * surface reports that stop reason through `entryForStop` and invents nothing.
 * That is the differentiator the brief names: the core is precisely what stops
 * the agent from lying about what it did, so the surface's job is to show what
 * the core established, not to smooth it.
 */

import { runAgentLoop, type ModelAdapter, type ToolRunner, type LoopOptions } from "../../../../src/core/loop.ts";
import { EventStore, type Event } from "../../../../src/core/store.ts";
import { DEFAULT_PROJECTS_ROOT } from "../../../../src/adapters/frontier.ts";
import { bindProject, identities, resolveScope, type ProjectIdentity, type Scope } from "./context.ts";
import { entryForStop, pendingFor, translateEvent, type Pending } from "./translate.ts";
import type { Control, Entry, Option, SurfaceState } from "../app/state.ts";
import type { Store } from "../app/store.ts";

/** How long a run may go before the budget is spent. The chat's own number. */
export const MAX_STEPS = 8;

export interface ProducerOptions {
  /** The store this producer owns. It is the only writer. */
  readonly store: Store;
  readonly model: ModelAdapter;
  readonly tools: ToolRunner;
  /** The directory the person launched from. Resolved against the registry. */
  readonly cwd: string;
  /** The projects root. Defaults to the machine's, overridable for a test. */
  readonly projectsRoot?: string;
  /** Injection point for the clock, so a test does not depend on the wall. */
  readonly now?: () => number;
  /** Injection point for identity minting, for the same reason. */
  readonly mintId?: () => string;
  /**
   * Injection point for the portfolio identities.
   *
   * Present so a test can resolve a sentence against a fake registry and never
   * read the real one. Production leaves it out and the registry is read from
   * `projectsRoot`, once per launch.
   */
  readonly identities?: readonly ProjectIdentity[];
}

/** What a run needs, assembled here so the loop call site is one line. */
interface Wiring {
  readonly scope: Scope;
  readonly subject: string;
  readonly goal: string;
}

export interface Producer {
  /** Hand a sentence to the surface. Any sentence. */
  say(text: string): void;
  /** Accept a choice from an offer the producer made. */
  choose(option: Option): void;
  /** The current state, for a caller that is not React. */
  readonly state: SurfaceState;
}

/**
 * A session id, unique enough to separate two runs in one log.
 *
 * Not a UUID and not random: it is derived from the clock the caller injected, so
 * a test that injects a fixed clock gets a fixed id and can assert on the log.
 */
const defaultMintId = (now: number): string => `v2-${now.toString(36)}`;

/**
 * Build the producer.
 *
 * Takes the store rather than creating one, so the same shape serves a real
 * launch and a headless test. Takes the adapters by interface, so a test drives
 * the whole vertical with no provider and no shell.
 */
export function createProducer(options: ProducerOptions): Producer {
  const { model, tools, cwd } = options;
  /**
   * The store, read through an accessor rather than closed over by name.
   *
   * The parameter is called `store` and the loop also builds a session store, so
   * a bare `store` inside `onEvent` referred to the wrong one. Naming the
   * surface's store `view` removes the shadowing entirely, which is cheaper than
   * remembering which is which at every call site.
   */
  const view = options.store;
  const projectsRoot = options.projectsRoot ?? DEFAULT_PROJECTS_ROOT;
  const now = options.now ?? (() => Date.now());
  const mint = options.mintId ?? (() => defaultMintId(now()));
  const send = (control: Control): void => view.send(control);

  // Read the registry once. Naming a project costs a registry read and no git
  // (`src/adapters/project-binding.ts:78`), and doing it per sentence would make
  // every sentence pay for a launch's worth of work.
  const ids = options.identities ?? identities(projectsRoot);

  // The effect request, kept so the outcome can be recorded against it. EFF-01:
  // the emission is not the outcome. A request the world never answered is a
  // request, and the surface must be able to say so.
  let pendingRequest: string | null = null;
  let pendingAction: Pending | undefined;
  /**
   * Where the open action row sits in the timeline.
   *
   * Held alongside the pending action because the observation that settles it
   * arrives as a separate event with no memory of where its action was written.
   * Without this the settled row would be appended and every call would show
   * twice, once still claiming to be running.
   */
  let pendingAt: number | undefined;
  /**
   * The sentence an open offer is answering.
   *
   * Held here rather than in the surface's state, because it is a fact about the
   * pending run and not something a person reads. A choice answers *where*, and
   * the sentence that produced the offer is still what the person wants done.
   */
  let offeredGoal = "";

  const log = (line: string): void => send({ type: "logged", line });
  const observe = (entries: readonly Entry[]): void => {
    if (entries.length > 0) send({ type: "observed", entries });
  };

  /** Ask the binder, then run or offer. This is the automatic context step. */
  const runWith = (scope: Scope, goal: string): void => {
    if (scope.at === "choice") {
      // More than one project defends itself. BIND-05 forbids a silent pick, so
      // this is a question to a person, and the composer stays live underneath.
      observe([
        { kind: "status", label: "which project", value: scope.options.map((o) => o.name).join(" · "), certainty: "unknown" },
        { kind: "cuesheet", text: "Pick one, then say what you want done." },
      ]);
      offeredGoal = goal;
      send({ type: "offered", choices: scope.options });
      return;
    }

    // The scope is known, one way or another. State it plainly, with the real
    // path, because a person checking the surface picked the right directory is
    // the cheapest verification there is.
    send({ type: "scoped", project: scope.name, where: scope.path });
    send({ type: "began" });
    void start(scope, goal);
  };

  /** Start the real loop. Everything here is the part V1 could not do. */
  const start = async (scope: { path: string; name: string }, goal: string): Promise<void> => {
    const subject = "builder";
    const sessionId = mint();
    const store = new EventStore(sessionId, now);
    const requestId = `E-${sessionId}`;

    // The request is committed conditionally before the world is asked, so two
    // surfaces that both find a run allowed cannot both be right by the time it
    // lands. `null` means the journal moved, which is a refusal rather than an
    // error: nothing was written, and the person is told.
    const basis = store.revision;
    const committed = store.appendIfCurrent(basis, {
      kind: "effect_requested",
      subject: requestId,
      data: {
        effect: "RunAgent",
        effectId: requestId,
        affordance: "APPROVE_GOAL",
        reads: { goal: "known", project: "known" },
      },
    });
    if (committed === null) {
      observe([{ kind: "failure", text: "another surface started first; nothing was run here." }]);
      send({ type: "ended" });
      return;
    }
    pendingRequest = requestId;
    log(`[effect_requested] ${requestId} RunAgent ${scope.name}`);

    // The loop options, and the one that matters most: `onEvent` is how the work
    // becomes visible. It fires from a promise continuation outside React, which
    // is why the store is external (`app/store.ts`).
    const loopOptions: LoopOptions = {
      subject,
      goal,
      maxSteps: MAX_STEPS,
      onEvent: (event: Event) => {
        // Every event goes to the log. Only some become entries. The log is the
        // evidence and the entries are the sentence a person reads, and
        // collapsing them would make the two indistinguishable.
        log(`[${event.kind}] ${event.subject} ${safeData(event)}`);

        // An action opens its row, and the observation that follows settles that
        // same row rather than adding another. The index is where it was
        // written, tracked here because the producer owns every append.
        let at: number | undefined;
        if (event.kind === "action") {
          pendingAction = pendingFor({
            name: String(event.data.tool ?? ""),
            input: (event.data.input ?? {}) as Record<string, unknown>,
          });
          at = view.get().entries.length;
        } else if (typeof event.data.tool === "string") {
          at = pendingAt;
        }

        const translated = translateEvent(event, pendingAction, at);
        if (event.kind === "action") {
          pendingAt = at;
        }
        if (event.kind === "observation" && typeof event.data.tool === "string") {
          pendingAction = undefined;
          pendingAt = undefined;
        }
        if (!translated) return;
        // A settled entry replaces the open row; a new one is appended. The two
        // are distinguished by whether the translator named an index, which is
        // the only thing that knows whether a row already exists.
        if (translated.at === undefined) {
          send({ type: "observed", entries: [translated.entry] });
        } else {
          send({ type: "settled", at: translated.at, entry: translated.entry });
        }
      },
    };

    try {
      const outcome = await runAgentLoop(store, model, tools, loopOptions);
      observe(entryForStop(outcome.stop));
      // The run returned. That is a fact about the process, not a success, so
      // the outcome records what the loop actually stopped on rather than
      // assuming it worked.
      recordObserved(outcome.stop.reason);
    } catch (cause) {
      const why = cause instanceof Error ? cause.message : String(cause);
      observe([{ kind: "failure", text: `the run stopped: ${why}` }]);
      log(`[effect_observed] ${pendingRequest ?? "E-unknown"} failed ${why}`);
      pendingRequest = null;
    } finally {
      send({ type: "ended" });
    }
  };

  const recordObserved = (reason: string): void => {
    const id = pendingRequest;
    pendingRequest = null;
    if (!id) return;
    log(`[effect_observed] ${id} ${reason}`);
  };

  return {
    say(text: string) {
      const said = text.trim();
      if (!said) return;
      // Record first, so the sentence is on screen before any work starts. The
      // surface never withholds what the person typed.
      send({ type: "submit", text: said });
      const scope = resolveScope(said, cwd, ids, bindProject, projectsRoot);
      runWith(scope, said);
    },
    choose(option: Option) {
      const goal = offeredGoal;
      offeredGoal = "";
      send({ type: "choose", option });
      // A chosen project is a real scope, so a run follows it. The sentence that
      // produced the offer is the goal, because that is what the person wants
      // done and the choice only answered where.
      if (goal.length === 0) return;
      send({ type: "began" });
      void start({ path: option.path, name: option.name }, goal);
    },
    get state() {
      return view.get();
    },
  };
}

/** Render an event's data for the log without ever throwing on its shape. */
function safeData(event: Event): string {
  try {
    const text = JSON.stringify(event.data);
    return text.length > 160 ? `${text.slice(0, 159)}…` : text;
  } catch {
    return "(unreadable)";
  }
}