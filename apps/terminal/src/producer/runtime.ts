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
 * loop needs a provider. So `OPENROUTER_API_KEY` is forwarded, the comment in
 * the launcher says what actually happens, and the surface reports plainly when
 * the key is absent rather than starting a run that cannot finish.
 *
 * ## On the tool allowlist
 *
 * Seven commands, the same seven `src/chat.ts:213` uses. Not a sandbox: a
 * constraint. The runner refuses a path outside the roots, and the producer roots
 * the run at the directory the person is standing in, so a sentence cannot widen
 * its own scope by naming a directory.
 */

import { OpenRouterAdapter } from "../../../../src/adapters/openrouter.ts";
import { ShellToolRunner } from "../../../../src/adapters/shell.ts";
import type { ModelAdapter, ToolRunner } from "../../../../src/core/loop.ts";
import { createProducer, type Producer, type ProducerOptions } from "./index.ts";
import type { Store } from "../app/store.ts";

/** The commands the surface may run, rooted at the resolved directory. */
export const ALLOWED = ["node", "git", "rg", "ls", "cat", "npm", "npx", "cargo"];

/** The model the loop is given. Named, so a run's log says what produced it. */
export const MODEL = "anthropic/claude-sonnet-4-6";

/**
 * Build the real producer, or say why it cannot be built.
 *
 * The key check is up front and it returns a reason rather than a half-built
 * producer, because a surface that starts a run it cannot finish is the exact lie
 * this rewrite exists to remove.
 */
export function createLiveProducer(store: Store, cwd: string): { producer: Producer } | { missing: string } {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    return {
      missing:
        "OPENROUTER_API_KEY is not set, so Cuesheet has no model to think with. " +
        "Everything else works: the surface runs, the portfolio resolves, nothing can be attempted.",
    };
  }
  const model: ModelAdapter = new OpenRouterAdapter({ apiKey, model: MODEL });
  const tools: ToolRunner = new ShellToolRunner({
    allow: ALLOWED,
    roots: [cwd],
    defaultCwd: cwd,
  });
  const options: ProducerOptions = { store, model, tools, cwd };
  return { producer: createProducer(options) };
}