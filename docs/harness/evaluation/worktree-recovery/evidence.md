# EV-WORKTREE-RECOVERY - 2026-10-02

Base f6493f5, branch h06-3b-worktrees. Bounded slice of H06.3b (parent stays TODO): the
recovery half of the durable managed worktree manager, not worker admission, quotas,
integration or cleanup. Extends H06.3b1 allocation receipts, H06.3b2 snapshot carry and
H06.3b3/b4 workspace runtime; it does not re-prove them.

## Recovery rule

A managed worktree is recovered, not inferred. `listManagedWorktrees(root)` reads every
ledger under the owner root, re-inspects the physical worktree with the same bounded Git
inventory used at allocation, and reports one state per allocation. Four facts stay
separate because they lead to different actions: the receipt phase, whether the owner pid
is alive, whether the worktree is present, and whether it is physically clean.

- `owned`: the recorded owner is alive. The worktree is held, never a reuse candidate.
- `recoverable`: the owner disappeared and the worktree is attested (same common Git
  directory, exact managed path, HEAD at the recorded base) and clean. It is reusable for
  the same unit and base, and it is reconciled in place, never recreated.
- `uncertain`: present but not attestable, dirty, absent, cancelled, or carrying a crash
  residue. Reported with the reason. Never a reuse candidate.
- `invalid`: the ledger itself cannot be attested. Reported, never skipped, never offered.

Nothing in the recovery path writes, removes, recreates or reclaims anything. Recovery is
read-only, so a second listing after a refused re-attribution returns the same states, and
no unmerged content can be dropped by reading. `managedWorktreeCandidates` is the only
bridge to reuse and it offers a candidate only when `condition==='recoverable'` and the
worktree was physically clean; dirty, owned, uncertain and invalid states map to active or
unclean, so `chooseAgentIsolation` cannot select them.

Finalize claims are first-class crash state. A controller that dies between its exclusive
`.finalize` claim and the ready receipt leaves both files behind. The claim is read and
reported; an orphaned claim keeps the allocation uncertain even when the worktree is clean
and attested, and it is never reclaimed or deleted by age, size or timer. That matches the
H06.3b1 rule that an orphan claim requires explicit inspection.

## Defect found and fixed

The recovery path compared `inspectAgentGit(path).repository` against the recorded source
repository. For a linked worktree `git rev-parse --show-toplevel` returns the worktree
itself, so that comparison is false for every healthy managed worktree: recovery labelled
all of them as belonging to another repository, reported no clean/dirty distinction, and
hid reuse candidates that were physically valid. Ownership is now decided by the exact
managed path plus the recorded common Git directory, the same identity `allocateWorktree`
already attests at creation, and the same defect was corrected in the pre-existing
allocation path so a refused reuse names unmerged content instead of a wrong repository.

## Proof

Targeted: `node --test --test-reporter=spec test/git-snapshot.test.ts` 8/8 PASS, of which
4 are new recovery proofs on real local temporary Git repositories:

- a crashed controller (a real child process, `SIGKILL` after its allocation receipt, exit
  signal asserted) leaves a worktree that `listManagedWorktrees` finds again with
  `phase=ready`, `ownerAlive=false`, `worktree=present`, `clean=false`, `condition=
  recoverable` and the unmerged file intact; the refused re-attribution returns uncertain
  naming unmerged content, and the receipt bytes, worktree count and source status are
  unchanged before and after.
- a crashed controller with a clean worktree is reused: the recovery view offers it to
  `chooseAgentIsolation`, the re-attribution returns ready at the same path, no second worktree
  is created and no receipt is appended twice.
- recovery separates clean from dirty and never drops unmerged content: a snapshot carried
  into a worktree is recovered with `recovered:true`; a worker contribution beyond the
  snapshot turns the next allocation uncertain instead of reconciling it away; dropping the
  attributed snapshot is refused as an attribution change; carried human content and the
  worker contribution both survive every step.
- a finalize claim orphaned by a crash is reported (`finalizeClaim=true`, uncertain, reason
  naming the claim without a ready receipt), blocks reuse even though the worktree is clean,
  and survives the refused re-attribution byte for byte.

Mutations, each reverted after: disabling the orphan-claim branch fails the finalize test;
collapsing the clean/dirty recovery reason fails the crashed-controller test; offering every
state as a clean reusable candidate fails the crashed-controller test. The repository
identity comparison was caught the same way, as three failing tests before the fix.

Sibling targeted suites, unchanged and PASS: `test/managed-worktrees.test.ts`,
`test/agent-git.test.ts`, `test/worktree-integration.test.ts` (18), `test/workspace-runtime.test.ts`
(9). `node_modules/.bin/tsc -p tsconfig.build.json` stays at the inherited 32 diagnostics.
`git diff --check` clean. No network, no paid model call, no full gated suite (six workers
run concurrently).

## Limits and open items

- `.cuesheet-project/graph.json` drift: `src/adapters/managed-worktrees.ts` is a declared
  graph source, so this edit changes its digest and
  `test/state-graph-manifest.test.ts` "the committed manifest is what the generator produces"
  fails until someone runs `npm run graph:regen`. That artifact is outside this slice's
  allowlist, so the drift is reported rather than papered over. It is the first drift since
  the artifact was created (b4a4780).
- The finalize-claim residue is a constructed durable state, not a controller killed inside
  `appendReady`; no timer or age reclaim exists to test. Owner liveness is a pid check, so a
  recycled pid reads as alive and defers to inspection rather than reconciling.
- Recovery reads physical state but is not wired to the coordinator runtime: no automatic
  sweep, no cleanup, no retained artifact for unmerged work, no quota or descendant
  accounting. H06.3b stays open for durable multi-unit reservations, and H06.3c/d for
  integration, terminal view and recoverable cleanup.
- Host races and configuration changes after inspection stay R06; this is not a kernel
  sandbox and does not confine Git. No commit, merge, push or worktree removal is claimed.