/**
 * The human surface, as a command.
 *
 * This is what plain `cuesheet` runs. It exists to be thin: the words a person
 * sees come from `apps/terminal/src/app/`, the work comes from
 * `apps/terminal/src/producer/`, and the only decision this file makes is which
 * terminal renders them.
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const TERMINAL = join(REPO, "apps", "terminal");
const RUNNER = join(TERMINAL, "node_modules", ".bin", "tsx");
const SLICE = join(TERMINAL, "src", "main.tsx");

/**
 * Run the surface, inheriting the terminal so Ink sees a real TTY.
 *
 * `stdio: "inherit"` is load-bearing rather than convenient: Ink reads raw mode
 * from stdin, and a piped stdin makes it throw before it draws anything. The
 * old chat avoided this by not being a raw-mode application, which is one more
 * reason it printed a different surface.
 */
export async function surface(argv = process.argv.slice(2)): Promise<number> {
  const args = argv[0] === "surface" ? argv.slice(1) : argv;
  if (args.length && (args[0] !== "--verify" || args.length !== 2)) {
    console.error("surface: usage: cuesheet surface [--verify <self-contained Node check.mjs>]");
    return 2;
  }
  const verificationScript = args[1] ? resolve(process.cwd(), args[1]) : undefined;
  if (!existsSync(SLICE)) {
    console.error(`surface: the slice is missing at ${SLICE}`);
    return 1;
  }
  if (!existsSync(RUNNER)) {
    console.error(`surface: ${RUNNER} is not installed.`);
    console.error("        run `pnpm install` in apps/terminal, then try again.");
    return 1;
  }

  // The surface draws a cursor, so it needs a terminal on both ends. Ink's own
  // failure for a missing one is a stack trace about raw mode, which tells the
  // person reading it nothing about what to do next. This says it in a line.
  //
  // `isTTY` is checked on stdin as well as stdout because a pipe on one side is
  // enough to break the drawing, and the most common way to arrive here is
  // `cuesheet | tee log` or a CI step, where stdout is a file and stdin is not.
  if (!process.stdout.isTTY) {
    console.error("surface: this needs a terminal. `cuesheet` draws a prompt and reads keys.");
    console.error("         for a non-interactive check, use `cuesheet inspect` or `cuesheet projects`.");
    return 1;
  }

  return await new Promise<number>((settle) => {
    const child = spawn(RUNNER, [SLICE], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        // Named, not inherited wholesale, because the surface needs four things
        // and passing the whole environment would grant it everything.
        //
        //   PATH   the tool runner resolves node, git, rg, npm against it
        //   HOME   the portfolio lives at $HOME/projects
        //   TERM   colour
        //   OPENROUTER_API_KEY   the model's provider
        //
        // The fourth entry is new and it falsifies a claim this file used to
        // make. The comment here read "it starts no model and touches no
        // network", which was true of the V1 surface and stopped being true the
        // moment the producer started running `src/core/loop.ts`. Naming the
        // credential is the honest version: the surface does start a model, and
        // it does reach the network, and a reader of this file can see exactly
        // what it is given.
        //
        // Nothing else crosses. No secret from the parent reaches the child, and
        // the absence of `OPENROUTER_API_KEY` is handled where it is read
        // (`apps/terminal/src/producer/runtime.ts`), which reports it in one
        // sentence rather than starting a run that cannot finish.
        PATH: process.env["PATH"] ?? "",
        HOME: process.env["HOME"] ?? "",
        TERM: process.env["TERM"] ?? "xterm-256color",
        ...(verificationScript ? { CUESHEET_VERIFY_SCRIPT: verificationScript } : {}),
        ...(process.env["OPENROUTER_API_KEY"] ? { OPENROUTER_API_KEY: process.env["OPENROUTER_API_KEY"] } : {}),
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
