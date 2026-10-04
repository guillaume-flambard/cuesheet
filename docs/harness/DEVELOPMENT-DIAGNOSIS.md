# Development diagnosis and usable selfhost priority

Status: DISCOVERY. Owner reports that execution, interface/history and recovery all obstruct replacing OpenCode with CUESHEET, and that effort has produced too little usable outcome. This changes the acceptance priority: ordinary development inside CUESHEET is the gate. The preceding ignore-only success is valid scoped evidence, not acceptance of that gate. Rust/Ratatui was discussed, not authorized as a rewrite.

## Measured reproduction

Public terminal, actual IntentLane HEAD, natural bounded two-file code task, real OpenCode Go/GPT-5.6-Luna, correction through live terminal input and explicit renewal of the unchanged pinned oracle. Final driver failure is retained. 143.929 seconds, 142 controller events, 18 controller steps, no applied integration and no work_verified. Source task is still unimplemented. Baseline independent behavioral oracle correctly rejects it.

Evidence: /Users/memo/projects/_reports/cuesheet-intentlane-code-2026-10-03/public-1/events.json, terminal.ansi, failure.json and private journals. The fixture is not a completed product task or human acceptance.

Observed sequence: objective create5 -> correction29 -> check renewal35. Worker tool intent7 (rg inspection) has a container admission/cleanup, but no confirmed private tool receipt after cancellation. Parent run_code_workers33 returns null and leaves intent22 uncertain. Recovery41 says private admission was missing, though admitted27 existed: it examines only the latest worker state, which is uncertain31. Reconciliation attempts and new delegation are refused; coordinator spends the remaining work on technical recovery.

Do not claim the cancelled invocation never launched: container intent7 was admitted. Whether it completed is unconfirmed. Safety must remain conservative for possible mutations. The defect is the missing usable recovery path and misleading diagnosis, not proof that uncertain effects can be silently ignored.

## Findings and confidence

1. Proven user-flow defect: normal live correction can end in an unresolved parent effect and no usable continuation. Test corrections reached workers, but did not prove subsequent completion of the revised public task.
2. Proven diagnostic defect: recovery treats the latest failed/cancelled/uncertain state as absence of an earlier valid admission. Provenance and current execution state are conflated.
3. Proven coverage gap: previous installed proofs used fixture transport or repeated resumes/models/API orchestration; SELFHOST.md and SEMANTIC-LIVE-STEERING.md explicitly retain these limitations. Green component checks do not establish ordinary replacement usability.
4. Architectural hypothesis, not established root cause: repeated model proposals, orchestration/recovery vocabulary and a broad coordinator responsibility may explain low useful output. Measure the loop against a simpler sequential baseline before adding another abstraction or rewriting it in Rust.

Evidence of breadth, not a causal proof: producer/index.ts is1045 lines,58 adapter entries,128 test entries,66 harness entries, state.json10189 lines at inspection. Numbers alone cannot prove bad design. No claim is made about total engineering time/cost without logs measuring it.

## Bounded recovery plan

US01: one ordinary public request in a representative CUESHEET dirty checkout can read relevant files, change a module/test, execute project checks and yield a verified local diff. No human worker packet, model-switch workaround or technical reconciliation sequence as the normal path.
US02: a functional correction during reading, inference or execution cancels old authority, preserves evidence, clearly separates cancellation from possible unconfirmed mutation, and offers safe continuation to the revised result. No obsolete contribution integrates.
US03: history shows the request, current instruction, actual change/test status and actionable failure/recovery in terms a developer can use. It must not merely expose implementation journals. Interface defects require an observed scenario and the existing design direction; no cosmetic rewrite.
US04: crash/reload resumes the same current task without duplicating uncertain effects or losing source edits. The public installed journey, including source integrity and check binding, is the acceptance oracle.

Finite graph:
- US-AUDIT P0 DONE: measured failed public correction above and source-level recovery inspection.
- US-RECOVERY P0 TODO: separate admission provenance from latest status, specify safe cancelled/uncertain continuation, regression for actual revised public completion. Depends US-AUDIT.
- US-SELFHOST P0 TODO: real representative CUESHEET code/test task from public terminal, including a correction and replay. Depends US-RECOVERY.
- US-LEGIBILITY P1 TODO: assess and repair observed history/error/recovery friction on that journey. Depends US-SELFHOST.
- US-CLOSE P1 TODO: independently falsify all four criteria, verify required regressions, document shortest manual acceptance. Depends all above.

No implementation is claimed from this audit. High risks remain: revised task continuation and usable installed selfhost unverified. The pending IntentLane code vertical remains a reproducer/validation task, not dropped or marked done. Its baseline and failure are retained; implementation/replay await this recovery path. Previous source changes and work remain preserved. No commit, push, deployment or rewrite.

Acceptance metrics for further work: successful real task, functional correction followed to completion, restart followed to completion, understandable failure/recovery, preserved Git and verified tests. Component-test count and document count are not product-progress metrics. No new features, parallelism or technology migration enters this critical path without addressing that journey.

## Recovery admission correction, bounded scope

RA01: inspection must use the latest worker state while recognizing an earlier attested admission in the same batch. A later uncertain/cancelled/failed state must not erase admission provenance.
RA02: shared provenance mismatch, stale objective, private uncertain effects and live writers remain refusals; inspection performs no mutation or replay.
Acceptance: append uncertain after a real admitted worker, inspect the real private journal, retain effect-uncertain; a revised objective returns stale; tampered latest provenance stays blocked. Existing durable-proposal recovery/integration remains valid.
Map: controller admission + latest shared state -> physical worktree -> private effect receipts -> recovery report. No UI, schema, permission, deployment or network changes. Local compatibility and data integrity are applicable; accessibility, caching and migration are N/A because no input/render/storage format changes. Risk: accidentally admitting untrusted latest state, mitigated by existing exact provenance checks and regression.
Finite work: RA-SPEC DONE (this section); RA-FIX IN_PROGRESS (recovery inspector); RA-VERIFY TODO (targeted recovery suite and adverse latest provenance); RA-CLOSE TODO (record evidence). Broader US-RECOVERY remains open until revised public continuation succeeds.

Evidence RA-EV01: `node --test test/code-worker-recovery.test.ts` PASS, 3 tests, 0 failures, 8.118 seconds. Real process killed after file write before receipt; later uncertain projection retains attested admission, reports one uncertain effect, stale revision refuses, forged latest workspace refuses. Existing crash-before-publication, exclusive claim, corrupt journal, owner rejection and ordinary integration also pass.
Evidence RA-EV02: `node --test test/terminal-code-workers.test.ts` PASS, 18 tests, 0 failures, 29.582 seconds. In-flight correction/model-change, uncertain-journal rejection, source drift, scope rejection, failures and pinned candidate integration guards preserved.
RA-FIX DONE; RA-VERIFY DONE; RA-CLOSE DONE for the admission diagnostic slice only. Inspection remains read-only, latest shared provenance is still checked against controller admission, and reconciliation still refuses uncertain phases. No claim of safe automatic continuation or public selfhost acceptance. Broader US-RECOVERY remains IN_PROGRESS.

## Confirmed receipt at cancellation boundary

RC01: when a tool returns a confirmed integer status during cancellation, persist its receipt before throwing the cancellation. This records execution evidence without accepting an obsolete proposal. Null statuses and thrown executors remain uncertain.
RC02: cancellation still prevents another effect and goal closure. Verify the real durable producer with a tool that cancels the producer before returning a confirmed result, repeat with null and thrown result.
Map: public producer -> executeTool -> private/durable tool result -> completion receipt -> cancellation boundary. Local additive journal compatibility, concurrency, cancellation, integrity and diagnostics apply; no UI/network/auth/deployment change. Risk: mistake obsolete evidence for acceptance, mitigated by unchanged abort and finish guards.
Finite graph: RC-SPEC DONE; RC-FIX IN_PROGRESS; RC-VERIFY TODO (producer cancellation regression plus steering/worker regressions); RC-CLOSE TODO. This is a required US-RECOVERY subtask; no whole-product acceptance follows from it.

Owner daily-product scope clarified in voice: model choice, multiple useful agents, dynamic skills/roles, natural intent/project binding, safe self-development and a polished terminal. Reuse existing master specs and capabilities. The immediate dependency remains safe correction/recovery; green component checks do not close daily usability.

RC-EV01: recovery + code-worker-loop + mid-run-directive suites PASS, 33 tests / 0 failures, 8.157 seconds. The first regression initially failed because the external executor cancellation race discarded the result before the outer receipt boundary. The fix now attaches receipt capture to executor settlement, retains journal writer ownership checks, and leaves late authority revoked.
RC-EV02: cancellation-only adversarial run PASS, 4 tests / 0 failures, 0.825 seconds. Immediate confirmed and delayed confirmed results publish exactly one linked receipt; null and thrown results remain uncertain. Cancelled work never verifies the objective or invokes another tool. RC-FIX DONE; RC-VERIFY IN_PROGRESS pending shipped build; RC-CLOSE TODO.

RC-EV03: shipped `bash scripts/build.sh` PASS. Compiler reports the same 25 existing diagnostics as the previous shipped build; strict typecheck remains non-green and is not claimed. Terminal bundle and dispatcher validation pass. RC-FIX DONE; RC-VERIFY DONE for this receipt scope; RC-CLOSE DONE. The command shim executes this checkout and the shipped surface bundle was regenerated, so the cancellation fix is available to ordinary launches. No claim of a verified public revised-task completion.
Remaining US-RECOVERY blocker: genuinely uncertain private effects and obsolete preserved batches still lack a safe usable continuation. A confirmed receipt now survives cancellation, but cannot turn unconfirmed writes into success. Model/agent/skill and multi-project daily acceptance, installed self-development and owner visual acceptance remain open.

## Ordinary self-development, restart 2026-10-03

Owner asks for execution of the first usable self-development journey. Bounded task: fix the observed ordinary command refusal `cuesheet --provider opencode --model ID` while preserving named commands and help. Public installed terminal receives a natural request, actual model produces the source change, existing isolated integration and independently pinned owner check verify it. No direct controller work packet or model substitution is considered ordinary success. Existing dirty work, HEAD and index must be preserved.

REQ-DU01: ordinary root provider/model flags launch the same surface as the explicit surface command; unknown flags still refuse. REQ-DU02: a natural request from the installed terminal yields the bounded source change and current independent evidence. REQ-DU03: source/index unchanged outside that change; interactive input and model choice remain available. Acceptance is the owner check executed on candidate and source plus review of real journal, diff and PTY output. A read-only or generated-only response fails.

Finite graph DU-DISCOVER DONE: root model flag refusal reproduced; explicit surface invocation through a piped stdout refuses correctly. DU-RUN IN_PROGRESS: actual installed PTY with configured model and independent check. DU-REVIEW TODO depends DU-RUN. DU-CLOSE TODO depends DU-REVIEW. Security, model/network, source integrity, recovery, integration, keyboard/terminal rendering, packaging and error compatibility apply; no new deployment, account, schema or migration. Public completion and native terminal visual inspection remain open; prior native app access denial is not bypassed.

DU-RUN observed failure: GLM performs four reading inferences in 240 seconds with no change; same journal was explicitly reopened with Luna via the public Resume action. An actual code worker then fails before any inference because the parent frame was compacted to its ceiling before child instructions, skills and history were appended. A ready batch with no contribution remains pending and triggers repeated refusals. Native terminal visual access remains denied; PTY functional evidence is not claimed as native visual acceptance.

REQ-DU04: compile the complete worker frame, including packet/skills/private observations, before applying the shared-context ceiling. Preserve all human directives and bounded tool authority. Never increase the owner's ceiling as a workaround. AC-DU04: an oversized optional observation is omitted with provenance, the real worker inference receives its task and human constraint within the ceiling; oversized authoritative data still refuses. DU-FRAME P0 IN_PROGRESS -> DU-FRAME-VERIFY P0 TODO -> new ordinary public run on the corrected runtime. The optional frame-finalizer is controller-owned, never model input; no storage or permissions change. Recovery of earlier failed nested batches remains open, not silently discarded.

REQ-DU05: tool preflight refusal before container creation must return a definite nonexecution status, never uncertain mutation. Local text file/directory observations must use the existing scoped native research reader rather than mount an entire dependency-heavy source tree. Path canonicalization, excluded secrets, bounded output and source-only scope remain enforced. AC-DU05: hardlinked dependency preflight returns126 with no create attempt; scoped cat and simple ls succeed without Docker, excluded/outside paths refuse. Native scoped reads do not start code work or weaken mutation isolation. DU-READ P0 IN_PROGRESS, DU-READ-VERIFY P0 TODO, real replay remains required. Second public run exposed an uncertain git preflight result that blocks later mutation; it was stopped without source changes.

REQ-DU06: a prose-only first worker response with an unchanged workspace is an unverified proposal to redirect, not an uncertain code effect. The candidate observer must return false on an unchanged captured snapshot before asking for a nonempty integration plan. AC-DU06: a pinned-check worker first emits prose, then edits its declared file; the same worker reaches candidate proof, controller integration and source proof, preserving human/index state. Fourth real run exposes the empty-delta integration plan throwing before any private tool effect; the controller incorrectly labels it uncertain. DU-EMPTY P0 IN_PROGRESS -> DU-EMPTY-VERIFY P0 TODO -> public rerun. The immutable source oracle is now a capsule check; its own candidate preflight passes the previous real edited candidate. An oracle `version` command assertion was corrected to the explicitly requested `--version` before admission; historical failed check retained.


DU07, observed installed fifth run: one-file worker edit succeeded in its private workspace but candidate inspection refused with `Integration exceeds100 paths`. The planner counted inherited dirty source paths before comparing source and result. Change: retain bounded inspection (1000 paths, 32 MiB) while applying the existing integration limit (100 new delta files, 4 MiB) to actual differences only. Acceptance: 110 inherited dirty files survive a one-file integration, and 101 actual changes still refuse. Fifth run did not finish or integrate; preserved report: `/Users/memo/projects/_reports/cuesheet-daily-2026-10-03/fifth-1`.


DU public sixth replay succeeded: actual installed shim, PTY, real opencode-go/gpt-5.6-luna, natural request, private code worker, pinned candidate check, one-file integration, independent source finish. Parent journal `t-1c754e50-4196-4f42-acf9-ae2eee79d92f` seq 68 contains work_verified VERIFIED against objective-5 revision 5. Only src/cuesheet.ts changed during the run; HEAD, index and all other tracked diffs preserved (sixth-1/preservation.json). This proves the bounded CLI self-development journey, not overall daily usability, visual acceptance, arbitrary model routing or correction/recovery.

Verification: child-frame/research/container/worker targeted set 46 passed, 5 Docker-gated skipped; worker prose-first check 2 passed; integration suite 8 passed, including 110 inherited dirty files and rejection of 101 actual delta files. Build succeeds while still reporting 25 pre-existing TypeScript errors. Dispatcher suite 13 passed. An additional install check collided with a concurrent build launched by this agent; the failed check is retained and rerun sequentially, not treated as product proof.


Final bounded checks: sequential install suite passed 5, failed 0, skipped 1 Docker-gated Linux journey. This includes packed install, real installed PTY outside checkout, and preserved interrupted proposal UI provenance. Fresh root flags launched the local installed terminal and executed a project-scoped native ls through the real model. The final answer to that read-only launch question was not awaited; no claim of full conversational completion. `git diff --check` clean. Global phase remains IMPLEMENTING; visual daily acceptance, intent correction/recovery, real multi-worker and dynamic skills remain open. No commit, reset, staging or push performed.
