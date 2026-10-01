/**
 * Adapter: a local shell as the tool runner.
 *
 * All I/O in the loop happens here, behind a single interface, so the core
 * never learns how a tool runs. The policy that matters here is the one from
 * the harness rules: running a command is fine, changing the world outside a
 * declared scope is not. So this runner does not sandbox, it constrains: it
 * refuses paths that are not under an allowed root, and it returns the exit
 * code as-is rather than interpreting success.
 *
 * The same rule as everywhere else in this project: absence of evidence is not
 * evidence. A tool that cannot be found returns an exit code and a message, it
 * does not throw, because a throw would be read as a harness fault when it is a
 * world fault.
 */

import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { ToolRequest, ToolResult } from "../core/loop.ts";

export interface ShellToolRunnerOptions {
  /** Commands that may run. Anything else is refused by name. */
  allow: string[];
  /** Paths a command's working directory may be under. */
  roots: string[];
  /** Hard ceiling on a single command, in milliseconds. */
  timeoutMs?: number;
  /** Bytes of output kept. The tail matters more than the head. */
  outputBytes?: number;
  /**
   * The declared working directory, used when a request does not supply one.
   *
   * This exists because the alternative failed in a real run: the model
   * supplies a path to the thing it wants, not a working directory, and making
   * it construct a cwd meant three refused calls in a row against an agent
   * doing exactly the right thing. The scope is a property of the harness that
   * admitted the task, not something the model gets to choose, so it is
   * supplied here and cannot be widened by a request.
   */
  defaultCwd?: string;
  /** Trusted controller environment; never accepted from a tool request. */
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_OUTPUT_BYTES = 8_000;
const HARNESS_CREDENTIALS = new Set([
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY",
  "CUESHEET_API_KEY", "BRAVE_SEARCH_API_KEY",
]);

export class ShellToolRunner {
  private readonly options: Required<ShellToolRunnerOptions>;

  constructor(options: ShellToolRunnerOptions) {
    this.options = {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      outputBytes: DEFAULT_OUTPUT_BYTES,
      ...options,
      // Copy at admission; neither the model nor later environment changes can
      // inject provider credentials into an already configured tool runner.
      env: Object.fromEntries(Object.entries(options.env ?? process.env)
        .filter(([key]) => !HARNESS_CREDENTIALS.has(key.toUpperCase()))),
    };
  }

  async run(request: ToolRequest, signal?: AbortSignal): Promise<ToolResult> {
    const { name, input } = request;

    if (!this.options.allow.includes(name)) {
      return {
        name,
        exit: 127,
        output: `tool "${name}" is not in the allow list: ${this.options.allow.join(", ")}`,
      };
    }

    // A model supplies a path to the file it wants; the harness supplies the
    // scope. When the request carries no explicit cwd, the declared root is
    // the working directory, and the requested path is read relative to it.
    const cwd = String(input.cwd ?? this.options.defaultCwd ?? "");
    if (!this.isUnderRoot(cwd)) {
      return {
        name,
        exit: 126,
        output: `refusing to run in ${cwd || "(unset)"}: outside the declared roots ${this.options.roots.join(", ")}`,
      };
    }

    // A path that escapes the working directory is the interesting refusal:
    // an agent reaching for a file it was not given, which is a real boundary
    // and not a formatting complaint.
    const requested = input.path;
    if (typeof requested === "string" && requested.length > 0) {
      const target = resolve(cwd, requested);
      if (!this.isUnderRoot(target)) {
        return {
          name,
          exit: 126,
          output: `refusing to read ${requested}: resolves to ${target}, outside the declared roots ${this.options.roots.join(", ")}`,
        };
      }
    }

    const argv = this.buildArgv(name, input, cwd);
    if (argv.length === 0) {
      return { name, exit: 2, output: "no argv supplied" };
    }

    // The declaration and the executable must be the same command. A caller
    // cannot gain another executable by putting it behind an allowed name.
    if (argv[0] !== name) {
      return { name, exit: 126, output: `refusing executable ${argv[0]}: expected ${name}` };
    }

    return new Promise<ToolResult>((resolvePromise) => {
      execFile(
        argv[0],
        argv.slice(1),
        {
          cwd: cwd || process.env.HOME,
          timeout: this.options.timeoutMs,
          maxBuffer: this.options.outputBytes * 4,
          env: { ...this.options.env, NO_COLOR: "1" },
          signal, killSignal: "SIGKILL",
        },
        (error, stdout, stderr) => {
          const output = `${stdout}${stderr}`.slice(-this.options.outputBytes);
          if (!error) {
            resolvePromise({ name, exit: 0, output });
            return;
          }
          // A killed process has a signal rather than a code, and reporting
          // that honestly matters: a timeout is not a test failure.
          const code =
            typeof (error as { code?: unknown }).code === "number"
              ? ((error as { code: number }).code)
              : null;
          const signal = (error as { signal?: string | null }).signal;
          resolvePromise({
            name,
            exit: code,
            output: `${output}${signal ? `\n[killed by ${signal}]` : ""}`.trimEnd(),
          });
        },
      );
    });
  }

  /**
   * Assemble the command line.
   *
   * Two shapes are accepted, and the choice was forced by a real run: a model
   * may either send an explicit argv, or send the tool name plus a path and
   * expect the runner to know how that tool is invoked. Rejecting the second
   * shape taught an agent that was behaving correctly that it was being
   * blocked, and it then spent its budget retrying.
   */
  private buildArgv(name: string, input: Record<string, unknown>, cwd: string): string[] {
    if (Array.isArray(input.argv) && input.argv.length > 0) {
      return input.argv.map(String);
    }
    const path = typeof input.path === "string" ? input.path : "";
    if (path) {
      if (name === "cat") return ["cat", path];
      if (name === "ls") return ["ls", "-la", path];
      if (name === "node") return ["node", "-e", `console.log(require('fs').readFileSync(${JSON.stringify(path)},'utf8'))`];
    }
    return [];
  }

  private isUnderRoot(cwd: string): boolean {
    if (!isAbsolute(cwd)) {
      return false;
    }
    let target: string;
    try {
      // realpath first, so a symlink pointing outside a root is refused too.
      target = realpathSync(resolve(cwd));
    } catch {
      return false;
    }
    return this.options.roots.some((root) => {
      try {
        return target === realpathSync(resolve(root)) || target.startsWith(realpathSync(resolve(root)) + "/");
      } catch {
        return false;
      }
    });
  }
}
