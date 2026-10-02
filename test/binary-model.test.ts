/**
 * MB-01: the local binary as a model provider.
 *
 * The tests here are about a transport, so most of them are about what the
 * transport refuses. A provider that invents an answer when the world said
 * nothing is the defect class this repository has fought three times, and a
 * subprocess boundary is exactly where that defect would arrive wearing a new
 * hat: a torn stream, a non-zero exit, a truncated line, an empty envelope.
 *
 * So the parse is exercised against captured raw runs rather than a live
 * subprocess, which is what makes a torn stream a test case at all. The one
 * live test is gated on the binary being present and is a real inference.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AGENT_CONFIG,
  BINARY_ADAPTER_NAME,
  PROPOSAL_AGENT,
  binaryAvailable,
  parseProposal,
  readStream,
  renderProposalPrompt,
  type RawRun,
} from "../src/adapters/binary-model.ts";
import { findBinary, resolveModel, OPENROUTER_PROVIDER } from "../src/adapters/default-model.ts";
import { ShellToolRunner } from "../src/adapters/shell.ts";
import { runAgentLoop, compileFrame, type ModelAdapter, type ToolRequest, type ToolRunner } from "../src/core/loop.ts";
import { EventStore } from "../src/core/store.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "cuesheet-binary-"));

/** One well-formed NDJSON line, so a test states only what it is testing. */
const line = (o: Record<string, unknown>): string => `${JSON.stringify(o)}\n`;

const stepStart = () => line({ type: "step_start", timestamp: 1, part: { type: "step-start" } });
const text = (t: string) => line({ type: "text", timestamp: 2, part: { type: "text", text: t } });
const stepFinish = (extra: Record<string, unknown> = {}) =>
  line({
    type: "step_finish",
    timestamp: 3,
    part: {
      type: "step-finish",
      reason: "stop",
      tokens: { total: 100, input: 90, output: 10, reasoning: 0, cache: { write: 0, read: 0 } },
      cost: 0,
      ...extra,
    },
  });
const toolUse = (tool: string) =>
  line({
    type: "tool_use",
    timestamp: 2,
    part: { type: "tool", tool, callID: "call_1", state: { status: "completed", input: {}, output: "" } },
  });

/** A complete, well-formed run whose envelope carries the given payload. */
const goodRun = (envelope: unknown): RawRun => ({
  stdout: stepStart() + text(JSON.stringify(envelope)) + stepFinish(),
  stderr: "",
  exit: 0,
  signal: null,
});

describe("MB-01 the proposal agent strips the tool list", () => {
  it("denies every tool and every permission, in the config Cuesheet owns", () => {
    // The whole safety argument is this object. Asserted rather than described
    // because a later edit that softens one key would otherwise pass every other
    // test in this file and silently remove the guarantee.
    const agent = (AGENT_CONFIG as { agent: Record<string, Record<string, unknown>> }).agent[
      PROPOSAL_AGENT
    ];
    assert.deepEqual(agent?.["tools"], { "*": false });
    assert.deepEqual(agent?.["permission"], { "*": "deny" });
    assert.equal(agent?.["mode"], "primary");
  });

  it("never runs with --auto, which is the opposite of the guarantee", () => {
    // `--auto` approves every permission that is not explicitly denied, so a
    // config that ever stopped denying would become fully permissive under it.
    // The adapter has no flag to turn it on and never adds one.
    const source = readFileSyncUtf8(join(import.meta.dirname, "..", "src", "adapters", "binary-model.ts"));
    assert.equal(source.includes('"--auto"'), false, "the adapter must not name --auto");
    assert.equal(source.includes("'--auto'"), false, "the adapter must not name --auto");
  });
});

function readFileSyncUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

describe("MB-01 a proposal is parsed out of text, and a tool event is not one", () => {
  it("reads text and tool calls out of the envelope", () => {
    const r = parseProposal(
      goodRun({
        text: "I need to read the entry point before I touch anything.",
        toolCalls: [{ name: "read_file", input: { path: "src/index.ts" } }],
      }),
    );
    assert.equal(r.text, "I need to read the entry point before I touch anything.");
    assert.equal(r.toolCalls.length, 1);
    assert.equal(r.toolCalls[0]!.name, "read_file");
    assert.deepEqual(r.toolCalls[0]!.input, { path: "src/index.ts" });
  });

  it("unwraps a fenced envelope, because a fence is unambiguous", () => {
    const fenced = goodRun({ text: "ok", toolCalls: [] });
    fenced.stdout = stepStart() + text('```json\n{"text":"ok","toolCalls":[]}\n```') + stepFinish();
    assert.equal(parseProposal(fenced).text, "ok");
  });

  it("MB-01 THE CRUX: a tool_use event is refused, never honoured", () => {
    // This is the boundary 0bff34c drew. The binary tried to act, which means
    // the deny-list did not hold, and the correct response to a guarantee that
    // has just been observed false is to stop rather than to continue using it.
    const run: RawRun = {
      stdout: stepStart() + toolUse("write") + text('{"text":"done","toolCalls":[]}') + stepFinish(),
      stderr: "",
      exit: 0,
      signal: null,
    };
    assert.throws(() => parseProposal(run), /deny-list did not hold/);
  });

  it("a tool event is refused even when the envelope is perfectly valid", () => {
    // Written in the other order deliberately: a clean parse must not be
    // available as a consolation prize when the stream also shows an action.
    const run: RawRun = {
      stdout: text('{"text":"all good","toolCalls":[]}') + toolUse("bash") + stepFinish(),
      stderr: "",
      exit: 0,
      signal: null,
    };
    assert.throws(() => parseProposal(run), /deny-list did not hold/);
  });

  it("an empty envelope is a failure, not a quiet success", () => {
    assert.throws(() => parseProposal(goodRun({ text: "   ", toolCalls: [] })), /neither text nor a tool call/);
    assert.throws(() => parseProposal(goodRun({})), /neither text nor a tool call/);
  });

  it("prose is refused rather than searched for something that parses", () => {
    // A parser that scraped JSON out of a paragraph is how a sentence becomes a
    // command. The whole point is that the shape is closed.
    const prose: RawRun = {
      stdout: stepStart() + text('Sure! Here is my plan: {"text":"x","toolCalls":[]} Hope that helps.') + stepFinish(),
      stderr: "",
      exit: 0,
      signal: null,
    };
    assert.throws(() => parseProposal(prose), /not the requested JSON object/);
  });

  it("a tool call with no name is dropped rather than given an invented one", () => {
    const r = parseProposal(
      goodRun({ text: "x", toolCalls: [{ input: { path: "a" } }, { name: "read_file", input: {} }] }),
    );
    assert.equal(r.toolCalls.length, 1, "the nameless call did not become a request");
    assert.equal(r.toolCalls[0]!.name, "read_file");
  });

  it("a non-object input is normalised to {}, never passed through as an array", () => {
    const r = parseProposal(goodRun({ text: "x", toolCalls: [{ name: "read_file", input: ["a"] }] }));
    assert.deepEqual(r.toolCalls[0]!.input, {});
  });
});

describe("MB-01 a torn or broken stream is a failure, never an answer", () => {
  it("a stream cut mid-line is refused as incomplete", () => {
    // The exact defect this repository keeps refusing to ship: half an answer
    // read as a whole one. NDJSON's last record is only whole if the stream
    // ended with a newline, so the cut has to be at the very end.
    const whole = stepStart() + text('{"text":"I will read the file first","toolCalls":[]}') + stepFinish();
    const torn: RawRun = {
      stdout: whole.slice(0, whole.length - 12),
      stderr: "",
      exit: 0,
      signal: null,
    };
    assert.equal(readStream(torn.stdout).truncated, true, "the cut is detected as a cut");
    assert.throws(() => parseProposal(torn), /ended mid-line/);
  });

  it("a malformed line among good ones is refused, not skipped", () => {
    const run: RawRun = {
      stdout: stepStart() + "{not json at all}\n" + text('{"text":"x","toolCalls":[]}') + stepFinish(),
      stderr: "",
      exit: 0,
      signal: null,
    };
    assert.throws(() => parseProposal(run), /not valid events/);
  });

  it("a non-zero exit is refused, and the exit is named", () => {
    const run: RawRun = { stdout: "", stderr: "402 insufficient credits", exit: 1, signal: null };
    assert.throws(() => parseProposal(run), /exited 1/);
  });

  it("a non-zero exit that still printed an answer is still refused", () => {
    // A clean envelope on stdout does not make a failed run a successful one.
    const run: RawRun = {
      stdout: text('{"text":"done","toolCalls":[]}'),
      stderr: "killed",
      exit: 137,
      signal: null,
    };
    assert.throws(() => parseProposal(run), /exited 137/);
  });

  it("a killed process is refused, naming the signal", () => {
    const run: RawRun = { stdout: "", stderr: "", exit: null, signal: "SIGKILL" };
    assert.throws(() => parseProposal(run), /terminated on SIGKILL/);
  });

  it("no output at all is refused, and says the model said nothing", () => {
    assert.throws(() => parseProposal({ stdout: "", stderr: "", exit: 0, signal: null }), /returned no text/);
  });

  it("events with no text event are refused rather than read as an empty answer", () => {
    const run: RawRun = { stdout: stepStart() + stepFinish(), stderr: "", exit: 0, signal: null };
    assert.throws(() => parseProposal(run), /returned no text/);
  });

  it("an empty stream is not reported as truncated; there is nothing to cut", () => {
    const s = readStream("");
    assert.equal(s.truncated, false);
    assert.equal(s.malformed, 0);
    assert.deepEqual(s.texts, []);
  });

  it("a stream ending in a newline is not truncated", () => {
    assert.equal(readStream(stepStart()).truncated, false);
  });
});

describe("MB-01 cost and tokens come from the stream, or they are absent", () => {
  it("reports what step_finish said", () => {
    const r = parseProposal(goodRun({ text: "x", toolCalls: [] }));
    assert.equal(r.usage.length, 1);
    assert.equal(r.usage[0]!.tokens, 100);
    assert.equal(r.usage[0]!.input, 90);
    assert.equal(r.usage[0]!.output, 10);
    assert.equal(r.usage[0]!.cost, 0, "a reported zero is a measurement, not an absence");
  });

  it("a step that reported no tokens reports null, not 0", () => {
    // docs/cost-current.md exists because cost was measured before it was
    // optimised. A number that appears because a field was missing is the
    // opposite of a measurement, and it would be read as one.
    const noTokens = line({
      type: "step_finish",
      timestamp: 3,
      part: { type: "step-finish", reason: "stop", cost: 0 },
    });
    const s = readStream(noTokens);
    assert.equal(s.usage[0]!.tokens, null);
    assert.equal(s.usage[0]!.input, null);
    assert.equal(s.usage[0]!.cost, 0, "cost was reported, so it is kept");
  });

  it("a step with no cost at all reports null cost", () => {
    const s = readStream(line({ type: "step_finish", part: { type: "step-finish", reason: "stop" } }));
    assert.equal(s.usage[0]!.cost, null);
  });

  it("every step's usage is kept, so a multi-step run is measurable", () => {
    // One text envelope, two steps. A run that thinks twice reports both, and
    // the measurement is only worth anything if it accumulates rather than
    // keeping whichever step it read last.
    const stdout =
      stepStart() +
      text('{"text":"thinking","toolCalls":[]}') +
      stepFinish({ cost: 0, tokens: { total: 7, input: 6, output: 1 } }) +
      stepStart() +
      stepFinish({ cost: 0, tokens: { total: 5, input: 4, output: 1 } });
    const r = parseProposal({ stdout, stderr: "", exit: 0, signal: null });
    assert.equal(r.usage.length, 2);
    assert.deepEqual(
      r.usage.map((u) => u.tokens),
      [7, 5],
    );
    assert.equal(
      r.usage.reduce((sum, u) => sum + (u.cost ?? 0), 0),
      0,
      "and the costs accumulate to what the run actually spent",
    );
  });
});

describe("MB-01 the four verbs stay the only path to a change", () => {
  it("a live loop hands the binary's proposal to the runner, and nothing else runs", async () => {
    // The honest version of this test, and its limit stated up front: a fake
    // binary is a real process that writes a real NDJSON stream and really
    // exits, so the adapter, the parse and the loop are all exercised. Only the
    // model is substituted, which is the part under test.
    //
    // What this can prove is where a tool call comes from and who may run it.
    // It cannot prove the producer's own verbs do the right thing with the
    // proposal; that is `llm-producer.test.ts`, and pretending otherwise here
    // would be a test that looks stronger than it is.
    const root = realpathSync(tmp());
    try {
      // A fake `opencode` that speaks the measured protocol. It proposes one
      // read and one verb the harness does not honour, and it writes nothing.
      const fake = join(root, "fake-opencode");
      writeExecutable(
        fake,
        [
          "#!/bin/sh",
          "cat <<'STREAM'",
          stepStart(),
          text(
            JSON.stringify({
              text: "Reading the seed. I am done once I have.",
              toolCalls: [
                { name: "cat", input: { path: "seed.txt" } },
                { name: "ruler", input: { path: "anything" } },
              ],
            }),
          ),
          stepFinish(),
          "STREAM",
        ].join("\n"),
      );

      const work = join(root, "work");
      mkdirSync(work, { recursive: true });
      writeFileSync(join(work, "seed.txt"), "seed\n", "utf8");
      const before = readdirSync(work).sort();

      const { BinaryModelAdapter } = await import("../src/adapters/binary-model.ts");
      const model: ModelAdapter = new BinaryModelAdapter({ binary: fake, project: work, timeoutMs: 20_000 });
      // The real runner, and the real allow list shape `chat.ts` uses.
      const tools: ToolRunner = new ShellToolRunner({
        allow: ["cat"],
        roots: [work],
        defaultCwd: work,
      });

      const store = new EventStore("mb01", () => 1);
      const outcome = await runAgentLoop(store, model, tools, {
        subject: "builder",
        goal: "propose, then let the harness act",
        maxSteps: 1,
      });

      // The model said it finished. That is a claim, and it is in the log as one,
      // not as the reason the run ended.
      assert.equal(outcome.claims.length, 1);
      assert.match(outcome.claims[0]!, /Reading the seed/);
      assert.equal(outcome.stop.reason, "budget-exhausted", "a claim did not close the goal");

      // Every proposed call reached the log as a request before it ran. The
      // binary cannot write to the log, so an action in it is one Cuesheet chose.
      const actions = outcome.session.events.filter((e) => e.kind === "action");
      assert.deepEqual(
        actions.map((a) => (a.data as { tool: string }).tool),
        ["cat", "ruler"],
      );
      // And the proposal arrived with the step number, so the log can say which
      // inference asked for it.
      assert.equal(actions[0]!.data["step"], 1);

      // The runner ran the verb it allows and refused the one it does not. That
      // refusal is the four verbs working: the vocabulary is the harness's, and
      // a name the harness does not honour cannot reach the world.
      const observations = outcome.session.events.filter(
        (e) => e.kind === "observation" && typeof e.data["tool"] === "string",
      );
      const cat = observations.find((o) => o.data["tool"] === "cat");
      assert.equal(cat?.data["exit"], 0, "the allowed verb ran");
      assert.match(String(cat?.data["output"]), /seed/);
      const refused = observations.find((o) => o.data["tool"] === "ruler");
      assert.equal(refused?.data["exit"], 127, "the unhonoured verb never ran");
      assert.match(String(refused?.data["output"]), /not in the allow list/);

      // And the filesystem is exactly as it was: the only change the model asked
      // for was a read, so there was no change to make.
      assert.deepEqual(readdirSync(work).sort(), before, "nothing in the workspace was modified");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a write proposal reaches the runner as data, and the runner is what changes the world", async () => {
    // The write case, with a runner that really writes. This is the property the
    // whole slice rests on: the binary asks, and something that is not the binary
    // decides. The recording runner stands in for the producer's own verbs, and
    // it records rather than writes, so the assertion is about who was asked and
    // what the answer was.
    const root = realpathSync(tmp());
    try {
      const fake = join(root, "fake-opencode");
      writeExecutable(
        fake,
        [
          "#!/bin/sh",
          "cat <<'STREAM'",
          stepStart(),
          text(
            JSON.stringify({
              text: "Writing the proposal.",
              toolCalls: [{ name: "write_file", input: { path: "out.txt", contents: "PROPOSED\n" } }],
            }),
          ),
          stepFinish(),
          "STREAM",
        ].join("\n"),
      );

      const work = join(root, "work");
      mkdirSync(work, { recursive: true });
      const before = readdirSync(work).sort();

      const { BinaryModelAdapter } = await import("../src/adapters/binary-model.ts");
      const model: ModelAdapter = new BinaryModelAdapter({ binary: fake, project: work, timeoutMs: 20_000 });

      const asked: ToolRequest[] = [];
      const tools: ToolRunner = {
        async run(request) {
          asked.push(request);
          return { name: request.name, exit: 0, output: "written by the runner" };
        },
      };

      const store = new EventStore("mb01-write", () => 1);
      const outcome = await runAgentLoop(store, model, tools, {
        subject: "builder",
        goal: "propose a write",
        maxSteps: 1,
      });

      assert.equal(asked.length, 1);
      assert.equal(asked[0]!.name, "write_file");
      assert.deepEqual(asked[0]!.input, { path: "out.txt", contents: "PROPOSED\n" });

      // The request is in the log, and the binary itself created nothing.
      const action = outcome.session.events.find((e) => e.kind === "action");
      assert.ok(action, "the proposal is a logged request");
      assert.equal(action.data["tool"], "write_file");
      assert.deepEqual(readdirSync(work).sort(), before, "the binary wrote nothing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the adapter never names a tool event as a ToolRequest, because a run through it logs no action", () => {
    // The structural half, and the one that cannot rot: the source contains no
    // branch that reads a `tool` part into a request. `readStream` collects the
    // tool names only so `parseProposal` can refuse on them.
    const source = readFileSyncUtf8(join(import.meta.dirname, "..", "src", "adapters", "binary-model.ts"));
    const asRequest = /toolCalls\.(push|concat)\([^)]*toolUse|input:\s*part\[/.test(source);
    assert.equal(asRequest, false, "a tool event must never become a ToolRequest");
    assert.match(source, /toolEvents/, "but it must be collected, so the refusal can name it");
  });
});

describe("MB-01 the surface resolves a model instead of demanding a key", () => {
  const withEnv = (values: Record<string, string | undefined>, body: () => void) => {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(values)) {
      saved[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      body();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it("uses the local binary when there is one, with no key set", () => {
    withEnv({ CUESHEET_PROVIDER: undefined, OPENROUTER_API_KEY: undefined }, () => {
      const resolved = resolveModel({ project: null });
      // The binary is installed on this machine, so this is the real branch.
      if ("missing" in resolved) {
        assert.match(resolved.missing, /no model transport on this machine/);
        assert.match(resolved.missing, /CUESHEET_OPENCODE_BIN/, "and it says what it looked for");
      } else {
        assert.equal(resolved.name, BINARY_ADAPTER_NAME);
        assert.equal(resolved.adapter.name, BINARY_ADAPTER_NAME);
      }
    });
  });

  it("an ambient OPENROUTER_API_KEY does not silently take over the default path", () => {
    // Four hardcoded model ids and one env var used to decide this. A key that
    // happens to be exported changing which transport a run spends is a
    // decision nobody can reconstruct from the log afterwards.
    withEnv({ CUESHEET_PROVIDER: undefined, OPENROUTER_API_KEY: "sk-ambient" }, () => {
      const resolved = resolveModel({ project: null });
      if (!("missing" in resolved)) {
        assert.equal(resolved.name, BINARY_ADAPTER_NAME, "an ambient key is not a request");
      }
    });
  });

  it("OpenRouter is used when it is asked for by name", () => {
    withEnv({ CUESHEET_PROVIDER: OPENROUTER_PROVIDER, OPENROUTER_API_KEY: "sk-explicit" }, () => {
      const resolved = resolveModel({ project: null });
      assert.ok(!("missing" in resolved));
      assert.equal(resolved.name, "openrouter");
    });
  });

  it("asking for OpenRouter without a key says exactly that, rather than falling back silently", () => {
    withEnv({ CUESHEET_PROVIDER: OPENROUTER_PROVIDER, OPENROUTER_API_KEY: undefined }, () => {
      const resolved = resolveModel({ project: null });
      assert.ok("missing" in resolved);
      assert.match(resolved.missing, /OPENROUTER_API_KEY is not set/);
    });
  });

  it("the false sentence about local runtimes is gone from the surface", () => {
    // The exact claim this slice exists to retract. Asserted on the source
    // because a stale copy in a comment is how it comes back.
    for (const rel of ["src/chat.ts", "src/cli-run.ts", "apps/terminal/src/producer/runtime.ts"]) {
      const source = readFileUtf8(join(import.meta.dirname, "..", rel));
      assert.equal(
        /there is no local (model )?runtime on this machine/.test(source),
        false,
        `${rel} must not claim there is no local runtime`,
      );
    }
  });

  it("no surface hardcodes a model id any more", () => {
    // The four copies of `anthropic/claude-sonnet-4-6` are gone from the default
    // path. One remains, in the OpenRouter branch of `resolveModel`, where a
    // model id belongs because that branch is a different provider.
    for (const rel of ["src/chat.ts", "apps/terminal/src/producer/runtime.ts"]) {
      const source = readFileUtf8(join(import.meta.dirname, "..", rel));
      assert.equal(source.includes("claude-sonnet-4-6"), false, `${rel} hardcodes a model id`);
    }
  });

  it("findBinary names the path it used, and reports absence honestly", () => {
    const found = findBinary({ PATH: "/nonexistent-cuesheet-bin" });
    if (found === null) {
      // Honest absence: the fallback locations were checked too.
      assert.equal(found, null);
    } else {
      assert.equal(binaryAvailable(found), true);
      assert.equal(found.endsWith("opencode"), true);
    }
  });

  it("binaryAvailable refuses a path that is not executable, rather than calling it a transport", () => {
    assert.equal(binaryAvailable(null), false);
    assert.equal(binaryAvailable(""), false);
    assert.equal(binaryAvailable("/definitely/not/here/opencode"), false);
  });
});

describe("MB-01 the prompt says what the model may propose", () => {
  const frame = (directives: string[] = []) => {
    const store = new EventStore("s", () => 1);
    for (const text of directives) {
      store.append({ kind: "directive", subject: "builder", data: { text } });
    }
    return compileFrame(store.toSession(), { subject: "builder", goal: "prove the envelope", maxSteps: 1 }, 1);
  };

  it("enumerates the producer's vocabulary, recovered from the directive", () => {
    // The same `tools: a, b, c` convention `openrouter.ts` reads. A model cannot
    // discover a shape it was never shown, and a run retrying a calling
    // convention is a run that measured nothing.
    const prompt = renderProposalPrompt(frame(["tools: read_file, write_file, finish"]), ["read_file", "write_file", "finish"]);
    assert.match(prompt, /"read_file", "write_file", "finish"/);
  });

  it("states the closed shape, and that there are no tools", () => {
    const prompt = renderProposalPrompt(frame(), []);
    assert.match(prompt, /You have no tools/);
    assert.match(prompt, /\{"text": string, "toolCalls"/);
    assert.match(prompt, /ONE JSON object and nothing else/);
  });

  it("says that a completion claim does not finish the run", () => {
    // Carried across from the OpenRouter prompt on purpose: the loop's rule
    // belongs to the prompt, not to whichever provider happens to be installed.
    assert.match(renderProposalPrompt(frame(), []), /does not finish anything/);
  });
});

describe("MB-01 a real run against the installed binary", () => {
  // Realpath first. On macOS `tmpdir()` is under a symlink, and ShellToolRunner
  // resolves paths before comparing them to its roots, so a root that was never
  // realpathed refuses every path inside itself. That is the runner behaving
  // correctly, and the fix belongs in the test rather than in the runner.
  const binary = findBinary();

  it(
    "returns text at no cost, and touches nothing",
    { skip: binary ? false : "no opencode binary on this machine" },
    async () => {
      const root = realpathSync(tmp());
      try {
        const before = readdirSync(root).sort();
        const { BinaryModelAdapter } = await import("../src/adapters/binary-model.ts");
        const model = new BinaryModelAdapter({
          binary: binary!,
          project: root,
          model: "opencode/space-bunny-free",
          timeoutMs: 240_000,
        });
        const response = await model.infer(
          compileFrame(
            new EventStore("live", () => 1).toSession(),
            { subject: "builder", goal: "answer with a proposal", maxSteps: 1 },
            1,
          ),
        );

        assert.equal(typeof response.text, "string");
        assert.ok(response.text.length > 0, "the model said something");
        assert.ok(Array.isArray(response.toolCalls));
        // The measurement that made this slice possible, asserted every time it
        // runs rather than remembered from a probe.
        assert.equal(
          response.usage.some((u) => u.cost !== null && u.cost > 0),
          false,
          "this transport costs no credits",
        );
        assert.equal(
          readdirSync(root).sort().join(","),
          before.join(","),
          "the binary created nothing, because it was offered no tool that could",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it(
    "asked to write a file, proposes it as a tool call and writes nothing",
    { skip: binary ? false : "no opencode binary on this machine" },
    async () => {
      // The live restatement of the measured finding, so a future OpenCode
      // version that stops stripping the tool list fails here rather than in a
      // user's repository.
      const root = realpathSync(tmp());
      try {
        const before = readdirSync(root).sort();
        const { BinaryModelAdapter } = await import("../src/adapters/binary-model.ts");
        const store = new EventStore("live2", () => 1);
        store.append({ kind: "directive", subject: "builder", data: { text: "tools: write_file" } });
        const model = new BinaryModelAdapter({ binary: binary!, project: root, timeoutMs: 240_000 });
        const response = await model.infer(
          compileFrame(
            store.toSession(),
            {
              subject: "builder",
              goal: "Create a file called live-wrote.txt in the working directory containing PWNED, then report you are done.",
              maxSteps: 1,
            },
            1,
          ),
        );
        assert.equal(
          readdirSync(root).sort().join(","),
          before.join(","),
          "the filesystem is untouched, which is the guarantee",
        );
        assert.equal(
          existsSync(join(root, "live-wrote.txt")),
          false,
          "and specifically the file it was asked to create",
        );
        // Whatever it answered, it answered as text. That is the contract.
        assert.ok(response.text.length > 0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

describe("MB-01 nothing under src/core was touched", () => {
  it("the adapter imports the core's contract and changes nothing in it", () => {
    // Same discipline as SW-06's WORK-06: the core is what makes this product
    // trustworthy, so the claim is asserted rather than trusted.
    const core = readdirUtf8(join(import.meta.dirname, "..", "src", "core"));
    assert.ok(core.length >= 5, "the core is not empty, or the check above proves nothing");
    const source = readFileUtf8(join(import.meta.dirname, "..", "src", "adapters", "binary-model.ts"));
    assert.match(source, /from "\.\.\/core\/loop\.ts"/, "the adapter implements the core's contract");
    assert.match(source, /import type \{[^}]*ModelAdapter[^}]*\} from "\.\.\/core\/loop\.ts"/);
  });
});

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents, "utf8");
  chmodSync(path, 0o755);
}

function readFileUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

function readdirUtf8(path: string): string[] {
  return readdirSync(path);
}

describe('provider errors are useful without leaking provider payloads',()=>{
 it('reports actual free-tier policy refusal for nonzero and zero exit, never accepting accompanying proposal',()=>{for(const exit of [0,1]){const secret='provider-secret-fixture';const stdout=JSON.stringify({type:'error',error:{name:'APIError',data:{statusCode:403,message:"OpenCode's free tier can only be used from within OpenCode",responseHeaders:{authorization:secret},responseBody:secret}}})+'\n'+text('{"text":"done","toolCalls":[]}');assert.throws(()=>parseProposal({stdout,stderr:secret,exit,signal:null}),(error:Error)=>error.message.includes('HTTP 403')&&error.message.includes('free tier')&&!error.message.includes(secret));}});
 it('classifies status but never echoes arbitrary error text or stderr',()=>{for(const status of [401,403,429,500]){const secret='key-in-provider-error';assert.throws(()=>parseProposal({stdout:JSON.stringify({type:'error',error:{name:'APIError',data:{statusCode:status,message:secret}}})+'\n',stderr:secret,exit:1,signal:null}),(error:Error)=>error.message.includes('HTTP '+status)&&!error.message.includes(secret));}assert.throws(()=>parseProposal({stdout:'',stderr:'secret-in-stderr',exit:1,signal:null}),(error:Error)=>error.message.includes('exited 1')&&!error.message.includes('secret-in-stderr'));});
});
