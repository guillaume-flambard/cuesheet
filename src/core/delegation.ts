/**
 * Core: the delegation gate.
 *
 * capability.ts resolves requirements and describes a refusal, but a library
 * that can refuse is not a mechanism that refuses. The delegator still had to
 * remember to call it, and the incident the primitive exists for happened
 * exactly because remembering failed, three times in one day. This file is
 * the preflight the thing that actually delegates runs: requirements in, one
 * executable answer out, spawn or do not. It adds no resolution logic of its
 * own and calls resolveCapabilities() unchanged.
 *
 * The requirements declaration format lives here too, because the format is
 * the other half of the contract between a brief and this gate. If only the
 * CLI knew the shape, a malformed requirement could only be caught by
 * spawning a process. Parsing a string is not I/O: the core still receives
 * text and returns data, and knows nothing about files, clocks or
 * directories.
 */

import {
  describeBlock,
  isSpawnable,
  resolveCapabilities,
  type Capability,
  type CapabilityResolution,
  type ResolutionOptions,
  type Requirement,
} from "./capability.ts";

/** Thrown when a requirements declaration does not match the contract. */
export class RequirementsFormatError extends Error {}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Parse a requirements declaration into what the gate understands.
 *
 * The shape is one key, `requirements`, holding an array of `{kind, name}`.
 * A bare top-level array is rejected on purpose: a format whose meaning
 * depends on guessing what the writer meant is how a brief degrades
 * silently. Extra keys on the object or on a requirement are ignored, so a
 * brief can carry its own context without asking permission. Kind and name
 * are matched exactly by the core, so they are validated as non-empty
 * strings and never trimmed or normalized: a typo must block, not
 * best-effort match.
 */
export function parseRequirements(text: string): Requirement[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new RequirementsFormatError(
      `requirements declaration is not valid JSON: ${detail}`,
    );
  }

  if (Array.isArray(raw)) {
    throw new RequirementsFormatError(
      'the requirements declaration is a bare array; the shape is {"requirements": [...]}',
    );
  }
  if (raw === null || typeof raw !== "object") {
    throw new RequirementsFormatError(
      'the requirements declaration must be an object with a "requirements" array',
    );
  }

  const list = (raw as { requirements?: unknown }).requirements;
  if (!Array.isArray(list)) {
    throw new RequirementsFormatError(
      'the requirements declaration needs a "requirements" array: {"requirements": [{"kind": "...", "name": "..."}]}',
    );
  }

  return list.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new RequirementsFormatError(`requirement ${index} is not an object`);
    }
    const { kind, name } = entry as { kind?: unknown; name?: unknown };
    if (!isNonEmptyString(kind)) {
      throw new RequirementsFormatError(
        `requirement ${index}: "kind" must be a non-empty string, e.g. "skill"`,
      );
    }
    if (!isNonEmptyString(name)) {
      throw new RequirementsFormatError(
        `requirement ${index}: "name" must be a non-empty string`,
      );
    }
    return { kind, name };
  });
}

/** The gate's answer, ready to act on without further interpretation. */
export interface Preflight {
  /** The full resolution, for callers that want per-requirement detail. */
  resolution: CapabilityResolution;
  /** False means do not spawn. There is no third option and no downgrade. */
  spawnable: boolean;
  /** The refusal text. Empty exactly when `spawnable` is true. */
  refusal: string;
}

/**
 * The preflight step a delegator runs before spawning anything: the work
 * packet's requirements against a registry snapshot. Resolution happens
 * here, at delegation time, against the snapshot handed in; nothing in this
 * call reaches forward to a newer state of the registry. A blocked verdict
 * carries its refusal text, so the caller that refuses does not have to
 * reconstruct why.
 */
export function preflightDelegation(
  requirements: Requirement[],
  available: Capability[],
  options: ResolutionOptions,
): Preflight {
  const resolution = resolveCapabilities(requirements, available, options);
  return {
    resolution,
    spawnable: isSpawnable(resolution),
    refusal: describeBlock(resolution),
  };
}
