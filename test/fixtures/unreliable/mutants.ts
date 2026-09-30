/**
 * Breaking Cuesheet, on purpose, without touching Cuesheet.
 *
 * A benchmark row is only worth having if it can go red. A matrix of
 * assertions that all pass tells a reader that the system behaves, and nothing
 * about whether the assertions have any teeth: a table that only ever prints
 * green is indistinguishable from a table that was written to print green.
 *
 * The usual way to answer that is to edit the source, watch it fail, and revert.
 * That is not available here, and not only because of the write scope. Editing
 * `src/` even transiently is a bad way to spend the reader's trust: the
 * interesting failure is the one where the edit is forgotten, and the artefact
 * that catches it is a dirty working tree, which is a signal people learn to
 * ignore.
 *
 * So the mutation happens in memory. Each entry below names a file, an exact
 * substring of it, and the substring that replaces it. The harness copies the
 * file to a temporary directory, applies the substitution, rewrites its relative
 * import specifiers to absolute `file://` URLs of the *real* modules, and
 * imports the result. Every dependency is the genuine one, so the mutant differs
 * from production in exactly one named expression and nothing else.
 *
 * Three properties make a mutant result worth believing:
 *
 * 1. The substitution must apply. `mutate` throws when the `from` string is not
 *    present, so a mutant that silently became a no-op after a refactor is a
 *    loud failure rather than a row that quietly stopped being falsifiable.
 * 2. The dependency graph must be the real one. Rewriting specifiers to the
 *    real files is what stops a mutant from becoming a second, divergent copy
 *    of the system.
 * 3. It must be loaded under a fresh specifier. Node caches by URL, so every
 *    mutant carries a unique query string. Without it, two mutants of the same
 *    file in one process would share a module and the second would be a lie.
 *
 * What this cannot do is show a mutant that *should* fail the matrix but does
 * not, because no such source line exists. Those are reported as zero-bite
 * mutants in `docs/reliability-matrix.md`, because "this property is structural
 * rather than enforced by a line" is a finding and not an absence.
 */

import { readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "src");

export interface MutantSpec {
  id: string;
  /** The file, relative to `src/`. */
  module: string;
  /** The exact text that must be there, or the mutant refuses to build. */
  from: string | readonly string[];
  to: string | readonly string[];
  /** Which invariant the removal is meant to break. */
  breaks: string;
  /**
   * True when the mutant is expected to change nothing.
   *
   * A mutant that bites nothing is usually a coverage finding rather than a
   * broken falsifier: the code it changes is not on any path a row takes.
   * Those are kept in the table and reported, because deleting them would hide
   * a gap, and keeping them under a false claim would invent a proof.
   */
  expectZeroBites?: boolean;
  /** Why, when `expectZeroBites` is set. */
  zeroBiteReason?: string;
}

const src = (m: string): string => join(SRC, m);

/**
 * The mutants. Each is one expression, and each is a defect that a real harness
 * has shipped at some point.
 */
export const MUTANTS: readonly MutantSpec[] = [
  {
    id: "M-ACCEPT",
    module: "adapters/artifact-verifier.ts",
    from: 'verdict: exit === 0 ? "VERIFIED" : "REJECTED"',
    to: 'verdict: "VERIFIED"',
    breaks: "the oracle: every artifact that ran at all is accepted",
  },
  {
    id: "M-REJECT-ALL",
    module: "adapters/artifact-verifier.ts",
    from: 'verdict: exit === 0 ? "VERIFIED" : "REJECTED"',
    to: 'verdict: "REJECTED"',
    breaks: "soundness of the accept path: correct work can never be accepted",
  },
  {
    id: "M-LIVE",
    module: "adapters/artifact-verifier.ts",
    from: "cwd: options.artifact.location",
    to: 'cwd: process.env.CUESHEET_LIVE_WORKSPACE ?? options.artifact.location',
    breaks: "ART-04: the check runs against whatever is on disk now",
  },
  {
    // The enforcement point is the caller's short-circuit, not `readCapture`.
    // Both check the digest, and the caller checks first, so mutating
    // `readCapture` alone would change nothing a row can observe. The
    // redundancy is deliberate defence in depth and it is recorded as a
    // zero-bite mutant in docs/reliability-matrix.md.
    id: "M-UNIDENTIFIED",
    module: "adapters/artifact-verifier.ts",
    from: 'if (readable.kind === "unavailable") {',
    to: 'if (false && readable.kind === "unavailable") {',
    breaks: "ART-06: the check runs against a capture it could not identify",
  },
  {
    id: "M-ABSENT-FAILED",
    module: "work.ts",
    from: 'outcome: "INCONCLUSIVE",\n        why: `no outcome receipt',
    to: 'outcome: "CONFIRMED_FAILED",\n        why: `no outcome receipt',
    breaks: "WRK-04: no receipt is read as a failed worker",
  },
  {
    id: "M-BOTH-ORDER",
    module: "work.ts",
    from: "if (hasFailure && hasResult) {",
    to: "if (false && hasFailure && hasResult) {",
    breaks: "WRK-06: a contradictory directory is read as if it were a verdict",
  },
  {
    id: "M-PENDING-FALSE",
    module: "state.ts",
    from: 'if (completeness !== "complete") {\n    return unknown(',
    to: 'if (completeness !== "complete") {\n    return seen(false);\n  }\n  if (false) {\n    return unknown(',
    breaks: "EFF-07: an unattested log is read as proof that nothing is in flight",
  },
  {
    id: "M-STALE",
    module: "core/store.ts",
    from: "if (this.revision !== expectedRevision) return null;",
    to: "",
    breaks: "CON-03: a decision committed against a revision that has moved",
  },
  {
    id: "M-EVIDENCE",
    module: "state.ts",
    from: [
      'const evidence = events.filter((e) => e.kind === "evidence");',
      'const claim = typeof e.data.claim === "string" ? e.data.claim : null;',
      'const source = typeof e.data.source === "string" ? e.data.source : null;',
    ],
    to: [
      'const evidence = events.filter((e) => e.kind === "evidence" || e.kind === "work_produced");',
      'const claim = typeof e.data.claim === "string" ? e.data.claim : typeof e.data.summary === "string" ? e.data.summary : null;',
      'const source = typeof e.data.source === "string" ? e.data.source : typeof e.data.effectId === "string" ? `worker ${e.data.effectId}` : null;',
    ],
    breaks: "the producer's account is promoted to a fact the fold calls proven",
  },
  {
    id: "M-READCAPTURE",
    module: "adapters/artifact-capture.ts",
    from: "if (digest !== artifact.digest) {",
    to: "if (false && digest !== artifact.digest) {",
    breaks: "ART-06, at the callee rather than the caller",
    expectZeroBites: true,
    zeroBiteReason:
      "readCapture already checks the digest and so does the caller that uses it, and the caller runs first. Removing the callee's check changes nothing observable, which is defence in depth rather than a hole. The property itself is falsified by M-UNIDENTIFIED, on the line that actually decides.",
  },
  {
    id: "M-VERIFY-PERMISSIVE",
    module: "verify.ts",
    from: 'verdict: artifact.artifactDigest === expected ? "VERIFIED" : "REJECTED"',
    to: 'verdict: "VERIFIED"',
    breaks: "VER-06 in the pure verifier",
    expectZeroBites: true,
    zeroBiteReason:
      "a coverage gap, and the reason this benchmark exists: Cuesheet has two ways to reach a verdict. runAgainstArtifact computes its own and never calls verify(), so no row in this matrix can observe verify() at all. Every row here measures the I/O path. Whether the two agree is unmeasured, and it should be.",
  },
];

const counter = { n: 0 };

/**
 * Where the mutated copies live, so they can be removed afterwards.
 *
 * Node has already read and compiled each one by the time `loadMutant`
 * resolves, so deleting the file does not unload the module. A run of this
 * matrix builds one temporary copy per mutant, and a benchmark that runs on
 * every commit should not leave a directory behind on every one of them.
 */
const STAGED = new Set<string>();

/**
 * Build and import one mutant.
 *
 * Returns the live module namespace. A mutant that cannot be built is an error
 * rather than a null, because a falsifier that is quietly missing is worse than
 * no falsifier: the row would be reported as unbreakable when in fact nobody
 * tried.
 */
export async function loadMutant(spec: MutantSpec): Promise<Record<string, unknown>> {
  const file = src(spec.module);
  const original = readFileSync(file, "utf8");
  const froms = typeof spec.from === "string" ? [spec.from] : spec.from;
  const tos = typeof spec.to === "string" ? [spec.to] : spec.to;
  if (froms.length !== tos.length) {
    throw new Error(`mutant ${spec.id}: ${froms.length} substitutions for ${tos.length} replacements`);
  }
  let code = original;
  froms.forEach((needle, i) => {
    if (!code.includes(needle)) {
      throw new Error(
        `mutant ${spec.id} did not apply: ${JSON.stringify(needle)} is not in ${spec.module}. ` +
          `The source moved, so this row's falsification is no longer being exercised.`,
      );
    }
    code = code.replace(needle, tos[i] as string);
  });

  // Point every relative import at the real module, so the mutant differs from
  // production in the substituted expression and in nothing else.
  code = code.replace(/from "(\.[^"]*)"/g, (_match, specifier: string) => {
    const absolute = resolve(dirname(file), specifier);
    return `from "${pathToFileURL(absolute).href}"`;
  });

  const dir = mkdtempSync(join(tmpdir(), "cuesheet-mutant-"));
  STAGED.add(dir);
  const name = spec.module.replace(/[/\\]/g, "_").replace(/\.ts$/, "");
  const target = join(dir, `${name}.ts`);
  writeFileSync(target, code);

  counter.n += 1;
  return import(`${pathToFileURL(target).href}?mutant=${counter.n}`) as Promise<
    Record<string, unknown>
  >;
}

/** Remove every staged copy. Returns how many it had to, for the leak guard. */
export function sweepMutants(): number {
  const n = STAGED.size;
  for (const dir of STAGED) rmSync(dir, { recursive: true, force: true });
  STAGED.clear();
  return n;
}

