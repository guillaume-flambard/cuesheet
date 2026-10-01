/**
 * SW-01: a Shared Work State, and the stale-revision rebase it must prove.
 *
 * The crux is the last describe block and everything else exists to make it
 * runnable. The owner's case:
 *
 * ```text
 * a worker reads revision 127
 * a human says "stop, focus Spotlight instead"
 * the state is 128
 * the worker tries to commit a decision taken against 127
 * appendIfCurrent(127) is refused
 * the worker re-reads, rebases, and continues
 * ```
 *
 * Two conventions from the house style apply. The whole file runs with no
 * terminal, no provider and no clock, because a worker's behaviour that can only
 * be read by running a surface was never verified
 * (`apps/terminal/src/render.ts:143`, restated in `test/surface-v2.test.ts:20-26`).
 * And structural claims are read off source rather than trusted: `WORK-04` and
 * `WORK-05` are assertions about what this repository's files contain, so they
 * fail when the claim stops being true rather than when someone remembers to
 * update a comment.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EventStore, type Event, type NewEvent } from "../src/core/store.ts";
import {
  describeWork,
  projectWork,
  NO_WORK,
  type SharedWorkState,
} from "../src/work-state.ts";
import {
  CONTEXT_SOURCE_KINDS,
  contextSourceFromBinding,
  describeContextSource,
  isContextSourceKind,
  previousSessionSource,
  scratchSource,
} from "../src/work-context.ts";
import { temporaryWorker, type WorkLog } from "../src/work-worker.ts";
import { bindProject, type ProjectIdentity } from "../src/adapters/project-binding.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = 1_800_000_000_000;

/**
 * Remove comments, so an assertion can be about code rather than about prose.
 *
 * The house pattern, from `test/surface-v2.test.ts:80-84`. It matters here
 * because these modules explain themselves in terms of what they refuse to be,
 * so a scan that read the explanation would find the refusal.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * A clock that answers a fixed time, so every event in a test is comparable and
 * no assertion depends on how fast the machine ran.
 */
const fixedClock = (): (() => number) => {
  let tick = 0;
  return () => NOW + tick++;
};

/** A store, and the log the worker layer will be handed. */
function withStore(fn: (store: EventStore, log: WorkLog) => void): void {
  const store = new EventStore("s", fixedClock());
  // The adapter is passed as an interface, which is the point: the same worker
  // runs over this and over a durable store, so a test can reach a refusal
  // without a lock file.
  const log: WorkLog = {
    read: () => store.toSession().events,
    revision: () => store.revision,
    appendIfCurrent: (expected, event) => store.appendIfCurrent(expected, event),
  };
  fn(store, log);
}

/** The events a store holds, as a comparable list. */
const eventsOf = (store: EventStore): Event[] => store.toSession().events;

/** A decision-shaped event, so a test states the decision and not the plumbing. */
const decision = (subject: string, text: string): NewEvent => ({
  kind: "action",
  subject,
  data: { text, tool: "commit" },
});

/**
 * A portfolio identity for a fake project, with every field the binder reads.
 *
 * Built through one function so a test never hand-rolls a partial identity: the
 * binder reads `description` and a missing one throws rather than failing to
 * match, which is a confusing way to learn the shape
 * (`src/adapters/project-binding.ts:65-77`).
 */
function identity(name: string, path: string): ProjectIdentity {
  return {
    name,
    path,
    kind: "repo",
    status: "active",
    nature: "a fake project for a test",
    stack: "typescript",
    exists: true,
  };
}

// ─── the projection ──────────────────────────────────────────────────────────

describe("SW-01 the work language is a reading of the log, and nothing else", () => {
  it("the same events project the same state, twice", () => {
    withStore((store) => {
      store.append({ kind: "goal", subject: "g1", data: { id: "g1", text: "make it work" } });
      store.append(decision("w1", "use the guard"));
      const first = projectWork(store.toSession().events);
      const second = projectWork(store.toSession().events);
      assert.deepEqual(second, first, "a pure fold cannot drift between calls");
    });
  });

  it("an empty log is revision -1 and holds nothing, and saying otherwise would be a guess", () => {
    assert.equal(NO_WORK.revision, -1);
    assert.deepEqual(NO_WORK.goals, []);
    assert.deepEqual(NO_WORK.decisions, []);
    // The fold and the store must agree, or a reader comparing them would see a
    // disagreement where there is none. CON-06.
    withStore((store, log) => {
      assert.equal(log.revision(), -1);
      assert.equal(projectWork(log.read()).revision, -1);
    });
  });

  it("it reads the six event kinds the core session fold deliberately ignores", () => {
    // The reason this projection exists at all. If it only ever read what
    // `toSession` already reads, it would be a second reading of the same thing.
    withStore((store) => {
      store.append({ kind: "goal", subject: "g1", data: { id: "g1", text: "ship" } });
      store.append({ kind: "effect_requested", subject: "E1", data: { effectId: "E1" } });
      store.append({ kind: "effect_observed", subject: "E1", data: { effectId: "E1", outcome: "succeeded" } });
      store.append({ kind: "work_produced", subject: "w1", data: { artifactId: "a1", summary: "a report" } });
      store.append({ kind: "work_verified", subject: "w1", data: { artifactId: "a1", verdict: "VERIFIED" } });
      store.append(decision("w1", "run the test"));
      store.append({ kind: "observation", subject: "w1", data: { text: "it passed" } });
      store.append({ kind: "note", subject: "human", data: { text: "which database?" } });

      const state = projectWork(store.toSession().events);
      assert.equal(state.tasks.length, 1, "an effect request and its observation");
      assert.equal(state.artifacts.length, 1, "one production, not two");
      assert.equal(state.artifacts[0]!.verdict, "VERIFIED");
      assert.equal(state.decisions.length, 1);
      assert.equal(state.claims.length, 1);
      assert.equal(state.openQuestions.length, 1);
    });
  });

  it("a claim is not the evidence for it", () => {
    // The separation the loop was built on: the loop never ends because a model
    // said so (src/core/loop.ts:14-22). A projection that folded a model's words
    // into evidence would restore the collapse.
    withStore((store) => {
      store.append({ kind: "goal", subject: "g1", data: { id: "g1", text: "ship" } });
      store.append({ kind: "observation", subject: "w1", data: { text: "I fixed it" } });
      const state = projectWork(store.toSession().events);
      assert.equal(state.claims.length, 1);
      assert.equal(state.claims[0]!.fromTool, false);
      // A model's own claim closes nothing.
      assert.equal(state.goals[0]!.open, true, "a claim is not a completion");
    });
  });

  it("a task that was never answered is asked, never failed", () => {
    // The three-state distinction from src/work.ts:6-27 and src/effects.ts:11-20.
    // A world that has not answered is not a world that refused.
    withStore((store) => {
      store.append({ kind: "effect_requested", subject: "E1", data: { effectId: "E1" } });
      const state = projectWork(store.toSession().events);
      assert.equal(state.tasks[0]!.state, "asked");
    });
  });

  it("an artifact nobody checked is not checked, and not a failure", () => {
    withStore((store) => {
      store.append({ kind: "work_produced", subject: "w1", data: { artifactId: "a1", summary: "s" } });
      const state = projectWork(store.toSession().events);
      assert.equal(state.artifacts[0]!.verdict, null, "null is not a rejection");
    });
  });

  it("a decision whose basis was not recorded says so, rather than acquiring a number", () => {
    // Same reasoning as EffectRequest.revision (src/effects.ts:52-63): inventing
    // a basis is how a decision becomes unauditable while looking audited.
    withStore((store) => {
      store.append({ kind: "action", subject: "w1", data: { text: "d", tool: "t" } });
      assert.equal(projectWork(store.toSession().events).decisions[0]!.against, null);
    });
  });

  it("it describes itself without inventing anything", () => {
    withStore((store) => {
      store.append({ kind: "goal", subject: "g1", data: { id: "g1", text: "ship it" } });
      const lines = describeWork(projectWork(store.toSession().events));
      assert.ok(lines.some((l) => l.includes("goal: ship it")), lines.join(" | "));
      assert.ok(lines[0]!.startsWith("at revision "), "the basis leads");
    });
    assert.ok(describeWork(NO_WORK).some((l) => l.includes("no goal recorded")));
  });
});

// ─── context sources: no repository required ─────────────────────────────────

describe("SW-01 a context source is polymorphic, so no repository is required", () => {
  it("every kind is in the closed union, as a value and not only as a type", () => {
    // The same reasoning as EVENT_KINDS_OF_STORE (src/core/store.ts:66-86): a
    // consumer that has to restate the list is a consumer that will drift.
    assert.deepEqual([...CONTEXT_SOURCE_KINDS], [
      "repository", "web", "file", "artifact", "scratch", "previous_session",
    ]);
    for (const kind of CONTEXT_SOURCE_KINDS) assert.equal(isContextSourceKind(kind), true);
    assert.equal(isContextSourceKind("database"), false);
  });

  it("a scratch source is a real source, so work with no repository is describable", () => {
    const at = { at: 1, when: NOW, by: "human" };
    const source = scratchSource("s1", "an idea", at);
    assert.equal(source.kind, "scratch");
    // The sentence says so in words, because a reader shown "scratch" alone
    // would not know the repository is absent on purpose.
    assert.match(describeContextSource(source), /no repository/);
  });

  it("a previous session is named, not copied", () => {
    const source = previousSessionSource("s2", "s-42", { at: 2, when: NOW, by: "w2" });
    assert.equal(source.kind, "previous_session");
    assert.equal(source.name, "s-42");
    assert.match(describeContextSource(source), /continuing session/);
  });

  it("a bound repository becomes a source carrying the basis it matched on", () => {
    const identities: ProjectIdentity[] = [identity("cuesheet", "/w/cuesheet")];
    const binding = bindProject("fix cuesheet today", identities);
    assert.equal(binding.kind, "bound");
    const source = contextSourceFromBinding(binding, { at: 3, when: NOW, by: "human" })!;
    assert.equal(source.kind, "repository");
    assert.equal(source.name, "/w/cuesheet");
    // BIND-01's basis, carried forward so a reader can check the match.
    assert.match(source.why!, /matched on/);
  });

  it("an ambiguous or absent scope yields no source, rather than a silent pick", () => {
    // BIND-05: more than one candidate is a question to a person, and this
    // function has no person to ask. It must not invent a scope.
    const identities: ProjectIdentity[] = [identity("alpha", "/w/alpha"), identity("beta", "/w/beta")];
    const at = { at: 1, when: NOW, by: "human" };
    assert.equal(contextSourceFromBinding(bindProject("work on alpha and beta", identities), at), null);
    assert.equal(contextSourceFromBinding(bindProject("nothing matches here", identities), at), null);
  });
});

// ─── the crux: a stale commit is refused, and the worker rebases ──────────────

describe("SW-02, SW-03 the crux: a decision taken against a stale revision is refused", () => {
  it("a worker commits at the revision it read", () => {
    withStore((store, log) => {
      const worker = temporaryWorker(log, "w1");
      const basis = worker.read().revision;
      const report = worker.step((state) => decision(worker.subject, `working from ${state.revision}`));
      assert.equal(report.outcome.kind, "committed");
      assert.equal(report.attempts, 1);
      // The commit names its basis, so a later reader can audit it (CON-01).
      assert.equal(report.state.decisions[0]!.against, basis);
      // One event appended. The first sequence is 1 even on an empty journal
      // (src/core/store.ts:169), so the count is asserted rather than arithmetic
      // on the revision.
      assert.equal(log.read().length, 1);
      assert.equal(store.revision, 1);
    });
  });

  it("THE CRUX: the human bumps the revision, the commit is refused, the worker rebases and continues", () => {
    withStore((store, log) => {
      const worker = temporaryWorker(log, "w1");
      store.append({ kind: "goal", subject: "human", data: { id: "g1", text: "finish the parser" } });

      // 1. The worker reads and takes its decision against 127.
      const basis = worker.read().revision;
      assert.equal(basis, 1, "the goal is at revision 1");

      // 2. A human message lands while the worker is in flight. "stop, focus
      //    Spotlight instead" is a new constraint, appended by someone else.
      store.append({ kind: "directive", subject: "human", data: { id: "c1", text: "stop, focus Spotlight instead" } });
      assert.equal(store.revision, 2, "the state moved under the worker");

      // 3. The worker commits the decision it formed against 127. The guard
      //    refuses, and it wrote nothing at all.
      const committed = store.appendIfCurrent(basis, decision("w1", "keep going on the parser"));
      assert.equal(committed, null, "the guard refuses a stale decision");
      assert.equal(store.revision, 2, "a refusal wrote nothing");

      // 4. The worker, through the real API, handles the refusal: it re-reads,
      //    re-derives against the new state, and commits at the new revision.
      //    The producer is a function of the state, so the only way to produce
      //    "focus Spotlight" is to have read the directive that says so.
      const report = worker.step((state) => {
        const constraint = state.constraints.find((c) => c.text.includes("Spotlight"));
        return decision(worker.subject, constraint ? "focus Spotlight instead" : "keep going on the parser");
      });

      assert.equal(report.outcome.kind, "committed");
      assert.equal(report.attempts, 1, "no refusal happened this time, because the basis was re-read first");
      // The re-derived decision is in the log, and the stale one is nowhere.
      const texts = projectWork(log.read()).decisions.map((d) => d.text);
      assert.deepEqual(texts, ["focus Spotlight instead"], "the decision was re-derived, not retried");
      assert.ok(!texts.includes("keep going on the parser"), "the stale decision was never written");
    });
  });

  it("a worker that reads a stale basis and commits is refused, and step() rebases for it", () => {
    // The same crux, but the staleness arrives between the read and the commit
    // inside one step, which is the window P10 was built for
    // (test/control-revision.test.ts:48-58). Here the interleaving is inside the
    // producer, so the whole rebase path runs without a second actor.
    withStore((store, log) => {
      const worker = temporaryWorker(log, "w1");
      store.append({ kind: "goal", subject: "human", data: { id: "g1", text: "g" } });

      const report = worker.step((state, attempt) => {
        // On the first attempt, someone else writes while the worker is busy, so
        // the commit is made against a revision that has already moved.
        if (attempt === 1) {
          store.append({ kind: "directive", subject: "human", data: { id: "c1", text: "focus Spotlight" } });
        }
        return decision(worker.subject, `derived at ${state.revision}`);
      });

      assert.equal(report.outcome.kind, "rebased", "the refusal was handled, not hidden");
      assert.equal(report.attempts, 2, "one refusal, one re-derivation");
      const outcome = report.outcome;
      if (outcome.kind !== "rebased") throw new Error("unreachable");
      assert.equal(outcome.from, 1, "the attempt was made against revision 1");
      assert.equal(outcome.to, 3, "the re-derived decision landed at 3, after the directive at 2");
      // The committed decision was derived against the state that included the
      // directive, which is the whole content of "rebase". It is not 1, and it is
      // not the revision the log happened to be at when the refusal was noticed.
      assert.equal(report.state.decisions[0]!.against, 2);
      // And the first attempt's decision text never reached the log at all.
      assert.equal(
        report.state.decisions.filter((d) => d.against === 1).length,
        0,
        "the refused attempt wrote nothing",
      );
    });
  });

  it("a producer that declines records nothing, and that is not a failure", () => {
    // Three states, not two: committed, declined, exhausted. A boolean would
    // have collapsed the middle one into a failed commit.
    withStore((store, log) => {
      const worker = temporaryWorker(log, "w1");
      const before = store.revision;
      const report = worker.step(() => null);
      assert.equal(report.outcome.kind, "declined");
      assert.equal(store.revision, before, "nothing was written");
    });
  });

  it("a log that never stops moving exhausts the budget rather than spinning", () => {
    withStore((store, log) => {
      const worker = temporaryWorker(log, "w1");
      // A producer that writes on every attempt: the world moves every time, so
      // the rebase loop has to be bounded by something.
      const report = worker.step((state) => {
        store.append({ kind: "note", subject: "other", data: { text: `noise at ${state.revision}` } });
        return decision(worker.subject, "try");
      }, 3);
      assert.equal(report.outcome.kind, "exhausted");
      assert.equal(report.attempts, 3);
    });
  });
});

// ─── several workers, one state, no queue ────────────────────────────────────

describe("SW-04 two temporary workers, one projection, no channel between them", () => {
  it("each sees the other's output through the state, and neither is given the other", () => {
    withStore((store, log) => {
      const a = temporaryWorker(log, "w-a");
      const b = temporaryWorker(log, "w-b");

      // A works, and its decision lands in the shared log.
      a.step(() => decision(a.subject, "A: parse the input first"));
      // B never met A. It reads the state, which contains A's work.
      const seenByB = b.read().decisions.map((d) => d.text);
      assert.deepEqual(seenByB, ["A: parse the input first"], "B learned it from the state, not from A");

      // And B's own work lands in the same place, where A can now read it.
      b.step(() => decision(b.subject, "B: then index it"));
      const seenByA = a.read().decisions.map((d) => d.text);
      assert.deepEqual(seenByA, ["A: parse the input first", "B: then index it"]);

      // Neither worker is a parameter, field, or return of the other.
      assert.deepEqual(Object.keys(a).sort(), ["read", "step", "subject"]);
      assert.deepEqual(Object.keys(b).sort(), ["read", "step", "subject"]);
    });
  });

  it("a new worker picks up where a dead one left off, without the transcript", () => {
    // The substitution this slice exists to make possible. The dead worker is
    // gone entirely; the state carries what the next one needs.
    withStore((store, log) => {
      const first = temporaryWorker(log, "w-gone");
      store.append({ kind: "goal", subject: "human", data: { id: "g1", text: "make the thing work" } });
      first.step(() => decision(first.subject, "chose the guard over a lock"));
      store.append({ kind: "work_produced", subject: "w-gone", data: { artifactId: "a1", summary: "a test" } });
      store.append({ kind: "note", subject: "human", data: { text: "which parser?" } });

      // A completely separate worker, with no reference to the first.
      const second = temporaryWorker(log, "w-new");
      const state: SharedWorkState = second.read();
      assert.equal(state.goals[0]!.text, "make the thing work");
      assert.equal(state.decisions[0]!.text, "chose the guard over a lock");
      assert.equal(state.artifacts[0]!.summary, "a test");
      assert.equal(state.openQuestions[0]!.text, "which parser?");
      // Six events, and the whole of the work is readable from them. No
      // transcript, because a transcript is the thing this project stopped
      // depending on (src/core/store.ts:6-9).
      assert.equal(log.read().length, 4);
    });
  });

  it("a worker's step ends at the boundary, and what it already appended stays", () => {
    // SW-05: the safe boundary is the step. Everything already in the log
    // survives, because the log is append-only (src/core/store.ts:159-163) and
    // "obsolete" must never mean "undo".
    withStore((store, log) => {
      const worker = temporaryWorker(log, "w1");
      store.append({ kind: "goal", subject: "human", data: { id: "g1", text: "g" } });
      worker.step(() => decision(worker.subject, "first step done"));
      const afterFirst = store.revision;

      // The work becomes obsolete. This is the human's message, and it is
      // appended to the shared log exactly as the crux's is: not a control event
      // aimed at a worker, a fact about the work.
      store.append({ kind: "directive", subject: "human", data: { id: "c1", text: "stop" } });

      // The worker takes no further step, and it declines by reading: the
      // producer is handed the state and returns nothing because the state says
      // stop. There is no cancellation flag and no scheduler involved, which is
      // the point of putting the boundary at the step.
      const report = worker.step((state) =>
        state.constraints.some((c) => c.text === "stop") ? null : decision(worker.subject, "second step"),
      );
      assert.equal(report.outcome.kind, "declined");
      assert.equal(store.revision, afterFirst + 1, "only the directive was appended, not the work");
      // And the earlier work is intact rather than rolled back.
      assert.deepEqual(
        projectWork(log.read()).decisions.map((d) => d.text),
        ["first step done"],
      );
    });
  });
});

// ─── the claims that must stay true as the code changes ─────────────────────

describe("SW-06 the claims about this code are read off the source, not trusted", () => {
  it("WORK-04 no worker-to-worker channel exists anywhere in the work layer", () => {
    // The brief asks for a structural test that would fail if someone added
    // one. A comment cannot fail, so this reads the three modules and asserts
    // the absence of every shape a channel would take.
    //
    // Comments are stripped first, and that is the load-bearing detail rather
    // than a convenience: this layer's own doc comment names the channel
    // vocabulary in order to deny it, so a scan that read prose would fail on the
    // denial. The house pattern for this already exists in
    // `test/surface-v2.test.ts:80-84`, which strips before asserting precisely
    // so an assertion can be about behaviour rather than about prose.
    const MODULES = ["work-state.ts", "work-context.ts", "work-worker.ts"];
    const sources = MODULES.map((name) => stripComments(readFileSync(join(ROOT, "src", name), "utf8")));

    // The vocabulary of a channel: a way for one worker to address, wake, or be
    // read by another. Only code counts, per the stripping above.
    const CHANNEL = /\b(inbox|outbox|mailbox|channel|publish|subscribe|broadcast|deliverTo|sendTo|receiveFrom|peer|onMessage|emitTo)\b/;
    for (const [index, text] of sources.entries()) {
      const found = text.match(CHANNEL);
      assert.equal(
        found,
        null,
        `src/${MODULES[index]} names "${found?.[0]}" in code, which would be a channel`,
      );
    }

    // The stronger form, and the one that would really catch an addition: the
    // worker's entire surface is three members, and a peer would have to be one
    // of them. Read off the interface rather than off a list written here, so
    // adding a member to `TemporaryWorker` fails this test.
    //
    // Both member forms are collected, because the interface mixes them:
    // `readonly subject: string` is a property and `read(): SharedWorkState` is
    // a method. Reading only the properties would let a peer hide in a method
    // signature, which is precisely where one would be added.
    const workerSource = readFileSync(join(ROOT, "src", "work-worker.ts"), "utf8");
    const start = workerSource.indexOf("export interface TemporaryWorker");
    assert.notEqual(start, -1, "TemporaryWorker is the surface being asserted about");
    const declared = workerSource.slice(start, workerSource.indexOf("\n}", start));
    const members = declared
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^(readonly\s+)?[a-zA-Z_]\w*\s*[(:]/.test(line))
      .map((line) => line.replace(/^readonly\s+/, "").split(/[(:]/)[0]!);
    assert.deepEqual(
      members,
      ["subject", "read", "step"],
      "a peer would have to appear in this list",
    );
  });

  it("WORK-05 the work layer imports nothing that could observe", () => {
    // VIEW-01b's reasoning one layer up: purity should be a property of the
    // import list, not of the author's discipline. No `node:` import, and no
    // absolute path or homedir, so a test never needs a machine.
    for (const name of ["work-state.ts", "work-context.ts", "work-worker.ts"]) {
      const text = readFileSync(join(ROOT, "src", name), "utf8");
      assert.doesNotMatch(text, /from\s+["']node:/, `${name} imports a machine`);
      assert.doesNotMatch(text, /homedir\(|process\.cwd|process\.env/, `${name} names a machine`);
      assert.doesNotMatch(text, /\/Users\/[a-z0-9_-]+/i, `${name} names a person`);
      assert.doesNotMatch(text, /\bDate\.now\(|\bnew Date\b|\bMath\.random\(/, `${name} reads a clock`);
    }
  });

  it("WORK-07 the state carries no field that is always empty", () => {
    // The projection has no context sources, and that is recorded as an absence
    // rather than an empty list. A field that is structurally always empty tells
    // a reader it knows something and found nothing, which is a claim it cannot
    // support. This asserts the removal, so it cannot be reintroduced by an edit
    // that looks like a completion.
    // Stripped, because the interface carries a doc comment explaining the
    // absence, and an assertion that failed on its own explanation would be a
    // test against documentation. What is asserted is the code, not the prose.
    const state = stripComments(readFileSync(join(ROOT, "src", "work-state.ts"), "utf8"));
    const body = state.slice(state.indexOf("export interface SharedWorkState"));
    assert.doesNotMatch(
      body,
      /contextSource/,
      "context sources cannot be folded from this log, so the state must not pretend to hold them",
    );
    // And the state a worker actually reads is complete rather than padded.
    assert.deepEqual(
      Object.keys(projectWork([])).sort(),
      [
        "artifacts", "claims", "constraints", "decisions", "goals", "lastAt",
        "openQuestions", "revision", "tasks",
      ],
      "every field, and no field that nothing produces",
    );
  });

  it("WORK-06 nothing under src/core was touched by this slice", () => {
    // The frozen core is the reason the product is trustworthy, so the constraint
    // is asserted rather than promised.
    const core = projectWork; // referenced so the import is not merely decorative
    assert.equal(typeof core, "function");
    // The work layer's only route into the core is the event type, never the
    // store: a projection that constructed a store could sequence its own reads.
    const state = readFileSync(join(ROOT, "src", "work-state.ts"), "utf8");
    const imports = [...state.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    assert.deepEqual(imports, ["./core/store.ts"], "one import, and it is a type");
    assert.doesNotMatch(state, /new EventStore/, "a projection does not create a log");
  });
});
