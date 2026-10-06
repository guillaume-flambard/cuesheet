# IntentLane code and live correction vertical

Status: DISCOVERY. Owner authorized the four proposed steps in this chat. Canonical planning remains here. Previous ignore-only vertical evidence stays historical.

## Intent, model and scope

Complete when the public CUESHEET terminal delegates a real bounded IntentLane code change to OpenCode, a functional correction arrives during execution, old contributions cannot integrate, and two fresh checkouts reach independent accepted behavior with Git preserved.

Real task: score-across-catalogue-growth task 3.3, an audit-deliverable truth gate. formatDeltaText currently presents score arrows across catalogue versions without warning. Add a clear warning with baseline/candidate catalogue versions when versions differ or are missing/unknown. Keep raw numbers, rankings and JSON unchanged, same-known-version output unchanged. No decision about unknown scoring, no new catalogue records, no Apple APIs, no scope completion claim for the larger OpenSpec change. All context files read.

Flow: natural request -> target binding -> scoped code/test packet -> isolated workspace -> current worker effects -> live correction -> current objective/check -> scoped candidate oracle -> integration -> source oracle -> replay. Immutable owner oracle independently bundles target TypeScript and checks observable report behavior, not source-text implementation.

## Requirements and acceptance

CV01: a mismatch or unknown version produces a visible non-comparability warning naming both versions; same known version preserves existing text; JSON and score values remain unchanged. Baseline oracle must fail, final oracle and target regressions pass.
CV02: initial natural request delegates one code worker, no hand-made worker packet or implementation. Allowed target files audit-diff.ts and audit-diff.test.ts only; meaningful tests added.
CV03: a live message adds the unknown/missing-version requirement during the first worker execution. Old revision must remain historical, never integrated; new accepted proof targets the revised objective. The same pinned oracle can be explicitly renewed through the existing public check-confirmation action.
CV04: repeat the same request/correction protocol on a fresh checkout, equivalent behavior, unchanged HEAD/index, main dirty IntentLane preserved.
CV05: applicable target test/build/validate/generated-output checks and CUESHEET regression checks pass; source and verification provenance are retained. No Siri claim. Apple metadata compilation N/A to text-only audit-diff behavior; generation stability is checked instead.

## Finite graph

C01 P0 DISCOVER/MODEL/SPECIFY task and owner oracle: DONE. Spec above (task, scope, flow); owner oracle v2 below, C01-EV01..C01-EV06.
C02 P0 first public code execution and live correction: TODO after four attempts, none reaching VERIFIED. Three defects were found by real runs and closed with regressions; two attempts were blocked externally (provider quota, provider timeout). Evidence and the exact defects are in DEVELOPMENT-DIAGNOSIS.md under "C02 public run: four attempts, three defects, still open". Depends C01.
C03 P0 required controller defects found by C02, with regression and safe recovery: TODO, depends C02; only observed defects enter scope.
C04 P1 fresh replay and Git preservation: TODO, depends C03.
C05 P1 independent adversarial/target/runtime verification and closure: TODO, depends C04.

## Risks and coverage

High open: stale worker batches may prevent safe continuation after correction; diagnose real journals before adapting. High open: tests/dependencies in frozen target artifacts require owner-controlled tooling; independent esbuild bundling reuses installed target dependencies read-only, never worker permissions. Dirty source must be compared before/after. Medium: provider variability remains fail-closed. No new parallelism or proof engine.

Applicable: text/report UX, success/empty/error inputs, cancellation/live revision, restart/recovery, data/Git integrity, current proof/check binding, scoped tools/security/privacy, deterministic output, dependencies/offline, diagnostics, unit/integration/public runtime, build and docs. N/A: schema/API changes, authentication, migrations, caching, UI/accessibility redesign, deployment and Apple human acceptance; none changes in this slice. Closure requires all scoped criteria, no high risk or P0/P1 open. Only subsequent human acceptance remains.

Owner steering during this run: replacement usability/selfhost and development diagnosis take precedence. See DEVELOPMENT-DIAGNOSIS.md. C01 oracle baseline independently rejected; C02 public run failed after live correction, with zero integration/verification. C03 required recovery defects are identified, not implemented. No target task or criterion marked complete.

## Owner oracle v2, C01 evidence

The v1 oracle (`owner.mjs`) had two tautologies. `formatDeltaJson(delta)===json` compared one call to itself, and `baseline.score===candidate.score` compared a document to a clone of itself, so both held even if the change corrupted JSON or scores. Oracle v2 (`owner-v2.mjs`) replaces them with values pinned to `golden-captured.json`, captured from pristine IntentLane HEAD, and adds a rendered-level pin. The warn matrix is declared in the oracle from CV01, never derived from observed output, so the oracle cannot absorb whatever the code happens to do.

Six cases: 27.0->28.0, 27.0->absent, absent->28.0, absent->absent, unknown->unknown warn; 27.0->27.0 does not. 41 assertions.

C01-EV01: oracle fails on the real target at HEAD f395ca56b, 9 of 41 assertions, every one a missing warning on a case that requires it. Exit 1. IntentLane HEAD and dirty-state hash unchanged (`89b6343...`) before and after; the oracle is read-only and bundles through esbuild into a temp dir.

C01-EV02: `vitest run packages/core/src/audit-diff.test.ts` PASS 19/19 at the same HEAD. This is the CV05 target baseline, recorded before any worker touches the tree.

C01-EV03: oracle is satisfiable. A reference implementation in a scratch copy outside both repos passes 41/41. It exposes the non-obvious edge: `diffAuditDocuments` normalizes a missing catalogue to the sentinel `"unknown"`, so warning on version inequality alone is wrong. Warn unless the versions are equal AND known.

C01-EV04: four adversaries are rejected, evidence in `adversarial/results.log`. Corrupted summary line 6 failures; reworded warning phrase 10 failures; naive version-inequality-only implementation, the most plausible worker output, 4 failures on exactly the absent and unknown cases; rendered score tamper 6 failures.

C01-EV05: two oracle defects were found by that adversarial pass and fixed, not worked around. The score-tamper adversary initially passed because the tamper was inserted before the score lines were built, so it had nothing to corrupt. The first replacement compared rendered lines against a golden set, which discarded the tampered line as an "added line". The accepted invariant is that all non-warning lines must equal the HEAD output exactly.

C01-EV06: an earlier draft of oracle v2 passed on the pristine tree because the captured cases carried no warn field, so every case took the no-warning branch and the warning check never executed. A vacuous oracle would have green-lit an unimplemented requirement. The warn matrix now lives in the oracle and a disagreement between matrix and case list is a hard error.

C01 proves the oracle rejects a false claim and accepts a true one. It does not prove the target task is implemented, and no target criterion is marked complete.
