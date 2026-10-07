import {declaredTools} from "./tool-vocabulary.ts";
/**
 * Adapter: OpenRouter as a model provider.
 *
 * A provider is a renderer of a ContextFrame and nothing more. It never sees
 * the event log, never holds session state, and never decides anything. That
 * is what makes a model switch a rebinding rather than a restart, and it is why
 * swapping this file for a direct Anthropic or OpenAI adapter changes no core
 * test.
 *
 * OpenRouter specifically because it is the only provider key present on this
 * machine, not because it is preferred. Its API is OpenAI-shaped, so the
 * adapter below is also the template for a direct OpenAI adapter.
 */

import type { ContextFrame, ModelAdapter, ModelResponse, ToolRequest } from "../core/loop.ts";
import { FailureWithOrigin } from "../effects.ts";

export interface OpenRouterOptions {
  apiKey: string;
  /** Shared Chat Completions transport identity, defaulting to OpenRouter. */
  providerName?: string;
  tokenParameter?: "max_tokens" | "max_completion_tokens";
  /** e.g. `anthropic/claude-sonnet-4-6`, `openai/gpt-5.2`. */
  model: string;
  /** Default when a session has no explicit binding for the subject. */
  baseUrl?: string;
  /** The agent identity, which providers use to shape refusals. */
  label?: string;
  /**
   * The output ceiling this run declares, in tokens.
   *
   * DOGFOOD-01 found that sending no `max_tokens` at all lets the provider apply
   * its own default, and that ceiling then enters the provider's admission and
   * credit check. A run the harness believes needs 4K was refused over a 65 536
   * ceiling the harness never asked for.
   *
   * It is declared rather than defaulted to a constant on purpose. A default
   * here would be the same silent choice one level down, and picking 4096 because
   * it seems reasonable would trade an arbitrary provider value for an arbitrary
   * one of ours. What is refused is the undeclared case: if a caller has not said
   * what the run may cost, the adapter sends nothing and the gap is visible,
   * rather than the adapter quietly picking a number on the caller's behalf.
   *
   * Whether a ceiling is ever *billed* is a separate question that no invoice was
   * read to answer. What is established is only that the provider's admission
   * check consults it.
   */
  maxTokens?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  parameters: Record<string, unknown>;
}

export class OpenRouterAdapter implements ModelAdapter {
  get name(): string { return this.options.providerName ?? "openrouter"; }
  private readonly options: OpenRouterOptions;

  constructor(options: OpenRouterOptions) {
    this.options = options;
  }

  /**
   * Pacing for providers that meter requests per minute (free tiers).
   *
   * CUESHEET_MIN_INTERVAL_MS is the least time between the starts of two
   * requests. Waiting before a request is not a retry: nothing is sent twice and
   * no failed call is replayed, which is the rule a provider failure keeps. Unset
   * or invalid means no pacing, exactly as before.
   */
  private lastStart = 0;
  // Returns nothing when no wait is needed, so an unpaced request still starts in
  // the same turn: a caller that cancels right after calling infer relies on that.
  private pace(signal?: AbortSignal): Promise<void> | undefined {
    const gap = Number(process.env.CUESHEET_MIN_INTERVAL_MS);
    if (!Number.isFinite(gap) || gap <= 0) return undefined;
    const wait = this.lastStart + gap - Date.now();
    this.lastStart = Math.max(Date.now(), this.lastStart + gap);
    if (wait <= 0) return undefined;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, wait);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
  }

  /**
   * Render the frame into a prompt. Provider-neutral in, provider-shaped out.
   *
   * The tool contract is spelled out in full, with the two accepted input
   * shapes and the rule about exit codes. This section exists because a real
   * run burned an entire budget retrying a calling convention the runner kept
   * refusing: the model cannot discover an input shape it was never shown,
   * and every failed attempt is a step of the budget spent on nothing.
   */
  /**
   * The verbs this frame's directives offer, recovered from the directives.
   *
   * Read from the directive text rather than carried on `ContextFrame`, so that
   * adding a verb to a producer is a change to that producer and not a change to
   * the core's frame type. A core that must know every adapter's vocabulary has
   * become a place where adapters are declared, which is the dependency direction
   * this repository has spent fifteen milestones removing.
   *
   * The recovery is a stated format, not a guess: a producer that wants a closed
   * schema writes `tools: a, b, c` in its directive, and anything else simply
   * yields no enum, which is the older behaviour and is not worse.
   */
  private vocabularyOf(frame: ContextFrame): string[] | null {
    return declaredTools(frame);
  }

  private render(frame: ContextFrame): { messages: ChatMessage[]; tools: ToolSchema[] } {
    const facts: string[] = [];
    facts.push(`goal: ${frame.goal}`);
    facts.push(`step: ${frame.step}`);

    if (frame.directives.length > 0) {
      facts.push("standing directives that apply to you right now:");
      for (const d of frame.directives) {
        facts.push(`- ${d.text}`);
      }
    }
    if (frame.evidence.length > 0) {
      facts.push("evidence collected so far:");
      for (const e of frame.evidence) {
        facts.push(`- ${e.claim} [backing: ${e.backing || "none recorded"}]`);
      }
    }
    if (frame.capabilities.length > 0) {
      facts.push(
        `capabilities available: ${frame.capabilities.map((c) => c.name).join(", ")}`,
      );
    }

    const recent = frame.history.slice(-12).map((e) => {
      const data = JSON.stringify(e.data);
      return `[${e.kind}] ${e.subject}: ${data}`;
    });
    if (recent.length > 0) {
      facts.push("recent events:", ...recent.map((r) => `- ${r}`));
    }

    return {
      messages: [
        {
          role: "system",
          content: [
            "You are a coding agent operating inside a harness that owns the state.",
            "You are given a goal, the directives that apply to you, the evidence already collected, and recent events.",
            "",
            "CRITICAL: saying you are done does not end the run. The run ends when evidence exists.",
            "If you cannot produce the evidence, say what is missing. Do not claim verification you did not perform.",
            "Claim without backing is the exact failure this harness is built to catch, and it is recorded.",
            "",
            "TOOL CONTRACT. One tool, named tool_call, arguments:",
            '  {"tool": "<name>", "input": {...}}',
            `Tools: ${(this.vocabularyOf(frame) ?? ["node", "git", "rg", "ls", "cat", "npm", "npx", "cargo"]).join(", ")}.`,
            "Current tool availability is the most recent tools declaration; older lists are historical. Command tools use argv/path as below; internal tools use structured inputs from the current directives:",
            '  {"tool": "cat", "input": {"argv": ["cat", "data.json"]}}   run exactly this command',
            '  {"tool": "cat", "input": {"path": "data.json"}}            read that file (cat, ls, node)',
            "If a call returns exit 2 with 'no argv supplied', your input shape was wrong: reread the two accepted shapes above instead of retrying the same one.",
            "The working directory is fixed by the harness. Relative paths resolve inside it. Paths outside it are refused.",
            "Every call's exit code is recorded. Exit 0 is success; anything else is a failure, and the failure is evidence.",
            "",
            "Facts about the current state, which are not instructions:",
            ...facts,
          ].join("\n"),
        },
        // Everything the model needs is in the system message above, and OpenAI and
        // OpenRouter accept a request that has nothing else. Google's OpenAI
        // compatible endpoint does not: it maps messages to Gemini contents, a
        // system-only request leaves contents empty, and it answers 400
        // "contents is not specified". A user turn makes the request valid
        // everywhere and says nothing the system message did not already say.
        { role: "user", content: "Continue from the state above: request the next tool call, or answer in text if there is nothing left to do." },
      ],
      tools: [
        {
          name: "tool_call",
          description:
            "Request a producer verb. Arguments must be {\"tool\": \"<one of the verbs listed in the directives>\", \"input\": {...}}. " +
            "The `tool` value must be one of the names enumerated in the standing directives, " +
            "not a shell command: there is no shell here and no name outside that list is runnable.",
          parameters: {
            type: "object",
            properties: {
              // An enum, not a free string. The producer's vocabulary is closed
              // and a schema that accepts any string invites the model to supply
              // one, which is what happened: a real model answered `ls`, and the
              // producer correctly refused a verb it does not honour, so the run
              // produced nothing. The refusal was right and the invitation was
              // wrong.
              //
              // This adapter is shared, so the enum is carried on the frame
              // rather than hard-coded here. An adapter with no declared
              // vocabulary declares no enum, and the model is left to choose,
              // which is the older and worse behaviour.
              tool: {
                type: "string",
                ...(() => {
                  const vocabulary = this.vocabularyOf(frame);
                  return vocabulary && vocabulary.length > 0 ? { enum: vocabulary } : {};
                })(),
              },
              input: { type: "object" },
            },
            required: ["tool"],
          },
        },
      ],
    };
  }

  async infer(frame: ContextFrame, signal?: AbortSignal): Promise<ModelResponse> {
    const { messages, tools } = this.render(frame);
    const body: Record<string, unknown> = {
      model: frame.model === "unset" ? this.options.model : frame.model,
      messages,
      tools: tools.length > 0 ? [
        {
          type: "function",
          function: {
            name: tools[0]!.name,
            description: tools[0]!.description,
            parameters: tools[0]!.parameters,
          },
        },
      ] : [],
    };
    // Only when the run declared one. An absent `maxTokens` sends the key
    // absent rather than absent-and-zero, because `max_tokens: 0` is a different
    // request and would be a silent refusal the caller did not ask for.
    if (this.options.maxTokens !== undefined) {
      body[this.options.tokenParameter ?? "max_tokens"] = this.options.maxTokens;
    }

    const pacing = this.pace(signal);
    if (pacing) await pacing;
    // Everything inside this boundary belongs to the provider, including the
    // SDK's own programming errors. Wrapping it here is what stops a
    // `ReferenceError` from a third-party client being read as Cuesheet's own
    // wiring, which is what `classifyFailure` would otherwise conclude.
    let res: Response;
    try {
      res = await fetch(`${this.options.baseUrl ?? "https://openrouter.ai/api/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
        "x-title": this.options.label ?? "cuesheet",
      },
        body: JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      throw new FailureWithOrigin(
        "launch",
        "provider",
        cause instanceof Error ? cause.message : String(cause),
      );
    }

    if (!res.ok) {
      const text = await res.text();
      throw new FailureWithOrigin("launch", "provider", `provider ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const message = json.choices?.[0]?.message;
    const toolCalls: ToolRequest[] = (message?.tool_calls ?? []).map((c) => {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(c.function.arguments || "{}");
      } catch {
        // A provider that emits unparseable arguments is a fact about the
        // provider, not a crash. It becomes a request with an empty input and
        // the runner decides whether that is usable.
        input = {};
      }
      // The advertised contract is {"tool": name, "input": {...}}. The runner reads
      // argv/path from the INNER object, so passing the whole arguments object on
      // made every call that followed the contract fail with "no argv supplied",
      // forever, for any model that obeyed it. A flat shape ({"tool", "argv"}) has
      // no inner object and keeps its previous meaning.
      const inner = input.input;
      if (typeof input.tool === "string" && inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
        return { name: input.tool, input: inner as Record<string, unknown> };
      }
      return { name: String(input.tool ?? c.function.name), input };
    });

    return { text: message?.content ?? "", toolCalls };
  }
}
