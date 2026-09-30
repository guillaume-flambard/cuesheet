/**
 * Freezing what a worker actually produced, before anyone changes it again.
 *
 * A code agent does not produce a `result.json`. It produces a workspace. And a
 * workspace is mutable, which makes verification a question about time:
 *
 * ```text
 * worker finishes
 * workspace = A
 * someone, or another worker, touches it
 * workspace = B
 * verifier runs the tests          <- against B
 * ```
 *
 * Verifying B lets E42 be credited with or blamed for work it never did, and
 * the verdict still looks perfectly reasonable. So the runtime captures the
 * workspace once, computes a digest over what it captured, and the verifier
 * only ever runs against the capture. The live workspace can be vandalised
 * afterwards and the verdict will not move.
 *
 * The digest is computed here, by the runtime, over bytes the runtime read. It
 * is not read from a receipt, not accepted from the worker, and not compared
 * against a number the goal supplied. The producer is not the authority over
 * the identity of its own output either, for the same reason it is not the
 * authority over whether that output is any good.
 *
 * The claim is deliberately narrow, because the honest one is narrower than the
 * tempting one. Without an operating system sandbox, a worker could have written
 * anywhere it had permission to. This capture can prove one of two things:
 *
 * ```text
 * PROVABLE    the state of the declared workspace, after the worker finished
 * NOT PROVABLE the entirety of that worker's effects on the machine
 * ```
 *
 * So `covers` and `doesNotCover` are fields, and the second is not empty. A
 * capture that claimed more would be making exactly the kind of claim this
 * repository has spent fifteen milestones refusing to make.
 */

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";

/** What a capture covers, stated as a bound rather than as a boast. */
export const CAPTURE_SCOPE = "declared_workspace" as const;

/** Directories that are not the work's output, and are not snapshotted. */
const IGNORED = new Set(["node_modules", ".git", ".DS_Store"]);

export interface CapturedArtifact {
  /**
   * The artifact's name, derived from its own content.
   *
   * Content-addressed, so the id and the digest are the same fact: an artifact
   * whose content changed no longer matches its own name, and a verifier that
   * checks the two cannot be fooled by a renamed capture.
   */
  artifactId: string;
  /** Which effect produced it. */
  producerEffectId: string;
  /** Computed by the runtime over the bytes it captured. */
  digest: string;
  /** Where the frozen copy lives. The only thing a verifier may run against. */
  location: string;
  scope: typeof CAPTURE_SCOPE;
  /** What this capture does cover, named. */
  covers: string[];
  /** What it does not, said out loud rather than left implied. */
  doesNotCover: string[];
  capturedAt: number;
  fileCount: number;
}

export interface CaptureOptions {
  sessionId: string;
  effectId: string;
  /** The workspace to freeze. Read, never written. */
  workspace: string;
  /** Where frozen artifacts are kept. */
  root: string;
  /** For tests that need a fixed capture time. */
  now?: () => number;
}

/** Every file under a directory, relative and sorted, skipping the ignored. */
function filesUnder(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...filesUnder(full, base));
    } else if (entry.isFile()) {
      out.push(relative(base, full).split("\\").join("/"));
    }
  }
  return out.sort();
}

/**
 * A digest over a directory's contents.
 *
 * Order-independent by construction rather than by luck: entries are sorted
 * first, and each contributes its path, its length and the hash of its bytes.
 * Two workspaces with the same files have the same digest whatever order the
 * filesystem listed them, and a workspace with one changed byte does not.
 */
export function digestDirectory(dir: string): { digest: string; fileCount: number } {
  const parts: string[] = [];
  const files = filesUnder(dir);
  for (const rel of files) {
    const bytes = readFileSync(join(dir, rel));
    parts.push(`${rel}\x00${bytes.length}\x00${digestBytes(bytes)}`);
  }
  return { digest: digestString(parts.join("\n")), fileCount: files.length };
}

const digestBytes = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const digestString = (input: string): string =>
  createHash("sha256").update(input).digest("hex");

/**
 * Freeze a workspace into an artifact, and name it by its own content.
 *
 * The copy is made first and hashed second, so the digest describes the copy
 * that will be verified rather than the directory that will keep changing. A
 * worker still running could otherwise change the workspace between the hash and
 * the copy, and the capture would attest to bytes that were never stored.
 */
export function capture(options: CaptureOptions): CapturedArtifact {
  const { sessionId, effectId, workspace, root } = options;
  const now = options.now ?? Date.now;

  if (!existsSync(workspace)) {
    throw new Error(`cannot capture a workspace that is not there: ${workspace}`);
  }
  if (!statSync(workspace).isDirectory()) {
    throw new Error(`a workspace must be a directory: ${workspace}`);
  }

  // A provisional name, since the real one is the digest of the content.
  const staging = join(root, sessionId, "artifacts", `${effectId}.pending`);
  mkdirSync(staging, { recursive: true });
  cpSync(workspace, staging, { recursive: true, force: true });

  const { digest, fileCount } = digestDirectory(staging);
  const artifactId = `A-${digest.slice(0, 16)}`;
  const location = join(root, sessionId, "artifacts", artifactId);

  // ART-02: the artifact is immutable from here. Writing to a name that already
  // exists would be a second capture claiming to be the first, so this refuses
  // rather than overwriting.
  if (existsSync(location)) {
    return {
      artifactId,
      producerEffectId: effectId,
      digest,
      location,
      scope: CAPTURE_SCOPE,
      covers: filesUnder(workspace),
      doesNotCover: [...COVERAGE_LIMITS],
      capturedAt: now(),
      fileCount,
    };
  }
  cpSync(staging, location, { recursive: true });
  return {
    artifactId,
    producerEffectId: effectId,
    digest,
    location,
    scope: CAPTURE_SCOPE,
    covers: filesUnder(workspace),
    doesNotCover: [...COVERAGE_LIMITS],
    capturedAt: now(),
    fileCount,
  };
}

/**
 * What a capture is not evidence of.
 *
 * Kept next to the code that captures, not in a document, because a limit that
 * lives in prose is a limit nothing checks.
 */
export const COVERAGE_LIMITS: readonly string[] = [
  "files the worker touched outside the declared workspace",
  "effects on processes, the network, or any other machine state",
  "anything the worker did not declare, in a workspace it was not given",
  // EXP-07. A live run was given an ambiguous task: "score() is wrong, make the
  // test pass", against a test that several implementations satisfy. The model
  // picked one, the artifact was frozen, the oracle ran, and the verdict was
  // VERIFIED. That verdict is true and thin at the same time: the oracle proved
  // the artifact satisfies the test, and the test never stated the intent. A
  // verdict here is evidence about the requirement, never about whether the
  // requirement was the right one to begin with. Nothing below can establish
  // that, so it is a limit and not a bug to be fixed by a cleverer verifier.
  "whether the requirement the oracle checked was the requirement that was meant",
  // EXP-06, and this one is about the capture rather than the requirement. A
  // writer outside the system mutated `b.mjs` while the workspace was being
  // copied. The artifact holds `a@v1` and `b@v2`, a pair that never coexisted on
  // disk at any instant, and its digest is correct: content addressing proves
  // the bytes it holds are the bytes it names. It proves nothing about whether
  // those bytes were ever simultaneously true.
  //
  // The verdict was VERIFIED, because the contract only concerned `a.mjs`. That
  // is the correct verdict and it is also the size of the hole: a capture is not
  // a snapshot of a moment, it is a set of reads, and a set of reads taken while
  // the world moves describes a world that may not exist.
  //
  // Not fixable by hashing harder. A digest over an unordered file list cannot
  // tell a real workspace from a chimera, because the chimera is exactly as
  // self-consistent as the real one. Detecting it needs an observation of the
  // workspace's coherence over time, which is a different mechanism from
  // content addressing and is deliberately not invented here.
  "whether the captured files were ever simultaneously true in the workspace",
];

/** Does this capture still describe the bytes on disk? */
export function verifyCapture(artifact: CapturedArtifact): boolean {
  if (!existsSync(artifact.location)) return false;
  const { digest } = digestDirectory(artifact.location);
  return digest === artifact.digest;
}

/**
 * Read a capture back, or report that it cannot be established.
 *
 * ART-06: an artifact that is gone, or whose bytes no longer match its own name,
 * produces `unavailable` rather than a verdict. A verification that cannot say
 * which thing it evaluated must not say the thing was wrong.
 */
export function readCapture(
  artifact: CapturedArtifact,
): { kind: "ok" } | { kind: "unavailable"; why: string } {
  if (!existsSync(artifact.location)) {
    return { kind: "unavailable", why: `the capture for ${artifact.artifactId} is not on disk` };
  }
  const { digest } = digestDirectory(artifact.location);
  if (digest !== artifact.digest) {
    return {
      kind: "unavailable",
      why: `${artifact.artifactId} no longer matches its own digest; which bytes it was is unknown`,
    };
  }
  return { kind: "ok" };
}
