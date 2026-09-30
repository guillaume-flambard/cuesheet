/**
 * The first LLM worker, behind exactly the boundary the deterministic one sat behind.
 *
 * P13's code worker edits a workspace and writes a receipt claiming the tests
 * pass without ever running them. P14 made that claim powerless. P15 froze the
 * workspace so the verifier could only see the capture. This file is the next
 * step in the same line: replace the *decision* inside the worker with a model,
 * and change nothing else.
 *
 * ```text
 * LLM -> untrusted producer -> mutable workspace -> FrozenArtifact -> independent verifier
 * ```
 *
 * and never `LLM -> State`, never `LLM -> GoalSatisfied`, never
 * `LLM -> Verification`. A model that wants any of those is a harness bug, not
 * a missing feature.
 *
 * The claim of this file is narrow and checkable: **swapping the decision for a
 * model changes no law.** It holds because of what this module deliberately does
 * not do.
 *
 * - It imports no state, no affordance, no event-store and no verification
 *   function. The one value it borrows from the core is `digestOf`, a hash.
 * - It writes to exactly two places: its own effect directory, and files under
 *   the workspace it was given. Nothing else is reachable through it.
 * - It honours exactly one verb from a model, `write_file`. Every other tool
 *   call, and all of the model's prose, is discarded unread.
 * - It never parses "success", "done", "tests pass" or any other boast. The
 *   model's text is stored verbatim as a *claim* and is not evaluated, which is
 *   why it cannot reach a verdict.
 *
 * The interesting consequence is that this module needs no privilege at all. The
 * model may be wrong, boastful, or unavailable, and the four runs in
 * `test/llm-producer.test.ts` all end the same way: the verdict comes from
 * running the repository's own tests inside a frozen capture, and the producer is
 * not on the path that decides.
 *
 * What an LLM buys, stated honestly: it can read a workspace and propose an
 * edit, which a fixed `edit()` function cannot. What it costs: the digest a
 * deterministic worker could have recomputed no longer proves anything on its
 * own, which is precisely why ART-01 and P15 exist. The producer is dumber about
 * its own output than `code-worker.ts` was, and the architecture is what pays for
 * that.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import type { ContextFrame, ModelAdapter, ModelResponse } from "../core/loop.ts";
import { digestOf } from "../verify.ts";
import { OpenRouterAdapter } from "./openrouter.ts";

/**
 * The one verb this producer honours from a model.
 *
 * A closed vocabulary of one, not a configurable allow-list. A second verb is a
 * second thing a model can reach, and each addition is a place the boundary can
 * be worn thin, so the set is fixed here rather than passed in.
 */
export const WRITE_TOOL = "write_file";

/** A write the model proposed and this producer is willing to apply. */
export interface ProposedWrite {
  /** Workspace-relative, `/`-separated. Never absolute, never escaping. */
  readonly path: string;
  readonly contents: string;
}

/**
 * What a model asked for, after the unusable parts are dropped.
 *
 * `discarded` is kept because a producer that silently drops half a response is
 * indistinguishable from one that understood it. The count is what a human
 * reading a log needs.
 */
export interface PatchExtraction {
  readonly writes: readonly ProposedWrite[];
  /** Why each non-`write_file` or malformed call was not applied. */
  readonly discarded: readonly string[];
}

/**
 * The payload of a tool call.
 *
 * `ModelAdapter.toolCalls` carries the provider's whole argument object as
 * `input`, and providers disagree about whether the payload sits at the top of
 * that object or under the `input` key the OpenAI-shaped envelope names:
 *
 * ```json
 * {"tool": "write_file", "input": {"path": "a.mjs", "contents": "..."}}
 * ```
 *
 * Both are read, envelope first. The envelope is what `openrouter.ts` documents
 * and what it emits, so supporting only the flat form would make this producer
 * work against every stub and fail against every real provider, which is the
 * worst of both: green tests and a dead integration.
 */
function payloadOf(call: { input: Record<string, unknown> }): Record<string, unknown> {
  const nested = call.input["input"];
  return typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : call.input;
}

/**
 * Read the model's proposed writes out of a response, and nothing else.
 *
 * Pure, and total: every input produces a value. The model's prose is never
 * inspected, which is the mechanism by which a boast cannot become a fact. A
 * response containing nothing but text returns zero writes and one discarded
 * entry, and the caller turns that into a failure receipt.
 */
export function writesFromResponse(response: ModelResponse): PatchExtraction {
  const writes: ProposedWrite[] = [];
  const discarded: string[] = [];

  for (const call of response.toolCalls) {
    if (call.name !== WRITE_TOOL) {
      discarded.push(`${call.name}: not a verb this producer honours`);
      continue;
    }
    const payload = payloadOf(call);
    const path = payload["path"];
    const contents = payload["contents"];
    if (typeof path !== "string" || path.length === 0) {
      discarded.push(`${WRITE_TOOL}: no usable path`);
      continue;
    }
    if (typeof contents !== "string") {
      discarded.push(`${WRITE_TOOL} ${path}: no usable contents`);
      continue;
    }
    if (isAbsolute(path) || path.startsWith("/")) {
      discarded.push(`${WRITE_TOOL} ${path}: an absolute path is not inside a workspace`);
      continue;
    }
    // Traversal is not checked here. Whether a path escapes is asked once, of the
    // final name, by `placeInWorkspace`, which knows where the workspace
    // actually is. Deciding it twice would mean two answers to one question.
    writes.push({ path, contents });
  }

  if (response.toolCalls.length === 0 && response.text.length > 0) {
    // Prose with no tool call is the most common shape of a model that believes
    // it has finished. Recorded, so the failure receipt can say why.
    discarded.push(`model replied with prose and no ${WRITE_TOOL} call`);
  }

  return { writes, discarded };
}

/** Where a proposed path actually lands, and whether that is allowed. */
export type Placement =
  | { readonly ok: true; readonly absolute: string }
  | { readonly ok: false; readonly why: string };

/**
 * Resolve a workspace-relative path, refusing anything that leaves the workspace.
 *
 * The threat model in force is a semantically unreliable worker, not a hostile
 * process with OS access, so this is not a sandbox and does not pretend to be.
 * What it does prevent is the accident: a model writing `../state.ts` because it
 * was asked to "fix the state bug" and the workspace happened to be nested.
 */
export function placeInWorkspace(workspace: string, path: string): Placement {
  const root = resolve(workspace);
  const absolute = resolve(root, path);
  if (absolute === root) {
    return { ok: false, why: `${path}: names the workspace itself` };
  }
  if (!absolute.startsWith(root + sep)) {
    return { ok: false, why: `${path}: resolves outside the workspace` };
  }
  return { ok: true, absolute };
}

export interface ProduceOptions {
  /** The mutable workspace this effect is allowed to change. */
  readonly workspace: string;
  /** The one directory this producer may write records into. */
  readonly effectDir: string;
  readonly effectId: string;
  readonly nonce: string;
  /** What this effect was asked to do. The goal, not an instruction to trust. */
  readonly input: string;
  /** The provider. Injected, so a test can supply a deterministic one. */
  readonly adapter: ModelAdapter;
  readonly model?: string;
  /**
   * Workspace files to show the model, by relative path.
   *
   * Declared by the caller, never discovered by scanning. The alternative was
   * measured, not assumed: without them a real model reaches for `cat` first,
   * because the frame gives it a task and no material, and this producer has no
   * tool executor to answer with. The two repairs were an executor or the
   * contents, and the contents were chosen because an executor widens what the
   * model can cause to whatever it can spell in `argv`, while this does not
   * widen it at all: the model still has exactly one verb, and it now has the
   * material to use it.
   *
   * An unreadable file is not fatal and is not mentioned to the model. A
   * producer that could not read a file has not learned anything about the work,
   * and inventing a placeholder would be worse than silence.
   */
  readonly workspaceFiles?: readonly string[];
  /**
   * Runs after the writes are on disk and before the receipt is written.
   *
   * A seam, not a hook for behaviour. It exists so a test can make the producer
   * die in the window P12 named: work committed, no receipt. Without a way to be
   * in that window, "a producer that crashed mid-way invents nothing" is a
   * sentence in a comment instead of a test.
   */
  readonly afterApply?: () => void;
}

/**
 * What the producer observed about its own run.
 *
 * Never a verdict. `produced` means bytes were written and a receipt was filed;
 * what those bytes are worth is settled elsewhere, by someone else.
 */
export type ProduceReport =
  | {
      readonly kind: "produced";
      readonly applied: readonly ProposedWrite[];
      /** What the model said, stored verbatim and evaluated nowhere. */
      readonly claim: string;
      readonly discarded: readonly string[];
    }
  | {
      readonly kind: "failed";
      /**
       * Which party is answerable for the absence: `"producer"` when the model
       * was asked and did not deliver, `"provider"` when the call never
       * returned. A4 turns on this being a real distinction.
       */
      readonly origin: "provider" | "producer";
      readonly why: string;
    };

/**
 * The frame the model is shown.
 *
 * One directive, stating the verb and its shape. It says nothing about
 * succeeding, and it does not ask for a self-assessment, because the producer
 * has no use for one and a request invites a field that later code might read.
 *
 * `history`, `evidence` and `capabilities` are empty: this producer is given a
 * task and a workspace, not a session's knowledge. Adding them is a later
 * question and would need a measurement.
 */
export function frameFor(options: ProduceOptions): ContextFrame {
  return {
    goal: options.input,
    history: [],
    capabilities: [],
    evidence: [...workspaceEvidence(options)],
    directives: [
      {
        seq: 1,
        at: 0,
        target: "worker",
        applied: false,
        text: [
          `To change a file, call the ${WRITE_TOOL} tool with exactly:`,
          `  {"tool": "${WRITE_TOOL}", "input": {"path": "<workspace-relative path>", "contents": "<the complete new file text>"}}`,
          "contents replaces the whole file. Paths are relative to the working directory and may not leave it.",
          "Change the files that make the task true. Then stop.",
          "Do not report whether you succeeded. Nothing you write is read as evidence of success.",
        ].join("\n"),
      },
    ],
    model: options.model ?? "unset",
    step: 0,
  };
}

/**
 * Read the declared files and describe them, without judging them.
 *
 * Presented as `Evidence`, because that is what they are: material the producer
 * read, with the file as its backing. `backing` names the file rather than a
 * test result, so nothing in the frame reads as a verification the producer did
 * not perform.
 */
function workspaceEvidence(options: ProduceOptions): ContextFrame["evidence"] {
  const out: ContextFrame["evidence"][number][] = [];
  for (const path of options.workspaceFiles ?? []) {
    let contents: string;
    try {
      contents = readFileSync(resolve(options.workspace, path), "utf8");
    } catch {
      continue;
    }
    out.push({
      seq: out.length + 1,
      at: 0,
      subject: path,
      claim: `current contents of ${path}:\n${contents}`,
      backing: `read from the workspace by the harness; not checked for correctness`,
    });
  }
  return out;
}

/**
 * Run one LLM production.
 *
 * Three exits, and the choice between them is the whole design:
 *
 * ```text
 * the provider failed            -> failure receipt, origin "provider"
 * the model proposed nothing     -> failure receipt, origin "producer"
 * the model proposed writes      -> apply, then a result receipt
 * ```
 *
 * The failure receipts exist because silence is not available here: a producer
 * that returns without a record leaves the work outcome INCONCLUSIVE, which is
 * honest but leaves a recoverable failure looking like a vanished one. The
 * producer knows the difference between "I asked and got nothing" and "the call
 * never came back", so it files the one that is true.
 *
 * What it never does, in any of the three: decide whether the work is good.
 */
export async function produce(options: ProduceOptions): Promise<ProduceReport> {
  let response: ModelResponse;
  try {
    response = await options.adapter.infer(frameFor(options));
  } catch (cause) {
    // The provider's own fault, kept distinct from the model declining to act.
    // `OpenRouterAdapter` already wraps transport errors in `FailureWithOrigin`,
    // so the origin survives; this only guarantees a record exists either way.
    const why = cause instanceof Error ? cause.message : String(cause);
    writeFailure(options, why);
    return { kind: "failed", origin: "provider", why };
  }

  const { writes, discarded } = writesFromResponse(response);
  if (writes.length === 0) {
    const why =
      discarded.length > 0
        ? `the model proposed no usable edit: ${discarded.join("; ")}`
        : "the model proposed no edit";
    writeFailure(options, why);
    return { kind: "failed", origin: "producer", why };
  }

  const applied: ProposedWrite[] = [];
  for (const write of writes) {
    const placement = placeInWorkspace(options.workspace, write.path);
    if (!placement.ok) {
      const why = `${write.path}: ${placement.why}`;
      writeFailure(options, why);
      return { kind: "failed", origin: "producer", why };
    }
    writeFileSync(placement.absolute, write.contents, "utf8");
    applied.push(write);
  }

  // The window P12 named: the work is committed and no receipt says so. A test
  // reaches in here to occupy it; production code has no reason to.
  options.afterApply?.();

  writeResult(options, applied, response.text);
  return {
    kind: "produced",
    applied,
    claim: response.text,
    discarded,
  };
}

/**
 * The digest the producer reports.
 *
 * A hash of the bytes it wrote, which is the most the producer can honestly
 * know. It is *not* the digest the runtime will compute over the captured
 * workspace, and it is not compared against anything: ART-01 makes the runtime's
 * own digest authoritative, precisely because a producer's digest is a string it
 * made up about itself.
 */
const producerDigest = (writes: readonly ProposedWrite[]): string =>
  digestOf(JSON.stringify(writes));

/**
 * File the receipt that says: this worker asserts it produced this.
 *
 * `success: true` is written unconditionally, in every branch, for the same
 * reason `test/fixtures/code-worker.ts` does. A producer that hedged would be
 * evaluating its own output, and the field exists on `WorkArtifact` precisely so
 * a test can prove that whatever lands here cannot move a verdict. The model's
 * prose goes in `claim`, verbatim, unparsed.
 */
function writeResult(
  options: ProduceOptions,
  applied: readonly ProposedWrite[],
  claim: string,
): void {
  writeFileSync(
    `${options.effectDir}/result.json`,
    JSON.stringify(
      {
        effectId: options.effectId,
        nonce: options.nonce,
        summary: `proposed ${applied.length} write(s): ${applied.map((w) => w.path).join(", ")}`,
        digest: producerDigest(applied),
        // The powerless fields, kept so VER-02 stays testable against a model.
        success: true,
        producerClaim: { success: true, reason: claim },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

/** File the receipt that says: this effect produced nothing, and here is why. */
function writeFailure(options: ProduceOptions, why: string): void {
  writeFileSync(
    `${options.effectDir}/failure.json`,
    JSON.stringify(
      { effectId: options.effectId, nonce: options.nonce, why },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

/**
 * Run as a real process, in the same slot as the deterministic code worker.
 *
 * This block is the reason the milestone is not a claim. `launch()` starts a
 * script with `workerEnvironment` and `CUESHEET_EFFECT_DIR`, and this reads
 * exactly those, so an LLM production is a worker like any other: it gets an
 * identity before it runs, a directory it may write, and a workspace it may
 * change. It gets no way to reach the session store, because no path from here
 * to there exists.
 *
 * The provider is constructed here, at the edge, and only here. `produce()`
 * takes one as an argument, which is what lets a test supply a deterministic one
 * and what keeps this file's core free of any provider name.
 */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  const effectId = process.env["CUESHEET_EFFECT"] ?? "";
  const nonce = process.env["CUESHEET_EFFECT_NONCE"] ?? "";
  const effectDir = process.env["CUESHEET_EFFECT_DIR"] ?? "";
  const workspace = process.env["CUESHEET_WORKSPACE"] ?? "";
  // A missing identity is a refusal, not a run: a producer that cannot name its
  // own effect would file a receipt nobody could attribute.
  if (!effectId || !nonce || !effectDir || !workspace) {
    process.stderr.write("llm producer: missing identity or workspace, refusing to run\n");
    process.exit(2);
  }

  const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
  if (!apiKey) {
    writeFailure({ workspace, effectDir, effectId, nonce, input: "" } as ProduceOptions,
      "no provider credential is available; nothing was attempted");
    process.stderr.write("llm producer: no provider credential, produced nothing\n");
    process.exit(1);
  }

  const adapter = new OpenRouterAdapter({
    apiKey,
    model: process.env["CUESHEET_MODEL"] ?? "anthropic/claude-sonnet-4-6",
  });

  // The task is `input.json`, the same file the deterministic worker is given.
  let input = "";
  try {
    input = readFileSync(`${effectDir}/input.json`, "utf8");
  } catch {
    input = "make the repository's own tests pass";
  }

  const report = await produce({ workspace, effectDir, effectId, nonce, input, adapter });

  // The exit code is not the outcome and nothing reads it. `workOutcomeOf`
  // answers from the receipt alone, which is the whole point of the split.
  process.exit(report.kind === "produced" ? 0 : 1);
}
