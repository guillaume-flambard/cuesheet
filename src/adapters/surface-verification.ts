/** Owner-selected, self-contained Node check, pinned before the model runs. */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, renameSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { capture, type CapturedArtifact } from "./artifact-capture.ts";
import { runAgainstArtifactAsync } from "./artifact-verifier.ts";
import type { Verification } from "../verify.ts";

export interface CompletionResult {
  artifact: CapturedArtifact;
  verification: Verification;
  record: string;
  checkDigest: string;
}
export interface CompletionCheck {
  readonly pinned?: { script: string; digest: string };
  verify(workspace: string, effectId: string, signal?: AbortSignal): Promise<CompletionResult>;
}

export function createCompletionCheck(options: { script: string; root: string; timeoutMs?: number }): CompletionCheck {
  if (!realpathSync(options.script).endsWith(".mjs")) throw new Error("the declared check must be a self-contained .mjs script");
  const script = readFileSync(options.script);
  const checkDigest = createHash("sha256").update(script).digest("hex");
  mkdirSync(options.root, { recursive: true });
  const root = mkdtempSync(join(options.root, "check-"));
  const pinned = join(root, "oracle.mjs");
  writeFileSync(pinned, script, { flag: "wx", mode: 0o400 });
  let attempt = 0;
  return { pinned: { script: pinned, digest: checkDigest }, async verify(workspace, effectId, signal) {
    signal?.throwIfAborted();
    if (!/^[A-Za-z0-9_-]+$/.test(effectId)) throw new Error("invalid effect identity");
    const sessionId = `surface-${++attempt}`;
    const working = realpathSync(workspace);
    const storage = realpathSync(root);
    if (storage === working || storage.startsWith(working + "/")) {
      throw new Error("verification storage must be outside the working directory");
    }
    const artifact = capture({ sessionId, effectId, workspace: resolve(workspace), root });
    const target = { effectId, artifactDigest: artifact.digest };
    const intact = (): boolean => createHash("sha256").update(readFileSync(pinned)).digest("hex") === checkDigest;
    let verification: Verification;
    if (!intact()) {
      verification = { target, verdict: "INCONCLUSIVE", evidence: [{ kind: "actual_digest", value: "the declared check changed after admission" }] };
    } else {
      verification = await runAgainstArtifactAsync({ artifact, command: process.execPath, args: [pinned], verificationId: `V-${effectId}`, timeoutMs: options.timeoutMs, signal });
      if (!intact()) verification = { target, verdict: "INCONCLUSIVE", evidence: [{ kind: "actual_digest", value: "the declared check changed during verification" }] };
    }
    const record = join(root, `${sessionId}-${effectId}-${artifact.artifactId}.json`);
    writeFileSync(record + ".pending", JSON.stringify({ artifact, verification, checkDigest }, null, 2), { flag: "wx" });
    renameSync(record + ".pending", record);
    return { artifact, verification, record, checkDigest };
  } };
}
