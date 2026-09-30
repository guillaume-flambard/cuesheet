/**
 * The human surface, as a command.
 *
 * This is what plain `cuesheet` runs. It exists to be thin: the words a person
 * sees come from `apps/terminal/src/render.ts`, and the only decision this file
 * makes is which terminal renders them.
 *
 * The previous default, `cuesheet chat`, printed this on startup:
 *
 * ```text
 * cuesheet chat
 *   here      /Users/memo
 *             home directory. goals need a project, but the portfolio answers from here.
 *   registry  248 capabilities, 2 unreadable (absence is not evidence)
 *   sessions  2158 on disk
 * say what you want. a goal is staged and runs when you type go. help lists the questions.
 * ```
 *
 * Every line is a true fact about the machine and none of it is what someone
 * who typed `cuesheet` asked for. The surface asks one question instead, and
 * keeps the machinery behind `/inspect` where it belongs.
 *
 * The slice is a separate package with its own dependencies, so this dispatcher
 * runs it through the workspace's own runner rather than importing it directly.
 * If the runner is missing, the failure says which package is absent instead of
 * printing a module-not-found for a file that exists.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const TERMINAL = join(REPO, "apps", "terminal");
const RUNNER = join(TERMINAL, "node_modules", ".bin", "tsx");
const SLICE = join(TERMINAL, "src", "slice.tsx");

/**
 * Run the surface, inheriting the terminal so Ink sees a real TTY.
 *
 * `stdio: "inherit"` is load-bearing rather than convenient: Ink reads raw mode
 * from stdin, and a piped stdin makes it throw before it draws anything. The
 * old chat avoided this by not being a raw-mode application, which is one more
 * reason it printed a different surface.
 */
export async function surface(): Promise<number> {
  if (!existsSync(SLICE)) {
    console.error(`surface: the slice is missing at ${SLICE}`);
    return 1;
  }
  if (!existsSync(RUNNER)) {
    console.error(`surface: ${RUNNER} is not installed.`);
    console.error("        run `pnpm install` in apps/terminal, then try again.");
    return 1;
  }

  return await new Promise<number>((settle) => {
    const child = spawn(RUNNER, [SLICE], {
      cwd: TERMINAL,
      stdio: "inherit",
      env: {
        // Named, not inherited wholesale. The slice reads the portfolio, which
        // is a filesystem read under $HOME, and it needs a TERM to colour. It
        // needs no credentials, because it starts no model and touches no
        // network, and saying so here is what keeps that true.
        PATH: process.env["PATH"] ?? "",
        HOME: process.env["HOME"] ?? "",
        TERM: process.env["TERM"] ?? "xterm-256color",
      },
    });
    child.on("error", (cause) => {
      console.error(`surface: the terminal could not start: ${cause.message}`);
      settle(1);
    });
    child.on("exit", (code, signal) => {
      // A signal is not a failure of this process, so it is reported as one and
      // the exit code stays 0 for a clean Ctrl-C.
      settle(signal ? 0 : (code ?? 0));
    });
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "\0")) {
  process.exit(await surface());
}
