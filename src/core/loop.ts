/**
 * Core: the agent loop, and the canonical context frame it feeds a model.
 *
 * The loop is deliberately small, because a small loop is a thing you can
 * measure. It is observe, compile, infer, act, append, and repeat until the
 * goal closes or the budget runs out. Everything that would make it larger
 * (subagents, a scheduler, a plugin system) waits for a measurement, per
 * ADR-001.
 *
 * The two commitments that matter:
 *
 * 1. The context frame is a projection, never the source of truth. It is
 *    rebuilt from the event log on every inference, so a session that lost its
 *    runtime keeps its knowledge, and a model that lost its provider is
 *    replaced rather than restarted.
 *
 * 2. A completion claim is not a completion. The loop never ends because the
 *    model said so; it ends when evidence about the goal is in the log, or when
 *    the budget is spent. A model that claims "done" with nothing backing it
 *    is exactly the V1 divergence the benchmark measures, and the loop is built
 *    so that the claim cannot end it.
 */

import type { Capability, Requirement } from "./capability.ts";
import { isSpawnable, resolveCapabilities } from "./capability.ts";
import type { Directive, Evidence, Event, EventStore, Session } from "./store.ts";

/** What a model may ask the loop to do. Never a raw shell string. */
export interface ToolRequest {
  name: string;
  input: Record<string, unknown>;
}

/** What a tool actually did. A loop cannot proceed on a claim of success. */
export interface ToolResult {
  name: string;
  /** Process exit code where the tool has one. Null when it does not. */
  exit: number | null;
  output: string;
}

/** One call into a model provider. Providers are adapters, never the session. */
export interface ModelAdapter {
  readonly name: string;
  /**
   * Infer once against a compiled frame. A provider returns text, tool calls,
   * or both. It never sees the event log, only the frame.
   */
  infer(frame: ContextFrame): Promise<ModelResponse>;
}

export interface ModelResponse {
  text: string;
  toolCalls: ToolRequest[];
}

/** What actually runs a tool. All I/O lives behind this. */
export interface ToolRunner {
  run(request: ToolRequest): Promise<ToolResult>;
}

/**
 * The canonical context, provider-neutral. A model is a renderer of this
 * frame, which is what makes swapping one possible without losing state.
 */
export interface ContextFrame {
  goal: string;
  /** The most recent events, most recent last. Bounded by the compiler. */
  history: Event[];
  /** Directives addressed to this subject that are still open. */
  directives: Directive[];
  /** Evidence so far, with whatever backing it has, including none. */
  evidence: Evidence[];
  /** Capabilities the subject currently holds, resolved live. */
  capabilities: Capability[];
  model: string;
  /** Steps spent, so a provider can see the budget it is inside. */
  step: number;
}

export interface LoopOptions {
  /** Identifies the agent, and the subject its directives are addressed to. */
  subject: string;
  /** The goal this loop is accountable for. */
  goal: string;
  /** Capabilities the agent requires before it may run at all. */
  requires?: Requirement[];
  /** Live registry snapshot, taken at spawn, not at session start. */
  registry?: Capability[];
  /** Hard ceiling on inferences. A loop that cannot be stopped is a hazard. */
  maxSteps: number;
}

export type LoopStop =
  | { reason: "goal-closed"; steps: number; evidence: number }
  | { reason: "budget-exhausted"; steps: number; evidence: number }
  | { reason: "blocked"; missing: string[] };

export interface LoopOutcome {
  stop: LoopStop;
  session: Session;
  /** Every claim the model made, kept separate from the evidence. */
  claims: string[];
}

/**
 * Compile the frame a single inference sees. Pure: it reads the session and
 * the registry, and it is rebuilt every step, so nothing here can become a
 * stale cache without a test failing on the rebuild.
 */
export function compileFrame(
  session: Session,
  options: LoopOptions,
  step: number,
): ContextFrame {
  const subject = options.subject;
  return {
    goal: options.goal,
    history: session.events,
    directives: session.openDirectives.filter((d) => d.target === subject),
    evidence: session.evidence,
    capabilities: [...session.capabilities.values()].map((c) => ({
      kind: "skill",
      name: c.name,
      version: c.version,
      source: "session",
    })),
    model: session.models.get(subject)?.model ?? "unset",
    step,
  };
}

export async function runAgentLoop(
  store: EventStore,
  model: ModelAdapter,
  tools: ToolRunner,
  options: LoopOptions,
): Promise<LoopOutcome> {
  const claims: string[] = [];
  const requires = options.requires ?? [];

  // The admission gate runs before anything is spent, against the live
  // registry, not against what a session-start snapshot happened to hold.
  if (requires.length > 0) {
    const gate = resolveCapabilities(requires, options.registry ?? [], {
      now: Date.now(),
    });
    if (!isSpawnable(gate)) {
      return {
        stop: {
          reason: "blocked",
          missing: gate.resolution.unresolved.map((u) => u.requirement.name),
        },
        session: store.toSession(),
        claims,
      };
    }
    store.append({
      kind: "capability",
      subject: options.subject,
      data: { resolved: gate.resolution.resolved.map((c) => c.name) },
    });
  }

  store.append({ kind: "goal", subject: options.subject, data: { text: options.goal } });

  for (let step = 1; step <= options.maxSteps; step++) {
    const session = store.toSession();
    const frame = compileFrame(session, options, step);

    const response = await model.infer(frame);

    if (response.text.trim()) {
      claims.push(response.text);
      store.append({
        kind: "observation",
        subject: options.subject,
        data: { text: response.text, step },
      });
    }

    for (const call of response.toolCalls) {
      const result = await tools.run(call);
      store.append({
        kind: "action",
        subject: options.subject,
        data: { tool: call.name, input: call.input, step },
      });
      // The result is an observation, not evidence. Only something the loop
      // can point at later closes a goal.
      store.append({
        kind: "observation",
        subject: options.subject,
        data: { tool: call.name, exit: result.exit, output: result.output, step },
      });
    }

    const after = store.toSession();
    if (after.goal && !after.goal.open) {
      return {
        stop: { reason: "goal-closed", steps: step, evidence: after.evidence.length },
        session: after,
        claims,
      };
    }
  }

  const final = store.toSession();
  return {
    stop: {
      reason: "budget-exhausted",
      steps: options.maxSteps,
      evidence: final.evidence.length,
    },
    session: final,
    claims,
  };
}
