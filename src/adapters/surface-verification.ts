/** Owner-selected, self-contained Node check, pinned before the model runs. */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, renameSync, realpathSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { capture, type CapturedArtifact } from "./artifact-capture.ts";
import { runAgainstArtifactAsync } from "./artifact-verifier.ts";
import {capsuleCheckProfile,runCapsuleCheck} from "./capsule-verification.ts";
import type { Verification } from "../verify.ts";

export interface CompletionResult {
  artifact: CapturedArtifact;
  verification: Verification;
  record: string;
  checkDigest: string;
}
export interface CompletionCheck {
  readonly pinned?: { script: string; digest: string };
  /** Read only a bounded private diagnostic belonging to this check instance. */
  readDiagnostic?(record: string): readonly string[];
  verify(workspace: string, effectId: string, signal?: AbortSignal): Promise<CompletionResult>;
}

export function createCompletionCheck(options: { script: string; root: string; timeoutMs?: number; containerSocket?:string }): CompletionCheck {
  if (!realpathSync(options.script).endsWith(".mjs")) throw new Error("the declared check must be a self-contained .mjs script");
  const script = readFileSync(options.script);
  const profile=capsuleCheckProfile(script);
  if(profile&&!options.containerSocket)throw Error("Owner capsule check requires a declared local container socket.");
  const checkDigest = createHash("sha256").update(script).digest("hex");
  mkdirSync(options.root, { recursive: true });
  const root = mkdtempSync(join(options.root, "check-"));
  const pinned = join(root, "oracle.mjs");
  writeFileSync(pinned, script, { flag: "wx", mode: 0o400 });
  let attempt = 0;
  return { pinned: { script: pinned, digest: checkDigest },
    readDiagnostic(record) {
      // Records must be from this private check directory and use the runtime-generated name.
      if (typeof record !== "string" || !/^[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]+-A-[a-f0-9]{16}\.json$/.test(record.split("/").at(-1) ?? "")) return [];
      const candidate = resolve(record);
      if (resolve(candidate, "..") !== root) return [];
      const path = candidate.slice(0,-5)+".diagnostic.txt";
      try {
        const st=lstatSync(path);
        if (!st.isFile() || st.isSymbolicLink() || st.size>4096) return [];
        if (process.platform!=="win32" && (st.mode & 0o077)!==0) return [];
        const data=readFileSync(path,{encoding:"utf8",flag:"r"}).slice(0,4096);
        return data.trimEnd().split("\n").slice(0,70);
      } catch { return []; }
    },
    async verify(workspace, effectId, signal) {
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
      verification = profile ? await runCapsuleCheck({artifact,script,profile,socket:options.containerSocket!,root,checkDigest,timeoutMs:options.timeoutMs,signal}) : await runAgainstArtifactAsync({ artifact, command: process.execPath, args: [pinned], verificationId: `V-${effectId}`, timeoutMs: options.timeoutMs, signal });
      if (!intact()) verification = { target, verdict: "INCONCLUSIVE", evidence: [{ kind: "actual_digest", value: "the declared check changed during verification" }] };
    }
    // Keep potentially sensitive check output out of append-only events and receipts.
    const diagnostics = verification.evidence.filter(e=>e.kind==="check_output").map(e=>e.value).join("\n").slice(0,4096);
    verification={...verification,evidence:verification.evidence.filter(e=>e.kind!=="check_output")};
    if(diagnostics) writeFileSync(join(root,sessionId+"-"+effectId+"-"+artifact.artifactId+".diagnostic.txt"),diagnostics,{flag:"wx",mode:0o600});
    const record = join(root, `${sessionId}-${effectId}-${artifact.artifactId}.json`);
    writeFileSync(record + ".pending", JSON.stringify({ artifact, verification, checkDigest }, null, 2), { flag: "wx" });
    renameSync(record + ".pending", record);
    return { artifact, verification, record, checkDigest };
  } };
}
