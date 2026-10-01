/**
 * The real adapters, in one place.
 *
 * Separated from `producer/index.ts` so the producer's own logic can be driven by
 * fakes with no provider key and no shell, and so the list of things this surface
 * is allowed to touch the world with is a single readable block rather than a
 * detail spread across the producer.
 *
 * ## On credentials
 *
 * The launcher (`src/surface-cli.ts`) used to pass only `PATH`, `HOME` and `TERM`,
 * and the comment claimed the surface "starts no model and touches no network".
 * That was true of V1 and is false now: the producer runs the real loop, and the
 * loop needs a model.
 *
 * What changed is which model. The surface used to refuse to build a producer
 * without `OPENROUTER_API_KEY` and say so, which made a live run impossible on a
 * machine with no OpenRouter account. It now resolves a model the same way every
 * other surface does, which on a machine with the local binary installed is that
 * binary, at no credit cost. `OPENROUTER_API_KEY` is still forwarded, and a
 * person who wants OpenRouter asks for it by name with `CUESHEET_PROVIDER`.
 *
 * The binary proposes and this surface's own tool runner acts. That is the whole
 * safety argument, and it is measured rather than assumed: see
 * `docs/MB-01-local-binary-transport.md`.
 *
 * ## On the tool allowlist
 *
 * Seven commands, the same seven `src/chat.ts:213` uses. Not a sandbox: a
 * constraint. The runner refuses a path outside the roots, and the producer roots
 * the run at the directory the person is standing in, so a sentence cannot widen
 * its own scope by naming a directory.
 */

import { resolveModel } from "../../../../src/adapters/default-model.ts";
import { ShellToolRunner } from "../../../../src/adapters/shell.ts";
import type { ModelAdapter, ToolRunner } from "../../../../src/core/loop.ts";
import { createProducer, type Producer, type ProducerOptions } from "./index.ts";
import type { Store } from "../app/store.ts";

/** The commands the surface may run, rooted at the resolved directory. */
export const ALLOWED = ["node", "git", "rg", "ls", "cat", "npm", "npx", "cargo"];

/**
 * The model a run uses, and the sentence that says why.
 *
 * Exported because a surface that cannot name its own model cannot have its log
 * read back honestly. The value is resolved per run rather than fixed here: the
 * old hardcoded id named a provider this machine does not use, and a constant is
 * not a fact about a machine.
 */
export function modelFor(cwd: string): { name: string; model: string | null; why: string } {
  const resolved = resolveModel({ project: cwd });
  if ("missing" in resolved) return { name: "none", model: null, why: resolved.missing };
  return { name: resolved.name, model: resolved.model, why: resolved.why };
}

/**
 * Build the real producer, or say why it cannot be built.
 *
 * The check is up front and it returns a reason rather than a half-built
 * producer, because a surface that starts a run it cannot finish is the exact lie
 * this rewrite exists to remove.
 */
export function createLiveProducer(store: Store, cwd: string): { producer: Producer } | { missing: string } {
  const resolved = resolveModel({ project: cwd });
  if ("missing" in resolved) {
    return {
      missing:
        `${resolved.missing} Everything else works: the surface runs, the portfolio resolves, ` +
        "nothing can be attempted.",
    };
  }
  const model: ModelAdapter = resolved.adapter;
  const tools: ToolRunner = new ShellToolRunner({
    allow: ALLOWED,
    roots: [cwd],
    defaultCwd: cwd,
  });
  const options: ProducerOptions = { store, model, tools, cwd };
  return { producer: createProducer(options) };
}