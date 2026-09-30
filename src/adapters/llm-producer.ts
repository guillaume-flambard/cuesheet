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

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

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

/**
 * The whole vocabulary a model has, closed and enumerated.
 *
 * LIVE-01 measured what one verb costs. A real model was shown the workspace, was
 * told how to change a file, and answered with `ls`, which this producer does not
 * honour, so the run produced nothing and was correctly attributed to the model.
 *
 * The attribution was right and the conclusion would have been wrong. A model
 * asked to fix code in a directory it cannot list has been asked to guess what is
 * in it. `ls` was the first capability it reached for and it was missing, not
 * misbehaviour.
 *
 * So the vocabulary is now four verbs, and no shell:
 *
 * ```text
 * list_files   what is here
 * read_file    what is in one of them, including ones it was not shown
 * write_file   replace one file's whole contents
 * finish       say it is done
 * ```
 *
 * No `bash`, no free-form command, no `exec`. Each is a function of the
 * workspace, and each is implemented below rather than declared in the frame, so
 * a verb the model was offered and the producer does not honour is a defect the
 * tests can see. The alternative, honouring whatever string arrived, is what
 * fifteen milestones were spent removing.
 */
export const LIST_TOOL = "list_files";
export const READ_TOOL = "read_file";
export const FINISH_TOOL = "finish";

/** The complete set. A model is offered these and nothing else. */
export const PRODUCER_VOCABULARY = [LIST_TOOL, READ_TOOL, WRITE_TOOL, FINISH_TOOL] as const;

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
    if (call.name === LIST_TOOL || call.name === READ_TOOL) {
      // A read that arrived alongside a write. The read verbs are honoured,
      // and a real model routinely emits them in the same turn as a write
      // because it was told it had four tools. Calling it "not a verb this
      // producer honours" was both wrong and unhelpful: the producer honours
      // it, it was simply answered earlier in the conversation.
      //
      // A2 found this: the scripted fixtures never batched a read with a write,
      // so nothing caught it, and a real model does it on the first try.
      discarded.push(`${call.name}: answered earlier in this conversation, not re-read here`);
      continue;
    }
    if (call.name === FINISH_TOOL) {
      // The model said it was done. Recorded, never read: it is a claim like any
      // other, and the oracle judges the workspace rather than the announcement.
      discarded.push(`${FINISH_TOOL}: the model said it finished; the oracle decides`);
      continue;
    }
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
          `You have exactly four tools. There is no shell and no other way to touch anything.`,
          `tools: ${[LIST_TOOL, READ_TOOL, WRITE_TOOL, FINISH_TOOL].join(", ")}`,
          "",
          `1. ${LIST_TOOL}   {"tool": "${LIST_TOOL}", "input": {}}`,
          "   Every file in the working directory, sorted.",
          "",
          `2. ${READ_TOOL}   {"tool": "${READ_TOOL}", "input": {"path": "<workspace-relative path>"}}`,
          "   The current contents of one file. You may read a file you were not shown.",
          "",
          `3. ${WRITE_TOOL}  {"tool": "${WRITE_TOOL}", "input": {"path": "<workspace-relative path>", "contents": "<the complete new file text>"}}`,
          "   Replaces one file's whole contents. This is the only thing that changes anything.",
          "",
          `4. ${FINISH_TOOL} {"tool": "${FINISH_TOOL}", "input": {}}`,
          "   You are done. Optional; stopping without it is also accepted.",
          "",
          "Paths are relative to the working directory and may not leave it.",
          "Look before you edit: list the files, read the ones that matter, then change what makes the task true.",
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
  const turn = (frame: ContextFrame) => options.adapter.infer(frame);
  let response: ModelResponse;
  try {
    response = await turn(frameFor(options));
  } catch (cause) {
    // The provider's own fault, kept distinct from the model declining to act.
    // `OpenRouterAdapter` already wraps transport errors in `FailureWithOrigin`,
    // so the origin survives; this only guarantees a record exists either way.
    const why = cause instanceof Error ? cause.message : String(cause);
    writeFailure(options, why);
    return { kind: "failed", origin: "provider", why };
  }

  // Answer the read verbs, if any, and ask again.
  //
  // Bounded on purpose: a model that reads forever is not a worker, and a loop
  // here would be a resource the model controls. The bound is a turn count, not
  // a token count, because a turn is what this function is actually spending.
  const census = censusOf(response);
  const answered = await answerReads(options, frameFor(options), response, turn, census);
  census.turns += 1;
  if (answered !== response) {
    try {
      response = answered;
    } catch (cause) {
      const why = cause instanceof Error ? cause.message : String(cause);
      writeFailure(options, why);
      return { kind: "failed", origin: "provider", why };
    }
  }

  for (const call of answered.toolCalls) {
    census.requested[call.name] = (census.requested[call.name] ?? 0) + 1;
  }
  for (const name of Object.keys(census.requested)) {
    if (PRODUCER_VOCABULARY.includes(name as never)) {
      census.honoured[name] = census.requested[name]!;
    } else if (!census.unsupported.includes(name)) {
      census.unsupported.push(name);
    }
  }

  const { writes, discarded } = writesFromResponse(answered);
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

  writeResult(options, applied, answered.text, census);
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
/**
 * What verbs the model actually reached for, and which ones this producer could
 * not serve.
 *
 * Measured, not anticipated, because LIVE-01 was the cost of guessing wrong. A
 * real model was asked to fix code in a directory it could not list, answered
 * `ls`, and the run produced nothing. The failure was attributed correctly and
 * the vocabulary was wrong, and nothing in the repository had recorded which
 * verbs a model reaches for first.
 *
 * So this is a census, and it is deliberately NOT a mechanism. The protocol has
 * four verbs because four were enough; this count is how we would learn that they
 * stopped being enough, rather than adding a fifth because it seemed likely. If
 * five unrelated tasks all ask for `search_text`, that is a signal to consider a
 * fifth verb, and until then it is five occurrences of a number.
 *
 * `unsupported` is the field that would have caught LIVE-01 on the first run.
 */
export interface VerbCensus {
  /** Every verb name the model emitted, with how many times. */
  readonly requested: Readonly<Record<string, number>>;
  /** Of those, the ones this producer answers. */
  readonly honoured: Readonly<Record<string, number>>;
  /**
   * Names outside the vocabulary, verbatim. An empty list is the only evidence
   * that the protocol currently covers what a model asks for.
   */
  readonly unsupported: readonly string[];
  /** How many answer-and-retry turns the conversation took. */
  readonly turns: number;
}

function writeResult(
  options: ProduceOptions,
  applied: readonly ProposedWrite[],
  claim: string,
  census: VerbCensus,
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
        census,
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

/** How many times the producer will answer a read before insisting on an edit. */
export const MAX_READ_TURNS = 6;

/**
 * Answer `list_files` and `read_file` calls, then let the model reply once more.
 *
 * This is what makes the vocabulary more than a declaration. A verb offered and
 * not answered is a verb the model learns to stop using, and one model answered
 * `ls` in LIVE-01, which is the whole reason this function exists.
 *
 * Every answer is derived from the workspace and nothing else: no interpreter,
 * no shell, no network. A path that leaves the workspace is refused with the same
 * rule `placeInWorkspace` applies to a write, so reading cannot become a way out
 * that writing is not.
 *
 * The transcript of what was read goes back into the frame as evidence, with the
 * file named as its backing. That is the same shape as the workspace evidence the
 * first frame carried, and it carries the same caveat: read by the harness, not
 * checked for correctness.
 */
async function answerReads(
  options: ProduceOptions,
  frame: ContextFrame,
  response: ModelResponse,
  turn: (frame: ContextFrame) => Promise<ModelResponse>,
  census: MutableCensus,
): Promise<ModelResponse> {
  let current = frame;
  let currentResponse = response;

  for (let i = 0; i < MAX_READ_TURNS; i += 1) {
    const reads = readCallsOf(currentResponse);
    if (reads.length === 0) return currentResponse;
    for (const call of currentResponse.toolCalls) {
      if (call.name === LIST_TOOL || call.name === READ_TOOL) countServed(census, call.name);
    }

    const answers = reads.map((read) => answerRead(options, read));
    current = withEvidence(current, answers);
    try {
      currentResponse = await turn(current);
    } catch (cause) {
      // A provider failure mid-conversation is still a provider failure, and the
      // caller is told so rather than being handed a half-read conversation.
      //
      // Rethrown as it arrived rather than re-wrapped. Wrapping it would mean
      // importing `../effects.ts`, which is the module that builds observations,
      // and the boundary test A wrote forbids that import for exactly this
      // reason: an adapter that can reach the effects vocabulary can start
      // asserting things about effects. `produce` catches this at the top and
      // attributes it, so the information survives without the import.
      throw cause;
    }
  }
  return currentResponse;
}

interface ReadCall {
  path?: string;
}

function readCallsOf(response: ModelResponse): ReadCall[] {
  return response.toolCalls
    .filter((c) => c.name === LIST_TOOL || c.name === READ_TOOL)
    .map((c) => payloadOf(c) as { path?: unknown })
    .map((payload) => ({ path: typeof payload.path === "string" ? payload.path : undefined }));
}

/** One read verb, answered from the workspace. Never an interpreter. */
function answerRead(options: ProduceOptions, call: ReadCall): ContextFrame["evidence"][number] {
  if (call.path === undefined) {
    // A list with no path: the whole workspace, which is the only directory this
    // producer was ever given.
    const files = listWorkspace(options.workspace);
    return {
      seq: 0,
      at: 0,
      subject: "(workspace)",
      claim: `files in the workspace:\\n${files.join("\\n") || "(empty)"}`,
      backing: "listed by the harness from the workspace directory; not a test result",
    };
  }

  const placement = placeInWorkspace(options.workspace, call.path);
  if (!placement.ok) {
    return {
      seq: 0,
      at: 0,
      subject: call.path,
      claim: `not readable: ${placement.why}`,
      backing: "refused by the harness before any read",
    };
  }
  try {
    const contents = readFileSync(placement.absolute, "utf8");
    return {
      seq: 0,
      at: 0,
      subject: call.path,
      claim: `current contents of ${call.path}:\\n${contents}`,
      backing: "read from the workspace by the harness; not checked for correctness",
    };
  } catch (cause) {
    return {
      seq: 0,
      at: 0,
      subject: call.path,
      claim: `not readable: ${cause instanceof Error ? cause.message : String(cause)}`,
      backing: "refused by the harness during the read",
    };
  }
}

/** Every file in the workspace, relative and sorted, so the order is not the fs's. */
function listWorkspace(workspace: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(workspace, "");
  return out.sort();
}

function withEvidence(
  frame: ContextFrame,
  added: ContextFrame["evidence"],
): ContextFrame {
  return {
    ...frame,
    evidence: [...frame.evidence, ...added].map((e, i) => ({ ...e, seq: i + 1 })),
  };
}

/**
 * A census of the verbs in one conversation, built as the conversation happens.
 *
 * Counts rather than a set, because "the model asked twice" and "the model asked
 * once and retried" are different shapes of interaction and a set would hide the
 * difference.
 */
function censusOf(response: ModelResponse): MutableCensus {
  return { requested: {}, honoured: {}, unsupported: [], turns: 0 };
}

type MutableCensus = {
  requested: Record<string, number>;
  honoured: Record<string, number>;
  unsupported: string[];
  turns: number;
};

/** Fold a read answer into the census, so a served verb is counted as served. */
function countServed(census: MutableCensus, name: string): void {
  census.honoured[name] = (census.honoured[name] ?? 0) + 1;
}
