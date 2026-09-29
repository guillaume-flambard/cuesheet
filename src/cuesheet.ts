/**
 * CLI: the single entry point for the installed `cuesheet` command.
 *
 * This file dispatches and adds nothing. The implementations live in the CLIs
 * it calls, and it spawns them rather than importing them, because they are
 * scripts with their own arg parsing and their own exit codes. The one thing
 * this file is strict about is exit-code passthrough: a gate that refuses must
 * reach a script as exit 1, or the command is unusable as a gate.
 *
 * Machine paths appear only in the shim that installs this command, never
 * here.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const COMMANDS: Record<
  string,
  { file: string; about: string; style: "flags" | "subcommand" }
> = {
  // Two calling conventions live behind one command, and the difference is
  // deliberate: cli.ts is flag-driven because portfolio-owners and the README
  // call it that way, and its parser refuses unknown tokens. cli-run.ts is
  // subcommand-driven. The dispatcher absorbs the asymmetry so the user never
  // sees it.
  projects: { file: "cli.ts", about: "which projects can accept a writer right now", style: "flags" },
  gate: { file: "cli.ts", about: "refuse a brief whose requirements cannot resolve", style: "flags" },
  run: { file: "cli-run.ts", about: "run a goal under a session that owns its state", style: "subcommand" },
  resume: { file: "cli-run.ts", about: "replay a session and continue it", style: "subcommand" },
  sessions: { file: "cli-run.ts", about: "list the sessions stored on this machine", style: "subcommand" },
  inspect: { file: "cli-run.ts", about: "print a session log, event by event", style: "subcommand" },
  capabilities: { file: "cli-run.ts", about: "resolve the live skill registry", style: "subcommand" },
  frontier: { file: "frontier-cli.ts", about: "regenerate the portfolio frontier", style: "subcommand" },
};

function usage(): never {
  console.log(`cuesheet, a session that owns its own state

  cuesheet projects --root <dir> [--root <dir>] [--minutes N]
  cuesheet gate --requirements <file> --skill-root <dir>
  cuesheet run <goal> --in <dir> [--session <id>] [--max-steps N] [--model <id>]
  cuesheet resume <session> --in <dir>
  cuesheet sessions
  cuesheet inspect <session>
  cuesheet capabilities
  cuesheet frontier [<objects-file>]

Subcommands:

${Object.entries(COMMANDS)
  .map(([name, c]) => `  ${name.padEnd(14)}${c.about}`)
  .join("\n")}

A run needs a provider. Set OPENROUTER_API_KEY; there is no unauthenticated
fallback, on purpose.
`);
  process.exit(2);
}

function dispatch(argv: string[]): number {
  const [command, ...rest] = argv;
  if (!command) {
    usage();
  }
  const target = COMMANDS[command];
  if (!target) {
    console.error(`cuesheet: unknown command "${command}"`);
    usage();
  }

  const args =
    target.style === "subcommand" ? [command, ...rest] : rest;
  const result = spawnSync(process.execPath, [join(here, target.file), ...args], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`cuesheet: failed to launch ${target.file}: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`cuesheet: ${command} killed by ${result.signal}`);
    return 1;
  }
  return result.status ?? 1;
}

process.exit(dispatch(process.argv.slice(2)));
