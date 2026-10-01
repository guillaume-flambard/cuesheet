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
 * ## One store, and what a mid-run sentence does to it
 *
 * The `EventStore` is built once per producer, not once per run. That was the
 * defect SW-02 fixed and it is worth stating why it was ever wrong: a store
 * built inside `start()` gives every run a private log, so a sentence typed
 * during a run has no log it could join, and the only thing left to do with it
 * is start another run. Measured, before the fix: two runs, two logs, two
 * `effect_requested`, `frame.directives` empty on all sixteen inferences of
 * both, and the first run's request orphaned.
 *
 * So `say()` while a run is in flight appends a `directive` to that one log and
 * starts nothing. The loop recompiles its frame from the log at the top of every
 * step (`src/core/loop.ts:184-185`), so the directive reaches the next inference
 * with no change to the core. There is no queue and no pending-message field
 * anywhere in this app, and the test says so structurally rather than in a
 * comment.
 *
 * ## The safe boundary is `infer`, and it is the loop's own
 *
 * `model.infer(frame)` is called at `src/core/loop.ts:187`, after the frame has
 * been recompiled from the log and before any of the step's work exists. That is
 * the boundary, and it was read off the loop rather than invented for this
 * slice: it is the last point at which the loop is committed to acting on a
 * frame it has already read.
 *
 * The producer wraps the injected adapter, reads the revision on the way in, and
 * commits the step's record on the way out through `appendIfCurrent`. A sentence
 * typed during the inference moved the log, so the commit is refused, the worker
 * re-reads and re-derives, and the outcome is reported as `rebased` with the
 * revision it left and the revision it landed on. Nothing is killed mid-write:
 * the loop finishes its current step, because that step's appends are already
 * durable and the log is append-only (`src/core/store.ts:159-163`).
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
import { temporaryWorker, type StepOutcome, type WorkLog } from "../../../../src/work-worker.ts";
import { DEFAULT_PROJECTS_ROOT } from "../../../../src/adapters/frontier.ts";
import { bindProject, identities, resolveScope, type ProjectIdentity, type Scope } from "./context.ts";
import { entryForStop, pendingFor, translateEvent, type Pending } from "./translate.ts";
import type { Control, Entry, Option, SurfaceState } from "../app/state.ts";
import type { Store } from "../app/store.ts";

/** How long a run may go before the budget is spent. The chat's own number. */
export const MAX_STEPS = 8;

import type { TerminalSession } from "../../../../src/adapters/terminal-session.ts";
import { withSharedContext } from "../../../../src/adapters/shared-context.ts";
import { memoryCommand, MEMORY_SUBJECT } from "../../../../src/adapters/work-memory.ts";
import type { CompletionCheck } from "../../../../src/adapters/surface-verification.ts";

export interface ProducerOptions {
  /** The store this producer owns. It is the only writer. */
  readonly store: Store;
  readonly journal?: TerminalSession;
  readonly model: ModelAdapter;
  readonly tools: ToolRunner;
  readonly toolNames?: readonly string[];
  readonly verification?: CompletionCheck;
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
  /** Stop the current run; keep the conversation and the goal open. */
  cancel?(): void;
  /** Explicitly continue the persisted open goal, never auto-run on load. */
  resume?(): void;
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

  /**
   * The one log. Built here rather than inside `start`, so that every run in
   * this session appends to the same revisions and a sentence typed during a run
   * has a log it can join. See the header for the measurement that forced it.
   */
  const shared = options.journal?.core ?? new EventStore(mint(), now);

  /**
   * Whether a run is in flight, which decides what a sentence means.
   *
   * A sentence typed while idle starts a run. A sentence typed while a run is in
   * flight is a `directive` on the shared log and starts nothing. That is the
   * whole of "nothing queues": there is one flag, it holds no text, and the
   * sentence itself is appended immediately rather than held anywhere.
   */
  let inFlight = false;

  /**
   * The revision a step's work was derived against.
   *
   * Read on the way into `infer`, before the step's work exists, and committed
   * on the way out. A sentence typed during the inference moves the log in
   * between, which is what makes the commit refusable rather than assumed safe.
   * `null` means no step is open, which is the state outside a run.
   */
  let basis: number | null = null;

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
  // A row's index moves when the bounded history trims its head. Retain its
  // object identity and locate it when the result arrives instead.
  let pendingRow: Entry | undefined;
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

  /**
   * The worker's view of the shared log, by interface.
   *
   * Taken as an interface rather than the store, which is the house pattern
   * (`src/work-worker.ts:170-168`): the same worker runs over this and over a
   * durable `SessionStore`, and the guard it commits through is the store's own
   * `appendIfCurrent` rather than a second one written here.
   */
  const workLog: WorkLog = {
    read: () => shared.toSession().events,
    revision: () => shared.revision,
    appendIfCurrent: (expected, event) => shared.appendIfCurrent(expected, event),
  };
  const worker = temporaryWorker(workLog, "builder");

  /**
   * One step of the loop, guarded, at the boundary the loop already exposes.
   *
   * `infer` is called after the frame is recompiled and before the step's work
   * exists (`src/core/loop.ts:187`), so it is the last point at which the loop is
   * committed to what it has read. The wrapper reads the revision on the way in
   * and commits on the way out; a sentence typed while the model was thinking
   * has moved the log, so the commit is refused and reported as a rebase rather
   * than written over the newer state.
   *
   * What it commits is the step's own record, not a copy of the model's answer:
   * an `action` naming what was attempted, which is the one kind
   * `projectWork` folds into a `Decision` carrying the revision it was taken
   * against (`src/work-state.ts:311-322`). Nothing is undone when a step is
   * refused, because a refusal wrote nothing at all (CON-03).
   */
  const guarded = wrapAtBoundary(model);
  let proposalDirective = 0;
  let activeEffect = "";
  let activeWorkspace = cwd;
  let controller: AbortController | undefined;
  options.journal?.onFailure(() => controller?.abort(new Error("Session persistence failed")));
  const directiveRevision = (): number => shared.toSession().events
    .filter((event) => event.kind === "directive" || event.subject === MEMORY_SUBJECT).at(-1)?.seq ?? 0;
  const currentTools: ToolRunner = {
    async run(request) {
      const signal = controller!.signal;
      signal.throwIfAborted();
      options.journal?.assertWritable();
      if (directiveRevision() !== proposalDirective) {
        return { name: request.name, exit: 126, output: "The instructions changed; this proposal was discarded." };
      }
      if (shared.toSession().goal?.open === false) {
        return { name: request.name, exit: 126, output: "The declared check already settled this run; no further calls were executed." };
      }
      if (options.journal) shared.append({kind:"action",subject:"terminal.intent",data:{tool:request.name,input:request.input,effectId:activeEffect,phase:"requested"}});
      if (request.name === "finish") {
        if (!options.verification) return { name: "finish", exit: 126, output: "No acceptance check was declared; the goal remains open." };
        const basis = directiveRevision();
        observe([{ kind: "status", label: "check", value: "checking the captured result", certainty: "active" }]);
        const result = await interruptible(options.verification.verify(activeWorkspace, activeEffect, signal), signal);
        signal.throwIfAborted();
        const verdict = result.verification.verdict;
        const produced = shared.append({ kind: "work_produced", subject: activeEffect, data: { artifactId: result.artifact.artifactId, artifactDigest: result.artifact.digest, record: result.record, scope: result.artifact.scope } });
        log(`[work_produced] ${produced.subject} ${JSON.stringify(produced.data)}`);
        const event = shared.append({ kind: "work_verified", subject: activeEffect, data: { ...result.verification, record: result.record, checkDigest: result.checkDigest } });
        log(`[work_verified] ${event.subject} ${JSON.stringify(event.data)}`);
        const stillCurrent = directiveRevision() === basis;
        observe([{ kind: "status", label: "check", value: stillCurrent ? `${verdict.toLowerCase()} by the declared check` : "checked an earlier request; your latest message keeps this run open", certainty: !stillCurrent || verdict === "INCONCLUSIVE" ? "unknown" : verdict === "VERIFIED" ? "confirmed" : "failed" }]);
        if (verdict === "VERIFIED" && stillCurrent) {
          const evidence = shared.append({ kind: "evidence", subject: "builder", data: { claim: "The captured result satisfies the declared check", backing: result.record, artifactDigest: result.artifact.digest, effectId: activeEffect, checkDigest: result.checkDigest } });
          log(`[evidence] ${evidence.subject} ${JSON.stringify(evidence.data)}`);
          const translated = translateEvent(evidence);
          if (translated) observe([translated.entry]);
        }
        return { name: "finish", exit: verdict === "VERIFIED" && stillCurrent ? 0 : 1, output: JSON.stringify({ verdict, record: result.record, artifactDigest: result.artifact.digest, current: stillCurrent }) };
      }
      return interruptible((tools as ToolRunner & { run(request: Parameters<ToolRunner["run"]>[0], signal?: AbortSignal): ReturnType<ToolRunner["run"]> }).run(request, signal), signal);
    },
  };

  function wrapAtBoundary(inner: ModelAdapter): ModelAdapter {
    return {
      name: inner.name,
      async infer(frame) {
        const signal = controller!.signal;
        signal.throwIfAborted();
        options.journal?.assertWritable();
        // Read before the work exists. Everything after this line is the step.
        const read = shared.revision;
        basis = read;
        proposalDirective = directiveRevision();
        try {
          const response = await interruptible((inner as ModelAdapter & { infer(frame: Parameters<ModelAdapter["infer"]>[0], signal?: AbortSignal): ReturnType<ModelAdapter["infer"]> }).infer(withSharedContext(frame, shared.toSession()), signal), signal);
          // The response was derived from the old frame. Re-recording a step
          // cannot make its proposed actions current: discard them instead.
          return shared.revision === read ? response : { text: "", toolCalls: [] };
        } finally {
          basis = null;
          if (!signal.aborted) commitStep(read, frame);
        }
      },
    };
  }

  /**
   * Commit the step's record at the revision it was derived against, and say in
   * surface words what happened.
   *
   * The outcome is reported as it is, never collapsed: `committed` when nothing
   * moved, `rebased` when a sentence landed mid-step. Only the first is allowed
   * to read as ordinary progress, because a rebase means the run acted on a
   * frame older than the log, and a surface that said nothing would be hiding
   * the exact thing the person needs to see.
   */
  function commitStep(read: number, frame: Parameters<ModelAdapter["infer"]>[0]): void {
    const report = worker.step(
      (state) => ({
        kind: "action",
        subject: worker.subject,
        data: { text: `step ${frame.step} on ${state.goals[state.goals.length - 1]?.text ?? "the open goal"}`, tool: "step", step: frame.step },
      }),
      3,
      read,
    );

    const outcome: StepOutcome = report.outcome;
    // The committed record goes to the log whatever the outcome, because it was
    // appended through the store rather than through the loop's `append`, so
    // `onEvent` never saw it. Without this the step would be in the log and
    // invisible, which is worse than not having written it.
    if (outcome.kind === "committed" || outcome.kind === "rebased") {
      log(`[action] ${worker.subject} ${safeData(outcome.event)}`);
    }

    if (outcome.kind === "committed") return;

    // The mechanism words live here and nowhere else: `/inspect` is the only
    // reader of the raw log, and the timeline gets a sentence a person can read.
    // `from` is the revision the refused attempt was made against and `to` is
    // where the re-derived record landed, so a reader can see how far the world
    // moved while the step was running.
    const left = outcome.kind === "rebased" ? outcome.from : read;
    const landed = outcome.kind === "rebased" ? outcome.to : report.state.revision;
    log(`[work] ${outcome.kind} ${worker.subject} from ${left} to ${landed} after ${report.attempts} attempt${report.attempts === 1 ? "" : "s"}`);
    if (outcome.kind !== "rebased") return;

    observe([
      {
        kind: "status",
        label: "direction",
        value: "Your message was received; the earlier proposal was discarded.",
        certainty: "active",
      },
    ]);
  }

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
    inFlight = true;
    void start(scope, goal).catch(cause => {
      inFlight=false;
      send({type:"ended"});
      observe([{kind:"failure",text:`Le travail n’a pas démarré : ${cause instanceof Error ? cause.message : String(cause)}`}]);
    });
  };

  /** Start the real loop. Everything here is the part V1 could not do. */
  const start = async (scope: { path: string; name: string }, goal: string): Promise<void> => {
    options.journal?.assertWritable();
    controller = new AbortController();
    const signal = controller.signal;
    const subject = "builder";
    const requestId = `E-${mint()}`;
    activeEffect = requestId;
    activeWorkspace = scope.path;

    // The request is committed conditionally before the world is asked, so two
    // surfaces that both find a run allowed cannot both be right by the time it
    // lands. `null` means the journal moved, which is a refusal rather than an
    // error: nothing was written, and the person is told.
    //
    // Named `admitted` rather than `basis` because `basis` is the step's basis
    // in the boundary above, and two variables differing only by scope in the
    // same module is the kind of thing that is read wrong later.
    if (options.toolNames?.length) {
      shared.append({ kind: "directive", subject, data: { text: `tools: ${[...options.toolNames, ...(options.verification ? ["finish"] : [])].join(", ")}` } });
      shared.append({ kind: "directive", subject, data: { text:
        'These are command tools. Use input.argv with the exact tool name first, for example {"name":"ls","input":{"argv":["ls","-la"]}}. ' +
        'cat and ls also accept input.path. Paths and commands are relative to the declared working directory. ' +
        'Answer the user from the observed results; your text is displayed but is not verification.'
      } });
    }
    if (options.verification) {
      shared.append({ kind: "directive", subject, data: { text: "When the work is ready, propose finish with empty input. Cuesheet will independently run the owner-declared check against a captured result. You cannot select or change that check. A rejected or inconclusive verdict keeps the goal open." } });
    }
    const admitted = shared.revision;
    const committed = shared.appendIfCurrent(admitted, {
      kind: "effect_requested",
      subject: requestId,
      data: {
        effect: "RunAgent",
        effectId: requestId,
        affordance: "APPROVE_GOAL",
        reads: { goal: "known", project: "known" },
        cwd: scope.path, project: scope.name, goal,
      },
    });
    if (committed === null) {
      observe([{ kind: "failure", text: "another surface started first; nothing was run here." }]);
      log(`[effect_requested] ${requestId} refused; the log moved before it landed`);
      inFlight = false;
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
        } else if (typeof event.data.tool === "string") {
          at = pendingRow ? view.get().entries.indexOf(pendingRow) : undefined;
        }

        const translated = translateEvent(event, pendingAction, at);
        if (event.kind === "action") {
          pendingRow = translated?.entry;
        }
        if (event.kind === "observation" && typeof event.data.tool === "string") {
          pendingAction = undefined;
          pendingRow = undefined;
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
      // `guarded`, not `model`: the loop is given the boundary-wrapped adapter so
      // that every step commits at the revision it read. See the header.
      const outcome = await runAgentLoop(shared, guarded, currentTools, loopOptions);
      observe(entryForStop(outcome.stop));
      // The run returned. That is a fact about the process, not a success, so
      // the outcome records what the loop actually stopped on rather than
      // assuming it worked.
      recordObserved(outcome.stop.reason);
    } catch (cause) {
      if (signal.aborted) {
        send({ type: "interrupted" });
        pendingAction = undefined; pendingRow = undefined;
        observe([{ kind: "status", label: "work", value: "Interrompu. Le but reste ouvert ; les changements déjà faits sont conservés.", certainty: "unknown" }]);
        recordObserved("cancelled");
        return;
      }
      const why = cause instanceof Error ? cause.message : String(cause);
      observe([{ kind: "failure", text: `the run stopped: ${why}` }]);
      recordObserved(`failed: ${why}`);
    } finally {
      inFlight = false;
      send({ type: "ended" });
    }
  };

  const recordObserved = (reason: string): void => {
    const id = pendingRequest;
    pendingRequest = null;
    if (!id) return;
    if (options.journal && !options.journal.failure) shared.append({kind:"effect_observed",subject:id,data:{effectId:id,reason}});
    log(`[effect_observed] ${id} ${reason}`);
  };

  return {
    resume() {
      if(inFlight || options.journal?.failure) return;
      const historical=shared.toSession();
      const pending=historical.events.filter(event=>event.kind==="note" && event.subject==="terminal.user").at(-1);
      const lastGoal=historical.events.filter(event=>event.kind==="goal").at(-1);
      if(pending && pending.seq>(lastGoal?.seq ?? -1) && typeof pending.data.text==="string") {
        runWith(resolveScope(pending.data.text,cwd,ids,bindProject,projectsRoot),pending.data.text);return;
      }
      const goal=historical.goal;
      if(!goal || !goal.open) {observe([{kind:"status",label:"reprise",value:goal ? "Ce but a déjà été vérifié. Aucun travail n’a été relancé." : "Aucun but à reprendre dans cette session.",certainty:"unknown"}]);return;}
      const request=shared.toSession().events.filter(event=>event.kind==="effect_requested").at(-1);
      const path=typeof request?.data.cwd==="string" ? request.data.cwd : cwd;
      if(path!==cwd) {observe([{kind:"failure",text:"Le dernier travail ciblait un autre répertoire. Ouvre une nouvelle session dans ce répertoire."}]);return;}
      try {shared.append({kind:"directive",subject:"builder",data:{text:"The user explicitly resumed this goal. Inspect the current workspace before repeating effects: any tool without a recorded result may already have run before the previous process stopped."}});} catch {return;}
      runWith({at:"cwd",path,name:typeof request?.data.project==="string" ? request.data.project : view.get().project ?? "session"},goal.text);
    },
    cancel() {
      if (!inFlight || controller?.signal.aborted) return;
      log(`[cancel] ${pendingRequest ?? "run"} requested by the user`);
      controller?.abort(new Error("Run interrupted by the user"));
    },
    say(text: string) {
      const said = text.trim();
      if (!said) return;
      try {
        options.journal?.assertWritable();
        const memory = memoryCommand(shared, said);
        if (memory !== null) {
          send({ type: "submit", text: said });
          observe([{ kind: "status", label: "mémoire", value: memory, certainty: "unknown" }]);
          return;
        }
      } catch { return; }
      // Persist the user's instruction before showing it. View and harness journals
      // are separate, so neither a displayed directive nor an admitted tool may
      // depend on a write that has not happened yet.
      try {
        if(inFlight) shared.append({kind:"directive",subject:"builder",data:{text:said,source:"terminal.user"}});
        else if(options.journal) shared.append({kind:"note",subject:"terminal.user",data:{text:said}});
      } catch { return; }
      send({ type: "submit", text: said });
      if(options.journal?.failure) return;
      if(inFlight) {log(`[directive] builder ${said}`);return;}

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
      inFlight = true;
      void start({ path: option.path, name: option.name }, goal).catch(() => {inFlight=false;send({type:"ended"});});
    },
    get state() {
      return view.get();
    },
  };
}

/** Adapters that ignore the optional signal cannot commit a late result. */
function interruptible<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
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
