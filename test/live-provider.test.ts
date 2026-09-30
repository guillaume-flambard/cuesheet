/**
 * LIVE-01. One real model, one real path, run once on purpose.
 *
 * This is not an invariant. It is evidence, and the difference is the whole
 * point of this file.
 *
 * ```text
 * 443 automated deterministic tests   an invariant of the suite
 * this file, skipped by default       live evidence, zero or more runs
 * a manual PTY transcript            manual evidence
 * ```
 *
 * Three forms of evidence that are never mixed, because a deterministic proof
 * that has never touched a provider does not become a live result by being
 * listed next to one, and a live result does not become an invariant by being
 * run repeatedly. `docs/EVIDENCE.md` keeps the table that says which is which.
 *
 * ## What has been proven, and what has not
 *
 * P16 proved that an LLM can enter as an unreliable producer without gaining an
 * architectural privilege, using a scripted model and 23 deterministic tests. It
 * did NOT prove that a real provider, a real model and the real Cuesheet path
 * work together. Those are different claims and the first commit that blurs them
 * is the one that makes the ledger worthless.
 *
 * ## The four layers, kept apart
 *
 * ```text
 * REQUEST       what was asked
 * PRODUCER CLAIM what the model says about its own work
 * ARTIFACT      what it actually produced, hashed by the runtime
 * VERIFICATION  what an independent oracle establishes
 * ```
 *
 * A live run writes all four to one record so that a human can see which one
 * went wrong. The failure mode this guards against is not a crash: it is a run
 * where everything looks fine because the model's own summary of itself was read
 * as the outcome.
 *
 * ## Capability is granted, not inherited
 *
 * The child environment is built by naming. There is no `...process.env`, so the
 * provider credential reaches the run because the run asked for that credential
 * and nothing else, and the fixture workspace is the only project the model can
 * see. That is the same rule as `test/fixtures/hermetic-env.ts`, applied to a
 * run that costs money.
 *
 * ## Any outcome is a result
 *
 * ```text
 * origin=provider       the provider boundary failed, and we say so
 * origin=cuesheet       our own wiring failed, which is the interesting one
 * origin=world          the world refused
 * REJECTED with a boast the system survived a lying model
 * VERIFIED              the change was genuinely good
 * ```
 *
 * The only unacceptable outcome is a failure Cuesheet cannot attribute to a
 * boundary, because that is the one this whole project is for.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = process.cwd();

/** The one capability this file needs, granted explicitly or not at all. */
const LIVE_FLAG = "CUESHEET_LIVE_PROVIDER";
const KEY = "OPENROUTER_API_KEY";

const repoRoot = join(ROOT, "test", "fixtures", "repo");

/** The four layers, written side by side so a human can read one run. */
function record(parts: {
  request: string;
  claim: unknown;
  artifactDigest: string;
  verdict: string;
  failure?: { origin: string; step: string; why: string };
}): string {
  return [
    "=== LIVE-01 ===",
    `REQUEST       ${parts.request}`,
    `PRODUCER     ${typeof parts.claim === "string" ? parts.claim : JSON.stringify(parts.claim)}`,
    `ARTIFACT      ${parts.artifactDigest}`,
    `VERIFICATION  ${parts.verdict}`,
    parts.failure
      ? `ATTRIBUTION   origin=${parts.failure.origin} step=${parts.failure.step}\n              ${parts.failure.why}`
      : "ATTRIBUTION   (the run completed and the oracle judged the artifact)",
  ].join("\n");
}

/**
 * Read at call time, not at module load.
 *
 * `node:test` evaluates a `skip` option when the file loads, so a skip decided by
 * an environment variable read once at the top of the file cannot be turned on
 * from the same command line. Deciding inside the test body is the only shape
 * that lets one command authorise the run, and it means the skip decision is
 * visible in the output rather than baked into the source.
 */
const authorised = () => process.env[LIVE_FLAG] === "1" && Boolean(process.env[KEY]);

describe("LIVE-01: one real model, once, on purpose", () => {
  it("runs a real provider against the real path and keeps the four layers apart", (t) => {
    if (!authorised()) {
      t.skip(`set ${LIVE_FLAG}=1 with ${KEY} to run for real; skipped otherwise`);
      return;
    }

      const stage = mkdtempSync(join(tmpdir(), "cuesheet-live-"));
      const workspace = join(stage, "workspace");
      mkdirSync(workspace, { recursive: true });
      execFileSync("cp", ["-R", `${repoRoot}/.`, workspace]);

      // The fixture starts red, so a green verdict means something and a wrong
      // verdict is visible rather than vacuous. `spawnSync`, because the expected
      // state of a red fixture is a non-zero exit, and `execFileSync` throws on
      // it before the assertion can look at it. The first version used
      // `execFileSync` for this check and failed on the fixture being correct.
      const before = spawnSync(process.execPath, ["test.mjs"], { cwd: workspace, encoding: "utf8" });
      assert.equal(
        before.status,
        1,
        `the fixture must start red, got exit ${before.status}:\n${before.stdout}`,
      );

      // The driver is a real program so the credential reaches it by a name and
      // not by inheritance. Only four variables, and one of them is the key.
      const driver = join(stage, "live-driver.mjs");
      writeFileSync(
        driver,
        `import { produce } from ${JSON.stringify(join(ROOT, "src", "adapters", "llm-producer.ts"))};
         import { OpenRouterAdapter } from ${JSON.stringify(join(ROOT, "src", "adapters", "openrouter.ts"))};
         import { mintIdentity } from ${JSON.stringify(join(ROOT, "src", "spawn.ts"))};
         import { capture } from ${JSON.stringify(join(ROOT, "src", "adapters", "artifact-capture.ts"))};
         import { runAgainstArtifact } from ${JSON.stringify(join(ROOT, "src", "adapters", "artifact-verifier.ts"))};
         import { mkdirSync, readFileSync } from "node:fs";
         import { join } from "node:path";

         const [workspace, sessions, key] = process.argv.slice(2);
         const identity = mintIdentity("LIVE1");
         const effectDir = join(sessions, "effects", identity.effectId);
         mkdirSync(effectDir, { recursive: true });

         const report = await produce({
           workspace,
           effectDir,
           effectId: identity.effectId,
           nonce: identity.nonce,
           input: "The test file fails. Make it pass. Change the source, never the test.",
           adapter: new OpenRouterAdapter({ apiKey: key, model: process.env.CUESHEET_LIVE_MODEL ?? "anthropic/claude-sonnet-4-6" }),
           files: { "add.mjs": readFileSync(join(workspace, "add.mjs"), "utf8"),
                    "test.mjs": readFileSync(join(workspace, "test.mjs"), "utf8") },
         });

         const artifact = capture({ sessionId: "S", effectId: identity.effectId, workspace, root: sessions });
         const verdict = runAgainstArtifact({
           artifact, command: process.execPath, args: ["test.mjs"], verificationId: "LIVE1",
         });
         // The whole report, not a field of it: it is a union, so reading
         // \`report.claim\` yields undefined on the \`failed\` branch. A record that
         // prints "undefined" where the producer's account belongs is exactly
         // the gap this file exists to close.
         process.stdout.write("##REPORT##" + JSON.stringify({
           report, digest: artifact.digest, verdict: verdict.verdict, files: artifact.covers,
         }) + "##END##");
`,
      );

      const run = () =>
        execFileSync(process.execPath, [driver, workspace, join(stage, "sessions"), process.env[KEY]!], {
          cwd: stage,
          encoding: "utf8",
          // Named, not inherited. Four variables, and the credential is one of
          // them because this run asked for it.
          env: {
            PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
            HOME: stage,
            CUESHEET_SESSIONS: join(stage, "sessions"),
            NODE_NO_WARNINGS: "1",
            ...(process.env.CUESHEET_LIVE_MODEL ? { CUESHEET_LIVE_MODEL: process.env.CUESHEET_LIVE_MODEL } : {}),
          },
          timeout: 180_000,
        });

      let output: string;
      try {
        output = run();
      } catch (cause) {
        // A provider or runtime failure is a result, and the only unacceptable
        // one is a failure nobody can attribute. So it is attributed here.
        const text = String(cause);
        const origin = /OPENROUTER|429|401|402|rate limit|credits/i.test(text) ? "provider" : "cuesheet";
        console.log(
          record({
            request: "fix the failing test in a throwaway repo",
            claim: "(the producer never returned)",
            artifactDigest: "(none captured)",
            verdict: "INCONCLUSIVE",
            failure: { origin, step: "launch", why: text.slice(0, 400) },
          }),
        );
        throw cause;
      }

      const json = output.split("##REPORT##")[1]?.split("##END##")[0];
      assert.ok(json, `the driver produced no report:\n${output.slice(0, 600)}`);
      const parsed = JSON.parse(json) as {
        report:
          | { kind: "produced"; claim: string; discarded: string[]; applied: unknown[] }
          | { kind: "failed"; origin: "provider" | "producer"; why: string };
        digest: string;
        verdict: string;
        files: string[];
      };

      console.log(
        record({
          request: "fix the failing test in a throwaway repo",
          claim:
            parsed.report.kind === "produced"
              ? parsed.report.claim
              : `origin=${parsed.report.origin} :: ${parsed.report.why.slice(0, 400)}`,
          artifactDigest: parsed.digest,
          verdict: parsed.verdict,
        }),
      );

      // The only assertions that are invariants. Not the verdict: whatever the
      // model produced, Cuesheet's obligation is to have an artifact and an
      // oracle's answer about it, and to have both without having consulted the
      // model's own account.
      assert.ok(parsed.digest.length > 16, "the runtime hashed an artifact, whatever the model did");
      assert.ok(
        ["VERIFIED", "REJECTED", "INCONCLUSIVE"].includes(parsed.verdict),
        `the oracle returned a real verdict, got ${parsed.verdict}`,
      );
      assert.ok(parsed.files.includes("add.mjs"), "and the artifact names what it covers");
      // The model was shown both files, so it was never guessing blind, and the
      // test file is in the frame so a "fix" that edits the test is visible.
      assert.ok(
        parsed.files.includes("add.mjs") && parsed.files.includes("test.mjs"),
        "both source and test are in the frame",
      );
    },
  );
});
