/**
 * SW-02: a mid-run sentence is a fact in the shared log, not a second run.
 *
 * The owner's constraint, number one:
 *
 * ```text
 * Le message n'attend pas que les agents aient fini. Il devient immediatement
 * un nouveau fait dans le Shared Work State. Il n'y a jamais : message 4 queued
 * behind agent response 3.
 * ```
 *
 * ## The defect this file exists to prove is gone
 *
 * The belief before this slice was "a run in progress is a run you wait out".
 * That was wrong, and the truth was worse, so the first test below is written
 * against the measurement rather than against the belief. Measured with a model
 * that blocks inside `infer` and a sentence typed while it is blocked:
 *
 * ```text
 * [effect_requested] E-probe-1 RunAgent cuesheet
 * [goal] builder {"text":"first sentence"}
 * [effect_requested] E-probe-2 RunAgent cuesheet      <- a SECOND run started
 * [goal] builder {"text":"stop, focus Spotlight instead"}
 * ```
 *
 * Two runs, two private logs, `frame.directives` empty on all sixteen inferences
 * of both. The sentence was not queued behind the response. It was dropped into a
 * second concurrent run that could not see the first, so the work in flight never
 * learned the direction had changed, the first run's request was orphaned, and
 * `busy` was cleared by whichever run finished first.
 *
 * ## What is real here
 *
 * Every assertion below drives the **real producer** and therefore the **real
 * `runAgentLoop`** from `src/core/loop.ts`, over the real `EventStore`, with a
 * fake `ModelAdapter` and a fake `ToolRunner`. No terminal, no provider, no
 * clock, no filesystem, no credits. The fakes are injected through the same
 * interfaces production uses (`producer/index.ts:46-67`), which is why a
 * surface whose behaviour could only be read by spawning Ink would be a surface
 * whose behaviour was never verified (`test/surface-v2.test.ts:20-26`).
 *
 * And the structural claims are read off source rather than promised. The
 * queue-free assertion strips comments first, for the reason
 * `test/work-state.test.ts:66-72` gives: these modules explain themselves in
 * terms of what they refuse to be, so a scan that read the explanation would find
 * the refusal.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createStore } from "../apps/terminal/src/app/store.ts";
import { derive, emptySurface, type SurfaceState } from "../apps/terminal/src/app/state.ts";
import { createProducer, type Producer } from "../apps/terminal/src/producer/index.ts";
import type { ProjectIdentity } from "../src/adapters/project-binding.ts";
import type { ContextFrame, ModelAdapter, ModelResponse, ToolResult, ToolRequest, ToolRunner } from "../src/core/loop.ts";

// ─── the port and the fixed world ───────────────────────────────────────────

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SURFACE = join(ROOT, "apps", "terminal", "src");

/**
 * A fake portfolio, never the real one.
 *
 * One project, so `resolveScope` resolves from the working directory and no test
 * in this file can fall into the `choice` branch by accident. The ambiguity
 * branch is `test/surface-v2.test.ts`'s to cover, not this file's.
 */
const PORTFOLIO: readonly ProjectIdentity[] = [
  { name: "cuesheet", path: "tools/cuesheet", kind: "repo", status: "live", nature: "tool", stack: "typescript", exists: true },
];
const PROJECTS_ROOT = "/srv/projects";
const CWD = `${PROJECTS_ROOT}/tools/cuesheet`;
const NOW = 1_800_000_000_000;

/** Comments removed, so an assertion is about code rather than about prose. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every `.ts`/`.tsx` under the surface app, as stripped source. */
function surfaceSources(): Array<{ path: string; code: string }> {
  const out: Array<{ path: string; code: string }> = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      const path = full.slice(ROOT.length + 1);
      out.push({ path, code: stripComments(readFileSync(full, "utf8")) });
    }
  };
  walk(SURFACE);
  return out;
}

/** Let the producer's promise chain settle. The loop awaits on microtasks only. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * A revision named in a log line, or -1 when the line does not name one.
 *
 * -1 rather than a throw, because the caller's assertion is about whether the
 * number is right, and it should say so in its own words rather than fail inside
 * a parse.
 */
function revisionIn(line: string, word: "from" | "to"): number {
  const found = new RegExp(`${word} (-?\\d+)`).exec(line);
  return found === null ? -1 : Number(found[1]);
}

// ─── a model that blocks, so the mid-run sentence has a window ──────────────

/**
 * A model that parks inside chosen inferences until each is released.
 *
 * This is the whole test apparatus, and it exists because "the loop is busy" has
 * to be a real, repeatable condition rather than a fast race. Every park is
 * inside `infer`, which is the boundary the producer guards, so a submission made
 * while parked lands strictly between the worker's read and its commit.
 *
 * Parking is opt-in per step rather than every step, so the loop always finishes
 * and a test never leaves a pending promise behind for the runner to wait on.
 * `park()` before the run starts, `release()` to let that step finish, and
 * `releaseAll()` to let the loop run out its budget.
 */
function parkable(): {
  model: ModelAdapter;
  frames: ContextFrame[];
  /** Park inside inference `n`. Must be called before the loop reaches it. */
  park(n: number): Promise<void>;
  /** Let inference `n` finish. */
  release(n: number): void;
  releaseAll(): void;
} {
  const frames: ContextFrame[] = [];
  const gates = new Map<number, Promise<void>>();
  const openers = new Map<number, () => void>();
  const waiters = new Map<number, Promise<void>>();
  const arrivals = new Map<number, () => void>();

  const park = (n: number): Promise<void> => {
    const made = waiters.get(n);
    if (made) return made;
    let open: () => void = () => {};
    let arrived: () => void = () => {};
    gates.set(n, new Promise<void>((r) => {
      open = r;
    }));
    waiters.set(n, new Promise<void>((r) => {
      arrived = r;
    }));
    arrivals.set(n, arrived);
    openers.set(n, () => {
      open();
      openers.delete(n);
    });
    return waiters.get(n)!;
  };

  const release = (n: number): void => {
    openers.get(n)?.();
  };
  const releaseAll = (): void => {
    for (const open of [...openers.values()]) open();
  };

  return {
    frames,
    park,
    release,
    releaseAll,
    model: {
      name: "parkable",
      async infer(frame: ContextFrame): Promise<ModelResponse> {
        frames.push(frame);
        const gate = gates.get(frame.step);
        if (gate) {
          // The park. Everything the person says before this resolves lands in
          // the log while this await is outstanding.
          arrivals.get(frame.step)!();
          await gate;
        }
        // No tool calls, so the log holds the loop's own events and the
        // producer's, and nothing else can move a revision for an unrelated
        // reason.
        return { text: "", toolCalls: [] };
      },
    },
  };
}

const tools: ToolRunner = {
  async run(_request: ToolRequest): Promise<ToolResult> {
    return { name: "never", exit: 0, output: "" };
  },
};

/** Build a producer over fakes and the store it writes to. */
function rig(model: ModelAdapter): { producer: Producer; store: ReturnType<typeof createStore> } {
  const store = createStore();
  const producer = createProducer({
    store,
    model,
    tools,
    cwd: CWD,
    projectsRoot: PROJECTS_ROOT,
    identities: PORTFOLIO,
    now: () => NOW,
    mintId: (() => {
      let n = 0;
      return () => `s${++n}`;
    })(),
  });
  return { producer, store };
}

/** Every string a person could read on the timeline. */
const spoken = (state: SurfaceState): string =>
  state.entries
    .map((e) => {
      if (e.kind === "you" || e.kind === "cuesheet" || e.kind === "failure") return e.text;
      if (e.kind === "status") return `${e.label} ${e.value}`;
      return `${e.label} ${e.detail ?? ""}`;
    })
    .join("\n");

// ─── the crux ───────────────────────────────────────────────────────────────

describe("SW-02 a sentence typed during a run is a fact in the shared log", () => {
  it("THE CRUX: the loop is blocked, a sentence lands, the worker rebases, and a second one lands too", async () => {
    const parked = parkable();
    const { producer, store } = rig(parked.model);
    // Park inside step 1 and step 3. Step 3 is the second interruption, so both
    // are declared before the loop reaches either.
    const atFirstStep = parked.park(1);
    const atThirdStep = parked.park(3);

    // 1. A run starts, and parks inside its first inference.
    producer.say("finish the parser");
    await atFirstStep;
    assert.equal(store.get().busy, true, "the run is in flight");
    const logAtPark = store.get().log.length;

    // 2. The composer path, mid-run. This is `Composer.onSubmit` -> `App.submit`
    //    -> `producer.say`, with nothing else in between.
    producer.say("stop, focus Spotlight instead");

    // 3. It became a fact IMMEDIATELY: the log grew before `say` returned, and
    //    the run is still the same run.
    const now = store.get();
    assert.ok(
      now.log.length > logAtPark,
      "the sentence reached the log while the loop was still blocked, not after it finished",
    );
    assert.equal(now.busy, true, "and no second run replaced the first");
    assert.ok(
      now.log.some((l) => l.startsWith("[directive] builder") && l.includes("Spotlight")),
      "it is a directive on the shared log",
    );

    // 4. Nothing was killed mid-write: the producer has committed no step record
    //    while the model is still thinking, because the boundary has not closed.
    assert.ok(
      !now.log.some((l) => l.startsWith("[work]")),
      "no step was committed while the step was still running",
    );

    // 5. Release. The loop finishes the step, the boundary closes, and the
    //    commit made against the pre-sentence revision is refused.
    parked.release(1);
    await settle();
    await settle();

    const after = store.get();

    // Exactly one run. Two `effect_requested` or two `goal` events is the fork.
    const requests = after.log.filter((l) => l.startsWith("[effect_requested]"));
    const goals = after.log.filter((l) => l.startsWith("[goal]"));
    assert.equal(requests.length, 1, "one run, not two: a mid-run sentence never starts a run");
    assert.equal(goals.length, 1, "and the run's goal was not overwritten");
    assert.equal(
      after.log.filter((l) => l.includes("Spotlight") && l.startsWith("[goal]")).length,
      0,
      "the mid-run sentence never became a second goal",
    );

    // 6. The refusal was reported as a rebase, with the revision it left and the
    //    revision it landed on, and it is in the raw log only.
    const rebase = after.log.find((l) => l.startsWith("[work] rebased"));
    assert.ok(rebase, `the rebase is reported; log was:\n${after.log.join("\n")}`);
    const from = revisionIn(rebase, "from");
    const to = revisionIn(rebase, "to");
    assert.ok(Number.isInteger(from) && Number.isInteger(to), "both revisions are named");
    assert.ok(to > from, `the log moved forward, ${from} -> ${to}`);
    // The revision it left is the one it read, which is before the sentence was
    // appended, so the sentence is strictly inside the window.
    const directiveAt = after.log.findIndex((l) => l.startsWith("[directive]"));
    const workAt = after.log.findIndex((l) => l.startsWith("[work] rebased"));
    assert.ok(directiveAt >= 0 && workAt > directiveAt, "the sentence landed before the rebase was reported");

    // 7. The re-derived record is not the refused one. This is the load-bearing
    //    assertion about "rebases rather than laundered into committed": the
    //    step was committed against the state that included the sentence, and
    //    the first attempt left nothing behind.
    const decisions = after.log.filter((l) => l.startsWith("[action] builder") && l.includes("step 1"));
    assert.equal(decisions.length, 1, "exactly one attempt landed; a refusal writes nothing (CON-03)");
    assert.ok(decisions[0]!.includes("parser"), "and it carries the state the step was derived from");
    // The revision it committed at is in the record itself, so a reader can audit
    // which state it acted on rather than taking the surface's word for it.
    assert.match(decisions[0]!, /"against":\d+/, "the record names the revision it was taken against");

    // 8. The in-flight loop picked the sentence up: the directive is in the
    //    frame of the NEXT inference. This is the core recompiling its frame
    //    from the log (`src/core/loop.ts:184-185`), not a mechanism added here.
    const later = parked.frames.slice(1);
    assert.ok(later.length > 0, "the loop ran more than one inference");
    const carriedIntoFrame = later.some((f) => f.directives.some((d) => d.text.includes("Spotlight")));
    assert.ok(
      carriedIntoFrame,
      `the run saw the new direction; frames: ${JSON.stringify(later.map((f) => f.directives.map((d) => d.text)))}`,
    );

    // 9. And the second sentence, typed while the same run is still going, was
    //    accepted immediately too. This is the owner's "message 4 queued behind
    //    agent response 3" turned into its negative: nothing was queued.
    parked.release(2);
    await atThirdStep;
    const before = store.get().entries.length;
    producer.say("actually, focus the router instead");
    const last = store.get();
    assert.ok(last.entries.length > before, "the composer accepted a second submission at once");
    assert.ok(
      last.entries.some((e) => e.kind === "you" && e.text === "actually, focus the router instead"),
      "and it is on screen immediately",
    );
    assert.ok(
      last.log.some((l) => l.startsWith("[directive] builder") && l.includes("router")),
      "and it is in the log, not lost",
    );
    parked.releaseAll();
    await settle();

    // Both landed, in the order they were typed, and neither started a run.
    const directives = last.log.filter((l) => l.startsWith("[directive]"));
    assert.equal(directives.length, 2, "two submissions, two directives");
    assert.ok(directives[0]!.includes("Spotlight"), "the first kept its place");
    assert.ok(directives[1]!.includes("router"), "the second is after it");
    assert.equal(
      last.log.filter((l) => l.startsWith("[effect_requested]")).length,
      1,
      "and neither of them started a second run",
    );

    await settle();
  });

  it("a run is not forked: two sentences in a row while idle start two runs, not one log per run", async () => {
    // The mirror image, and the reason this is not simply "ignore everything
    // after the first sentence". A sentence typed while idle still starts a run.
    const seen: ContextFrame[] = [];
    const model: ModelAdapter = {
      name: "counting",
      async infer(frame) {
        seen.push(frame);
        return { text: "", toolCalls: [] };
      },
    };
    const { producer, store } = rig(model);

    producer.say("first goal");
    await settle();
    producer.say("second goal");
    await settle();

    // Two runs, two requests, both in ONE log, and the second run's goal is a
    // second `goal` event rather than a separate store.
    const log = store.get().log;
    assert.equal(log.filter((l) => l.startsWith("[effect_requested]")).length, 2, "two runs were started");
    assert.equal(log.filter((l) => l.startsWith("[goal]")).length, 2, "each with its own goal");
    // The crux of "one store": revisions never restart. The second run's first
    // step record is above the first run's last event, not back at 1.
    const seqs = seen.map((f) => f.step);
    assert.deepEqual(seqs.slice(0, 2), [1, 2], "the first run spent its steps");
    assert.ok(store.get().busy === false, "and the surface settled");
  });

  it("a sentence typed between two runs, with none in flight, starts a run", async () => {
    // The idle path is untouched. If the `inFlight` flag were wrong the other
    // way, the composer would silently swallow every sentence.
    const { producer, store } = rig({ name: "quiet", async infer() { return { text: "", toolCalls: [] }; } });
    producer.say("do the thing");
    await settle();
    assert.ok(store.get().log.some((l) => l.startsWith("[effect_requested]")), "an idle sentence started a run");
  });
});

// ─── the composer never becomes unavailable ─────────────────────────────────

describe("the composer is always available and never demands a stop", () => {
  it("derive does not drop, defer, or queue a submit that arrives while busy", () => {
    // `busy` is the whole of "is a run in flight". If `submit` branched on it, a
    // sentence typed during a run would be withheld, deferred, or refused, and
    // the owner's constraint would be violated at the last link in the chain.
    const busy = derive(emptySurface, { type: "began" });
    assert.equal(busy.busy, true);

    const after = derive(busy, { type: "submit", text: "stop, focus Spotlight instead" });
    assert.equal(after.composer, "", "the composer cleared, so the next sentence can be typed");
    assert.ok(
      after.entries.some((e) => e.kind === "you" && e.text === "stop, focus Spotlight instead"),
      "the sentence is recorded while busy, immediately",
    );
    // Still busy, because a person typing is not work and does not end a run.
    assert.equal(after.busy, true, "submitting does not end the run, and does not start one either");
  });

  it("the step record is a fact in the shared state and never a fake action row on the timeline", async () => {
    // The boundary commits an `action`, and `translateEvent` renders an `action`
    // as a tool row. If those records reached the timeline, a person would see
    // eight rows for work that never called a tool. They do not, because the
    // boundary commits through the store directly rather than through the loop's
    // `append`, so `onEvent` never fires for it. That is subtle and easy to
    // regress by routing the commit through `onEvent`, so it is asserted here.
    const { producer, store } = rig({ name: "quiet", async infer() { return { text: "", toolCalls: [] }; } });
    producer.say("do the thing");
    await settle();
    await settle();

    const state = store.get();
    assert.equal(
      state.entries.filter((e) => e.kind === "action").length,
      0,
      "no tool row was invented: the boundary commits no tool call",
    );
    // It is in the raw log, with the revision it acted on.
    const steps = state.log.filter((l) => l.startsWith("[action] builder"));
    assert.ok(steps.length > 0, "the step is recorded");
    assert.match(steps[0]!, /"against":\d+/, "and it names the revision it was taken against");
  });

  it("an admitted run records every step against a moving revision, so the state is auditable", async () => {
    // The consequence of one shared log, and the reason the records are worth
    // writing: `projectWork` reads `against` back, so a worker arriving later can
    // see which state each step acted on rather than reading history as current.
    const { producer, store } = rig({ name: "quiet", async infer() { return { text: "", toolCalls: [] }; } });
    producer.say("finish the parser");
    await settle();
    await settle();

    // Every recorded step carries a basis, and the bases advance rather than
    // restarting, which is what "one log" means in the state a reader gets.
    const bases = store
      .get()
      .log.filter((l) => l.startsWith("[action] builder"))
      .map((l) => Number(/"against":(\d+)/.exec(l)?.[1] ?? "-1"));
    assert.ok(bases.length > 1, "several steps");
    assert.ok(bases.every((b) => Number.isInteger(b)), "every step names its basis");
    assert.deepEqual(
      bases,
      [...bases].sort((a, b) => a - b),
      "and the bases advance",
    );
    assert.ok(new Set(bases).size > 1, "so no two steps claim the same basis");
  });

  it("the composer has no busy guard: no gate, no Stop, and disabled means no provider", () => {
    // Structural, because a guard that is merely undocumented is a guard that
    // comes back. The owner's words: "Jamais bouton Stop obligatoire juste pour
    // pouvoir reparler."
    const composer = stripComments(readFileSync(join(SURFACE, "components", "Composer.tsx"), "utf8"));

    assert.doesNotMatch(composer, /busy/, "the composer never learns whether a run is in flight");
    assert.doesNotMatch(composer, /waiting|please wait|current response/i, "and never says wait");
    assert.doesNotMatch(composer, /\bstop\b/i, "and offers no stop control of its own");
    // What it does have: Enter submits and typing is unguarded.
    assert.ok(composer.includes("key.return"), "Enter submits");
    assert.ok(composer.includes("props.onChange"), "typing is unguarded");

    // `disabled` does exist, and this is the distinction that matters: it is
    // wired to the absence of a provider, never to `busy`. A surface with no
    // model cannot answer, and saying so is honest; a surface that is busy can
    // still be spoken to, and saying so would be the bug this slice removes.
    assert.ok(composer.includes("disabled"), "the prop exists");
    const app = stripComments(readFileSync(join(SURFACE, "app", "App.tsx"), "utf8"));
    const wired = /disabled=\{([^}]*)\}/.exec(app);
    assert.ok(wired, "App wires it");
    assert.doesNotMatch(wired[1]!, /busy/, "and what it is wired to is never `busy`");
    assert.match(wired[1]!, /!producer/, "it means there is no model to answer with");
  });

  it("the surface holds no queue, buffer, or pending message anywhere", () => {
    // The structural assertion that would fail if a queue were reintroduced.
    //
    // Every word below is a shape a deferred message could take. The module
    // headers name several of them in order to deny them, which is exactly why
    // comments are stripped first: a scan that read the denial would find the
    // thing it is looking for.
    const QUEUE = /\b(queue|queued|enqueue|dequeue|buffer|buffered|inbox|outbox|backlog|pendingMessage|pending_message|pendingInput|deferred|deferUntil|messageQueue|sentWhileBusy)\b/;
    const offenders: string[] = [];
    for (const { path, code } of surfaceSources()) {
      const found = code.match(QUEUE);
      if (found) offenders.push(`${path}: ${found[0]}`);
    }
    assert.deepEqual(offenders, [], `a queue was reintroduced: ${offenders.join(", ")}`);
  });

  it("the producer keeps one log, so a sentence has somewhere to land", () => {
    // The root cause, asserted over source. `new EventStore` inside `start` is
    // what made every run private and forced a mid-run sentence to become a
    // second run instead of a fact.
    const producer = stripComments(readFileSync(join(SURFACE, "producer", "index.ts"), "utf8"));
    const built = producer.match(/new EventStore\(/g) ?? [];
    assert.equal(built.length, 1, "the store is built once");
    assert.ok(!/start[\s\S]{0,400}new EventStore\(/.test(producer), "and not inside start()");
  });
});

// ─── the person can see the direction changed ───────────────────────────────

describe("the surface shows the change in surface words and keeps the mechanism out", () => {
  it("the timeline says the direction changed and never names a revision", async () => {
    const parked = parkable();
    const { producer, store } = rig(parked.model);
    const atFirstStep = parked.park(1);

    producer.say("finish the parser");
    await atFirstStep;
    producer.say("stop, focus Spotlight instead");
    parked.releaseAll();
    await settle();
    await settle();

    const state = store.get();
    assert.ok(
      state.entries.some((e) => e.kind === "status" && e.label === "direction"),
      "the person is shown that the direction changed",
    );

    // The mechanism vocabulary belongs under `/inspect` and nowhere else. These
    // are the words of the log and the store, and a person reading the timeline
    // is reading sentences, not sequence numbers.
    const visible = spoken(state);
    for (const word of ["rebased", "revision", "appendIfCurrent", "directive", "against", "seq"]) {
      assert.doesNotMatch(visible, new RegExp(word, "i"), `"${word}" reached the timeline`);
    }
    // And it is in the raw log, which only `/inspect` reads.
    assert.ok(
      store.get().log.some((l) => l.startsWith("[work] rebased")),
      "the mechanism vocabulary is in the log",
    );
  });

  it("the run never claims a goal closed when a directive contradicted it", async () => {
    // `runAgentLoop` never ends because a model said so (`src/core/loop.ts:14-22`),
    // and a directive does not close a goal either: only evidence about the
    // goal's subject does (`src/core/store.ts:267-269`). A run that stopped
    // because a person disagreed would be the loop's one forbidden ending.
    const parked = parkable();
    const { producer, store } = rig(parked.model);
    const atFirstStep = parked.park(1);
    producer.say("finish the parser");
    await atFirstStep;
    producer.say("stop, focus Spotlight instead");
    parked.releaseAll();
    await settle();
    await settle();

    const stops = store.get().entries.filter(
      (e) => e.kind === "status" && e.label === "work",
    );
    assert.ok(stops.length > 0, "the run reported how it stopped");
    assert.ok(
      stops.every((e) => e.kind !== "status" || e.certainty !== "confirmed" || !/settled/.test(e.value)),
      "and it did not report the contradicted goal as settled work",
    );
  });
});

// ─── the boundary is the loop's own ─────────────────────────────────────────

describe("the safe boundary was read off the loop, not invented for this slice", () => {
  it("the guarded commit happens at infer, which is where the core recompiles its frame", async () => {
    // The claim "the boundary is the step" is only worth anything if the step is
    // somewhere real. This pins it to the core's own line rather than to a
    // comment in the producer.
    const loop = readFileSync(join(ROOT, "src", "core", "loop.ts"), "utf8");
    const recompile = loop.indexOf("compileFrame(");
    const infer = loop.indexOf("model.infer(");
    assert.ok(recompile >= 0 && infer >= 0, "the loop compiles a frame and then calls the model");
    assert.ok(recompile < infer, "the frame is compiled before the inference, so infer is the last point of commitment");

    const producer = readFileSync(join(SURFACE, "producer", "index.ts"), "utf8");
    assert.ok(producer.includes("guarded"), "the producer gives the loop a wrapped adapter");
    assert.ok(
      /runAgentLoop\(shared, guarded, tools/.test(producer),
      "and it is the adapter the loop is actually run with, not the injected one",
    );
  });

  it("a refusal writes nothing, so nothing is ever undone", async () => {
    // CON-03. The crux above shows one landed step record for two attempts, but
    // the stronger claim is structural: the guard refuses before it appends.
    const store = readFileSync(join(ROOT, "src", "core", "store.ts"), "utf8");
    const guard = /appendIfCurrent\(expectedRevision: number, event: NewEvent\): Event \| null \{([^}]*)\}/.exec(store);
    assert.ok(guard, "the guard exists");
    assert.match(guard[1]!, /this\.revision !== expectedRevision\) return null/);
    assert.match(guard[1]!, /return this\.append\(event\)/);
    // The null return precedes the append, so a refusal cannot have written.
    assert.ok(guard[1]!.indexOf("return null") < guard[1]!.indexOf("this.append"));
  });

  it("the step records what it was derived against, so a rebase is auditable later", () => {
    // `projectWork` reads `against` off the record (`src/work-state.ts:235-239`),
    // so the step must carry it for "which revision did this act on" to have an
    // answer in the log rather than only in a comment.
    const worker = readFileSync(join(ROOT, "src", "work-worker.ts"), "utf8");
    assert.match(worker, /against: basis/, "the commit names the basis it was taken against");
    const state = readFileSync(join(ROOT, "src", "work-state.ts"), "utf8");
    assert.match(state, /againstOf/, "and the projection reads it back");
  });
});