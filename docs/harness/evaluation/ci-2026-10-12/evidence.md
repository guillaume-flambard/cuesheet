# CI stabilization evidence — 12 October 2026

Status: candidate patch in PR #7 (not merged). Current source branch: fix/ci-pnpm-build-20261012. This is an observed record, not a promise that main is green.

## Initial failure
GitHub Actions #38274444853 on Ubuntu: 1,037 tests; 1,008 passed, 6 failed, 23 skipped. Defects were cascading:
- scripts/build.sh ran npm install --no-save for TypeScript inside a pnpm-managed workspace and hit npm Arborist "isDescendantOf" null error.
- install oracle and typecheck guard failed because their compiler/build prerequisite could not finish.
- test/surface-quality.test.ts sometimes asserted on an empty transport frame instead of a painted UI snapshot.

Mac pre-fix full suite also returned non-zero (16 failures reported by the initial run); this was not a clean baseline.

## Minimal source patch
- scripts/build.sh resolves the workspace-pinned TypeScript binary without mutating a pnpm-managed installation; absence is a refusal with a concrete install instruction.
- tsconfig.build.json reads Node typings from the declared apps/terminal workspace instead of relying on an accidental root-level npm install.
- test/typecheck-guard.test.ts uses the same pinned compiler and captures its diagnostics to its own file, preserving the differential guard rather than ignoring errors.
- test/surface-quality.test.ts requires a meaningful settled frame at BOTH 40x18 and 30x14; initial ANSI/control chunks do not count.
- test/shared-context-ui.test.ts waits for a new observed frame after each keypress/resize, instead of treating an arbitrary latest chunk as UI state.

No production logic was intentionally modified beyond compiler resolution; tests retain the assertions for evidence, layout, navigation, and lack of writes.

## Repro and results

Mac isolated worktree:
- pnpm install --frozen-lockfile: passed.
- bash scripts/build.sh: passed, terminal bundled, dispatch manifest checked.
- node --test test/install.test.ts test/typecheck-guard.test.ts: install/pack/PTY and typecheck checks passed after compiler/typeRoots fix.
- node --test test/surface-quality.test.ts: passed after settling-frame assertion.
- node --test test/shared-context-ui.test.ts: passed after frame-observation wait.
- One full Mac suite before the last test-race fixes: 1,037 total; 1,017 passed, 1 failed, 19 skipped. Remaining failure was test/surface-keys.test.ts, "PTY: declared owner check closes real surface work with independent evidence" (expect exit 8). It needs a separate environment/capability diagnosis; **do not claim Mac green**.

Ubuntu GitHub Actions at commit 07eb153:
- run https://github.com/memolabs-dev/cuesheet/actions/runs/38278572223
- 1,037 tests; **1,014 passed, 0 failed, 23 skipped**, conclusion success.
- Earlier intermediate runs each had one UI race, with different tests; the final run passed after asserting painted frames.

## Bot and governance observations
- The GitHub account drop-agent-bot (not the personal account) authenticated, pushed to fix/ci-pnpm-build-20261012 and authored the draft PR https://github.com/memolabs-dev/cuesheet/pull/7.
- The identity had repository write access but not admin; main requires 1 review and disallows force pushes.
- CI is not yet a required check on main because the fix remains unmerged; obtain human review, merge, then require the green CI check.
- Do not rename bot handle while open PRs/dependencies are not inventoried. Target-neutral name under consideration: memolabs-agent.

## Unproven and next tests
1. Mac PTY failing scenario must be diagnosed, not skipped. Compare environment, shell-tool admission, Node version and the independent owner check.
2. Prove repeated Ubuntu CI, not just a single green run, and track flaky UI behavior over subsequent PRs.
3. After human review/merge, enforce the new CI as a required check, confirm bot can answer review comments, then test a follow-up bot update without elevated rights.
4. Maintain distinction between PROVIDER LIVE and fixture-only tests, and between PACKAGED/INSTALLABLE/PUBLISHABLE.

Related: docs/harness/IMPLEMENTATION-GATES-2026-10.md (PR #5), issue #6, tracking issue #8.
