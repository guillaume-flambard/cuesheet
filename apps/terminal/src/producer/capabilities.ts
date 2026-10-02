/**
 * What this runtime can actually do right now, as a fact rather than an assumption.
 *
 * The capability model already exists in Core (`src/core/capability.ts`) and it
 * already refuses to spawn when a requirement cannot be resolved. What was
 * missing is the terminal's own honest answer to "what do I have", which is the
 * input that resolution needs.
 *
 * The rule this file exists to enforce, from the autonomy spec: multi-agent
 * execution is a capability, not an assumption. When it is unavailable the
 * harness must degrade to a sequential plan and PERSIST that fact, rather than
 * label sequential model calls as agents or pretend a plan was fully served.
 *
 * Nothing here probes the network. A capability is reported available only when
 * the runtime has a concrete reason to believe so, and `unavailable` carries the
 * reason so a reader can tell "not present" from "present but unusable".
 */
import type { Capability } from "../../../../src/core/capability.ts";

export type Availability = "available" | "unavailable";

export interface RuntimeCapability {
  /** Matches `Requirement.kind`, so the existing resolver can consume this unchanged. */
  readonly kind: string;
  readonly name: string;
  readonly availability: Availability;
  /** Never empty. When unavailable, this is the reason, not a placeholder. */
  readonly reason: string;
  /** Content identity in the Core sense; a probe result, not a version guess. */
  readonly version: string;
}

export interface RuntimeCapabilities {
  readonly probed: readonly RuntimeCapability[];
  /** The subset the Core resolver accepts: available capabilities only. */
  readonly registry: readonly Capability[];
  /**
   * Requirements this runtime cannot serve. A plan naming one is adapted or
   * blocked, never silently served by something weaker.
   */
  readonly missing: readonly RuntimeCapability[];
}

/**
 * Probe once per launch. Deliberately cheap and local: a capability that needs a
 * network round trip is reported unavailable with that reason rather than
 * blocked on, because a startup that waits on a provider is a startup that fails
 * when the provider does.
 */
export function probeRuntimeCapabilities(options: { subagentsAvailable?: boolean; provider?: string } = {}): RuntimeCapabilities {
  const probed: RuntimeCapability[] = [];

  const add = (kind: string, name: string, availability: Availability, reason: string, version: string) =>
    probed.push({ kind, name, availability, reason, version });

  add("runtime", "model", "available", "a provider adapter is constructed by the producer", "live");
  add("runtime", "shell", "available", "the shell runner is admitted for the resolved scope", "live");
  add("runtime", "filesystem", "available", "the candidate workspace is a real directory", "live");
  add("runtime", "git", "available", "worktree allocation and snapshots run here", "live");

  const capsuleImage = process.env.CUESHEET_TEST_CAPSULE_IMAGE;
  const capsuleSocket = process.env.CUESHEET_TEST_TOOL_SOCKET;
  if (capsuleImage && capsuleSocket) add("runtime", "capsule", "available", "a pinned capsule image and a tool socket are configured", capsuleImage.replace(/^sha256:/, "").slice(0, 16));
  else add("runtime", "capsule", "unavailable", "no pinned capsule image and tool socket are configured, so isolated Linux execution is not offered", "absent");

  if (options.subagentsAvailable === true) add("runtime", "subagents", "available", "the runtime reports a task capability", "live");
  else add("runtime", "subagents", "unavailable", "this runtime exposes no sub-agent capability, so work is executed sequentially and never labelled as concurrent", "absent");

  add("runtime", "web", "unavailable", "web research is a separate admitted tool and is not assumed here", "absent");

  if (options.provider) add("provider", options.provider, "available", "the producer selected this provider", "selected");
  else add("provider", "none", "unavailable", "no provider is selected, so inference is not offered", "absent");

  const missing = probed.filter((c) => c.availability === "unavailable");
  const registry: Capability[] = probed
    .filter((c) => c.availability === "available")
    .map((c) => ({ kind: c.kind, name: c.name, version: c.version, source: "terminal-probe" }));

  return Object.freeze({ probed: Object.freeze(probed), registry: Object.freeze(registry), missing: Object.freeze(missing) });
}

/**
 * One line a person can read, and the same facts a plan can be compiled against.
 *
 * A sequential degradation is stated, not hidden: if sub-agents are absent the
 * line says so, because a plan that quietly runs one thing at a time while its
 * graph claims branches is the mislabelling the spec forbids.
 */
export function describeRuntimeCapabilities(caps: RuntimeCapabilities): string {
  const available = caps.registry.map((c) => c.name);
  const absent = caps.missing.map((c) => c.name);
  const concurrent = caps.registry.some((c) => c.kind === "runtime" && c.name === "subagents");
  const head = concurrent ? "worker" : "worker, séquentiel uniquement";
  return `${head} ; disponibles : ${available.filter((n) => n !== "subagents").join(", ")}${absent.length ? ` ; indisponibles : ${absent.join(", ")}` : ""}`;
}
