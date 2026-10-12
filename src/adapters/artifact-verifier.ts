/**
 * The independent check, run against a frozen artifact and nothing else.
 *
 * P14's verifier was declarative: it compared a digest against a requirement
 * and needed no world. That was sufficient for a worker whose whole output was a
 * string, and it stops being sufficient the moment a worker edits code, because
 * deciding whether a change is correct means running something.
 *
 * So the I/O lives here rather than in `verify.ts`, which stays pure. The split
 * matters more than the placement: the verdict is computed from data by one
 * module and the world is touched by another, so a reader can tell at a glance
 * which decisions were made by inspection and which needed the machine.
 *
 * Two things this module will not do:
 *
 * - It does not accept a working directory as an argument. There is no parameter
 *   through which a caller could hand it the live workspace, so "verify what is
 *   there now" is not a call this API can express. That is ART-03 enforced by
 *   the shape rather than by a review.
 * - It does not treat a non-zero exit as a rejected artifact without saying so.
 *   A runner that dies for its own reasons is not evidence about the work, and
 *   an oracle that reports its own crash as the work's failure is worse than no
 *   oracle.
 */

import { spawn, spawnSync } from "node:child_process";

import { readCapture, type CapturedArtifact } from "./artifact-capture.ts";
import { describeVerification, type Verification, type VerificationEvidence } from "../verify.ts";

export interface RunOptions {
  /** The frozen artifact. Its `location` is the only directory used. */
  artifact: CapturedArtifact;
  /** The program to run, with args, inside the capture. */
  command: string;
  args: string[];
  /** Ceiling on the run, so a hanging test cannot hang a session. */
  timeoutMs?: number;
  /** A stable id for this verification, for the record. */
  verificationId: string;
  signal?: AbortSignal;
}

/**
 * Run the check against the capture.
 *
 * ART-04 is the property this exists to hold: the live workspace can be changed
 * in any way after the capture, and the verdict will not move, because the
 * process is started with its working directory set to `artifact.location` and
 * nothing else is passed to it.
 */
export function runAgainstArtifact(options: RunOptions): Verification {
  const target = { effectId: options.artifact.producerEffectId, artifactDigest: options.artifact.digest };
  const evidence: VerificationEvidence[] = [
    { kind: "target_digest", value: options.artifact.digest },
  ];

  // ART-06, first and short-circuiting: if the artifact cannot be established,
  // no verdict is possible, and "not established" is not "wrong".
  const readable = readCapture(options.artifact);
  if (readable.kind === "unavailable") {
    return {
      target,
      verdict: "INCONCLUSIVE",
      evidence: [...evidence, { kind: "actual_digest", value: readable.why }],
    };
  }

  const result = spawnSync(options.command, options.args, {
    cwd: options.artifact.location,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 30_000,
  });

  return verdictFromResult(options, result);
}

function verdictFromResult(options: RunOptions, result: { status: number | null; signal: string | null; error?: Error }): Verification {
  const target = { effectId: options.artifact.producerEffectId, artifactDigest: options.artifact.digest };
  const evidence: VerificationEvidence[] = [{ kind: "target_digest", value: options.artifact.digest }];
  // A runner that could not be started, or that was killed, tells us nothing
  // about the work. INCONCLUSIVE again, and the reason is in the evidence.
  if (result.error) {
    return {
      target,
      verdict: "INCONCLUSIVE",
      evidence: [...evidence, { kind: "actual_digest", value: `runner failed: ${result.error.message}` }],
    };
  }
  if (result.signal) {
    return {
      target,
      verdict: "INCONCLUSIVE",
      evidence: [...evidence, { kind: "actual_digest", value: `runner stopped on ${result.signal}` }],
    };
  }

  const exit = result.status ?? -1;
  return {
    target,
    verdict: exit === 0 ? "VERIFIED" : "REJECTED",
    evidence: [
      ...evidence,
      {
        kind: "actual_digest",
        value: `exit ${exit} running ${options.command} in ${options.artifact.artifactId}`,
      },
    ],
  };
}

/** Bounded diagnostic output. Never use text as evidence of success. */
function safeCheckOutput(raw: string): string {
  return raw
    .replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g,"")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g,"�")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,})\b/g,"[REDACTED]")
    .replace(/((?:token|password|secret|api[_-]?key)\s*[:=]\s*)[^\s]+/gi,"$1[REDACTED]")
    .slice(0,4096);
}
/** The terminal uses the same verdict rules without blocking its composer. */
export async function runAgainstArtifactAsync(options: RunOptions): Promise<Verification> {
  const readable = readCapture(options.artifact);
  if (readable.kind === "unavailable") {
    return { target: { effectId: options.artifact.producerEffectId, artifactDigest: options.artifact.digest }, verdict: "INCONCLUSIVE", evidence: [{ kind: "actual_digest", value: readable.why }] };
  }
  const result = await new Promise<{ status: number | null; signal: string | null; error?: Error; output: string }>((settle) => {
    let stdout = "", stderr = "";
    const collectOut=(chunk:Buffer)=>{if(stdout.length<8192)stdout+=chunk.toString("utf8").slice(0,8192-stdout.length);};
    const collectErr=(chunk:Buffer)=>{if(stderr.length<4096)stderr+=chunk.toString("utf8").slice(0,4096-stderr.length);};
    const output=()=>stderr ? stderr+"\n"+stdout : stdout;
    const child = spawn(options.command, options.args, {
      cwd: options.artifact.location, stdio: ["ignore","pipe","pipe"], env: { PATH: process.env.PATH ?? "" },
      signal: options.signal, killSignal: "SIGKILL",
    });
    child.stdout?.on("data",collectOut); child.stderr?.on("data",collectErr);
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 30_000);
    child.on("error", (error) => { clearTimeout(timer); settle({ status: null, signal: null, error, output:output() }); });
    child.on("close", (status, signal) => { clearTimeout(timer); settle({ status, signal, output:output() }); });
  });
  const after = readCapture(options.artifact);
  if (after.kind === "unavailable") {
    return { target: { effectId: options.artifact.producerEffectId, artifactDigest: options.artifact.digest }, verdict: "INCONCLUSIVE", evidence: [{ kind: "actual_digest", value: after.why }] };
  }
  const verdict=verdictFromResult(options,result);
  const excerpt=safeCheckOutput(result.output);
  return excerpt ? {...verdict,evidence:[...verdict.evidence,{kind:"check_output",value:excerpt}]} : verdict;
}

/** A sentence for a surface, reusing the shared wording. */
export const describeRun = describeVerification;
