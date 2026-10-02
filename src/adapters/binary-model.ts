import {declaredTools} from "./tool-vocabulary.ts";
/**
 * Adapter: the local OpenCode binary as a model provider.
 *
 * A provider is a renderer of a ContextFrame and nothing more. This one has no
 * API key, no network and no credits: it shells out to a binary already on the
 * machine. `0bff34c` recorded that the binary is not a usable *tool runner*,
 * and that record stands. This file is the other role, and the distinction is
 * the whole design.
 *
 * ## What the binary is trusted to do, and not to do
 *
 * It is trusted to be a language model that returns text. It is **not** trusted
 * to touch the filesystem, run a command, or be believed.
 *
 * The mechanism, measured in a throwaway directory before a line of this was
 * written (docs/MB-01-local-binary-transport.md):
 *
 * ```text
 * --agent plan, benign `ls -A .`        -> bash executed, status=completed
 * --agent plan, "create a file"         -> refused, by the model's discretion
 * permission {"*": deny, read: allow}   -> read executed, real output
 * the same agent, asked to write        -> no verb in its tool list, no file
 * ```
 *
 * The contrast is the finding. A denied tool is *removed from the tool list the
 * model is offered*, so there is no verb to call and nothing to refuse. That is
 * categorically stronger than being offered a tool and declining it, which is
 * what `--agent plan` does: it still carries `bash: * allow`, and its two
 * refusals were choices. A safety argument cannot rest on a model choosing
 * well, so the built-in plan agent is not used here.
 *
 * So Cuesheet owns the agent definition. `agentConfig()` below writes a
 * project-local `opencode.json` with an empty tool list and an empty permission
 * set, and `--pure` keeps an external plugin from adding a tool back. The binary
 * is then asked what it *would* do, and the answer arrives as text.
 *
 * ## Why the proposal is parsed out of text
 *
 * Because that is the only channel left once the tool list is empty, and it is
 * also the safe one. A `tool_use` event from this binary would be a tool call
 * the binary chose to make, which is exactly the bypass `0bff34c` found. So no
 * `tool_use` event is ever honoured: a ToolRequest exists only because
 * `parseProposal` read it out of a text response, and it is handed to
 * Cuesheet's own `ShellToolRunner` like any other. Four verbs, frozen capture
 * and the oracle are untouched, and "the model said it finished" stays a claim.
 *
 * ## On `--dir`
 *
 * The binary requires a working directory, so one is always passed. When the
 * caller resolved a project, that project is the directory, so the binary's view
 * of the world matches the frame it was handed. When the context source is
 * `scratch` and there is no repository at all, a throwaway directory is created
 * instead: pointing the binary at the user's home to satisfy a required argument
 * is the same unmeasured assumption this repository has now refused three times.
 *
 * ## On cost
 *
 * `step_finish` reports `cost` and `tokens` per step, which no previous transport
 * reported at all. They are carried on the returned response rather than logged
 * and forgotten, because docs/cost-current.md exists because cost was measured
 * before it was optimised and not after.
 */

import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import type { ContextFrame, ModelAdapter, ModelResponse, ToolRequest } from "../core/loop.ts";
import { FailureWithOrigin } from "../effects.ts";

/** The name this adapter answers to in a run's log. */
export const BINARY_ADAPTER_NAME = "opencode-binary";

/** The agent Cuesheet defines and the binary is forbidden from exceeding. */
export const PROPOSAL_AGENT = "cuesheet-proposal";

/**
 * The agent definition Cuesheet owns.
 *
 * Written into a throwaway directory, never into a user's project: the file
 * exists to strip the tool list, and a project that adopted it would have its
 * own OpenCode configuration rewritten by an unrelated tool.
 *
 * Both keys are present because they are not the same lever. `tools: {"*": false}`
 * removes the tools from the list the model is offered; `permission: {"*": "deny"}`
 * denies any that survive. The measurement above is about the first, and the
 * second is the belt to that pair of braces, in case a future version resolves
 * one of them differently.
 */
export const AGENT_CONFIG: Readonly<Record<string, unknown>> = {
  $schema: "https://opencode.ai/config.json",
  agent: {
    [PROPOSAL_AGENT]: {
      description: "Proposes work as text. No tools, no filesystem, no shell.",
      mode: "primary",
      tools: { "*": false },
      permission: { "*": "deny" },
    },
  },
};

export interface BinaryModelOptions {
  /** Absolute path to the binary. Resolved by the caller, not guessed here. */
  binary: string;
  /**
   * The project the run belongs to, when there is one.
   *
   * Passed to the binary as `--dir` so its working directory is the project
   * rather than whatever launched Cuesheet. Null for a scratch run, which gets a
   * throwaway directory instead.
   */
  project?: string | null;
  /** `provider/model` for the local runtime, e.g. `opencode/space-bunny-free`. */
  model?: string;
  /** Hard ceiling on one inference. A model that cannot be stopped is a hazard. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * The envelope the model is asked for, and the only shape `infer` will read.
 *
 * A closed shape on purpose. The binary is a language model, and a language
 * model will happily answer in prose; a parser that scraped whatever looked
 * like JSON out of a paragraph would be reading a boast as a fact, which is the
 * defect this repository exists to prevent. An answer that is not exactly this
 * object is a failure, and the text is kept so the failure can say what arrived.
 */
interface Proposal {
  text?: unknown;
  toolCalls?: unknown;
}

/** One `step_finish`, reduced to what a run's log should carry about it. */
export interface StepUsage {
  /** Tokens the step reported. Null when the stream reported none. */
  readonly tokens: number | null;
  readonly input: number | null;
  readonly output: number | null;
  /** Provider-reported cost. Zero is a real observation, not an absence. */
  readonly cost: number | null;
}

export interface BinaryModelResponse extends ModelResponse {
  /** Per-step usage as the stream reported it. Never invented. */
  readonly usage: StepUsage[];
  /** The text before parsing, so a parse failure can quote what arrived. */
  readonly raw: string;
}

/**
 * The result of running the binary, with no parsing applied.
 *
 * Separate from `BinaryModelResponse` so the process boundary and the parse can
 * be tested separately. Everything the tests assert about a malformed stream is
 * a fact about `parseProposal` over a captured `RawRun`, not about a subprocess.
 */
export interface RawRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exit: number | null;
  readonly signal: NodeJS.Signals | null;
}

/**
 * Read a step's usage out of one `step_finish` event, or null when absent.
 *
 * Null is not zero. A step that reported no tokens has not reported zero tokens,
 * and a run that printed `0 input tokens` because the field was missing would be
 * the exact established-but-not-established confusion this repository keeps
 * refusing. Cost is the exception: a reported `0` is a real measurement and is
 * kept as `0`.
 */
function usageOf(event: Record<string, unknown>): StepUsage | null {
  const part = event["part"] as Record<string, unknown> | undefined;
  if (!part || part["type"] !== "step-finish") return null;
  const tokens = part["tokens"] as Record<string, unknown> | undefined;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    tokens: num(tokens?.["total"]),
    input: num(tokens?.["input"]),
    output: num(tokens?.["output"]),
    cost: num(part["cost"]),
  };
}

/**
 * Reduce a raw NDJSON stream to the text and the usage it actually reported.
 *
 * A torn stream is reported, not repaired. NDJSON's last line is complete only
 * if it ended in a newline, so a stream that did not is treated as truncated and
 * refused by `parseProposal`. A truncated answer that read as a clean one is the
 * defect class this repository has fought three times, and a transport that
 * invents the missing half of a line is how it happens.
 *
 * Pure. Every assertion the tests make about malformed input is made here.
 */
export function readStream(stdout: string): {
  texts: string[];
  usage: StepUsage[];
  /** Lines that were not valid JSON. Kept so a failure can name them. */
  malformed: number;
  /** True when the last line was cut off mid-record. */
  truncated: boolean;
  /** Every `tool_use` event the stream contained. Never honoured. */
  toolEvents: string[];
  providerErrors: string[];
} {
  // An empty or whitespace-only stream has no lines at all, so it is not
  // truncated: there is nothing to be cut off from.
  const endsClean = stdout === "" || stdout.endsWith("\n");
  const lines = stdout.split("\n");
  // A trailing newline yields a final empty element that is not a record.
  if (endsClean && lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const texts: string[] = [];
  const usage: StepUsage[] = [];
  const toolEvents: string[] = [];
  const providerErrors:string[]=[];
  let malformed = 0;

  for (const line of lines) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) {
      malformed++;
      continue;
    }
    const event = parsed as Record<string, unknown>;
    if(event.type==="error"){
      const error=event.error as {name?:unknown;data?:{statusCode?:unknown;message?:unknown}}|undefined;
      const status=error?.name==="APIError"&&Number.isSafeInteger(error.data?.statusCode)&&Number(error.data?.statusCode)>=400&&Number(error.data?.statusCode)<=599 ? Number(error.data!.statusCode):null;
      const free=status===403&&typeof error?.data?.message==="string"&&error.data.message.includes("free tier")&&error.data.message.includes("within OpenCode");
      providerErrors.push(free?"provider refused HTTP 403: its free tier is restricted to OpenCode usage; choose a provider/model admitted for this harness. No fallback was selected.":status===401?"provider refused HTTP 401: verify authentication for the selected provider.":status===403?"provider refused HTTP 403: access is not admitted for this request.":status===429?"provider refused HTTP 429: rate or quota limit; retry later or choose an admitted model.":status!==null?`provider refused HTTP ${status}; no proposal was accepted.`:"provider emitted an error; no proposal was accepted.");continue;
    }
    const part = event["part"] as Record<string, unknown> | undefined;
    if (!part) {
      malformed++;
      continue;
    }
    const kind = part["type"];
    if (kind === "text" && typeof part["text"] === "string") {
      texts.push(part["text"]);
    } else if (kind === "tool") {
      const name = part["tool"];
      toolEvents.push(typeof name === "string" ? name : "unnamed");
    } else if (kind === "step-finish") {
      const seen = usageOf(event);
      if (seen) usage.push(seen);
    }
  }

  return { texts, usage, malformed, truncated: !endsClean && lines.length > 0, toolEvents,providerErrors };
}

/**
 * Pull the JSON envelope out of a text response.
 *
 * Deliberately narrow. A fenced block is unwrapped because a model that was
 * told "only JSON" will sometimes fence it anyway, and a fence is unambiguous
 * rather than a guess. Prose around the object is refused rather than searched,
 * because searching a paragraph for something that parses is how a sentence
 * becomes a command.
 */
function envelopeOf(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  const body = fenced ? fenced[1]!.trim() : trimmed;
  if (!body.startsWith("{")) return null;
  return body;
}

/**
 * Parse one proposal from a raw run.
 *
 * Every refusal here is a refusal, never a repair. The cases a real transport
 * produces, and what each one means:
 *
 * ```text
 * exit non-zero            the world was asked and refused
 * no `text` event at all   the model said nothing
 * torn last line           the answer was cut off
 * a malformed line         the stream is not what the format says
 * no JSON envelope         prose, where a closed object was required
 * tool_use events present  the binary tried to act, which this adapter forbids
 * ```
 *
 * The last one is a stop condition rather than a warning. A `tool_use` event
 * means the deny-list did not hold, and continuing would mean trusting a
 * guarantee that has just been observed to be false.
 */
export function parseProposal(run: RawRun): BinaryModelResponse {
  // A declaration rather than a `const` arrow, because `never` only narrows the
  // code after it when the call target is explicitly typed, and this one guards
  // every line that follows. An arrow const left `parsed` possibly-undefined
  // through all of them, which is six diagnostics saying the same thing.
  function refuse(why: string): never {
    throw new FailureWithOrigin("run", "provider", `opencode binary: ${why}`);
  }

  if (run.signal) {
    refuse(`terminated on ${run.signal} before it answered`);
  }
  const stream = readStream(run.stdout);
  if (stream.toolEvents.length > 0)refuse(`the deny-list did not hold, it emitted ${stream.toolEvents.length} native tool event(s)`);
  if(stream.providerErrors.length)refuse(stream.providerErrors[0]!);
  if(run.exit!==0)refuse(`exited ${run.exit}${run.stdout.trim()?"":" and wrote no answer"}`);

  if (stream.truncated) refuse("the stream ended mid-line, so the answer is incomplete");
  if (stream.malformed > 0) {
    refuse(`${stream.malformed} line(s) were not valid events`);
  }
  if (stream.texts.length === 0) refuse("the model returned no text");

  const raw = stream.texts.join("").trim();
  const envelope = envelopeOf(raw);
  if (envelope === null) {
    refuse(`the answer was not the requested JSON object: response content omitted`);
  }

  let parsed: Proposal;
  try {
    parsed = JSON.parse(envelope) as Proposal;
  } catch {
    refuse(`the envelope was not valid JSON: response content omitted`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    refuse("the envelope was not an object");
  }

  const text = typeof parsed.text === "string" ? parsed.text : "";
  const toolCalls = readToolCalls(parsed.toolCalls);
  if (text.trim() === "" && toolCalls.length === 0) {
    // An empty answer and a refused answer must not look alike. A run that
    // returned nothing usable is a failure, not a step that succeeded quietly.
    refuse("the envelope carried neither text nor a tool call");
  }

  return { text, toolCalls, usage: stream.usage, raw };
}

/**
 * Read the tool calls out of the envelope, dropping anything malformed.
 *
 * A dropped call is not a silent one: an entry that is not a `{name, input}`
 * object with a string name cannot become a `ToolRequest`, and inventing a name
 * for it would be worse than not running it. The loop records what it was given,
 * so the absence is visible in the log rather than in a count nobody reads.
 */
function readToolCalls(value: unknown): ToolRequest[] {
  if (!Array.isArray(value)) return [];
  const calls: ToolRequest[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const call = entry as Record<string, unknown>;
    const name = call["name"];
    if (typeof name !== "string" || name.trim() === "") continue;
    const input = call["input"];
    calls.push({
      name,
      input:
        typeof input === "object" && input !== null && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {},
    });
  }
  return calls;
}

/**
 * Render the frame into the one prompt the model is asked to answer.
 *
 * Provider-neutral in, provider-shaped out, exactly as `openrouter.ts` does it.
 * The tool contract is spelled out in full because the model cannot discover a
 * shape it was never shown, and a run that spends its budget retrying a calling
 * convention is a run that measured nothing.
 *
 * The model is told it has no tools, and that this is deliberate, because a model
 * that believes it is being deprived of something will try to work around it.
 */
export function renderProposalPrompt(frame: ContextFrame, vocabulary: readonly string[]): string {
  const facts: string[] = [`goal: ${frame.goal}`, `step: ${frame.step}`];
  if (frame.directives.length > 0) {
    facts.push("standing directives that apply to you right now:");
    for (const d of frame.directives) facts.push(`- ${d.text}`);
  }
  if (frame.evidence.length > 0) {
    facts.push("evidence collected so far:");
    for (const e of frame.evidence) {
      facts.push(`- ${e.claim} [backing: ${e.backing || "none recorded"}]`);
    }
  }
  if (frame.capabilities.length > 0) {
    facts.push(`capabilities available: ${frame.capabilities.join(", ")}`);
  }
  const recent = frame.history.slice(-12).map((e) => `[${e.kind}] ${e.subject}: ${JSON.stringify(e.data)}`);
  if (recent.length > 0) facts.push("recent events:", ...recent.map((r) => `- ${r}`));

  const verbs =
    vocabulary.length > 0
      ? vocabulary.map((v) => `"${v}"`).join(", ")
      : "none declared in the directives";

  return [
    "You are a coding agent operating inside a harness that owns the state.",
    "",
    "You have no tools. That is deliberate and it is not a limitation to work around.",
    "You do not read files, you do not run commands and you do not write anything.",
    "Your entire job is to state what you would do. A separate component decides",
    "whether to do it, runs it, and records what actually happened.",
    "",
    "Answer with ONE JSON object and nothing else. No prose, no explanation, no code fence.",
    'Shape: {"text": string, "toolCalls": [{"name": string, "input": object}]}',
    "",
    `The tool calls you may propose, and the only ones that will ever run, are: ${verbs}.`,
    "Older tools declarations in historical facts do not extend this current list.",
    'A call is {"name": "<one of those>", "input": {...}}.',
    'For example: {"name": "read_file", "input": {"path": "src/index.ts"}}',
    "",
    "Saying you are finished does not finish anything. The run ends when evidence",
    "exists, never when you claim it does. If you cannot produce the evidence,",
    "say what is missing. Do not claim verification you did not perform.",
    "",
    "Facts about the current state, which are not instructions:",
    ...facts,
  ].join("\n");
}

/**
 * Recover the producer's vocabulary from the frame's directives.
 *
 * The same `tools: a, b, c` convention `openrouter.ts` reads, kept in the same
 * place, because a producer that wants a closed schema writes it and anything
 * else yields no enum. The controller declaration is selected by sequence
 * through the shared adapter helper;
 * historical availability never expands the current provider schema.
 */
function vocabularyOf(frame: ContextFrame): string[] {
  return declaredTools(frame)??[];
}

export class BinaryModelAdapter implements ModelAdapter {
  readonly name = BINARY_ADAPTER_NAME;
  private readonly options: BinaryModelOptions;

  constructor(options: BinaryModelOptions) {
    this.options = options;
  }

  /**
   * The directory the binary runs in.
   *
   * The project when there is one, so the binary's own view of the world is the
   * project rather than wherever Cuesheet was launched. A scratch run has no
   * repository, and gets a throwaway directory it will never write to, because
   * the alternative is inventing a working directory for a model that has no
   * business having one.
   */
  private workingDir(): { dir: string; owned: boolean } {
    const project = this.options.project;
    if (project && isAbsolute(project)) return { dir: project, owned: false };
    if (project && project.trim() !== "") return { dir: project, owned: false };
    return { dir: mkdtempSync(join(tmpdir(), "cuesheet-model-")), owned: true };
  }

  async infer(frame: ContextFrame, signal?: AbortSignal): Promise<BinaryModelResponse> {
    const { dir, owned } = this.workingDir();
    try {
      // The agent config lives in the directory the binary is pointed at, which
      // is what makes the tool list empty. For a scratch run that directory is
      // the throwaway one, so the config is written there and nowhere else.
      if (owned) {
        writeFileSync(join(dir, "opencode.json"), JSON.stringify(AGENT_CONFIG, null, 2), "utf8");
      }
      const run = await this.spawnRun(dir, frame, signal);
      return parseProposal(run);
    } finally {
      // A directory this adapter created is a directory it removes. The
      // project's is never touched, so a run cannot leave its agent config
      // behind in someone's repository.
      if (owned) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // A throwaway directory that would not delete is untidy, not a
          // failure of the run, and the answer has already been decided by the
          // time this is reached.
        }
      }
    }
  }

  /**
   * Run the binary and capture what it said.
   *
   * `spawn` rather than `execFileSync` so a model that never returns costs a
   * timeout instead of hanging the surface, and so the child's output is a
   * stream that can be torn mid-write rather than a string that is only ever
   * whole.
   */
  private spawnRun(dir: string, frame: ContextFrame, signal?: AbortSignal): Promise<RawRun> {
    // Keep inline provider/model preferences, while reserving our proposer.
    // Do not echo the inherited config: it can contain provider credentials.
    let inline: Record<string, unknown> = {};
    try {
      if (process.env.OPENCODE_CONFIG_CONTENT) {
        const value = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT);
        if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
        inline = value;
      }
    } catch {
      return Promise.reject(new FailureWithOrigin("launch", "world", "OPENCODE_CONFIG_CONTENT must be a JSON object"));
    }
    const inheritedAgents = inline.agent && typeof inline.agent === "object" && !Array.isArray(inline.agent) ? inline.agent : {};
    const config = { ...inline, ...AGENT_CONFIG, agent: { ...inheritedAgents, ...(AGENT_CONFIG.agent as Record<string, unknown>) } };
    const args = [
      "run",
      "--dir",
      dir,
      "--agent",
      PROPOSAL_AGENT,
      "--format",
      "json",
      // No external plugins. A plugin is third-party code that could add a tool
      // to the list this adapter's whole argument depends on being empty.
      "--pure",
      renderProposalPrompt(frame, vocabularyOf(frame)),
    ];
    if (this.options.model) args.splice(1, 0, "--model", this.options.model);

    return new Promise<RawRun>((resolve, reject) => {
      // Inline config follows project config in OpenCode's merge order. The
      // proposal boundary must apply to projects as well as scratch runs;
      // writing a config into the user's project would mutate their settings.
      const child = spawn(this.options.binary, args, {
        stdio: ["ignore", "pipe", "pipe"],
        signal, killSignal: "SIGKILL",
        env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
      });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(
          new FailureWithOrigin(
            "run",
            "provider",
            `opencode binary: no answer within ${this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
          ),
        );
      }, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (cause) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // ENOENT lands here, and it is the common case: a machine without the
        // binary. Attributed to the world rather than to our wiring, because
        // the wiring worked and the thing it reached for is not there.
        reject(
          new FailureWithOrigin(
            "launch",
            "world",
            `opencode binary: cannot run ${this.options.binary}: ${
              cause instanceof Error ? cause.message : String(cause)
            }`,
          ),
        );
      });
      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exit: code, signal });
      });
    });
  }
}

/**
 * Is there a binary at this path?
 *
 * A fact about the machine, asked before a run starts rather than discovered
 * inside one, so a caller can say "there is no model here" honestly. That is
 * the sentence `src/chat.ts` used to get wrong: it claimed no local runtime
 * existed while one was installed and configured.
 *
 * `X_OK` rather than mere existence, because a file that is not executable is
 * not a transport and reporting it as one would replace one false claim with
 * another. Null when the path is unknown, which is a third answer and is not
 * "absent".
 */
export function binaryAvailable(binary: string | null | undefined): boolean {
  if (!binary) return false;
  try {
    accessSync(binary, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
