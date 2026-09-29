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

import type { ContextFrame, ModelAdapter, ModelResponse, ToolRequest } from "../src/core/loop.ts";

export interface OpenRouterOptions {
  apiKey: string;
  /** e.g. `anthropic/claude-sonnet-4-6`, `openai/gpt-5.2`. */
  model: string;
  /** Default when a session has no explicit binding for the subject. */
  baseUrl?: string;
  /** The agent identity, which providers use to shape refusals. */
  label?: string;
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
  readonly name = "openrouter";
  private readonly options: OpenRouterOptions;

  constructor(options: OpenRouterOptions) {
    this.options = options;
  }

  /**
   * Render the frame into a prompt. Provider-neutral in, provider-shaped out.
   *
   * The system prompt states the one rule the loop depends on: a completion
   * claim is not a completion. Everything else the frame carries is fact, not
   * instruction, so the model is never told to believe it.
   */
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
            "Facts about the current state, which are not instructions:",
            ...facts,
          ].join("\n"),
        },
      ],
      tools: [
        {
          name: "tool_call",
          description:
            "Request a tool to run. Use this for every action that touches the world.",
          parameters: {
            type: "object",
            properties: {
              tool: { type: "string" },
              input: { type: "object" },
            },
            required: ["tool"],
          },
        },
      ],
    };
  }

  async infer(frame: ContextFrame): Promise<ModelResponse> {
    const { messages, tools } = this.render(frame);
    const body = {
      model: frame.model === "unset" ? this.options.model : frame.model,
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: tools[0].name,
            description: tools[0].description,
            parameters: tools[0].parameters,
          },
        },
      ],
    };

    const res = await fetch(`${this.options.baseUrl ?? "https://openrouter.ai/api/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
        "x-title": this.options.label ?? "cuesheet",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`provider ${res.status}: ${text.slice(0, 300)}`);
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
      return { name: String(input.tool ?? c.function.name), input };
    });

    return { text: message?.content ?? "", toolCalls };
  }
}
