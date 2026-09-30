/**
 * Was this file run, or merely imported?
 *
 * Five entry scripts need to answer this, and every one of them got it wrong in
 * the same way:
 *
 * ```ts
 * if (import.meta.url === `file://${process.argv[1]}`)
 * ```
 *
 * `import.meta.url` is a resolved realpath. `process.argv[1]` is the path as
 * typed. Put a symlink anywhere in that path and the two differ, the guard is
 * false, the dispatcher never runs, and the process exits 0 having done
 * nothing at all. No output, no error, no write. A user who installs by symlink
 * gets a command that agrees with everything and silently does nothing, which
 * is the worst failure this repository can have and the one nobody sees,
 * because exit 0 is indistinguishable from success when nothing should have
 * printed anyway.
 *
 * The fix is to resolve `process.argv[1]` before comparing, so both sides are
 * realpaths. That is one line, but one line times five is how the same defect
 * comes back, so it lives here and the entry points ask.
 *
 * Symlinked entry points are not a corner case. They are what `npm link`, what a
 * `~/bin` shim, and what a package manager's bin field all produce.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * True when this module is the process's entry point.
 *
 * `here` is passed in rather than read from `import.meta`, because a helper
 * reading its own module URL would answer the question for the helper instead
 * of for the caller.
 */
export function isEntryPoint(here: string): boolean {
  const invoked = process.argv[1];
  if (invoked === undefined) return false;

  // A path can fail to resolve: it was deleted between the shell and the
  // process, it was a path node has already replaced, or it is a directory.
  // Any of those mean we cannot claim to be the entry point, and saying so is
  // better than throwing inside a guard.
  const resolve = (path: string): string | null => {
    try {
      return realpathSync(path);
    } catch {
      return null;
    }
  };

  const self = resolve(fileURLToPath(here));
  const other = resolve(invoked);
  if (self === null || other === null) return false;
  return self === other;
}
