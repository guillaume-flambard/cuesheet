# Release managed worktrees on an explicit owner request

## Intent

Managed worktrees are created by `allocateWorktree` and never removed by
Cuesheet. Recovery is read-only (see
`docs/harness/evaluation/worktree-recovery/evidence.md`), which is correct for
a controller that must never drop unmerged content. It also means that every
allocation stays registered in the source repository until somebody deletes it
by hand.

That happened. On 2026-10-12 the developer checkout held 56 registrations in
`.git/worktrees` whose directories no longer existed: about fifty from
evaluation runs whose `_reports/cuesheet-*-2026-10-0x` state directories had
been deleted, and the rest from interrupted capsule tests (fixed separately on
`fix/fixture-worktree-leak`). Deleting a state directory cannot unregister the
worktrees it contains, because the registration lives in the source
repository and the ledger that would explain it is deleted with the directory.

The owner asked for a release operation: an explicit command that frees a
managed worktree when its allocation owner is dead and it holds nothing, so a
state directory can be emptied before it is deleted.

**Completion sentence:** this change is complete when `cuesheet worktrees
release --root <dir>` removes every managed worktree under that root whose
owner is dead and whose tree is clean, unregisters every one whose directory is
already gone, keeps everything else with the reason it was kept, records each
release in a preserved receipt, and exits nonzero whenever anything was kept.

## Non-goals

- No automatic release. Nothing in the controller, producer or terminal calls
  it; REC-W06 ("no automatic deletion") still holds.
- No `--force`, ever. Git refuses a modified, untracked or locked worktree, and
  that refusal is kept as the last guard.
- No release of worktrees Cuesheet did not allocate. Only a directory with an
  attested ledger under a managed root is considered; Claude Code, Codex and
  hand-made worktrees are out of scope.
- No recovery of registrations whose ledger was already deleted. Without the
  ledger there is no attested allocation; `git worktree prune` stays the
  owner's tool for those.
- No change to allocation, reuse (`managedWorktreeCandidates`) or the read-only
  listing semantics.

## System map

- `src/adapters/managed-worktrees.ts`: allocation, the per-id ledger
  `<root>/<id>.jsonl` (reservation line, then a `ready` receipt), the
  `.finalize` claim, and `listManagedWorktrees`, which re-inspects each
  allocation and classifies it `owned`, `recoverable`, `uncertain` or
  `invalid`. Release builds on that classification instead of re-deriving it.
- `src/adapters/agent-git.ts`: `inspectAgentGit`, the attested Git view used for
  ownership, HEAD and cleanliness.
- `src/cuesheet.ts`: the dispatcher and its `COMMANDS` table. A new `worktrees`
  command routes to `src/worktrees-cli.ts`.
- Managed roots in practice: the terminal producer passes
  `options.worktreeRoot`, which yields `<sessions>/workspaces/t-<task>/` with one
  `w-<uuid>` allocation per worker. The CLI accepts either a managed root or a
  directory whose immediate children are managed roots.
- State graph: `src/adapters/state-graph/manifest.ts` declares the files and
  their digests; `graph.json` is regenerated with `pnpm graph:regen`.

## Specification

`releaseManagedWorktree(root, id, {dryRun?, signal?})` returns one outcome:

| Observed allocation | Outcome | Effect |
| --- | --- | --- |
| `recoverable`, worktree present, Git-clean, no finalize claim | `released` | `git worktree remove <path>` without `--force`, then the ledger is archived |
| ledger attested, worktree absent, owner dead, no finalize claim | `unregistered` | `git worktree remove <path>` drops the registration if Git still lists the exact path, then the ledger is archived |
| owner alive, dirty, HEAD moved, foreign repository, finalize claim, invalid ledger, inconclusive inspection | `held` | none; the listing reason is returned |
| an existing release claim | `held` | none; the claim is reported and never reclaimed |
| Git refuses the removal | `held` | none; Git's refusal is returned and the ledger is untouched |

Rules:

1. **Recheck before the effect.** The allocation is inspected once to decide,
   then again immediately before `git worktree remove`. Git's own refusal of a
   modified or untracked tree closes the remaining window.
2. **Exclusive release claim.** `<id>.jsonl.release` is created with `wx`
   before inspection and removed afterwards. A second releaser sees it and
   holds. A claim left by a crash is reported, never deleted.
3. **Archive, never delete, the ledger.** After the worktree is gone the ledger
   is renamed to `<id>.released.jsonl` and a `released` receipt line is
   appended (mode, time, path). The listing and allocation only read
   `<id>.jsonl`, so the archived ledger leaves both, and the evidence stays.
   A crash between removal and archive leaves a ready ledger with an absent
   worktree, which the next release resolves as `unregistered`: the operation
   is idempotent.
4. **Git runs hermetically**, like allocation: no global or system config, no
   hooks, no fsmonitor, against the recorded common Git directory.
5. **Dry run** reports the outcome it would reach and writes nothing, not even
   the claim.

`cuesheet worktrees list --root <dir> [--format json]` prints each allocation's
condition and reason. `cuesheet worktrees release --root <dir> [--id <id>]...
[--dry-run] [--format json]` releases every allocation under the roots, or only
the named ids. Exit codes: `0` when nothing under the roots is left registered
by Cuesheet (everything released, unregistered or already archived), `1` when
anything was held, `2` for a usage error. The nonzero exit is the gate a script
uses before deleting the directory.

## Requirements and acceptance

- WTR-01: a dead-owner, Git-clean managed worktree is removed and unregistered.
  AC-WTR-01: after release the path is gone, Git no longer lists it, the
  ledger is archived with a `released` receipt.
- WTR-02: a managed worktree with an alive owner, modified or untracked
  content, a moved HEAD, a finalize claim or an invalid ledger is never
  removed. AC-WTR-02: each case returns `held`, the bytes and the ledger are
  unchanged, Git still lists it.
- WTR-03: an allocation whose directory is gone but whose registration remains
  is unregistered. AC-WTR-03: Git no longer lists the path; the ledger is
  archived with mode `unregistered`.
- WTR-04: release is exclusive and idempotent. AC-WTR-04: an existing release
  claim holds without effect; releasing twice yields one archive and a no-op;
  a crash between removal and archive is resolved by the next release.
- WTR-05: dry run writes nothing. AC-WTR-05: no claim, no archive, no Git
  change after a dry run that reports `released`.
- WTR-06: the CLI exposes list and release with a usable gate. AC-WTR-06:
  `cuesheet worktrees release` exits 0 when everything is released, 1 when
  anything is held, 2 on bad arguments, and accepts a parent of managed roots.
- WTR-07: nothing else changes. AC-WTR-07: the full suite fails the same tests
  before and after the change, and the committed state graph matches the
  generator.

## Work graph

| ID | Priority | Depends on | Task | Status |
| --- | --- | --- | --- | --- |
| WTR-T1 | P0 | | Extract the per-allocation inspection from `listManagedWorktrees` without behaviour change | DONE: existing listing and recovery tests green (15/15) |
| WTR-T2 | P0 | T1 | `releaseManagedWorktree` with claim, recheck, Git removal, archive | DONE |
| WTR-T3 | P0 | T2 | Tests for WTR-01 to WTR-05 against real Git repositories | DONE: 13/13, four mutations caught |
| WTR-T4 | P1 | T2 | `src/worktrees-cli.ts` and the `worktrees` entry in the dispatcher | DONE |
| WTR-T5 | P1 | T4 | CLI tests for WTR-06 | DONE: 3/3 |
| WTR-T6 | P1 | T3, T5 | Manifest and invariant registry nodes, regenerated `graph.json` | DONE: state-graph tests 41/41 |
| WTR-T7 | P1 | T6 | Full suite against the baseline, evidence recorded below | DONE |
| WTR-T8 | P1 | T7 | Manual acceptance by the owner | OPEN |

## Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Removing a worktree that holds work | Critical | Release only `recoverable` and Git-clean; recheck before the effect; never `--force`, so Git refuses modified, untracked and locked trees |
| A live owner whose PID was reused looks alive | Low | It is held, which is the safe direction |
| A dead owner whose PID was reused by an unrelated live process | Low | Held as alive; the owner can retry later |
| Two releasers race | Medium | Exclusive `wx` claim; the second holds |
| Crash mid-release | Medium | Order is remove, then archive; the next release resolves the leftover as `unregistered` |
| The ledger rename breaks listing or allocation | Medium | Both match only `^<id>\.jsonl$`; covered by a listing test after release |

## Verification plan

- Unit-level tests in `test/managed-worktree-release.test.ts` against real Git
  repositories, one per requirement, including the falsifying cases.
- CLI tests in `test/worktrees-cli.test.ts` that spawn the real dispatcher.
- `node --test` over the whole suite before and after, comparing the failing
  sets.
- `pnpm graph:regen`, then the state-graph manifest tests.

## Evidence

Recorded on 2026-10-12, Node 24.21.0, Git 2.54.0, macOS.

- **Git behaviour the design relies on**, observed on a scratch repository:
  `git worktree remove` without `--force` removes a tree whose only extra files
  are ignored, refuses a tree with an untracked or modified file, refuses a
  locked tree, drops the registration of a tree whose directory is already
  gone, and refuses a path that was never registered.
- **WTR-01..05**: `node --test test/managed-worktree-release.test.ts`, 13/13.
  Mutations, each applied alone and reverted: removing the clean check while
  adding `--force` fails 3 tests; ignoring the owner for an absent directory
  fails 1; letting a dry run write fails 1; opening the release claim without
  `wx` fails 1.
- **WTR-06**: `node --test test/worktrees-cli.test.ts`, 3/3, through the real
  dispatcher, including exit 1 when something is held and exit 2 for seven bad
  invocations.
- **WTR-07**: full suite before (base `ae9f391`) and after, same environment:
  1104 tests with 44 failures before, 1120 tests with 43 failures after. No
  test fails after that did not fail before. The two before-only failures are
  the dispatcher's no-TTY surface sentence, which then passed 3 runs out of 3 in
  isolation: load-dependent, not affected by this change. State-graph tests
  41/41 after `pnpm graph:regen`. `scripts/build.sh`: 0 type errors, the
  dispatcher names 12 files and all are emitted.
- **Real data, dry run only**: the built CLI over the twelve
  `_reports/cuesheet-c02-2026-10-06/*/sessions/workspaces` roots reports 13
  allocations, all `released`, exit 0. Their repositories are IntentLane copies
  inside the report itself. Nothing was released.

## Manual acceptance

1. Run a code-worker task, let it finish, then
   `cuesheet worktrees list --root <sessions>/workspaces`.
2. `cuesheet worktrees release --root <sessions>/workspaces --dry-run`: the
   clean allocations show `released`, the others `held` with a reason.
3. Without `--dry-run`: `git worktree list` in the source no longer shows the
   released paths, and each has `<id>.released.jsonl` beside it.
4. The command exits 0 only if nothing was held; only then delete the
   directory.
