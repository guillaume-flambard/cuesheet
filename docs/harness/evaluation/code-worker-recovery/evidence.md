# EV-CODE-WORKER-RECOVERY

## Scope record

Packet: `CS-RECOVERY-R1`  
Base: `78308fe32c3560df779d73cad6471fc45b4e8f83`  
Controller slice: H06.4a-R1. Parent H06.4a, H06.5c, H10.4, R06/R09 and global
acceptance remain open.

## API reconciliation before implementation

Source inspection at the packet base established:

- `src/adapters/code-worker-workspaces.ts` already persists controller batch and
  per-worker admission records with objective/revision, workspace, source digest,
  base, packet, and bounded IDs.
- `src/adapters/terminal-code-workers.ts` already owns private worker sessions,
  writes `active/admitted` projections and refuses another run while a pending
  batch exists. Existing pending-work guards continue to block finish.
- `src/adapters/code-worker-loop.ts` appends private effect intent before running
  a tool, appends a linked completion receipt only after an integer exit, and
  leaves null/unconfirmed effects uncertain. It had no durable proposal record.
- `src/adapters/session-store.ts` exposes read-only attestation of event bytes;
  `src/adapters/terminal-session.ts` opens journals by acquiring/reclaiming writer
  claims, so recovery inspection must not reopen private journals through
  `TerminalSession`.
- `src/adapters/agent-git.ts` performs read-only Git inventory;
  `src/adapters/managed-worktrees.ts` demonstrates conservative worktree recovery
  but does not establish worker proposal provenance.
- `src/adapters/code-worker-integration.ts` already checks current admitted
  packet, source digest/base, private effects, actual scope, current owner check,
  and preserves contribution on refusal. Recovery will feed this path, not replace
  it.
- `apps/terminal/src/producer/index.ts` is the owner boundary for tools and the
  current objective; existing `agentPage` projects worker workspace/journal and
  integration status but not recovery provenance/next action.

Therefore R1 adds a private durable proposal receipt before shared publication,
then bounded `inspect_code_workers {}` and `reconcile_code_workers {}` producer
operations. Inspection is read-only and controller-admission-derived. Inspection never acquires child claims. Reconciliation holds existing child writer claims while validating and publishing. Recovery
does not retry effects, alter workspaces, integrate,
run the pinned check, close goals, or clean anything. `AC-H06.4a` remains pending
until its broader correction/restart criterion is independently complete.

## Verification ledger

| Criterion | Status | Evidence |
| --- | --- | --- |
| AC-REC-W01 | VERIFIED (machine) | Direct controller logs and executable tests listed below. |
| AC-REC-W02 | VERIFIED (machine) | Direct controller logs and executable tests listed below. |
| AC-REC-W03 | VERIFIED (machine) | Direct controller logs and executable tests listed below. |
| AC-REC-W04 | VERIFIED (machine) | Direct controller logs and executable tests listed below. |
| AC-REC-W05 | VERIFIED (machine) | Direct controller logs and executable tests listed below. |
| AC-REC-W06 | VERIFIED (machine) | Direct controller logs and executable tests listed below. |

No code or runtime criterion is claimed by this discovery record.

## Direct controller verification

The owner requested direct Codex implementation for both projects after provider interruptions. The OpenCode patch was reviewed and repaired. The session-list import and per-append revision/private-ownership guards were corrected.

Local evidence directory: `/Users/memo/projects/_reports/cuesheet-intentlane-supervision-2026-10-02/CS-RECOVERY-R1/`.

- `controller-focused.log`: 19 passing tests, zero failures/skips.
- `controller-adversarial.log`: real SIGKILL/write-before-receipt, malformed IDs, source/revision drift, missing/symlink workspace, damaged/oversized/tampered journal, live claim, partial publication, competitor refusal, idempotence and owner-check rejection/source preservation pass.
- `controller-installed-canonical.log`: actual built, packed, installed package reopens Agents under PTY at widths 100 and 58; interruption, provenance, private journal, unknown cost and inspection operation visible. Automated input, no human acceptance claim.
- `controller-mutation.log`: removing uncertainty classification makes the real kill proof fail; original source restored.
- Public malformed recovery inputs refused without worker inference or effects.

The first full-suite attempt had 1001 passes, one failure and three skips. The failure correctly rejected a stale derived graph rewritten inside the protected capsule input. The graph was regenerated; final full verification passed: 1007 tests, 1004 passing, zero failures, three provider skips. The independent protected-source capsule check passed. Global and parent acceptance remain open.

Final logs: `controller-final-targeted-2.log` (12/12), `controller-full-final.log` (1007/1004/0/3) and `controller-installed-canonical.log` (installed PTY100/58). The real kill test also attempts integration and public finish and observes refusal. Partial publication tests change currentness and delete the held private claim between appends; neither permits the second publication. The full build/typecheck differential guards passed, with existing global diagnostics retained.

The direct live-model transport refused authentication with HTTP401. Previous OpenCode runs returned402. Meaningful installed real-model selfhost and semantic live steering are still pending and are not replaced by the fixture proofs. Human acceptance is not recorded.
