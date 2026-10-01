/**
 * The Shared Work State: the work language, projected from the log.
 *
 * The core already projects its log to a `Session`
 * (`src/core/store.ts:220`), and that projection is deliberately small. It keeps
 * a goal, directives, evidence, models and capabilities, and it ignores six of
 * the twelve event kinds on purpose, so that a consumer needing them reads the
 * events rather than finding them already discarded
 * (`src/core/store.ts:287-292`).
 *
 * This is that consumer. It is the second projection, over the same log, in the
 * vocabulary work is actually discussed in:
 *
 * ```text
 * goal  question  claim  decision  constraint  task  artifact
 * ```
 *
 * ## Why a second projection rather than a wider one
 *
 * The temptation is to widen `Session` until it holds everything. That would put
 * work vocabulary into the frozen core, and the core is what makes the product
 * trustworthy, so the cost is paid in the one place that must not pay it. Worse,
 * it would make every consumer of the session depend on work vocabulary it has
 * no use for.
 *
 * So the separation is the same one the repository already draws between a fold
 * and a view (`src/state.ts:1-22`): the log is the truth, this is a reading of
 * it, and a second reading is allowed to answer a different question. Two
 * projections over one log cannot disagree about the log, because neither of
 * them writes to it.
 *
 * ## What this buys, concretely
 *
 * A temporary worker can arrive and read this instead of a transcript. It needs
 * the goal, the decisions already taken, the evidence behind them, the artifacts
 * produced, and the questions nobody has answered. That is a bounded read, and it
 * is the whole of the substitution this slice exists to make possible: a worker
 * may die, and the next one does not need its messages.
 *
 * ## The one thing the state cannot tell you
 *
 * It cannot tell you whether the work is still *wanted*. That is not a fold
 * question, because "wanted" is a judgement made by a reader against a revision,
 * and a fold that answered it would be answering for whoever reads next. The
 * state carries the revision each item was recorded at, which is what lets a
 * reader decide (`src/work-worker.ts`).
 *
 * Purity is the constraint that makes it worth having. Like `state.ts`, this
 * module observes nothing: no clock, no filesystem, no `Date`. Everything it
 * reports is a reading of the event list it was handed, so the same events
 * always project the same state and a test needs no machine to check it.
 */

import type { Event } from "./core/store.ts";

/**
 * Where an item came from in the log.
 *
 * The sequence number, not the event index. The two differ the moment a log is
 * read back from a file whose first line was lost, and the sequence is the only
 * one of the two the store promised is stable forever
 * (`src/core/store.ts:25-26`).
 */
export interface Sourced {
  /** The sequence this was recorded at, so a reader can name its basis. */
  readonly at: number;
  /** The wall clock the store stamped. Never read from inside this module. */
  readonly when: number;
  /** Who recorded it. A worker subject, or a person. */
  readonly by: string;
}

/** What the work is trying to achieve. Several may be live at once. */
export interface Goal extends Sourced {
  readonly id: string;
  readonly text: string;
  /**
   * False once a later event closed it.
   *
   * The core closes a goal when evidence arrives about the same subject
   * (`src/core/store.ts:267-269`). This follows the same rule rather than
   * inventing a second one, because two closures for one goal would let a
   * reader be told a goal is done and open in the same pass.
   */
  readonly open: boolean;
}

/** A question nobody has answered. Open only; an answered one is not a question. */
export interface OpenQuestion extends Sourced {
  readonly id: string;
  readonly text: string;
  readonly by: string;
  /** The goal it belongs to, when it was raised against one. */
  readonly goal: string | null;
}

/**
 * Something asserted, kept separate from the evidence for it.
 *
 * This separation is the loop's founding commitment: the loop never ends because
 * a model said so (`src/core/loop.ts:14-22`), and an `observation` is a model's
 * words rather than a fact about the world. Folding them into one list would
 * restore exactly the collapse the core was written to prevent.
 */
export interface Claim extends Sourced {
  readonly id: string;
  readonly text: string;
  /** True when a tool produced it rather than the model asserting it. */
  readonly fromTool: boolean;
}

/** A choice that was made, with the revision it was made against. */
export interface Decision extends Sourced {
  readonly id: string;
  readonly text: string;
  /**
   * The revision the decision was taken against, or null when the record does
   * not say.
   *
   * Nullable rather than defaulted, for the same reason
   * `EffectRequest.revision` is (`src/effects.ts:52-63`): a record written
   * before this convention existed must read back as "does not say" rather than
   * acquire a number nobody wrote. Inventing a basis is how a decision becomes
   * unauditable while looking audited.
   */
  readonly against: number | null;
}

/** A boundary the work may not cross. Harder than a decision, which is a choice. */
export interface Constraint extends Sourced {
  readonly id: string;
  readonly text: string;
}

/** A unit of work, with the state the fold can honestly report about it. */
export interface Task extends Sourced {
  readonly id: string;
  readonly subject: string;
  readonly state: TaskState;
}

/**
 * What can be known about a task, which is not the same as what is true.
 *
 * Three states, and the third is the point. An effect that was requested and
 * never answered leaves a task in `asked`, not in `failed`: the world may still
 * be doing it, and a reader that called that a failure would be inventing a fact
 * (`src/effects.ts:11-20`).
 */
export type TaskState = "asked" | "running" | "settled";

/** Something produced, kept separate from whether anybody checked it. */
export interface Artifact extends Sourced {
  readonly id: string;
  readonly subject: string;
  readonly summary: string;
  /**
   * The verdict on the artifact, or null while nobody has checked.
   *
   * Null is not a failure. `work_produced` is an assertion and `work_verified`
   * is what an independent check concluded, and a third state is exactly what
   * keeps the two from collapsing into a success flag (VER-04,
   * `src/core/store.ts:60-64`).
   */
  readonly verdict: string | null;
}

/**
 * Everything a worker needs to understand the work without the transcript.
 *
 * `revision` is the first field for a reason. Every other field is a reading of
 * the log, and a reading taken against the wrong revision is the failure this
 * repository already named as P10. A reader that ignores `revision` and acts on
 * `decisions` is reading history as if it were current.
 */
export interface SharedWorkState {
  /** The revision this state was projected from. -1 for an empty log. */
  readonly revision: number;
  readonly goals: readonly Goal[];
  readonly openQuestions: readonly OpenQuestion[];
  readonly claims: readonly Claim[];
  readonly decisions: readonly Decision[];
  readonly constraints: readonly Constraint[];
  readonly tasks: readonly Task[];
  readonly artifacts: readonly Artifact[];
  /**
   * No `contextSources` field, and its absence is deliberate.
   *
   * Context sources are the one part of the work language that cannot be folded
   * out of this log: the core has no event kind that carries one, and adding one
   * would mean modifying `src/core/**`, which is frozen. So a source is supplied
   * by whoever resolved the scope, through `work-context.ts`, rather than
   * projected from here.
   *
   * The alternative was a field that is always empty, and an always-empty field
   * in a state a worker reads is worse than no field at all: a reader would
   * check it, find nothing, and be unable to tell "no source was resolved" from
   * "this projection does not know about sources". A missing field is a legible
   * absence; an empty one is a claim.
   */
  /**
   * The most recent event, for a reader that wants to know whether it is looking
   * at something still moving. History, never current state.
   */
  readonly lastAt: number;
}

/** One item's identity, as read out of an event. */
function idOf(event: Event, field = "id"): string {
  const raw = event.data[field];
  if (typeof raw === "string" && raw.length > 0) return raw;
  // Falling back to the sequence keeps every item addressable without inventing
  // an id. A caller can then say "decision 7", which is checkable, where a
  // synthetic uuid would be checkable only by this module.
  return `#${event.seq}`;
}

function textOf(event: Event, field = "text"): string {
  const raw = event.data[field];
  return typeof raw === "string" ? raw : "";
}

/** The subject an event was about, falling back to nothing rather than a guess. */
function subjectOf(event: Event): string {
  return typeof event.subject === "string" ? event.subject : "";
}

/**
 * The revision an event says it was taken against.
 *
 * Only a number counts. A string, a boolean, or an absent field all mean the
 * same thing here: the record does not say, and reading it as revision 0 would
 * claim a basis no one wrote down.
 */
function againstOf(event: Event): number | null {
  const raw = event.data.against ?? event.data.revision;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * Project the log into the work language.
 *
 * Pure, in the strongest sense the repository uses it: the same event list
 * always gives the same state, and nothing here reads a clock, a file, or a
 * process. That is what makes a stale-revision bug assertable at all, because a
 * projection that could drift would let a test pass on a state the real work
 * never saw.
 *
 * Every event kind is read, including the six the core session fold skips. That
 * is the entire reason this module exists; see the header.
 */
export function projectWork(events: readonly Event[]): SharedWorkState {
  const goals: Goal[] = [];
  const openQuestions: OpenQuestion[] = [];
  const claims: Claim[] = [];
  const decisions: Decision[] = [];
  const constraints: Constraint[] = [];
  const tasks: Task[] = [];
  const artifacts: Artifact[] = [];

  // Effects and artifacts are keyed by id rather than pushed, because the second
  // event about a thing is a *change of state* for it, not a second thing. A
  // list would report one spawn as two.
  const asked = new Map<string, { at: number; when: number; by: string; subject: string }>();
  const settled = new Set<string>();
  const produced = new Map<string, Artifact>();

  for (const event of events) {
    const sourced: Sourced = { at: event.seq, when: event.at, by: subjectOf(event) };

    switch (event.kind) {
      case "goal": {
        goals.push({ ...sourced, id: idOf(event), text: textOf(event), open: true });
        break;
      }
      case "directive": {
        // A directive is an instruction to a subject, so it is the closest thing
        // the log has to a constraint. Mapping it here rather than inventing a
        // constraint event keeps the vocabulary a reading of the log instead of a
        // second log nobody can check against this one.
        constraints.push({ ...sourced, id: idOf(event), text: textOf(event) });
        break;
      }
      case "note": {
        const text = textOf(event);
        if (text.length === 0) break;
        // A note is how a person speaks into the log without the machinery. It
        // becomes a question, because an unrecorded question is one the next
        // worker cannot find. It is not made a decision: nothing in a note
        // establishes that anything was weighed, and treating speech as a
        // decision is how a conversation becomes an authority it never had.
        openQuestions.push({
          ...sourced,
          id: idOf(event),
          text,
          goal: typeof event.data.goal === "string" ? event.data.goal : null,
        });
        break;
      }
      case "observation": {
        claims.push({
          ...sourced,
          id: idOf(event),
          text: textOf(event),
          // A tool observation carries the tool's name and an exit code; a model's
          // words do not. Keying on the shape rather than on the wording is what
          // keeps a model that says "exit 0" from claiming to be a tool result.
          fromTool: typeof event.data.tool === "string",
        });
        break;
      }
      case "action": {
        // A committed choice, as distinct from a claim about one. The loop emits
        // an action before the tool runs and an observation after, so an action
        // is the closest honest record of "this was decided and attempted".
        decisions.push({
          ...sourced,
          id: idOf(event),
          text: textOf(event, "text") || textOf(event, "tool"),
          against: againstOf(event),
        });
        break;
      }
      case "evidence": {
        // Evidence about a goal closes it, matching the core fold
        // (`src/core/store.ts:267-269`) rather than adding a second rule.
        const subject = subjectOf(event);
        const index = goals.findIndex((g) => g.id === subject);
        if (index >= 0) {
          goals[index] = { ...goals[index]!, open: false };
        }
        break;
      }
      case "effect_requested": {
        const id = typeof event.data.effectId === "string" ? event.data.effectId : idOf(event);
        asked.set(id, { ...sourced, subject: subjectOf(event) });
        break;
      }
      case "effect_observed": {
        // Only an observation that names its request settles it. An effect
        // observed without a matching request is a second fact, not a
        // completion, and folding it as one would let a log invent a task it
        // never admitted to having.
        const id = typeof event.data.effectId === "string" ? event.data.effectId : null;
        if (id !== null && asked.has(id)) settled.add(id);
        break;
      }
      case "work_produced": {
        const id = typeof event.data.artifactId === "string" ? event.data.artifactId : idOf(event);
        produced.set(id, {
          ...sourced,
          id,
          subject: subjectOf(event),
          summary: textOf(event, "summary"),
          verdict: null,
        });
        break;
      }
      case "work_verified": {
        // A verdict attaches to a production rather than replacing it, so a
        // rejection stays a second historical fact and the first one survives.
        const id =
          typeof event.data.artifactId === "string"
            ? event.data.artifactId
            : typeof event.data.against === "string"
              ? event.data.against
              : null;
        const artifact = id !== null ? produced.get(id) : undefined;
        if (artifact) {
          produced.set(id!, { ...artifact, verdict: textOf(event, "verdict") || "rejected" });
        }
        break;
      }
      case "capability":
      case "model": {
        // Read, and deliberately not projected. A capability or a model binding
        // is what a subject *can* do, not what the work *is*, and folding them in
        // would invite a reader to treat a tool list as a plan. Leaving them out
        // is the same choice the core fold makes, in the other direction.
        break;
      }
    }
  }

  for (const [id, request] of asked) {
    tasks.push({
      at: request.at,
      when: request.when,
      by: request.by,
      id,
      subject: request.subject,
      // Never `failed`. A request that was never answered is `asked`, and that is
      // the whole distinction between an unobserved world and a refusing one
      // (`src/effects.ts:11-20`).
      state: settled.has(id) ? "settled" : "asked",
    });
  }

  const last = events.length > 0 ? events[events.length - 1]! : undefined;

  return {
    // -1 for an empty log, and it has to agree with the store's own answer
    // (`src/core/store.ts:184-190`) or a caller comparing the two would see a
    // disagreement where there is none. CON-06.
    revision: last === undefined ? -1 : last.seq,
    goals,
    openQuestions,
    claims,
    decisions,
    constraints,
    tasks,
    artifacts: [...produced.values()],
    lastAt: last === undefined ? 0 : last.at,
  };
}

/** The state of nothing. An honest starting point, not a guess at a default. */
export const NO_WORK: SharedWorkState = projectWork([]);

/**
 * A sentence for a reader, never a summary the log did not support.
 *
 * Long on purpose. A reader left to invent a short line will invent a wrong one,
 * which is the same defect `describeWork` avoids in `src/work.ts:187-199`.
 */
export function describeWork(state: SharedWorkState): string[] {
  const lines: string[] = [`at revision ${state.revision}`];
  if (state.goals.length === 0) lines.push("no goal recorded");
  for (const goal of state.goals) {
    lines.push(`${goal.open ? "goal" : "closed goal"}: ${goal.text}`);
  }
  for (const decision of state.decisions) {
    const basis = decision.against === null ? "basis not recorded" : `decided at ${decision.against}`;
    lines.push(`decision: ${decision.text} (${basis})`);
  }
  for (const constraint of state.constraints) {
    lines.push(`constraint: ${constraint.text}`);
  }
  for (const artifact of state.artifacts) {
    const verdict = artifact.verdict === null ? "not checked" : artifact.verdict;
    lines.push(`artifact: ${artifact.summary || artifact.id} (${verdict})`);
  }
  if (state.openQuestions.length > 0) {
    for (const question of state.openQuestions) lines.push(`open question: ${question.text}`);
  }
  if (state.tasks.length > 0) {
    for (const task of state.tasks) lines.push(`task ${task.id}: ${task.state}`);
  }
  return lines;
}
