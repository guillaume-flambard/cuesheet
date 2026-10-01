/**
 * Which model a run gets, decided in one place.
 *
 * This exists because the answer used to be four separate hardcoded strings and
 * one environment variable, and four copies of an answer is three too many. The
 * old default named `anthropic/claude-sonnet-4-6`, a provider this machine does
 * not use, and refused to run at all without `OPENROUTER_API_KEY` while
 * announcing that no local runtime existed. One did.
 *
 * The rule, in one sentence: **a run uses the local binary unless a person asks
 * for another provider by name.** Not "unless a key happens to be exported", because
 * an ambient key silently changing which transport a run uses is the kind of
 * decision nobody can reconstruct from a log afterwards. Opt-in is explicit or
 * it is not a default.
 *
 * What is trusted is stated once and measured: the binary is trusted to be a
 * language model that returns text, and not to touch the filesystem, run a
 * command, or be believed. See `binary-model.ts` and
 * `docs/MB-01-local-binary-transport.md` for the measurement that established it.
 */

import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

import type { ModelAdapter } from "../core/loop.ts";
import { BinaryModelAdapter, binaryAvailable } from "./binary-model.ts";
import { OpenRouterAdapter } from "./openrouter.ts";
import { readModelPreferences, preferencesPath, validBaseUrl, type ModelPreferences } from "./model-preferences.ts";

/** The provider name a person sets to ask for OpenRouter rather than the local one. */
export const OPENROUTER_PROVIDER = "openrouter";

/** Where the binary is looked for when nothing says otherwise. */
const CANDIDATE_BINARIES = [
  join(homedir(), ".opencode", "bin", "opencode"),
  join(homedir(), ".local", "bin", "opencode"),
];

/**
 * A resolved provider, and the sentence a surface can print about it.
 *
 * `model` is null when the binary's own configured model is used, which is the
 * honest default: Cuesheet does not know which model a user has configured, and
 * hardcoding one is how `anthropic/claude-sonnet-4-6` ended up here.
 */
export interface ResolvedModel {
  readonly adapter: ModelAdapter;
  readonly name: string;
  readonly model: string | null;
  readonly why: string;
}

export interface ResolveOptions {
  /** The resolved project directory, or null for a scratch run with none. */
  readonly project?: string | null;
  /** Explicit transport for this run, overriding CUESHEET_PROVIDER. */
  readonly provider?: string;
  /**
   * A model named for this run, e.g. from `--model`.
   *
   * Takes precedence over `CUESHEET_MODEL`, because a flag on a command line is a
   * request about this run and an environment variable is a standing preference.
   */
  readonly model?: string | null;
  readonly baseUrl?: string;
  readonly maxTokens?: number;
  /** Tests and interactive selection can supply a complete preference snapshot. */
  readonly preferences?: ModelPreferences;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Find the binary, or say where it was looked for.
 *
 * `CUESHEET_OPENCODE_BIN` first so a person with it somewhere unusual does not
 * have to move their install, then `PATH`, then the two locations this machine
 * has actually used. A missing binary returns null with the list, because
 * "there is no model here" is only useful if it says what it looked for.
 */
export function findBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  const named = env["CUESHEET_OPENCODE_BIN"];
  if (named && binaryAvailable(named)) return named;
  for (const dir of (env["PATH"] ?? "").split(delimiter)) {
    if (dir === "") continue;
    const candidate = join(dir, "opencode");
    if (binaryAvailable(candidate)) return candidate;
  }
  for (const candidate of CANDIDATE_BINARIES) {
    if (binaryAvailable(candidate)) return candidate;
  }
  return null;
}

/**
 * The model this run will use, or the reason it cannot.
 *
 * A refusal returns what it looked for. The sentence it replaces claimed there
 * was no local runtime on this machine, which was false, and a false claim
 * about a machine is worse than no claim at all: it tells a reader the question
 * was settled when it was not.
 */
export function resolveModel(options: ResolveOptions = {}): ResolvedModel | { missing: string } {
  const env = options.env ?? process.env;
  let preferences: ModelPreferences;
  try { preferences = options.preferences ?? readModelPreferences(preferencesPath(env)); }
  catch (error) { return { missing: error instanceof Error ? error.message : String(error) }; }
  const provider = options.provider?.trim() || env.CUESHEET_PROVIDER?.trim() || preferences.provider || "opencode";
  const sameProvider = provider === preferences.provider;
  const model = options.model === null ? null : options.model?.trim() || env.CUESHEET_MODEL?.trim() || (sameProvider ? preferences.model : null) || null;
  if (!["opencode", "openrouter", "openai", "compatible"].includes(provider)) {
    return { missing: `Unknown provider "${provider}". Choose opencode, openrouter, openai or compatible.` };
  }
  const ceiling = env.CUESHEET_MAX_TOKENS;
  const maxTokens = options.maxTokens ?? (ceiling === undefined ? (sameProvider ? preferences.maxTokens : undefined) : Number(ceiling));
  if (maxTokens !== undefined && (!Number.isSafeInteger(maxTokens) || maxTokens < 1)) {
    return { missing: "CUESHEET_MAX_TOKENS must be a positive integer." };
  }
  if (provider === "opencode" && maxTokens !== undefined) {
    return { missing: "--max-tokens applies to HTTP providers. OpenCode uses its own configured output limit." };
  }
  if (provider === "openai" || provider === "compatible") {
    if (!model) return { missing: `${provider} requires an explicit model (--model or CUESHEET_MODEL).` };
    const apiKey = provider === "openai" ? env.OPENAI_API_KEY : env.CUESHEET_API_KEY;
    if (provider === "openai" && !apiKey) return { missing: "OPENAI_API_KEY is not set." };
    const baseUrl = provider === "openai" ? "https://api.openai.com/v1" : options.baseUrl ?? env.CUESHEET_BASE_URL ?? (sameProvider ? preferences.baseUrl : undefined);
    if (!baseUrl) return { missing: "compatible requires CUESHEET_BASE_URL (including /v1)." };
    if (!validBaseUrl(baseUrl)) return { missing: "CUESHEET_BASE_URL must be an HTTP(S) URL without credentials, query or fragment." };
    return {
      adapter: new OpenRouterAdapter({ apiKey: apiKey ?? "", model, providerName: provider,
        baseUrl: baseUrl.replace(/\/$/, ""), maxTokens,
        tokenParameter: provider === "openai" ? "max_completion_tokens" : "max_tokens" }),
      name: provider, model, why: `${provider}, explicitly selected, model ${model}`,
    };
  }

  // Explicit opt-in, and only explicit. A key that happens to be exported is not
  // a request to spend credits on every run in the session.
  if (provider === OPENROUTER_PROVIDER) {
    const apiKey = env["OPENROUTER_API_KEY"];
    if (!apiKey) {
      return {
        missing:
          "CUESHEET_PROVIDER=openrouter was asked for, but OPENROUTER_API_KEY is not set. " +
          "Unset CUESHEET_PROVIDER to use the local binary instead.",
      };
    }
    return {
      adapter: new OpenRouterAdapter({ apiKey, maxTokens, model: model ?? "anthropic/claude-sonnet-4-6" }),
      name: "openrouter",
      model: model ?? "anthropic/claude-sonnet-4-6",
      why: "CUESHEET_PROVIDER=openrouter, asked for by name",
    };
  }

  const binary = findBinary(env);
  if (binary === null) {
    return {
      missing:
        "no model transport on this machine. Looked for the opencode binary on PATH and in " +
        `${CANDIDATE_BINARIES.join(" and ")}. Set CUESHEET_OPENCODE_BIN to its path, install it, ` +
        "or set CUESHEET_PROVIDER=openrouter with OPENROUTER_API_KEY.",
    };
  }

  return {
    adapter: new BinaryModelAdapter({ binary, project: options.project ?? null, ...(model ? { model } : {}) }),
    name: "opencode-binary",
    model,
    why: `the local binary at ${binary}${model ? `, model ${model}` : ", on its own configured model"}`,
  };
}
