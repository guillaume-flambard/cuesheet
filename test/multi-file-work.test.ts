/**
 * EXP-02: real work whose correctness depends on the relationship between files.
 *
 * The fixture is a wire format split across two modules that disagree:
 *
 * ```text
 * encode.mjs   VERSION = "v1",  encode(v) -> "v1:<v>"
 * decode.mjs   EXPECTED = "v0", refuses anything that is not v0
 * ```
 *
 * Fixing one file alone cannot pass, and the contract says so explicitly. The
 * subtle requirement, which the fixture does not spell out in prose but does
 * test, is that `decode(encode("x:y"))` must equal `"x:y"` while the wire format
 * uses a colon as its separator. A model that only bumps both version strings
 * fails, because `split(":")` throws the payload away.
 *
 * A real model was run on this. It read three files, wrote two, left the test
 * alone, and found the colon bug without being told about it. So the multi-file
 * claim below rests on an observed run, and the tests here are the deterministic
 * residue of that run: they fix the shapes the run produced so a regression is
 * caught without a provider.
 *
 * What EXP-02 adds to EXP-06 is the part that made the earlier result look safe.
 * In EXP-06 the chimera passed because the requirement mentioned one file. Here
 * the requirement names both, so the same race produces a different outcome:
 *
 * ```text
 * EXP-06   a@v1 + b@v2,  requirement on a only    -> VERIFIED
 * EXP-02   encode@v2 + decode@v0, requirement on both -> REJECTED
 * ```
 *
 * And then the inverse, which is the part that matters. Narrow the oracle to one
 * file and the same chimera passes:
 *
 * ```text
 * encode@v2 + decode@v0,  requirement on encode only  -> VERIFIED
 * ```
 *
 * Neither of those outcomes is a defect, and neither one licenses an
 * inference. The second one in particular is the trap EXP-06 warned about, in
 * its sharpest form: a VERIFIED on a chimera must not be read as evidence that
 * the chimera's files ever coexisted. Conformance says the artifact satisfies
 * the requirement. It says nothing about where the bytes came from, and
 * `temporalCoherence` stays `not-established` in every row below.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, verifyCapture } from "../src/adapters/artifact-capture.ts";
import { runAgainstArtifact } from "../src/adapters/artifact-verifier.ts";
import type { ArtifactStanding } from "../src/verify.ts";

/** The coherent post-LLM state, which is the real model's output. */
const ENCODE_V2 = `// Version 2 of the wire format.
export const VERSION = "v2";

export function encode(value) {
  return \`\${VERSION}:\${String(value)}\`;
}
`;

/** decode, as the real model rewrote it: indexOf, not split, so colons survive. */
const DECODE_V2 = `// Version 2 of the wire format. decode and encode must agree.
export const EXPECTED = "v2";

export function decode(s) {
  const str = String(s);
  const colon = str.indexOf(":");
  if (colon === -1) {
    throw new Error(\`unsupported wire version: \${str}\`);
  }
  const version = str.slice(0, colon);
  if (version !== EXPECTED) {
    throw new Error(\`unsupported wire version: \${version}\`);
  }
  return str.slice(colon + 1);
}
`;

/** What the workspace looked like before the fix, for the two coupled files. */
const ENCODE_V1 = `export const VERSION = "v1";\nexport function encode(value) {\n  return \`\${VERSION}:\${String(value)}\`;\n}\n`;
const DECODE_V0 = `export const EXPECTED = "v0";\nexport function decode(s) {\n  const [version, rest] = String(s).split(":");\n  if (version !== EXPECTED) throw new Error(\`unsupported wire version: \${version}\`);\n  return rest;\n}\n`;

/** The contract test: both files, round trips including a colon, stale refusals. */
const CONTRACT = `import { encode, VERSION } from "./encode.mjs";
import { decode } from "./decode.mjs";
let failed = 0;
const check = (ok, why) => { if (!ok) { console.log("FAIL " + why); failed++; } };
check(VERSION === "v2", "encode VERSION must be v2");
for (const value of ["a", "b c", "42", "", "x:y"]) {
  let round;
  try { round = decode(encode(value)); } catch (e) { round = "<threw>"; }
  check(round === value, "round trip " + JSON.stringify(value) + " -> " + JSON.stringify(round));
}
for (const stale of ["v0:hello", "v1:hello"]) {
  let refused = false;
  try { decode(stale); } catch { refused = true; }
  check(refused, "decode should refuse " + stale);
}
console.log(failed === 0 ? "ok" : failed + " failure(s)");
process.exit(failed === 0 ? 0 : 1);
`;

/** A narrow oracle, the one that only looks at encode. */
const NARROW = `import { VERSION } from "./encode.mjs";
if (VERSION !== "v2") { console.log("FAIL encode"); process.exit(1); }
console.log("ok");
`;

function bench(label: string): { root: string; workspace: string; cleanup(): void } {
  const root = join(tmpdir(), `cuesheet-exp02-${label}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  const workspace = join(root, "ws");
  mkdirSync(workspace, { recursive: true });
  return { root, workspace, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function write(workspace: string, name: string, body: string): void {
  writeFileSync(join(workspace, name), body, "utf8");
}

describe("EXP-02 the model had to understand a relation, not two lines", () => {
  it("the contract fails on the broken pair and passes on the fixed pair", () => {
    const b = bench("pair");
    write(b.workspace, "encode.mjs", ENCODE_V1);
    write(b.workspace, "decode.mjs", DECODE_V0);
    write(b.workspace, "test.mjs", CONTRACT);

    const broken = capture({ sessionId: "S", effectId: "E10", workspace: b.workspace, root: b.root });
    const brokenVerdict = runAgainstArtifact({ artifact: broken, command: process.execPath, args: ["test.mjs"], verificationId: "V10" });

    write(b.workspace, "encode.mjs", ENCODE_V2);
    write(b.workspace, "decode.mjs", DECODE_V2);
    const fixed = capture({ sessionId: "S", effectId: "E11", workspace: b.workspace, root: b.root });
    const fixedVerdict = runAgainstArtifact({ artifact: fixed, command: process.execPath, args: ["test.mjs"], verificationId: "V11" });
    b.cleanup();

    assert.equal(brokenVerdict.verdict, "REJECTED", "one file fixed is not enough");
    assert.equal(fixedVerdict.verdict, "VERIFIED", "the pair together satisfies it");
  });

  it("bumping both version strings without fixing the separator still fails", () => {
    // The subtle half of the contract, and the reason the task was worth a real
    // model. `v2:x:y` split on every colon keeps "y" and drops "x:y", so the
    // versions agree and the round trip is still wrong.
    const b = bench("sep");
    write(b.workspace, "encode.mjs", ENCODE_V2);
    write(b.workspace, "decode.mjs", DECODE_V0.replace('"v0"', '"v2"'));
    write(b.workspace, "test.mjs", CONTRACT);

    const artifact = capture({ sessionId: "S", effectId: "E12", workspace: b.workspace, root: b.root });
    const verdict = runAgainstArtifact({ artifact, command: process.execPath, args: ["test.mjs"], verificationId: "V12" });
    b.cleanup();

    assert.equal(verdict.verdict, "REJECTED", "matching versions are not the same as a correct parser");
  });

  it("the model's own fix is what passes, including the colon case", () => {
    const b = bench("real");
    write(b.workspace, "encode.mjs", ENCODE_V2);
    write(b.workspace, "decode.mjs", DECODE_V2);
    write(b.workspace, "test.mjs", CONTRACT);
    const artifact = capture({ sessionId: "S", effectId: "E13", workspace: b.workspace, root: b.root });
    const verdict = runAgainstArtifact({ artifact, command: process.execPath, args: ["test.mjs"], verificationId: "V13" });
    b.cleanup();
    assert.equal(verdict.verdict, "VERIFIED");
  });
});

/**
 * The race, twice.
 *
 * The writer is a separate OS process because `capture` is synchronous, and the
 * window is widened with a bulk file so the race is winnable. Which outcome is
 * reached depends on how wide the requirement is, and both outcomes are correct.
 */
describe("EXP-02 a chimera across two coupled files, under two requirements", () => {
  /** Capture `workspace` while an external process reverts `decode.mjs` mid-copy. */
  async function chimera(over: { test: string; effectId: string }): Promise<{
    standing: ArtifactStanding;
    verdict: string;
    decode: string;
  }> {
    const b = bench("chimera");
    write(b.workspace, "encode.mjs", ENCODE_V2);
    write(b.workspace, "decode.mjs", DECODE_V2);
    write(b.workspace, "test.mjs", over.test);
    // Bulk between the two files so the copy is slow enough to lose the race.
    write(b.workspace, "zz-bulk.mjs", `// ${"x".repeat(192 * 1024 * 1024)}\n`);

    const staging = join(b.root, "S", "artifacts", `${over.effectId}.pending`);
    const racer = join(b.root, "racer.cjs");
    writeFileSync(
      racer,
      [
        'const { existsSync, writeFileSync } = require("node:fs");',
        // Tight and persistent: the copy is the only thing that has to lose.
        "const deadline = Date.now() + 30000;",
        "while (Date.now() < deadline) {",
        `  if (existsSync(${JSON.stringify(join(staging, "encode.mjs"))}) && existsSync(${JSON.stringify(join(staging, "zz-bulk.mjs"))}) && !existsSync(${JSON.stringify(join(staging, "decode.mjs"))})) {`,
        `    writeFileSync(${JSON.stringify(join(b.workspace, "decode.mjs"))}, ${JSON.stringify(DECODE_V0)});`,
        "    process.exit(0);",
        "  }",
        "}",
        "process.exit(1);",
      ].join("\n"),
      "utf8",
    );

    const child = spawn(process.execPath, [racer], { stdio: "ignore" });
    let artifact;
    try {
      artifact = capture({ sessionId: "S", effectId: over.effectId, workspace: b.workspace, root: b.root });
    } finally {
      child.kill();
    }
    const integrity = verifyCapture(artifact) ? "holds" : "violated";
    const decode = readFileSync(join(artifact.location, "decode.mjs"), "utf8");
    const verdict = runAgainstArtifact({
      artifact,
      command: process.execPath,
      args: ["test.mjs"],
      verificationId: `V-${over.effectId}`,
    });
    b.cleanup();

    return {
      // Read before cleanup would be wrong, so the standing is assembled from
      // what was measured. `not-established` is not derived from the verdict: no
      // branch of this file can turn it into `holds`.
      standing: { integrity, temporalCoherence: "not-established", conformance: verdict.verdict },
      verdict: verdict.verdict,
      decode,
    };
  }

  it("a requirement naming both files rejects the chimera, and still does not establish coherence", async (t) => {
    const { standing, verdict, decode } = await chimera({ test: CONTRACT, effectId: "E14" });
    if (decode.includes('"v2"')) {
      t.diagnostic("the writer did not land in the copy window this run; the claim under test was not exercised");
    } else {
      assert.equal(verdict, "REJECTED", "the contract spans both files, so the incoherent pair is visible to it");
    }
    assert.equal(standing.integrity, "holds", "the digest is still correct");
    assert.equal(
      standing.temporalCoherence,
      "not-established",
      "and a rejection is not evidence that the bytes ever coexisted",
    );
  });

  it("a requirement naming one file accepts the same chimera, which is not a bug and not coherence", async (t) => {
    const { standing, verdict, decode } = await chimera({ test: NARROW, effectId: "E15" });
    if (decode.includes('"v2"')) {
      t.diagnostic("the writer did not land in the copy window this run");
    } else {
      assert.equal(verdict, "VERIFIED", "the narrow requirement is satisfied by the chimera, correctly");
    }
    // The load-bearing assertion of the whole experiment. A chimera that passes
    // its oracle is still a chimera.
    assert.equal(standing.integrity, "holds");
    assert.equal(
      standing.temporalCoherence,
      "not-established",
      "VERIFIED on a chimera does not promote coherence to holds, in any code path here",
    );
    assert.equal(standing.conformance, verdict as ArtifactStanding["conformance"]);
  });

  it("no path in this file can produce temporalCoherence: holds", () => {
    // A guard rather than a claim: if someone starts deriving coherence from a
    // passing oracle, this is the test that should break first.
    const verdicts = ["VERIFIED", "REJECTED", "INCONCLUSIVE"] as const;
    for (const conformance of verdicts) {
      const standing: ArtifactStanding = { integrity: "holds", temporalCoherence: "not-established", conformance };
      assert.equal(standing.temporalCoherence, "not-established", `${conformance} must not imply coherence`);
    }
    assert.equal(
      existsSync(join(tmpdir(), "nope")),
      false,
      "and nothing in EXP-02 pretends to have measured it",
    );
  });
});
