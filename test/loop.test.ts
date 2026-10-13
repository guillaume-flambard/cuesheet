import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  compileFrame,
  runAgentLoop,
  type ContextFrame,
  type ModelAdapter,
  type ModelResponse,
  type ToolRequest,
  type ToolResult,
  type ToolRunner,
} from "../src/core/loop.ts";
import { EventStore } from "../src/core/store.ts";
import type { Capability } from "../src/core/capability.ts";

/** A provider that replays a scripted sequence of responses. */
const scripted = (...script: Array<Partial<ModelResponse>>): ModelAdapter => {
  let i = 0;
  return {
    name: "scripted",
    async infer(frame: ContextFrame): Promise<ModelResponse> {
      void frame;
      const step = script[Math.min(i, script.length - 1)] ?? {};
      i++;
      return { text: step.text ?? "", toolCalls: step.toolCalls ?? [] };
    },
  };
};

const runner = (results: Record<string, ToolResult>): ToolRunner => ({
  async run(request: ToolRequest): Promise<ToolResult> {
    return results[request.name] ?? { name: request.name, exit: 0, output: "" };
  },
});

const skill = (name: string): Capability => ({
  kind: "skill",
  name,
  version: "abc123",
  source: "test",
});

const newStore = () => new EventStore("s-test", () => 1000);

describe("runAgentLoop", () => {
  it("refuses to start when a required capability is unresolvable, spending nothing", async () => {
    const store = newStore();
    let inferences = 0;
    const counting: ModelAdapter = {
      name: "counting",
      async infer() {
        inferences++;
        return { text: "", toolCalls: [] };
      },
    };

    const outcome = await runAgentLoop(store, counting, runner({}), {
      subject: "builder",
      goal: "prove Notes append",
      requires: [{ kind: "skill", name: "github-readme" }],
      registry: [skill("humanizer")],
      maxSteps: 5,
    });

    assert.equal(outcome.stop.reason, "blocked");
    assert.deepEqual(
      outcome.stop.reason === "blocked" ? outcome.stop.missing : [],
      ["github-readme"],
    );
    assert.equal(inferences, 0, "a blocked delegation must not reach a model");
    assert.equal(store.toSession().events.length, 0, "and must leave no trace");
  });

  it("starts when the requirement is satisfiable, against the registry it was given", async () => {
    const outcome = await runAgentLoop(
      newStore(),
      scripted({ text: "reading" }),
      runner({}),
      {
        subject: "builder",
        goal: "g",
        requires: [{ kind: "skill", name: "github-readme" }],
        registry: [skill("github-readme")],
        maxSteps: 1,
      },
    );

    assert.equal(outcome.stop.reason, "budget-exhausted");
  });

  it("a claim of completion does not end the loop", async () => {
    const store = newStore();
    const outcome = await runAgentLoop(
      store,
      scripted({ text: "done, all verified" }),
      runner({}),
      { subject: "builder", goal: "g", maxSteps: 3 },
    );

    assert.equal(
      outcome.stop.reason,
      "stagnation",
      "the model saying done is not evidence or fresh progress",
    );
    assert.equal(
      outcome.claims.length,
      1,
      "identical text without effects is shown only once, even when the model repeats it",
    );
    assert.equal(outcome.claims[0], "done, all verified");
    assert.equal(outcome.session.goal?.open, true, "the goal stays open");
    assert.equal(outcome.session.evidence.length, 0, "and nothing was proven");
  });

  it("only evidence about the goal closes it", async () => {
    const store = newStore();
    store.append({ kind: "goal", subject: "builder", data: { text: "g" } });
    store.append({
      kind: "evidence",
      subject: "someone-else",
      data: { claim: "unrelated", backing: "x" },
    });

    const session = store.toSession();
    assert.equal(session.goal?.open, true, "evidence about another subject proves nothing");
  });

  it("a tool result is an observation, never evidence", async () => {
    const store = newStore();
    await runAgentLoop(
      store,
      scripted({ text: "running tests", toolCalls: [{ name: "bash", input: {} }] }),
      runner({ bash: { name: "bash", exit: 0, output: "42 passed" } }),
      { subject: "builder", goal: "g", maxSteps: 1 },
    );

    const session = store.toSession();
    const observations = session.events.filter((e) => e.kind === "observation");
    assert.equal(session.evidence.length, 0, "a passing tool is not proof of the goal");
    assert.ok(
      observations.some((o) => o.data.exit === 0),
      "the result is recorded as an observation with its exit code",
    );
  });

  it("a failing tool is recorded with its exit code, not smoothed over", async () => {
    const store = newStore();
    await runAgentLoop(
      store,
      scripted({ toolCalls: [{ name: "bash", input: { cmd: "cargo test" } }] }),
      runner({ bash: { name: "bash", exit: 101, output: "error: 1 test failed" } }),
      { subject: "builder", goal: "g", maxSteps: 1 },
    );

    const observed = store
      .toSession()
      .events.filter((e) => e.kind === "observation" && e.data.exit === 101);
    assert.equal(observed.length, 1);
    assert.match(String(observed[0].data.output), /test failed/);
  });

  it("the budget is a hard ceiling", async () => {
    let calls = 0;
    const endless: ModelAdapter = {
      name: "endless",
      async infer() {
        calls++;
        return { text: `still thinking ${calls}`, toolCalls: [] };
      },
    };

    const outcome = await runAgentLoop(newStore(), endless, runner({}), {
      subject: "builder",
      goal: "g",
      maxSteps: 4,
    });

    assert.equal(calls, 4);
    assert.equal(outcome.stop.reason, "budget-exhausted");
  });

  it("a model switch mid-session changes the frame, not the session", async () => {
    const store = newStore();
    store.append({ kind: "goal", subject: "builder", data: { text: "g" } });
    store.append({ kind: "model", subject: "builder", data: { model: "claude" } });

    const before = compileFrame(store.toSession(), { subject: "builder", goal: "g", maxSteps: 1 }, 1);
    assert.equal(before.model, "claude");

    store.append({ kind: "model", subject: "builder", data: { model: "gpt" } });
    const after = compileFrame(store.toSession(), { subject: "builder", goal: "g", maxSteps: 1 }, 2);

    assert.equal(after.model, "gpt");
    assert.equal(store.toSession().id, "s-test", "the session did not restart");
    assert.equal(store.toSession().events.length, 3);
  });

  it("named capabilities survive canonical replay into the inference frame", () => {
    const store = newStore();
    store.append({ kind: "capability", subject: "check-output", data: { version: "abc123" } });
    const frame = compileFrame(store.toSession(), { subject: "builder", goal: "g", maxSteps: 1 }, 1);
    assert.deepEqual(frame.capabilities, [{ kind: "skill", name: "check-output", version: "abc123", source: "session" }]);
  });

  it("an open directive addressed to the subject reaches its frame", async () => {
    const store = newStore();
    store.append({ kind: "goal", subject: "builder", data: { text: "g" } });
    store.append({
      kind: "directive",
      subject: "builder",
      data: { text: "do not write to the real vault" },
    });

    const frame = compileFrame(
      store.toSession(),
      { subject: "builder", goal: "g", maxSteps: 1 },
      1,
    );
    assert.equal(frame.directives.length, 1);
    assert.match(frame.directives[0].text, /real vault/);
  });

  it("a directive addressed elsewhere does not leak into this frame", async () => {
    const store = newStore();
    store.append({ kind: "goal", subject: "builder", data: { text: "g" } });
    store.append({ kind: "directive", subject: "verifier", data: { text: "not for you" } });

    const frame = compileFrame(
      store.toSession(),
      { subject: "builder", goal: "g", maxSteps: 1 },
      1,
    );
    assert.equal(frame.directives.length, 0);
  });

  it("the frame is rebuilt every step from the log, never cached", async () => {
    const seen: ContextFrame[] = [];
    const observing: ModelAdapter = {
      name: "observing",
      async infer(frame) {
        seen.push(frame);
        return { text: `ok ${seen.length}`, toolCalls: [] };
      },
    };

    await runAgentLoop(newStore(), observing, runner({}), {
      subject: "builder",
      goal: "g",
      maxSteps: 3,
    });

    assert.equal(seen.length, 3);
    assert.equal(seen[0].history.length, 1, "the goal is already in the log");
    assert.ok(
      seen[2].history.length > seen[0].history.length,
      "later steps see more, because the frame is derived, not stored",
    );
  });
});

describe("repeated tool refusals", () => {
  it("does not spend the whole inference budget repeating an identical denied effect", async () => {
    const store = new EventStore("repeat-refusal", () => 1000);
    let calls = 0;
    let inferences = 0;
    const model: ModelAdapter = {
      name: "stuck",
      async infer() {
        inferences++;
        return { text: "trying", toolCalls: [{ name: "node", input: { argv: ["node", "--version"] } }] };
      },
    };
    const outcome = await runAgentLoop(store, model, {
      async run(request) {
        calls++;
        return { name: request.name, exit: 126, output: "Tool route unavailable: sandbox not ready" };
      },
    }, { subject: "builder", goal: "produce verified result", maxSteps: 8 });
    assert.equal(outcome.stop.reason, "blocked");
    assert.equal(calls, 2, "the second identical permanent refusal must stop the run");
    assert.equal(inferences, 2);
    assert.equal(outcome.session.goal?.open, true, "a refusal never proves completion");
    assert.equal(outcome.session.evidence.length, 0);
    assert.equal(outcome.session.events.filter(event => event.kind === "action").length, 2);
    assert.equal(outcome.session.events.filter(event =>
      event.kind === "observation" && event.data.exit === 126,
    ).length, 2, "both real refusals remain in the replayable journal");
  });

  it("does not classify a changed request or uncertain result as a permanent repeated refusal", async () => {
    for (const exit of [126, null]) {
      const store = new EventStore("changed-" + exit, () => 1000);
      let calls = 0;
      const model: ModelAdapter = {
        name: "changing",
        async infer() {
          calls++;
          return { text: "", toolCalls: [{ name: "node", input: { argv: ["node", "--version", String(calls)] } }] };
        },
      };
      const outcome = await runAgentLoop(store, model, {
        async run(request) { return { name: request.name, exit, output: "not a confirmed permanent repeat" }; },
      }, { subject: "builder", goal: "g", maxSteps: 3 });
      assert.equal(outcome.stop.reason, "budget-exhausted");
      assert.equal(calls, 3);
    }
  });
});

describe("multi-tool stalled batches", () => {
  it("stops a repeated denied write plus failed verification without claiming success", async () => {
    const store = new EventStore("denied-and-finish", () => 1000);
    let calls = 0;
    const model: ModelAdapter = {
      name: "fixed",
      async infer() {
        return { text: "work", toolCalls: [
          { name: "node", input: { argv: ["node", "-e", "0"] } },
          { name: "finish", input: {} },
        ] };
      },
    };
    const outcome = await runAgentLoop(store, model, {
      async run(request) {
        calls++;
        return request.name === "node"
          ? { name: "node", exit: 126, output: "Container unavailable" }
          : { name: "finish", exit: 1, output: "INCONCLUSIVE" };
      },
    }, { subject: "builder", goal: "complete", maxSteps: 8 });
    assert.equal(outcome.stop.reason, "blocked");
    assert.equal(calls, 4, "two entire denied+failed batches are preserved, not eight");
    assert.equal(outcome.session.goal?.open, true);
    assert.equal(outcome.session.evidence.length, 0);
    assert.equal(outcome.session.events.filter(event => event.kind === "observation" && event.data.tool === "finish").length, 2);
  });
});
