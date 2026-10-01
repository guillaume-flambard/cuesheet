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
 * binary, using its configured account. `OPENROUTER_API_KEY` is still forwarded, and a
 * person chooses a transport with `--provider` or `CUESHEET_PROVIDER`.
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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { TerminalSession, terminalSessionRoot } from "../../../../src/adapters/terminal-session.ts";
import { persistentView } from "./session-view.ts";
import type { CompletionCheck } from "../../../../src/adapters/surface-verification.ts";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";
import { createCompletionCheck } from "../../../../src/adapters/surface-verification.ts";
import { createModelBinding, type ModelBinding } from "../../../../src/adapters/model-binding.ts";
import { resolveModel } from "../../../../src/adapters/default-model.ts";
import { ShellToolRunner } from "../../../../src/adapters/shell.ts";
import { ResearchTools } from "../../../../src/adapters/research-tools.ts";
import { SkillTools } from "../../../../src/adapters/skill-tools.ts";
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
 * Build one producer with a switchable model binding.
 *
 * A missing model remains selectable in the UI without replacing this producer.
 * App gates task submission on binding.missing. A broken owner check still
 * refuses construction, because model selection cannot repair that check.
 */
export function createLiveProducer(store: Store, cwd: string, settings: { journal?: TerminalSession; verification?: CompletionCheck; binding?: ModelBinding } = {}): { producer: Producer; binding: ModelBinding } | { missing: string } {
  const contextBudgetChars=process.env.CUESHEET_CONTEXT_CHARS===undefined ? undefined : Number(process.env.CUESHEET_CONTEXT_CHARS);
  if(contextBudgetChars!==undefined && (!Number.isSafeInteger(contextBudgetChars) || contextBudgetChars<4000))return {missing:"CUESHEET_CONTEXT_CHARS must be an integer of at least 4000."};
  const maxSlices=process.env.CUESHEET_MAX_SLICES===undefined ? 4 : Number(process.env.CUESHEET_MAX_SLICES);
  if(!Number.isSafeInteger(maxSlices) || maxSlices<1 || maxSlices>16)return {missing:"CUESHEET_MAX_SLICES must be an integer from 1 to 16."};
  const binding = settings.binding ?? createModelBinding({ project: cwd });
  const model: ModelAdapter = binding.adapter;
  const tools: ToolRunner = new ShellToolRunner({
    allow: ALLOWED,
    roots: [cwd],
    defaultCwd: cwd,
  });
  let verification;
  try {
    const script = process.env.CUESHEET_VERIFY_SCRIPT;
    verification = settings.verification ?? (script ? createCompletionCheck({ script, root: join(homedir(), ".local", "state", "cuesheet", "verification") }) : undefined);
  } catch (error) {
    return { missing: `The declared check could not be loaded: ${error instanceof Error ? error.message : String(error)}` };
  }
  const research=new ResearchTools({root:cwd,provider:process.env.CUESHEET_SEARCH_PROVIDER,apiKey:process.env.BRAVE_SEARCH_API_KEY});
  const roots=process.env.CUESHEET_SKILL_ROOTS?.split(delimiter).filter(Boolean) ?? [join(cwd,".cuesheet","skills")];
  const skills=new SkillTools({roots});
  const options: ProducerOptions = { store, journal: settings.journal, model, tools, cwd, toolNames: ALLOWED, verification, contextBudgetChars, research, skills, maxSlices };
  return { producer: createProducer(options), binding };
}
/** Acquire storage before building any live adapter. Loading never starts work. */
export function createTerminalRuntime(cwd: string, id?: string): { store: Store; producer: Producer; binding: ModelBinding; session: TerminalSession } | { missing: string } {
  let session: TerminalSession | undefined;
  try {
    const root = terminalSessionRoot();
    const proofRoot = join(homedir(), ".local", "state", "cuesheet", "verification");
    const declared = process.env.CUESHEET_VERIFY_SCRIPT;
    let verification = declared ? createCompletionCheck({script:declared,root:proofRoot}) : undefined;
    session = new TerminalSession({root,cwd,id,check:verification?.pinned});
    if (session.metadata.check) {
      const check = session.metadata.check;
      if(createHash("sha256").update(readFileSync(check.script)).digest("hex")!==check.digest) throw new Error("Le critère sauvegardé ne correspond plus à son empreinte. Reprise refusée.");
      verification = createCompletionCheck({script:check.script,root:proofRoot});
    }
    const store = persistentView(session);
    const binding = createModelBinding({project:session.metadata.cwd,preferences:session.lastModel});
    const live = createLiveProducer(store,session.metadata.cwd,{journal:session,verification,binding});
    if("missing" in live) throw new Error(live.missing);
    if(!binding.missing) session.recordModel(binding.selection);
    store.send({type:"logged",line:`[session] ${session.metadata.id} ${session.metadata.cwd}`});
    return {store,producer:live.producer,binding,session};
  } catch(error) {session?.close();return {missing:error instanceof Error ? error.message : String(error)};}
}
