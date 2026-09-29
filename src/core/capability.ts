/**
 * Core: capability resolution at delegation time.
 *
 * Same discipline as ownership: this core knows nothing about any machine,
 * user, directory layout or agent runtime. It receives requirements and an
 * already-normalized capability set, and decides whether the requirements can
 * be met right now. What it adds over ownership is failure asymmetry: a held
 * project can legitimately be retried later, but an unresolvable capability
 * is a fact of this instant, and must not degrade silently into a weaker
 * brief.
 *
 * Admission rule. This primitive entered Core after failing without it: on
 * 2026-09-29 three agents were each briefed to use the `github-readme` skill
 * and none could resolve it, because capability lists are snapshotted when a
 * runtime session starts, so anything created afterwards is invisible to
 * every agent already running. Worse, none of the three reported the
 * requirement as unsatisfiable; each silently substituted its own judgement
 * for the missing specification. Resolving requirements at delegation time,
 * and refusing to spawn before the requirements exist, turns that incident
 * into an invariant. It is in Core because it was observed three times in one
 * session, not because it looked reusable.
 */

/** A capability the delegator requires before it is willing to spawn. */
export interface Requirement {
  /**
   * What kind of thing this is: `skill`, `tool`, `model`, `mcp`... Opaque to
   * the core; resolution never happens across kinds.
   */
  kind: string;
  /** The name the caller uses to refer to it. */
  name: string;
}

/**
 * One thing a registry offers. `version` is a content identity produced by the
 * adapter, so a caller that pinned a capability before starting work can
 * later compare it against a fresh resolve, without the core needing to know
 * what a version actually is.
 */
export interface Capability {
  kind: string;
  name: string;
  /** Content identity. Meaning is an adapter matter; presence is the core's. */
  version: string;
  /** Where it was found. For messages only; never parsed by the core. */
  source: string;
}

/**
 * Marker a registry adapter attaches to `Capability.version` when it could
 * not verify anything at all. An empty registry and an unreadable one are
 * different facts, and treating the second as the first invents evidence.
 */
export const REGISTRY_UNVERIFIED = "unverified";

/** The outcome for a single requirement. */
export interface RequirementResult {
  requirement: Requirement;
  /** True when a capability of the same kind and name was offered. */
  resolved: boolean;
  /** The capability found; present exactly when `resolved` is true. */
  capability: Capability | null;
  /** Human-readable grounds. Never empty when `resolved` is false. */
  reasons: string[];
}

/** The complete answer a delegation needs before spawning. */
export interface Resolution {
  resolved: Capability[];
  unresolved: RequirementResult[];
}

export type ResolutionVerdict = "ready" | "blocked";

export interface ResolutionOptions {
  /**
   * Epoch milliseconds the caller treats as now. Injected so the function is
   * testable without a real clock, the same dependency injection pattern
   * `resolveOwnership` uses.
   */
  now: number;
}

export interface CapabilityResolution {
  /** `blocked` means at least one requirement is unmet: do not spawn. */
  verdict: ResolutionVerdict;
  resolution: Resolution;
  /**
   * True when the registry could not be verified at all. Absence is then not
   * evidence, and the caller is being asked to decide with missing data.
   */
  registryUnverified: boolean;
  now: number;
}

function describe(requirement: Requirement, available: Capability[]): string {
  const sameKind = available
    .filter((c) => c.kind === requirement.kind)
    .map((c) => c.name);
  if (sameKind.length === 0) {
    return `no ${requirement.kind} capability is registered at all`;
  }
  return `registered ${requirement.kind}: ${[...new Set(sameKind)].join(", ")}`;
}

/**
 * Resolve delegation requirements against a snapshot of the live registry.
 *
 * The registry adapter hands over a snapshot, and that snapshot is all the
 * core can see. Calling again later is how a caller picks up changes; nothing
 * in here reaches forward to a newer state. That is the distinction the
 * primitive exists to make: dynamic between operations, stable during one.
 */
export function resolveCapabilities(
  requirements: Requirement[],
  available: Capability[],
  options: ResolutionOptions,
): CapabilityResolution {
  const resolved: Capability[] = [];
  const unresolved: RequirementResult[] = [];
  const registryUnverified =
    available.length === 0 ||
    available.every((c) => c.version === REGISTRY_UNVERIFIED);

  for (const requirement of requirements) {
    // Adapters are required to order deterministically, newest registration
    // first, so the first match is the freshest content.
    const match = available.find(
      (c) => c.kind === requirement.kind && c.name === requirement.name,
    );

    if (match) {
      resolved.push(match);
      continue;
    }

    const reasons = [
      `required ${requirement.kind} "${requirement.name}" is not in the registry`,
      describe(requirement, available),
    ];
    if (registryUnverified) {
      reasons.push(
        "the registry could not be verified, so absence here is not evidence the requirement is unsatisfiable everywhere",
      );
    }

    unresolved.push({
      requirement,
      resolved: false,
      capability: null,
      reasons,
    });
  }

  return {
    verdict: unresolved.length > 0 ? "blocked" : "ready",
    resolution: { resolved, unresolved },
    registryUnverified,
    now: options.now,
  };
}

/** Does this resolution justify spawning? A blocked resolution never does. */
export function isSpawnable(resolution: CapabilityResolution): boolean {
  return resolution.verdict === "ready";
}

/**
 * The message for a blocked resolution. Names every unmet requirement and
 * what was actually available, so the failure is actionable at the place that
 * can fix it, instead of a bare failure with no explanation. When the
 * registry could not be verified, it also says that absence is not evidence,
 * because a refusal on unreadable data must not read as a proven fact.
 */
export function describeBlock(resolution: CapabilityResolution): string {
  const parts: string[] = [];
  for (const u of resolution.resolution.unresolved) {
    parts.push(
      `cannot resolve ${u.requirement.kind} "${u.requirement.name}": ${u.reasons[1]}`,
    );
  }
  if (resolution.registryUnverified) {
    parts.push(
      "the registry itself could not be read, so these lists may be wrong and absence here is not evidence the requirement is unsatisfiable everywhere",
    );
  }
  return parts.join("; ");
}
