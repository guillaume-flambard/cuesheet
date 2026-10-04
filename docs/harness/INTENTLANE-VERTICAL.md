# Sequential IntentLane vertical

Status: READY_FOR_MANUAL_ACCEPTANCE. Owner request supplied 2026-10-03. Scope: CUESHEET only; IntentLane is the real validation repository. Existing dirty work and wider product requirements are preserved. NOW.md states the mission and deferred vision.

## Model and acceptance

Natural request -> canonical repository binding -> current TerminalSession objective -> admitted scoped packet -> isolated Git workspace -> real OpenCode proposals and private durable effects -> controller supervision -> scoped candidate check -> controller integration -> independent source check -> current evidence verdict. Model text never supplies completion authority.

| Requirement / criterion | Required behavior | Evidence |
| --- | --- | --- |
| REQ-IV01 / AC-IV01 | One-page mission, IntentLane validation, deferred scope | NOW.md inspection |
| REQ-IV02 / AC-IV02 | Refusal, no launch, no delta, failed/exhausted/stale/cancelled work cannot prove success; uncertainty remains explicit | terminal-code-workers, code-worker-loop and agent-consultation regression tests; retained failed attempts |
| REQ-IV03 / AC-IV03 | One real OpenCode worker executes a useful scoped task, with observed progress and controller redirection | public-5 and public-6 journals; replay private supervision event rejects prose-only completion and the same worker proceeds |
| REQ-IV04 / AC-IV04 | Fresh checkout repeats the task with equivalent accepted result and preserved Git | public-5/audit.json, public-6/audit.json, final-audit.json |
| REQ-IV05 / AC-IV05 | Public terminal resolves, creates packet, delegates, integrates and verifies the natural request without human orchestration | public-run.mjs drives only PTY input; manualSteering=false in both audits |
| REQ-IV06 / AC-IV06 | Explicit canonical project name outranks weak token siblings; multiple explicit names remain ambiguous, missing explicit target never selects a sibling | project-binding tests and public runs |
| REQ-IV07 / AC-IV07 | Owner absolute registry override enables fresh public replay, with current scoped pinned proof and required regression checks | scope-runtime tests, installed Linux proof, Docker ownership and capsule proof tests |

## Finite work graph

Every DONE below refers only to this scoped graph and has the evidence named here. Product delivery remains subject to human acceptance.

| Task | Depends on | Status | Proof |
| --- | --- | --- | --- |
| IV01 Mission | none | DONE | NOW.md |
| IV02 Delegation verdicts, consultations, no-delta guard | IV01 | DONE | full-final.log; verdict/refusal/no-change regression cases |
| IV03 Real task, oracle, canonical binding | IV02 | DONE | owner.mjs; run-3/4 baseline REJECTED; project-binding tests |
| IV04 Supervision, child responsibility, scoped candidate stopping | IV03 | DONE | public-5/6 worker journals; candidate rejected/uncertain/cancelled and end-to-end integration tests |
| IV05 Fresh replay, independent source proof and Git preservation | IV04 | DONE | public-5/6 audits and identical .gitignore bytes/digest |
| IV06 Natural public journey, owner registry and packet guidance | IV05 | DONE | public-5/6 terminal/events/audits; invalid schema no-launch test |
| IV07 Adversarial verification, fixture accuracy, closure | IV06 | DONE | final-audit.json, full-final.log, Docker logs, capsule-proof-retry.log and final source/state inspection |

Discovery repairs are included in their parent task: failed batches returning zero and prose-only contributions (IV02); IntentLane colliding with pilots (IV03); child receiving controller responsibilities and continuing after accepted change (IV04); opaque malformed slug rejection and private registry replay (IV06); interrupted-recovery fixture lacking a delta and static obsolete 32-diagnostic assertions (IV07). No task is silently removed or left implied.

## Real task and oracle

Add exactly one `pilots/*/.build/` rule to IntentLane .gitignore, preserving every existing line. The actual NetNewsWire reproduce script emits that directory. Pilot sources, README and non-pilot build directories stay visible. Read IntentLane instructions and the existing add-asri-adapter-templates OpenSpec proposal/design/spec/tasks before choosing the trivial change. No Apple code, dependencies or human Siri observations change.

Owner oracle was pinned before inference. It checks old contents byte for byte and positive/negative `git check-ignore` cases in a separate temporary repository because frozen artifacts exclude Git metadata. Sources also pass `git diff --check`. Apple compilation/tests are N/A for this ignore-only delta. The worker cannot replace the check. Candidate proof stops only a single worker with a current scoped delta; it does not close the goal. Integration checks and the fresh source check still run independently.

## Evidence and reproduction

Report root: `/Users/memo/projects/_reports/cuesheet-intentlane-vertical-2026-10-03`.

- `public-5/audit.json`: public journey, one worker, no manual steering, 61.799 seconds, unchanged HEAD/index, only .gitignore changed.
- `public-6/audit.json`: same request from a fresh clone, 85.398 seconds, actual no-delta redirection, same preservation and independent verification.
- Both source verification digests: `9744e01450b58bdf478522b8d259cdf6114c453a6ab73adf0d11c09d4b2fa0f2`. Final .gitignore SHA256: `72613a451211b067580f6b02143c2dd992e7f1eab621c671f1b94f6815e34e81`.
- `primary-before.json` and `primary-final.json`: primary IntentLane HEAD/status/full binary diff unchanged. Human dirty work remains intact. No commit, staging, push or deployment.
- `run-3` and `run-4`: direct API checks, supplementary only; never substituted for the public journey.
- `run-1`, `public-1` through `public-4`: retained failures. Provider proposals may still fail or exhaust; the runtime refuses to certify them.
- `full-final.log`: 1043 tests, 1027 pass, zero failures, 16 conditional skips. `docker-final.log`: 14/14. `worker-docker-final.log`: 7/7. `installed-linux-final.log`: 1/1. Isolated capsule build/full tests and protection checks: `capsule-proof-retry.log`, 6/6, zero skips. The first capsule attempt failed on the historical 32-diagnostic assertion, was retained in `capsule-proof-final.log`, and passed after comparing actual diagnostic signatures instead.
- Build emits successfully with 25 inherited TypeScript diagnostics, no diagnostics in this change's production files. Strict typecheck is not claimed green. Capsule tests compare diagnostic signatures against the current host build rather than a historical count.

Reproduction: build CUESHEET, then `rtk node /Users/memo/projects/_reports/cuesheet-intentlane-vertical-2026-10-03/public-run.mjs <unused-number>`. It clones the actual IntentLane HEAD, supplies only the saved natural request through the production terminal PTY, uses a private registry and verifies scope/Git/oracle. Requires the installed authenticated OpenCode 1.18.34, model `opencode-go/gpt-5.6-luna` and the existing Docker socket/image recorded in the script. Oracle bytes and check digest are retained. Provider success is not deterministic; failed replay remains failed. No new workflow, proof engine or model route was introduced.

Official references consulted: https://opencode.ai/docs/cli/ ; https://opencode.ai/docs/permissions/ ; https://git-scm.com/docs/gitignore ; https://git-scm.com/docs/git-check-ignore . Installed help and running code govern behavior.

## Risks, coverage and remaining work

No critical/high scope risk remains after the two real public proofs. Medium limitations: provider variability can fail closed; strict typecheck has inherited diagnostics outside this change. Existing dirty CUESHEET work prevents attributing the whole working-tree diff to this request; only the listed runtime/adapters/tests/NOW/task/state additions belong here. Main IntentLane stays unchanged; accepted validation patches live in the fresh clones.

Verified categories: success/refusal/error/empty paths, cancellation and live revision, persistence/recovery, retries/replay, Git/data integrity, scoped tools, oracle pinning and mutation rejection, network/container failures, observability, regression/build/installed compatibility. Existing parallel compatibility tests remain; no new parallelism. N/A: UI redesign, accessibility changes, migrations, deployment, Apple product code and human observations. Deferred vision is not counted as completed.

DISCOVER, MODEL, SPECIFY, DECOMPOSE, IMPLEMENT, VERIFY and CLOSE are recorded by the task/oracle, finite graph, runtime changes and independent evidence above. All seven scoped criteria are verified, with no open P0/P1 or critical/high risk in this graph. Remaining work is human acceptance of this scoped delivery. The wider canonical backlog remains IMPLEMENTING. READY_FOR_MANUAL_ACCEPTANCE does not claim that the full product vision is delivered.
