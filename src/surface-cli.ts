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
 * The installed terminal runs its self-contained Node bundle. In a source
 * checkout, the separate terminal package runs through its own TSX runner.
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
const BUNDLE = join(TERMINAL, "main.mjs");

/** Only model preferences and the named credentials cross the launcher boundary. */
export function surfaceEnvironment(args: string[], env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const keys = ["PATH", "HOME", "TERM", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "CUESHEET_SESSIONS", "CUESHEET_SESSION", "CUESHEET_PROVIDER", "CUESHEET_MODEL", "CUESHEET_MAX_TOKENS", "CUESHEET_CONTEXT_CHARS",
    "CUESHEET_BASE_URL", "CUESHEET_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "CUESHEET_OPENCODE_BIN",
    "CUESHEET_SEARCH_PROVIDER", "BRAVE_SEARCH_API_KEY", "CUESHEET_SKILL_ROOTS", "CUESHEET_MAX_SLICES", "CUESHEET_CONTEXT_ROOTS", "LANG", "LC_ALL", "LC_MESSAGES", "TZ", "CUESHEET_TIME_ZONE", "CUESHEET_LANGUAGE", "CUESHEET_USER_LABEL", "CUESHEET_HOST_LABEL", "CUESHEET_TOOL_MODE", "CUESHEET_TOOL_IMAGE", "CUESHEET_TOOL_SOCKET"];
  const result: Record<string, string> = { TERM: "xterm-256color" };
  for (const key of keys) if (env[key] !== undefined) result[key] = env[key]!;
  const flags: Record<string, string> = { "--provider": "CUESHEET_PROVIDER", "--model": "CUESHEET_MODEL",
    "--max-tokens": "CUESHEET_MAX_TOKENS", "--base-url": "CUESHEET_BASE_URL", "--session": "CUESHEET_SESSION", "--verify": "CUESHEET_VERIFY_SCRIPT" };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]!;
    const value = args[i + 1];
    if (!flags[flag] || !value?.trim() || value.startsWith("--") || seen.has(flag)) {
      throw new Error("usage: cuesheet surface [--provider opencode|openrouter|openai|compatible|anthropic] [--model ID] [--max-tokens N] [--base-url URL] [--verify check.mjs] [--session ID]");
    }
    seen.add(flag);
    result[flags[flag]!] = flag === "--verify" ? resolve(process.cwd(), value) : value.trim();
  }
  return result;
}

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
  let selected: Record<string, string>;
  try { selected = surfaceEnvironment(args); }
  catch (error) { console.error(`surface: ${error instanceof Error ? error.message : String(error)}`); return 2; }
  const packaged=existsSync(BUNDLE);
  if (!packaged && !existsSync(SLICE)) {
    console.error(`surface: the slice is missing at ${SLICE}`);
    return 1;
  }
  if (!packaged && !existsSync(RUNNER)) {
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
    const child = spawn(packaged ? process.execPath : RUNNER, [packaged ? BUNDLE : SLICE], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...selected,
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
