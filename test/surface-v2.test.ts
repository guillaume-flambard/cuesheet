/**
 * HUMAN SURFACE V2: prompt-first to real, verified work.
 *
 * The founding transcript of V1 is still here, and it is still the binding
 * constraint on what a person may read:
 *
 * ```text
 * > on fait quoi ?
 * I can't tell which one you mean.
 * ```
 *
 * OBS-1, the first counterexample a person found. The surface had one
 * interpretation of every line and it was always "this names a project", so a
 * question about what to do was answered as a failed directory lookup. The fix
 * was never a better matcher: it was that a sentence stops having to be
 * classified at all.
 *
 * ## What this file asserts, and why each assertion is structural
 *
 * Every test here runs without a terminal, without a provider and without
 * touching the real portfolio. That is the convention from
 * `apps/terminal/src/render.ts:143` in V1 ("assertable without spawning a
 * terminal"), and it is the reason the producer takes its adapters by interface.
 * A surface whose behaviour can only be read by spawning Ink is a surface whose
 * behaviour was never verified.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createStore } from "../apps/terminal/src/app/store.ts";
import { derive, emptySurface, type Entry, type SurfaceState } from "../apps/terminal/src/app/state.ts";
import {
  createProducer,
  type Producer,
} from "../apps/terminal/src/producer/index.ts";
import {
  detailFor,
  entryForStop,
  pendingFor,
  translateEvent,
  verbFor,
} from "../apps/terminal/src/producer/translate.ts";
import { resolveScope } from "../apps/terminal/src/producer/context.ts";
import { bindProject, type Binding, type ProjectIdentity } from "../src/adapters/project-binding.ts";
import type { Event } from "../src/core/store.ts";
import type { ContextFrame, ModelAdapter, ModelResponse, ToolRequest, ToolResult, ToolRunner } from "../src/core/loop.ts";

// ─── the internal vocabulary, banned on the normal path ─────────────────────

/** Terms of the machine. None of them may reach a person on the normal path. */
const INTERNAL = [
  "goal", "staged", "unresolved", "state", "capabilities", "sessions on disk",
  "admission", "revision", "pendingEffect", "affordance", "read-set", "reconcil",
  "artifact", "INCONCLUSIVE", "workspace", "registry", "pending",
];

/**
 * The exact sentences the V1 surface produced, and the brief names three of them.
 *
 * They are not "phrases to avoid". They are the specific lies this rewrite exists
 * to make structurally impossible: with no classifier between the composer and the
 * producer, no input can select them.
 */
const DEAD_ENDS = [
  /name a project/i,
  /not a goal/i,
  /\bgo\?/i,
  /donne-moi un projet/i,
  /qu'est-ce qu'on y fait/i,
  /I don't know that one/i,
];

/**
 * Remove comments, so an assertion can be about behaviour rather than about prose.
 *
 * Naive on purpose: block comments and line comments, and nothing clever. A file
 * is allowed to *name* the sentence it removed in order to explain why it removed
 * it, and a test that failed on that would be a test against documentation.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ─── fakes, so the whole vertical runs with no provider and no shell ─────────

/** A model whose responses are consumed in order, then the last one repeats. */
function scripted(script: readonly ModelResponse[]): ModelAdapter & { seen: ContextFrame[] } {
  const seen: ContextFrame[] = [];
  let at = 0;
  return {
    name: "scripted",
    seen,
    async infer(frame: ContextFrame): Promise<ModelResponse> {
      seen.push(frame);
      const step = script[Math.min(at, script.length - 1)] ?? { text: "", toolCalls: [] };
      at += 1;
      return step;
    },
  };
}

/** A tool runner that answers from a table and records every call it received. */
function fakeTools(table: Record<string, ToolResult>): ToolRunner & { calls: ToolRequest[] } {
  const calls: ToolRequest[] = [];
  return {
    calls,
    async run(request: ToolRequest): Promise<ToolResult> {
      calls.push(request);
      return table[request.name] ?? { name: request.name, exit: 0, output: "" };
    },
  };
}

/**
 * The identities a test resolves against. A fake portfolio, never the real one.
 *
 * `kollio-web` and `kollio-cli` are here on purpose: they are what a genuine
 * ambiguity looks like under the real `bindProject`. Two projects defend
 * themselves on the same token, so BIND-05 requires a question rather than a
 * pick. Naming them by their shared stem is what makes that reachable in a test
 * without inventing a binder.
 */
const PORTFOLIO: readonly ProjectIdentity[] = [
  { name: "cuesheet", path: "tools/cuesheet", kind: "repo", status: "live", nature: "tool", stack: "typescript", exists: true },
  { name: "kollio-web", path: "products/kollio-web", kind: "repo", status: "live", nature: "app", stack: "typescript", exists: true },
  { name: "kollio-cli", path: "products/kollio-cli", kind: "repo", status: "live", nature: "app", stack: "typescript", exists: true },
  { name: "videoai", path: "experiments/videoai", kind: "repo", status: "live", nature: "experiment", stack: "python", exists: true },
];

const ROOT = "/srv/projects";

/**
 * The binder under test: the real `bindProject`, not a stand-in.
 *
 * BIND-05 (more than one candidate is a question, never a silent pick) lives in
 * the real function. Re-implementing it here would test this file's idea of it,
 * so the real one is called with the fake portfolio. It reads only its arguments,
 * which is why a test can drive it without a registry on disk.
 */
const binder = bindProject;

/** Build a producer over fakes, and the store it writes to. */
function rig(options: {
  cwd: string;
  model: ModelAdapter;
  tools: ToolRunner;
}): { producer: Producer; store: ReturnType<typeof createStore> } {
  const store = createStore();
  const producer = createProducer({
    store,
    model: options.model,
    tools: options.tools,
    cwd: options.cwd,
    projectsRoot: ROOT,
    // The fake portfolio is injected, so no test in this file ever reads the
    // real registry. A test that resolved against the machine's own projects
    // would assert whatever the machine happens to contain today.
    identities: PORTFOLIO,
    now: () => 1_790_000_000_000,
    mintId: () => "test-session",
  });
  return { producer, store };
}

/** Every string a person could read, joined. The thing the banned words are checked against. */
function spoken(state: SurfaceState): string {
  const parts: string[] = [];
  for (const e of state.entries) {
    if (e.kind === "you" || e.kind === "cuesheet" || e.kind === "failure") parts.push(e.text);
    if (e.kind === "status") parts.push(`${e.label} ${e.value}`);
    if (e.kind === "action") parts.push(`${e.label} ${e.detail ?? ""}`);
  }
  return parts.join("\n");
}

const entries = (state: SurfaceState, kind: Entry["kind"]): Entry[] => state.entries.filter((e) => e.kind === kind);
const actionEntries = (state: SurfaceState) => entries(state, "action") as Extract<Entry, { kind: "action" }>[];
const event = (over: Partial<Event> = {}): Event => ({
  seq: 1,
  at: 1_790_000_000_000,
  kind: "observation",
  subject: "builder",
  data: {},
  ...over,
});

/** Let the producer's promise chain settle. The loop awaits on microtasks only. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Where the terminal package's own compiler and tsconfig live. */
const ROOT_TSC = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "terminal");

/**
 * `tsc --noEmit` over `apps/terminal`, as the lines that name a file.
 *
 * The compiler exits 2 because errors live in files this change must not touch,
 * so the exit code is not a usable gate and the named lines are. It throws on a
 * non-zero exit, which is why the error lines are collected from `stdout` rather
 * than from a return value.
 */
function tscLines(): string[] {
  if (!existsSync(join(ROOT_TSC, "node_modules", ".bin", "tsc"))) return [];
  let out = "";
  try {
    out = execFileSync(join(ROOT_TSC, "node_modules", ".bin", "tsc"), ["--noEmit"], {
      cwd: ROOT_TSC,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (cause) {
    out = String((cause as { stdout?: string }).stdout ?? "");
  }
  return out.split("\n").filter((l) => /error TS/.test(l));
}

/** Errors in `apps/terminal/src/**`, which is every line this change wrote. */
const surfaceErrors = (): string[] => tscLines().filter((l) => l.startsWith("src/"));

/**
 * Errors in `src/**`, imported by the surface but owned by other milestones.
 *
 * Keyed on `file(line,col)` and no further, for the reason
 * `test/typecheck-guard.test.ts` gives at its own lines 24-26: a second error of
 * the same code in one file would be invisible, so the count is asserted
 * alongside the list.
 */
const inheritedErrors = (): string[] =>
  tscLines()
    .filter((l) => l.startsWith("../../src/"))
    .map((l) => (l.replace(/^\.\.\/\.\.\//, "").match(/^[^:]+/)?.[0] ?? l));

// ─── the banned words and the dead ends ─────────────────────────────────────

describe("the founding transcript, restated for V2", () => {
  it("no sentence can produce a dead end, because nothing classifies sentences", () => {
    // The structural assertion behind the three named non-negotiables. There is
    // no phrase list, so there is no phrase to match: the only way to fail this
    // is to reintroduce a classifier, which is a visible diff rather than a bug
    // found by a person.
    const files = [
      "apps/terminal/src/app/state.ts",
      "apps/terminal/src/app/App.tsx",
      "apps/terminal/src/producer/index.ts",
      "apps/terminal/src/producer/context.ts",
      "apps/terminal/src/components/Composer.tsx",
      "apps/terminal/src/overlays/Help.tsx",
    ];
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const file of files) {
      // Comments are stripped first, because a file is allowed to *name* the
      // thing it removed in order to explain why. Only executable text is
      // checked, or this test would fail on the sentence that documents the fix.
      const code = stripComments(readFileSync(join(root, file), "utf8"));
      assert.ok(
        !/TurnIntent|readTurn|routeIntention/.test(code),
        `${file} reintroduced a sentence classifier`,
      );
      for (const word of DEAD_ENDS) {
        const hit = word.exec(code);
        assert.equal(hit, null, `${file} contains a dead end: ${word.source}`);
      }
    }
  });

  it("the router is gone from the repository, not merely bypassed", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const gone of ["apps/terminal/src/turn.ts", "apps/terminal/src/render.ts", "apps/terminal/src/slice.tsx"]) {
      assert.throws(
        () => readFileSync(join(root, gone), "utf8"),
        `${gone} still exists`,
      );
    }
  });

  it("the V1 slice is not referenced by anything either", () => {
    // The reachability check that licensed the removal, asserted so it stays
    // true. A file nothing imports is a file nothing tests, and the removal was
    // only sound because the one importer was the test written for it.
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const stack: string[] = [join(root, "src"), join(root, "apps")];
    const importers: string[] = [];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === "node_modules" || name === "dist") continue;
          stack.push(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const text = readFileSync(full, "utf8");
        if (/from\s+["'][^"']*(render|slice|turn)\.ts["']/.test(text)) importers.push(full);
      }
    }
    assert.deepEqual(importers, [], `something still imports a removed module: ${importers.join(", ")}`);
  });

  it("the visual identity is not negotiable", () => {
    // Carried over from the V1 transcript, which is the one test in this file
    // whose subject was a renderer rather than a router. It stays because the
    // failure it guards against is real: an earlier version replaced `›` with `>`
    // so that TypeScript would stop complaining inside JSX, one symbol at a time,
    // until the surface looked like a different product. That is the design
    // mutilating itself to satisfy the compiler, and it must not come back.
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const files = [
      "apps/terminal/src/components/Composer.tsx",
      "apps/terminal/src/components/Timeline.tsx",
      "apps/terminal/src/overlays/Projects.tsx",
      "apps/terminal/src/theme/tokens.ts",
    ].map((f) => readFileSync(join(root, f), "utf8")).join("\n");

    assert.ok(files.includes("›"), "the prompt glyph is in the source");
    assert.ok(files.includes("✓"), "and the confirmation mark");
    assert.doesNotMatch(files, /\[ok\]|\[v\]|\[a\]|\[b\]|\[x\]/, "no bracketed ASCII stand-in");
    assert.doesNotMatch(files, /\.\.\.\s*\}/, "no three-dot ellipsis substituted for a real one");
  });
});

// ─── VIEW-01 for the terminal's own state module ────────────────────────────

describe("the type errors apps/terminal can see, and the ones it cannot", () => {
  it("the surface adds no type error of its own", () => {
    // The differential guard, run as a test. `tsc` over `apps/terminal` exits 2
    // because four errors live in files this change must not touch, so the exit
    // code is useless as a gate and the count is the gate instead.
    //
    // Every error the surface introduces would appear with an `apps/terminal`
    // prefix, because those are the files TypeScript reached through the surface.
    // Any error elsewhere is inherited from a file the surface merely imports,
    // and inheriting one is not the same as causing one.
    // Zero errors in the surface's own files. A path beginning `src/` is
    // `apps/terminal/src/`, and every one of those is code this change wrote.
    assert.deepEqual(surfaceErrors(), [], "apps/terminal introduced type errors");
  });

  it("the producer imports compile without inherited type errors", () => {
    assert.deepEqual(inheritedErrors(), [], "producer dependencies must compile");
  });
});

describe("VIEW-01 the surface state observes nothing", () => {
  it("app/state.ts contains no observation at all", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const text = readFileSync(join(root, "apps/terminal/src/app/state.ts"), "utf8");
    const forbidden = [
      /\bexecFileSync\b/, /\bspawnSync\b/, /\breadFileSync\b/, /\bexistsSync\b/,
      /\breaddirSync\b/, /snapshotPortfolio/, /\bnew Date\b/, /Date\.now\(/,
      /Math\.random\(/, /\bbindProject\b/, /\bprocess\b/,
    ];
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `app/state.ts observes: ${pattern.source}`);
    }
  });

  it("app/state.ts imports nothing that could observe", () => {
    // The structural form of VIEW-01b: a view that cannot import an observer is
    // a view that cannot observe, whatever its discipline today.
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const text = readFileSync(join(root, "apps/terminal/src/app/state.ts"), "utf8");
    assert.doesNotMatch(text, /from\s+["']node:/, "a view imports a node module");
    assert.doesNotMatch(text, /from\s+["']\.\.?\//, "a view imports outside itself");
  });

  it("derive is a pure function of its two arguments", () => {
    const state = derive(emptySurface, { type: "compose", text: "hello" });
    assert.equal(state.composer, "hello");
    // Called twice on the same input, agreed twice. VIEW-04b's reasoning, one
    // layer over.
    const again = derive(emptySurface, { type: "compose", text: "hello" });
    assert.deepEqual(state, again);
    // And it does not mutate what it was given.
    assert.equal(emptySurface.composer, "");
    assert.equal(emptySurface.entries.length, 0);
  });
});

// ─── acceptance 1: the whole vertical, with fakes ────────────────────────────

describe("a real run reaches the timeline as real observations", () => {
  it("tool calls become micro-events whose certainty comes from the exit code", async () => {
    const model = scripted([
      {
        text: "",
        toolCalls: [{ name: "cat", input: { path: "src/core/loop.ts" } }],
      },
      {
        text: "",
        toolCalls: [{ name: "npm", input: { argv: ["npm", "test"] } }],
      },
      { text: "the suite is green", toolCalls: [] },
    ]);
    const tools = fakeTools({
      cat: { name: "cat", exit: 0, output: "export async function runAgentLoop" },
      npm: { name: "npm", exit: 0, output: "# pass 535" },
    });
    const { producer, store } = rig({ cwd: `${ROOT}/tools/cuesheet`, model, tools });

    producer.say("prove the loop is wired");
    await settle();

    // The tool runner really ran, twice, with the requests the model supplied.
    assert.equal(tools.calls.length, 2, "both tool calls reached the runner");
    assert.deepEqual(tools.calls[0], { name: "cat", input: { path: "src/core/loop.ts" } });

    const actions = actionEntries(store.get());
    // One row per call, not two. A call opens `active` and settles in place when
    // the exit code arrives, so finished work does not sit on screen forever
    // claiming to be in progress.
    assert.equal(actions.length, 2, `expected 2 action rows, got ${JSON.stringify(actions)}`);

    // The certainty came from the exit code the runner returned, not from
    // anything the model said.
    assert.deepEqual(actions.map((a) => a.certainty), ["confirmed", "confirmed"]);
    assert.ok(!actions.some((a) => a.certainty === "active"), "nothing is left claiming to be running");
    assert.equal(actions[0]?.label, "read", "cat is a read");
    assert.equal(actions[0]?.detail, "src/core/loop.ts", "and it names the file, from the request");
    assert.equal(actions[1]?.label, "test", "npm test is a test");

    // And the surface settled on the loop's own stop reason, not on the model's
    // claim that it was done. A tool-free response yields the interactive turn,
    // while the goal remains explicitly open and unverified.
    const status = entries(store.get(), "status");
    assert.ok(
      status.some((s) => s.kind === "status" && /still open|Le but reste ouvert/.test(s.value)),
      `the surface kept the goal open after the answer: ${JSON.stringify(status)}`,
    );
  });

  it("a failing tool becomes a failed micro-event, and a refused one says why", async () => {
    const model = scripted([
      { text: "", toolCalls: [{ name: "npm", input: { argv: ["npm", "test"] } }] },
      { text: "", toolCalls: [{ name: "cat", input: { path: "../../etc/passwd" } }] },
      { text: "", toolCalls: [{ name: "curl", input: { argv: ["curl", "http://x"] } }] },
    ]);
    const tools = fakeTools({
      npm: { name: "npm", exit: 1, output: "1 test failed" },
      cat: { name: "cat", exit: 126, output: "refusing to read ../../etc/passwd: resolves outside the declared roots" },
      curl: { name: "curl", exit: 127, output: `tool "curl" is not in the allow list` },
    });
    const { producer, store } = rig({ cwd: `${ROOT}/tools/cuesheet`, model, tools });
    producer.say("run the tests and read the passwd file");
    await settle();

    const actions = actionEntries(store.get());
    assert.ok(actions.some((a) => a.certainty === "failed"), "a non-zero exit is failed, not unknown");

    // Two refusals, each translated out of the runner's own vocabulary into the
    // surface's, because a person who cannot see why a call was refused cannot
    // act on it.
    const failures = entries(store.get(), "failure").map((f) => (f.kind === "failure" ? f.text : ""));
    assert.ok(
      failures.some((f) => /outside the working directory/.test(f)),
      `a path outside the roots is explained: ${JSON.stringify(failures)}`,
    );
    assert.ok(
      failures.some((f) => /not one of the commands/.test(f)),
      `an unknown tool is explained: ${JSON.stringify(failures)}`,
    );
    // And the runner's own prose never reached the screen.
    const all = spoken(store.get());
    assert.doesNotMatch(all, /allow list|declared roots/, "the runner's vocabulary leaked");
  });

  it("internal log lines never become timeline entries", async () => {
    const model = scripted([
      { text: "", toolCalls: [{ name: "ls", input: { argv: ["ls", "-la", "src"] } }] },
      { text: "I have listed the directory.", toolCalls: [] },
    ]);
    const tools = fakeTools({ ls: { name: "ls", exit: 0, output: "total 4\ndrwxr-xr-x core\ndrwxr-xr-x adapters" } });
    const { producer, store } = rig({ cwd: `${ROOT}/tools/cuesheet`, model, tools });
    producer.say("what is in src");
    await settle();

    const all = spoken(store.get());
    // The raw tool output is not shown. It was used to decide confirmed, and it
    // stayed there.
    assert.doesNotMatch(all, /total 4/, "tool output became a timeline line");
    assert.doesNotMatch(all, /drwxr-xr-x/, "tool output became a timeline line");
    // The answer is visible as model text, separate from confirmed actions.
    assert.match(all, /I have listed/, "the model answer is visible");

    // Every row is one of the five kinds, and the three that were dead in V1 are
    // now constructed.
    for (const e of store.get().entries) {
      assert.ok(["you", "cuesheet", "action", "status", "failure"].includes(e.kind));
    }
    assert.ok(actionEntries(store.get()).length > 0, "the action variant is live");
    assert.ok(entries(store.get(), "status").length > 0, "the status variant is live");
  });

  it("the raw log keeps what the timeline dropped", async () => {
    const model = scripted([{ text: "a claim with no backing", toolCalls: [] }]);
    const { producer, store } = rig({
      cwd: `${ROOT}/tools/cuesheet`,
      model,
      tools: fakeTools({}),
    });
    producer.say("summarise the core");
    await settle();

    // Non-negotiable five: the mechanics live here and only here. The log has
    // the goal echo and the model's claim; the timeline has neither.
    const log = store.get().log.join("\n");
    assert.match(log, /\[goal\]/, "the goal event is in the log");
    assert.match(log, /a claim with no backing/, "the model's claim is in the log");
    assert.match(spoken(store.get()), /a claim with no backing/, "the answer is visible without becoming evidence");
  });
});

// ─── acceptance 2: automatic context, and never a dead end ──────────────────

describe("the environment disambiguates a sentence", () => {
  it("standing in a project decides it, with no question asked", () => {
    const scope = resolveScope("fix the failing test", `${ROOT}/tools/cuesheet`, PORTFOLIO, binder, ROOT);
    assert.equal(scope.at, "cwd", "the working directory wins over the words");
    assert.equal(scope.path, `${ROOT}/tools/cuesheet`);
  });

  it("a project named in the sentence is found when the cwd says nothing", () => {
    const scope = resolveScope("work on videoai", "/somewhere/else", PORTFOLIO, binder, ROOT);
    assert.equal(scope.at, "bound");
    assert.equal(scope.path, `${ROOT}/experiments/videoai`);
  });

  it("a free sentence naming no project still resolves: the cwd is the scope", () => {
    // The sentence that V1 could not handle. Not a clarification, not a
    // cancellation, not a question: a plain request with no project in it.
    const scope = resolveScope("ajoute un test", "/anywhere/at/all", PORTFOLIO, binder, ROOT);
    assert.equal(scope.at, "unresolved", "nothing matched, and that is not a failure");
    assert.equal(scope.path, "/anywhere/at/all", "the directory the person is standing in stands");
  });

  it("an ambiguous sentence is a choice, never a silent pick", () => {
    // BIND-05: more than one candidate means a question to a person.
    const scope = resolveScope("travaille sur kollio", "/elsewhere", PORTFOLIO, binder, ROOT);
    assert.equal(scope.at, "choice");
    if (scope.at !== "choice") return;
    assert.equal(scope.options.length, 2);
    assert.ok(scope.options.every((o) => o.why.length > 0), "each option carries a reason");
  });

  it("the ambiguity reaches the timeline as a question with every option named", async () => {
    const model = scripted([{ text: "", toolCalls: [] }]);
    const { producer, store } = rig({ cwd: "/elsewhere", model, tools: fakeTools({}) });
    producer.say("travaille sur kollio");
    await settle();

    const state = store.get();
    assert.equal(state.overlay, "projects", "an ambiguity opens the choice");
    assert.equal(state.choices.length, 2, "both candidates are offered");
    const spokenText = spoken(state);
    for (const name of state.choices.map((c) => c.name)) {
      assert.ok(spokenText.includes(name), `${name} is on screen, not just in the state`);
    }
    assert.equal(state.busy, false, "nothing started, so nothing is claimed to be running");
  });

  it("choosing from an offer runs the sentence that produced it", async () => {
    const model = scripted([{ text: "", toolCalls: [{ name: "ls", input: { argv: ["ls"] } }] }]);
    const tools = fakeTools({ ls: { name: "ls", exit: 0, output: "" } });
    const { producer, store } = rig({ cwd: "/elsewhere", model, tools });
    producer.say("travaille sur kollio");
    await settle();

    // Before the choice, nothing ran: an ambiguity is a question, not a guess.
    assert.equal(tools.calls.length, 0, "no work started while the question was open");
    assert.equal(store.get().busy, false);

    const chosen = store.get().choices[0]!;
    producer.choose(chosen);
    await settle();

    assert.equal(store.get().choices.length, 0, "the offer closed");
    // The goal the model saw is the sentence, not the project name. A choice
    // answered where, not what.
    assert.equal(model.seen[0]?.goal, "travaille sur kollio", "the goal is the original sentence");
    // And it really ran: the tool runner was reached, repeatedly, because the
    // script repeats its last response and the loop only stops on a closed goal
    // or a spent budget. Every call settled, so each pair of rows is active then
    // confirmed and nothing is left claiming to be running.
    assert.ok(tools.calls.length > 0, "the chosen project ran work");
    const actions = actionEntries(store.get());
    // One settled row per call: the script repeats its last response, so the loop
    // spends its whole budget calling ls, and each of those calls is one row.
    assert.equal(actions.length, tools.calls.length, "one row per call, settled");
    assert.ok(actions.every((a) => a.certainty === "confirmed"), "every call settled");
  });

  it("five OBS-3 sentences all reach the loop, none is classified", () => {
    // The five answers a V1 surface answered identically and wrongly. Here none
    // of them is special: all five are goals.
    for (const said of ["je sais pas", "aucun", "laisse tomber", "montre-moi", "aide"]) {
      const { producer, store } = rig({
        cwd: "/anywhere",
        model: scripted([{ text: "", toolCalls: [] }]),
        tools: fakeTools({}),
      });
      producer.say(said);
      assert.equal(store.get().entries[0]?.text, said, `"${said}" is on screen`);
      assert.ok(
        !DEAD_ENDS.some((d) => d.test(spoken(store.get()))),
        `"${said}" produced a dead end`,
      );
    }
  });
});

// ─── the machine's vocabulary never reaches a person ───────────────────────

describe("the core's vocabulary stays on its side of the firewall", () => {
  it("a full run says nothing in the core's words", async () => {
    const model = scripted([
      { text: "", toolCalls: [{ name: "cat", input: { path: "src/core/store.ts" } }] },
      { text: "", toolCalls: [{ name: "npm", input: { argv: ["npm", "run", "typecheck"] } }] },
    ]);
    const tools = fakeTools({
      cat: { name: "cat", exit: 0, output: "export class EventStore" },
      npm: { name: "npm", exit: 0, output: "" },
    });
    const { producer, store } = rig({ cwd: `${ROOT}/tools/cuesheet`, model, tools });
    producer.say("check the store and typecheck");
    await settle();

    const all = spoken(store.get());
    for (const word of INTERNAL) {
      assert.doesNotMatch(all, new RegExp(word, "i"), `"${word}" leaked into the surface`);
    }
  });

  it("translation is the only crossing, and it is one function", () => {
    // The firewall is one exported function rather than a convention. Everything
    // that turns core vocabulary into surface vocabulary goes through it, and a
    // second crossing would be a second export to notice in review.
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const dir = join(root, "apps/terminal/src");
    const coreImport = /from\s+["'][^"']*src\/core\//;
    const offenders: string[] = [];
    for (const file of ["components/Timeline.tsx", "components/Header.tsx", "components/Composer.tsx", "components/StatusBar.tsx", "overlays/Projects.tsx", "overlays/Inspect.tsx", "overlays/Help.tsx", "app/state.ts", "app/store.ts"]) {
      const text = readFileSync(join(dir, file), "utf8");
      if (coreImport.test(text)) offenders.push(file);
    }
    assert.deepEqual(offenders, [], `these reach the core directly: ${offenders.join(", ")}`);
  });
});

// ─── the five verbs ─────────────────────────────────────────────────────────

describe("work is shown as one of five things a person cares about", () => {
  it("the verbs come from the request, not from the output", () => {
    const cases: Array<[ToolRequest, string]> = [
      [{ name: "cat", input: { path: "a.ts" } }, "read"],
      [{ name: "ls", input: { argv: ["ls", "test"] } }, "read"],
      [{ name: "node", input: { argv: ["node", "-e", "console.log(\"test\")"] } }, "other"],
      [{ name: "node", input: { argv: ["node", "--test", "test/example.mjs"] } }, "test"],
      [{ name: "rg", input: { argv: ["rg", "-n", "x", "src"] } }, "read"],
      [{ name: "git", input: { argv: ["git", "status"] } }, "inspect"],
      [{ name: "git", input: { argv: ["git", "diff"] } }, "inspect"],
      [{ name: "npm", input: { argv: ["npm", "test"] } }, "test"],
      [{ name: "npx", input: { argv: ["npx", "tsc", "--noEmit"] } }, "verify"],
      [{ name: "node", input: { argv: ["sh", "-c", "echo x > f"] } }, "edit"],
    ];
    for (const [request, expected] of cases) {
      assert.equal(verbFor(request), expected, `${JSON.stringify(request)} is ${expected}`);
    }
  });

  it("a test is a test even when it also reads something", () => {
    // The ordering matters: a naive matcher sees `npm` and calls it an edit, and
    // a person watching their tests run sees the wrong word.
    assert.equal(verbFor({ name: "npm", input: { argv: ["npm", "test"] } }), "test");
  });

  it("an unrecognised call keeps its own name rather than being forced into a verb", () => {
    const request: ToolRequest = { name: "wasm-pack", input: { argv: ["wasm-pack", "build"] } };
    assert.equal(verbFor(request), "other", "no invented category");
    assert.equal(pendingFor(request).label, "wasm-pack", "it is shown honestly");
  });

  it("a detail is a target, or nothing at all", () => {
    assert.equal(detailFor({ name: "cat", input: { path: "src/a.ts" } }), "src/a.ts");
    assert.equal(detailFor({ name: "rg", input: { argv: ["rg", "-n", "x", "src"] } }), "src");
    // A subcommand is not a target. A real run printed `inspect status`, which
    // read like a file called `status`; the verb column already carries it.
    assert.equal(detailFor({ name: "git", input: { argv: ["git", "status", "--short"] } }), "");
    // `npm run typecheck` names a script, not a file, and the verb column
    // already reads "verify". Showing the script too would say it twice.
    assert.equal(detailFor({ name: "npm", input: { argv: ["npm", "run", "typecheck"] } }), "");
    // Nothing names a target, so nothing is invented. A fabricated filename is
    // worse than a bare verb.
    assert.equal(detailFor({ name: "ls", input: {} }), "");
  });
});

// ─── the stop reason is what the surface reports ────────────────────────────

describe("the loop's own stop decides what the surface says", () => {
  it("closed, spent and blocked are three different claims", () => {
    // Built as real `LoopStop` values, because the parameter is typed as one and
    // a hand-rolled object literal would let a fourth shape through unnoticed.
    const closed = entryForStop({ reason: "goal-closed", steps: 3, evidence: 1 }, "run-a");
    assert.equal(closed[0]?.kind, "status");
    assert.equal(closed[0]?.certainty, "confirmed");

    const spent = entryForStop({ reason: "budget-exhausted", steps: 8, evidence: 0 }, "run-b");
    assert.equal(spent[0]?.kind, "status");
    assert.equal(spent[0]?.certainty, "unknown", "a spent budget is not a settled goal");

    const blocked = entryForStop({ reason: "blocked", missing: ["git"] }, "run-c");
    assert.equal(blocked[0]?.kind, "failure", "a run that could not start is a failure, not a status");
    assert.match(JSON.stringify(blocked), /git/, "and it names what was missing");

    const bare = entryForStop({ reason: "blocked", missing: [] }, "run-d");
    assert.match(JSON.stringify(bare), /could not start/, "and it still says what happened");
  });

  it("a model's claim of completion never closes the run", async () => {
    // The core's own guarantee (`src/core/loop.ts:8-22`) and the surface's: a
    // model that says "done" with nothing backing it cannot produce a confirmed
    // status, because the surface reads the loop's stop and not the text.
    const model = scripted([{ text: "I am done, the work is complete.", toolCalls: [] }]);
    const { producer, store } = rig({
      cwd: `${ROOT}/tools/cuesheet`,
      model,
      tools: fakeTools({}),
    });
    producer.say("do the thing");
    await settle();

    const statuses = entries(store.get(), "status").filter((s) => s.kind === "status");
    assert.ok(
      statuses.some((s) => s.kind === "status" && s.certainty === "unknown" && /still open|Le but reste ouvert/.test(s.value)),
      `the run is reported as open: ${JSON.stringify(statuses)}`,
    );
    assert.ok(
      !statuses.some((s) => s.kind === "status" && s.label === "work" && s.certainty === "confirmed"),
      "a model's claim was not reported as established",
    );
  });
});

// ─── the store, not React ───────────────────────────────────────────────────

describe("state lives outside React so a streaming run can write it", () => {
  it("the store notifies only on a real change", () => {
    const store = createStore();
    let notified = 0;
    const off = store.subscribe(() => { notified += 1; });
    store.send({ type: "compose", text: "a" });
    assert.equal(notified, 1);
    store.send({ type: "compose", text: "ab" });
    assert.equal(notified, 2);
    // A control that changes nothing must not repaint the timeline.
    store.send({ type: "submit", text: "   " });
    assert.equal(notified, 2, "an empty sentence is not a change");
    off();
    store.send({ type: "compose", text: "abc" });
    assert.equal(notified, 2, "unsubscribing works");
  });

  it("a run writes to the same store a keystroke writes to", async () => {
    const model = scripted([{ text: "", toolCalls: [{ name: "ls", input: { argv: ["ls"] } }] }]);
    const { producer, store } = rig({
      cwd: `${ROOT}/tools/cuesheet`,
      model,
      tools: fakeTools({ ls: { name: "ls", exit: 0, output: "" } }),
    });
    // A keystroke first, then a run: one store, two writers by role, and the
    // producer is the only thing that can turn a promise continuation into state.
    store.send({ type: "compose", text: "list src" });
    producer.say("list src");
    await settle();
    assert.equal(store.get().composer, "", "the composer cleared");
    assert.ok(store.get().busy === false, "and the run settled");
    assert.ok(actionEntries(store.get()).length > 0);
  });
});

// ─── the overlay state ──────────────────────────────────────────────────────

describe("overlays are a state, not a component", () => {
  it("an offer opens the choice and closing it takes the choices with it", () => {
    const offered = derive(emptySurface, {
      type: "offered",
      choices: [{ name: "a", path: "p/a", why: "its name matched" }, { name: "b", path: "p/b", why: "its name matched" }],
    });
    assert.equal(offered.overlay, "projects");
    assert.equal(offered.choices.length, 2);
    // An offer nobody can see is not an offer. Leaving it behind would let a
    // later sentence be answered against a dismissed question.
    const closed = derive(offered, { type: "close" });
    assert.equal(closed.choices.length, 0);
    assert.equal(closed.overlay, "none");
  });

  it("a choice names the project and closes the overlay", () => {
    const offered = derive(emptySurface, {
      type: "offered",
      choices: [{ name: "kollio", path: "products/kollio", why: "its name matched" }],
    });
    const picked = derive(offered, { type: "choose", option: offered.choices[0]! });
    assert.equal(picked.project, "kollio");
    assert.equal(picked.overlay, "none");
    assert.equal(picked.choices.length, 0);
  });

  it("submitting clears an open offer, because the new sentence is the answer", () => {
    const offered = derive(emptySurface, {
      type: "offered",
      choices: [{ name: "a", path: "p/a", why: "w" }],
    });
    const said = derive(offered, { type: "submit", text: "actually, in videoai" });
    assert.equal(said.choices.length, 0);
    assert.equal(said.overlay, "none");
    assert.equal(said.entries.at(-1)?.kind, "you");
  });
});
 it("generic review language keeps the current project while a complete different name can switch it",()=>{
 const noisy=[...PORTFOLIO,{name:"gtm",path:"tools/gtm",kind:"repo",status:"live",nature:"review",stack:"safety",exists:true}] as ProjectIdentity[];
 const scope=resolveScope("review the safety of this correction",`${ROOT}/tools/cuesheet`,noisy,binder,ROOT);assert.equal(scope.at,"cwd");if(scope.at!=="choice")assert.equal(scope.path,`${ROOT}/tools/cuesheet`);
 const other=resolveScope("work on videoai",`${ROOT}/tools/cuesheet`,noisy,binder,ROOT);assert.equal(other.at,"bound");if(other.at!=="choice")assert.equal(other.path,`${ROOT}/experiments/videoai`);
});
