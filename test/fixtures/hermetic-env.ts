/**
 * The one definition of what a test's child is allowed to know.
 *
 * Written once because it was written three times, and three copies is three
 * places for the next key to leak from. Every test that spawns a process
 * imports this, so the allowed set is a single readable list rather than a
 * convention repeated in each file.
 *
 * The direction matters. This is not "inherit everything, then delete the
 * dangerous ones", which leaves every variable nobody thought of:
 *
 * ```ts
 * env: { ...process.env, OPENROUTER_API_KEY: undefined }
 * ```
 *
 * It is a capability that is absent until it is granted. The same rule the rest
 * of this repository runs on, one level down:
 *
 * ```text
 * unknown != absent
 * a capability nobody granted is not a capability
 * ```
 *
 * The first version of `test/real-chat-path.ts` got this wrong and reached a real
 * provider over the network. It passed. It cost seventeen seconds of somebody
 * else's latency, which is what makes a hidden observation hidden: nothing
 * failed, the time simply went somewhere nobody was measuring.
 *
 * And the failure mode of over-cleaning is real too. An earlier draft of
 * `test/e2e-real-path.ts` used `PATH=/usr/bin:/bin`, which does not contain node
 * on this machine, so every test in the file failed with `command not found` and
 * the symptom looked like a broken CLI. Hermeticity is not removing as much as
 * possible. It is declaring the minimum sufficient.
 */

import { dirname } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

/**
 * The canary a parent sets and a child must never see.
 *
 * It exists so the rule can be proven by behaviour rather than by pattern
 * matching. A static check proves no test contains `...process.env`. A canary
 * proves that a variable genuinely present in the parent genuinely does not
 * arrive. The two are complementary: the first catches the known shape, the
 * second catches the shape nobody thought of.
 */
export const CANARY = "CUESHEET_MUST_NOT_LEAK";

/**
 * The environment for a child, assembled by naming.
 *
 * `PATH` includes node's own directory on purpose. A hermetic environment that
 * cannot start the program under test is not hermetic, it is broken, and it
 * fails in a way that looks like a defect in the program.
 */
export function childEnv(options: {
  sessions: string;
  home: string;
  cwd?: string;
}): Record<string, string> {
  return {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    NODE_NO_WARNINGS: "1",
    CUESHEET_SESSIONS: options.sessions,
    HOME: options.home,
    ...(options.cwd ? { PWD: options.cwd } : {}),
  };
}

/** A throwaway directory for a child to use as HOME or a session root. */
export function sandboxDir(label: string): string {
  return mkdtempSync(`${tmpdir()}/cuesheet-${label}-`);
}