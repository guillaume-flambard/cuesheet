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
Remaining US-RECOVERY blocker, corrected2026-10-05: the earlier wording said uncertain effects and obsolete batches "lack a safe usable continuation". A reproducer disproved the implied mechanism. The human path works: `producer.changes()` returns a review carrying `blocked`, `decideChanges(reject)` returns `rejected`, and `pendingCodeWorkers` becomes false. No mechanism is missing and nothing is unreachable. The real gap is narrower: the gate is legible to the model but not actionable by it. Model/agent/skill and multi-project daily acceptance, installed self-development and owner visual acceptance remain open.

## Pending-batch gate: legibility without an affordance

Measured from the retained failed run, 142 events, and reproduced against current source. The failing run reconciled the wrong obligation: `reconcile_effect` succeeded once against the parent-level `run_code_workers` intent (seq 119, conclusion not-performed) and `run_code_workers` still returned 126 at seq 127, because the pending gate reads worker-batch events, not the parent intent. Tool census: `reconcile_effect` 8 calls, exits {0,2}; `run_code_workers` 4 calls, exits {126, null}. The model looped 18 steps and ended with zero integration.

Two causes, both still present in current source.

GT01, misleading refusal. `pendingCodeWorkers` refusals tell the model to inspect workspaces and journals. Inspection provably cannot clear the gate: the only operation that clears a worker batch is a human set-aside decision. A refusal that names an action which cannot help is worse than no refusal, because it sends the model into a loop.

GT02, missing affordance. `declaredNames()` publishes `inspect_code_workers` and `reconcile_code_workers` to the builder. Neither can open or clear the gate. The model is told a gate exists, given two tools that cannot act on it, and has no third option. Owner decision 2026-10-05: add a bounded model-callable set-aside, because the alternative leaves the model looping while a human watches.

### Bounded scope

SA01: refusals name the action that works. Every pending-batch refusal states that only a set-aside decision clears it, names that operation, and states that reconciliation cannot clear it. Inspection and reconciliation keep their existing read-only and conditional-publication authority.

SA02: a bounded `set_aside_code_workers {}` operation, controller-owned, accepting exactly `{}`. It appends the existing `rejected` batch and worker phases with `human:false` and an explicit model authority marker. It never applies a file, never integrates, never closes a goal, never claims verification, never deletes a workspace, journal or receipt, and never re-attempts an effect. Its entire effect is to stop the gate from blocking.

SA03: model set-aside is refused, not merely discouraged, when the batch still carries a recoverable durable proposal, because discarding one is a human decision. It is permitted only when no worker holds a proposal eligible for reconciliation. Refusal names `/changes` as the human path.

SA04: currentness guards match reconciliation. Objective ID/revision, source digest/base, controller admission provenance and workspace ownership are re-read before the append. A changed revision or source refuses and preserves everything.

SA05: idempotence. A second call on an already set-aside batch returns the recorded outcome without appending, so a model retry loop cannot grow the journal.

SA06: bounded output and input, exactly as REC-W05 already requires for the sibling operations, and readable in the Agents projection as an explicit model decision rather than a human one.

Map: pending gate -> model refusal text and declared tools -> controller-owned set-aside append -> existing batch phase. Additive journal records only, no schema, permission, network, deployment or migration change. Privacy, integrity, diagnostics, concurrency and restart are applicable; accessibility and UI redesign are not.

Finite graph: SA-SPEC DONE (this section); SA-FIX DONE; SA-VERIFY DONE for this slice; SA-CLOSE DONE. Broader US-RECOVERY stays open: a corrected public run is still required.

SA-EV01: `node --test test/code-worker-gate.test.ts` PASS 9/9. Refusals name the clearing operation and the human path; the model set-aside clears the gate with `human:false` and an explicit authority marker; no `work_verified`, no evidence event, no file in the source, HEAD and index preserved; workspaces, private journals and the uncertain receipt all survive; a recoverable proposal refuses and names `/changes`; `[]`, `{workerId}`, `{x:1}` and a bare string all refuse and none clears the gate; three retries produce exactly one batch record and one record per worker; a batch superseded by a live correction is clearable; a superseded batch that still holds a recoverable proposal refuses.

SA-EV02: existing suites preserved. `test/terminal-code-workers.test.ts` 27/27 and `test/code-worker-recovery.test.ts` 7/7 sequentially, and 43/43 for all three files together at `--test-concurrency=4`.

SA-EV03: `bash scripts/build.sh` PASS, 0 type errors, dispatcher and bundle validated. `tsc --noEmit` clean on both the terminal package and `tsconfig.build.json`. The previously recorded 25 compiler diagnostics are absent from this build.

SA-EV04: full suite differential, 1119 tests at `--test-concurrency=4`. With the three source files: 1088 pass / 14 fail / 17 skipped. With them stashed and a clean rebuild: 1080 pass / 22 fail / 17 skipped. The 8-failure delta is exactly the 9 new gate tests failing without the source, minus one that also failed for an unrelated pre-existing reason. Every failure present with the change is also present without it: `installed terminal runs in a real PTY`, `installed Agents reopens an interrupted private proposal`, `situation survives frame compaction`, `a conversation fills the terminal window`, `busy surface animates`, and the palette/live-notification PTY cases. Zero new failures, zero fixed-by-accident claims. Both install and `situation` failures were independently reproduced on the unmodified tree.

Two findings changed the design while implementing, both from tests rather than review.

The obvious reproduction was wrong. A reproducer for an uncertain worker suggested the human "set aside" path was unreachable, because `code-worker-review.ts` requires phase `proposal`. It is reachable: the review opens with `blocked`, `decideChanges(reject)` returns `rejected`, and `pendingCodeWorkers` becomes false. That hypothesis is discarded and the recorded blocker wording was corrected above.

A second, worse gate sits in front of the one that was diagnosed. When the uncertain effect is the worker run itself, `reconcile_effect` uncertainty refuses `run_code_workers` and `finish` before the pending-batch check is reached, and that refusal sends the model to `reconcile_effect`, which cannot clear a worker batch. This is the loop the retained run actually hit: `reconcile_effect` exited 0 once, delegation still exited 126. Both gates are now named in both refusals, and the model is told they are separate obligations.

The Agents projection had no next action for this state. Its recovery line only rendered for an `interrupted` agent, which requires a reload; a live uncertain worker projects as `failed` and showed nothing. It now covers both, which is why the wedged session has something to act on.

Known flake, not claimed fixed: one earlier concurrent run of `terminal-code-workers.test.ts` failed `wait()` on its 15s busy-timeout under 4-way load. It passes on repeated reruns including the same concurrency and the same file set. Timing sensitivity in the fixture, not a behavioural regression.

## C02 public run: four attempts, three defects, still open

C02 is not done. No attempt reached independent VERIFIED. What the attempts produced is three defects that only a real installed run could find, each closed with a regression.

Attempt 1, `opencode-go/gpt-5.6-luna`: quota exhausted at the first inference, before delegation. `public-1/outcome.json` records `BLOCKED_EXTERNAL` with every acceptance field false.

Attempt 2, `opencode/space-bunny-free`, owner-directed model substitution: delegated, took the live correction, renewed the pinned check, and reached `set_aside_code_workers` at event 85 after 9 wasted steps. It was refused. The guard required `batch.revision === current.revision`, but the correction had advanced the objective from revision 5 to 29, so the batch could never be set aside precisely because a correction arrived. The tool could not be used in the one scenario it exists for. Fixed: a batch admitted under an older revision is superseded by a human correction, its contribution cannot integrate anyway, so nothing usable is discarded, and it is re-inspected under its own revision so the recoverable-proposal guarantee holds. Regression SA07, refusal regression SA08.

Attempt 3: the gate was clear and the model inspected the batch at event 49, then spent 16 steps in a loop. `reconcile_effect` requires a successful `cat`/`ls`; `cat`/`ls` were refused by the isolated-workspace gate; that gate auto-calls `prepare_workspace`; `prepare_workspace` was refused by the uncertain-effect gate. Nothing could be observed, so the uncertainty could never be discharged. The intent was already in the code, since `cat` and `ls` are declared inspection tools and inspection is the designated escape from uncertainty; the isolated-workspace gate overrode it for container scopes. Fixed at `producer/index.ts`: that gate now yields while an uncertain mutation is outstanding, so read-only inspection stays available on the current scope. A read cannot mutate, so no safety property is weakened.

Attempt 4: provider inference timeout on the first controller turn, zero steps. `public-4/outcome.json` records `BLOCKED_EXTERNAL`.

C02 therefore remains TODO with a narrower and better-understood blocker: the three wedges that made it loop are closed and regression-covered, and no run has yet demonstrated a corrected public journey reaching the revised result. US-SELFHOST and US-LEGIBILITY stay open behind it. IntentLane is unchanged throughout: `f395ca56b`, dirty hash `89b6343...`, 36 dirty paths, and the v2 oracle still rejects the baseline.

Risk: granting the model an authority over discarding work. Mitigated by SA03 (never against a recoverable proposal), by the authority marker, by the fact that set-aside preserves every byte, and by integration and verification remaining separately gated. The invariant that matters is preserved: no set-aside path may ever turn a contribution into verified work.

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

## C02 rerun 2026-10-06: free models exposed an OpenRouter tool-call shape defect

Context: provider quotas (luna) and the opencode free tier were unavailable, so C02 was retried through OpenRouter with `:free` models. Harness rebuilt in `docs/harness/c02/` (oracle v2 for IntentLane c1f915196, capsule form pinned to the local node capsule image, adversaries, PTY driver). Oracle: HEAD pristine 24/42 (rejected), reference 42/42 including inside the no-network capsule, five adversaries rejected. Runs 1-19 retained under `/Users/memo/projects/_reports/cuesheet-c02-2026-10-06/`; none reached VERIFIED, C02 stays TODO.

Finding 1 (provider constraint, not a defect): opencode's free tier answers 403 FreeTierError "can only be used from within OpenCode" on the `opencode serve` HTTP path that Cuesheet uses. `opencode run` works for the same models. No free opencode model can be used by Cuesheet.

Finding 2 (defect, fixed): the OpenRouter adapter advertises `{"tool": name, "input": {...}}` but passed the whole arguments object on as the request input. The shell runner reads `argv`/`path` from the top level, so every call that followed the contract returned exit 2 "no argv supplied", which the surface printed as "the call had no command in it", forever. The workspace gate was a bystander: its refusal is a one-shot and the model's next call ran. Fix in `src/adapters/openrouter.ts`: unwrap `input` when `tool` is a string and `input` is a plain object; the flat shape is unchanged. Regression `test/openrouter-tool-call-shape.test.ts`, 6 tests, 3 fail without the fix. Neighbouring suites (provider-ux, model-switch, model-selection, llm-producer, adapters, current-tool-vocabulary, reliability-matrix, terminal-sessions) 69 pass, 0 fail, 2 skipped. Replay run 19 on the rebuilt bundle: `cat`/`ls` now execute (31 exit 0 observations) where run 18 had 22 "no argv supplied".

Still open: the free model then re-reads the same 8000-character excerpt 43 times instead of retrieving the rest through `read_history`, so no delegation or edit happened. That is a model limit against an existing bounded-reader design, not changed here. C02 needs a model that delegates.
