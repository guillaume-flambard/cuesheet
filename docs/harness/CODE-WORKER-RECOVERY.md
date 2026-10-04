# Reconcile interrupted code workers

## Scope and intent

H06.4a-R1 is a bounded prerequisite for installed Cuesheet selfhosting. After a
parent process stops, its admitted code workers and private effects must remain
inspectable. Reopening must never replay an effect or infer a living process
from an old `active` event. The existing MULTI-WORKER.md remains authoritative.
Parent H06.4a, H06.5c, H10.4 and global harness acceptance remain open.

## Reconciled controller API

The existing controller already owns batch admission (`terminal.code-workers`),
per-worker admission (`terminal.code-worker`), private `TerminalSession`
journals, effect intents/receipts, managed Git worktrees, the pending-work gate,
and `integrate_code_workers {}` with its pinned owner check. R1 extends those
boundaries rather than introducing another allocator, journal, integration
path, or the unrelated SG02.2 impact operation.

Two bounded controller tools are added, both accepting exactly `{}`:

- `inspect_code_workers {}` reads only the latest pending controller batch,
  its admission events, the admitted private journals, their writer claims, and
  physical Git worktrees/source. It returns bounded deterministic statuses and
  provenance. It does not append, acquire/release a child claim, infer liveness
  from `active`, or read arbitrary IDs/paths supplied by a model.
- `reconcile_code_workers {}` may publish only a proposal already persisted in
  that worker's private journal. Before publishing, it rechecks objective ID and
  revision, current source digest/base, controller admission, metadata/journal
  identity, completed effect receipts, workspace ownership, and dead writer
  claim. It updates the existing `terminal.agent` and `terminal.code-worker`
  projections; it never invokes a model/tool, retries an effect, integrates a
  file, closes a goal, or substitutes for `integrate_code_workers {}` and its
  pinned owner check. Repeating it after successful publication is a no-op.

The producer first appends a bounded `terminal.code-worker-proposal` record to
the private journal after the loop returns a proposal and before writing either
shared projection. The record binds proposal text/digest and step count to
worker ID, objective/revision, execution, source digest/base, workspace, and
journal. A crash before that durable append remains interruption/uncertainty;
a crash after it is inspectable and conditionally publishable. In either case,
unfinished effects remain uncertain and block reconciliation and integration.
An owner revision/source change turns a proposal historical and refuses its
publication without discarding its workspace or evidence.

## Requirements and acceptance

- REC-W01: derive interrupted-worker inspection only from controller admissions,
  private journals and physical worktree observations. A stale active event
  cannot attest liveness; a live writer claim, malformed journal, absent or
  untrusted workspace refuses recovery. Verify a real killed process followed
  by reopen.
- REC-W02: an intent without confirmed receipt remains uncertain and blocks
  replay, integration and finish. Verify kill after file write before receipt;
  the file survives and no second effect occurs. Removing this guard must fail
  the test.
- REC-W03: a durable proposal may be reconciled only with its current objective,
  revision, source and journal provenance. Reconciliation never substitutes for
  the pinned owner integration check. Verify crash after private proposal persistence, before shared publication, then
  reinspection and ordinary current owner verification.
- REC-W04: missing workspace, malformed/truncated journal, untrusted path,
  uncertain effect, claimed live journal or changed revision refuse safely.
  Preserve work and history; never append a false successful result.
- REC-W05: expose bounded inspection and a conditional reconciliation operation
  through the producer. Paths, worker IDs and authority come from the controller
  journal, not arbitrary model input. Repeated inspection is deterministic for
  unchanged observations; repeated reconciliation is idempotent.
- REC-W06: Agents/reopen must show interruption, evidence provenance and a useful
  next action. An installed PTY test must exercise that projection. Unknown
  costs stay unknown. No fabricated success or automatic deletion.

### Acceptance and verification map

| Requirement | Acceptance | Falsifiable proof |
| --- | --- | --- |
| REC-W01 | AC-REC-W01 | Kill a real controller/process, reopen its durable session, and observe the admitted worker as interrupted from its dead private writer claim plus real Git workspace; active alone never reports live. |
| REC-W02 | AC-REC-W02 | A real child writes a file and blocks before the receipt; kill the controller, reopen, inspect, and attempt another worker run. File remains once, effect remains uncertain, retry/integration/finish refuse. Mutation removing this guard must fail. |
| REC-W03 | AC-REC-W03 | Persist a proposal privately, stop before shared publication, reopen and reconcile at the same objective/revision/source; then use the ordinary pinned owner integration/check path. Stale objective/revision/source and duplicate reconcile refuse or no-op. |
| REC-W04 | AC-REC-W04 | Exercise missing workspace, corrupt/truncated private journal, forged path, uncertain intent, live claim, and source/revision drift. Each fails closed while preserving bytes and without a successful-result append. |
| REC-W05 | AC-REC-W05 | Producer accepts only empty inputs, derives paths/IDs from admissions, returns stable repeated inspection, and reconciles once without model/tool replay. |
| REC-W06 | AC-REC-W06 | Run the installed terminal under a real PTY, reopen the session, enter Agents, and assert interruption, journal/source provenance, unknown cost, and the exact next recovery operation. |

### Controller boundary and whole-change classification

State transitions are `active/admitted -> interrupted` on reopen unless a
private, provenance-valid proposal receipt exists; that receipt becomes
`proposal-recoverable` only when all currentness and physical checks pass. A
successful conditional reconciliation publishes `proposal`; `integrated` still
requires the unchanged owner integration/check path. Uncertain effects, damaged
logs, claims that may be live, paths outside the controller root, missing
workspace, stale revision, or source drift remain blocked and preserved.

Applicable: core behavior, errors, cancellation, retry gate, durable persistence,
state restoration, concurrency/claim observation, idempotency, privacy/security,
diagnostics, unit/integration/runtime tests, build, documentation and developer
experience. Not applicable: network/auth changes, database migration, deployment,
rollback, automated cleanup, resource deletion, or UI control/visual redesign.
Performance is bounded by at most two workers and bounded journal/inspection
inputs; no separate benchmark claim is made. Existing journal and consultation
formats remain readable; proposal receipts are additive and historical journals
without them are interruption-only, never guessed proposals.

## Finite work graph

1. R1-SPEC: reconcile this slice with existing admission/journal/integration APIs;
   model valid transitions and unknowns before code. Evidence: source references
   and this API section.
2. R1-INSPECT: implement conservative, controller-owned recovery inspection.
   Depends on R1-SPEC. Evidence: real process/Git/journal failure tests.
3. R1-RECONCILE: persist proposal provenance before shared publication; connect
   bounded producer tools, conditional current revision/source guards and truthful
   Agents projection. Depends on R1-INSPECT. Evidence: producer tests including
   stale revision and duplicate attempts.
4. R1-PROVE: kill/reopen proof, installed PTY, regressions, build and differential
   typecheck; reconcile canonical evidence/state. Depends on R1-RECONCILE.

All steps initially TODO. No parent acceptance is promoted by this document.

## Risks and verification

R06 authority/provenance, R09 partial effects and concurrent claim acquisition
remain applicable. Journal corruption and source drift are fail-closed.
Persistence, restart, cancellation, idempotence, concurrency, scoped paths,
privacy and diagnostics are applicable. No networking, authentication changes,
migrations, deployment or cleanup is introduced. Existing provider/tool caps
remain unchanged; inspection must be bounded and must not read transcripts into
shared model context wholesale. Existing consultations and journals remain
compatible. Historical evidence is immutable.

Use real process interruption and Git workspaces, targeted worker/producer/
integration tests, pinned Docker capsule (image
`sha256:358569078158e76f822a2cd0ed86c440f2244a65ab1385362ab5d29d2d28ceb4`,
socket `/Users/memo/.docker/run/docker.sock`), installed PTY, project build and
typecheck differential. Full suite follows only after the final source change
and runs at most once. Full logs go to
`/Users/memo/projects/_reports/cuesheet-intentlane-supervision-2026-10-02/CS-RECOVERY-R1`.
The controller independently verifies the diff and these results. Required
evidence stays pending until recorded. No human decision is needed for routine
reversible API choices. No source integration, commit, push, deletion or external
action is part of this packet.

Inspection limits: 20,000 controller events; 256 private directory entries; 2 MiB per private journal; two admitted workers; 16,384 output characters. Overflow refuses recovery. Conditional reconciliation holds the existing private writer claims and rechecks objective and ownership before each shared append. Inspection itself never acquires a claim.
