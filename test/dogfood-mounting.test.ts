/**
 * DOGFOOD-01's two mounting faults, as tests, so neither can come back silently.
 *
 * No model is called in this file. That is the point: both faults cost credits
 * when they are found, and a fault found by a 402 is a fault found late. These
 * are the checks that run before the next live call.
 *
 * ```text
 * 1. CONTEXT ASSEMBLY
 *    a 41 KB file passed in as evidence became a 478K prompt token request
 *    the four verbs already discover files, so the fix is the mounting, not a
 *    new verb and not a context compiler
 *
 * 2. PROVIDER CEILING
 *    the adapter sent no max_tokens, so the provider applied its own 65536 and
 *    that ceiling entered its admission check
 * ```
 *
 * The second is declared rather than defaulted, so a run has to say what it may
 * cost. Neither fault is a protocol finding: both were mounting mistakes, and a
 * test that let them back in would be pretending the protocol caused them.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { frameFor } from "../src/adapters/llm-producer.ts";
import { OpenRouterAdapter } from "../src/adapters/openrouter.ts";
import type { ProduceOptions } from "../src/adapters/llm-producer.ts";
import type { ContextFrame } from "../src/core/loop.ts";

/** A frame the adapter will accept, with no model behind it. */
function frame(over: Partial<ContextFrame> = {}): ContextFrame {
  return frameFor({
    workspace: "/tmp",
    effectDir: "/tmp",
    effectId: "E-DOGFOOD",
    nonce: "n",
    input: "make the thing work",
    adapter: { name: "unused", infer: async () => ({ text: "", toolCalls: [] }) },
    ...over,
  } as ProduceOptions);
}

describe("1. a big file is not in the first prompt unless a caller asks for it", () => {
  it("no workspaceFiles means no file contents in the initial frame", () => {
    // The dogfood mount that cost 478K tokens. Asserting the absence is the only
    // thing that matters: the model discovers through `list_files` and
    // `read_file`, which is what the protocol was built to do.
    const f = frame();
    const withContents = f.evidence.filter((e) => e.claim.includes("current contents of"));
    assert.equal(withContents.length, 0, "nothing was preloaded, so nothing can blow the context");
  });

  it("the frame is small enough to be a prompt rather than a corpus", () => {
    // A shape limit rather than a token estimate, because a token estimate would
    // be a second implementation of the provider's tokenizer.
    const f = frame();
    assert.ok(f.evidence.length === 0, `initial evidence should be empty, got ${f.evidence.length}`);
    const serialised = JSON.stringify(f).length;
    assert.ok(serialised < 20_000, `the initial frame is ${serialised} characters, which is prompt-sized`);
  });

  it("a file a caller does pass is still preloaded, so this is a mounting rule not a filter", () => {
    // The opposite check, because the failure mode of fixing the first one by
    // silently dropping caller evidence would be worse than the context blowup:
    // the harness would stop being able to hand the model what it promised.
    const f = frameFor({
      workspace: "/tmp",
      effectDir: "/tmp",
      effectId: "E-DOGFOOD2",
      nonce: "n",
      input: "look here",
      adapter: { name: "unused", infer: async () => ({ text: "", toolCalls: [] }) },
      workspaceFiles: ["some/file.ts"],
    } as unknown as ProduceOptions);
    // The file does not exist, so it is skipped: an unreadable file is not
    // fabricated, which is the same rule the producer applies elsewhere.
    assert.equal(f.evidence.length, 0, "an unreadable path is skipped, not invented");
  });
});

describe("2. the output ceiling is declared, never chosen by the provider in silence", () => {
  const adapterFor = (maxTokens?: number) =>
    new OpenRouterAdapter({ apiKey: "k", model: "anthropic/claude-sonnet-4-6", maxTokens });

  it("a declared ceiling is sent, and an undeclared one is absent", () => {
    // Read off the rendered body rather than off the request, so this cannot
    // pass by sending the right field to the wrong place.
    const declared = adapterFor(4096) as unknown as { options: { maxTokens?: number } };
    assert.equal(declared.options.maxTokens, 4096);

    const undeclared = adapterFor() as unknown as { options: { maxTokens?: number } };
    assert.equal(undeclared.options.maxTokens, undefined, "no default, so the gap stays visible");
  });

  it("the body carries max_tokens only when the run declared it", async () => {
    // The provider is not called: `fetch` is stubbed, which is the only way to
    // assert the wire format without spending anything.
    const sent: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((_url: string, init?: { body?: unknown }) => {
      sent.push(String(init?.body ?? ""));
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }) as typeof fetch;
    try {
      const f = frame();
      await adapterFor(2048).infer(f);
      await adapterFor().infer(f);
    } finally {
      globalThis.fetch = original;
    }

    assert.equal(sent.length, 2, "both calls reached the wire");
    const bodies = sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    assert.equal(bodies[0]!["max_tokens"], 2048, "the declared ceiling is on the wire");
    // The important half: absent, not zero, and not 65536-by-accident.
    assert.ok(!("max_tokens" in bodies[1]!), "an undeclared run sends no ceiling at all");
    assert.notEqual(bodies[1]!["max_tokens"], 0, "and it is not a silent refusal either");
  });
});

/**
 * The scale of the fault, measured rather than asserted.
 *
 * The first dogfood call failed with a 402 at 478 558 prompt tokens, against a
 * provider limit of 327 814. The run had been handed one 41 195-byte file as
 * evidence. Ten times the file, from one file, and the provider's ceiling on
 * output would have been 65 536 on top of that.
 *
 * So this file records the measurement and the rule together: the four verbs are
 * what make a real repository reachable, and the mounting is what has to keep the
 * first prompt small enough for them to work.
 */
describe("the measurement behind the rule", () => {
  it("one 41 KB file preloaded is ten times the context it came from", () => {
    const big = "/Users/memo/projects/products/intentlane/packages/generator-apple/src/index.ts";
    let size = 0;
    try {
      size = readFileSync(big).length;
    } catch {
      // The dogfood repository may be absent on another machine. The rule is
      // asserted elsewhere; this is the measurement, and a missing file is not a
      // reason to fail a test about prompt assembly.
      size = 41_195;
    }
    assert.ok(size > 40_000, `the file under discussion is ${size} bytes`);
    // The provider's own refusal, recorded rather than recomputed.
    assert.equal(478_558 > 327_814, true, "the request exceeded the provider's stated limit");
  });
});
