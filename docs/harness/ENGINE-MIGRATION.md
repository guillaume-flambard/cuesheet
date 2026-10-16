# Engine migration: cuesheet's terminal moves to Ink 8 and React 19

Status: IN PROGRESS, bounded. Owner directive of 2026-10-16, verbatim:
"moteur faut migrer car la je ne sais pas ce qu'est ink mais c'est nul". The
migration is ordered. The target is an execution-level choice, taken here with
evidence and recorded so it is not re-derived.

This file is the plan and the evidence for the engine work. It closes the line
in `OPENCODE-UX-ANATOMY.md` that read "do not migrate", which was written before
the owner's directive and is superseded by it.

Companion entries in `docs/harness/state.json`: `H08.6`, `REQ-H08.6`,
`AC-H08.6`, `EV-H08.6-TYPES`, `EV-H08.6-BATCH`.

## Decision, and the alternative that was rejected

Chosen: **Ink 8 plus React 19**, the same architecture as today, one engine
generation up.

Rejected for now: **`@opentui/core`**, the engine opencode itself uses. It is
version 0.6.6, a pre-1.0 surface whose peer is `web-tree-sitter 0.25.10`, and it
renders through `solid-js 1.9.17`. Adopting it means rewriting every component,
discarding the whole UI evidence base and taking a 0.x dependency. That is a
rewrite, not a migration, and the owner asked for the engine to stop being a
mystery, not for a second product. Recorded so the alternative has a cost, not
an aura.

## What was measured, before any conclusion

Sources read: the release bodies of Ink 8.0.0 (published 2026-10-03) and of
7.0.0, 6.0.0 and 5.0.0; the installed packages; and cuesheet itself.

| Fact | Value |
|---|---|
| Ink 8 peers | `react >=19.3.0`, `engines.node >=22` |
| This machine | node v24.21.0, so the engine floor is satisfied |
| Installed in the worktree | `ink 8.0.0`, `react 19.3.1`, `@types/react 19.3.0` |
| Ink 8 breaking changes that touch cuesheet | global `JSX` namespace gone with React 19; `stdin`/`stdout`/`stderr` are plain Node streams, not TTYs; `useInput` no longer receives unrecognized control sequences; `minWidth`/`maxWidth` numbers only (cuesheet has no percentage strings) |
| Ink 8 additions | `contentOffsetX`/`contentOffsetY` and `clientWidth`/`clientHeight` on `<Box>` |

Typecheck in the worktree went from **42 errors to 0**, in three classes:

1. `TS2503 Cannot find namespace 'JSX'`, 24 times in 19 files. React 19 removed
   the global namespace. Each file now imports the type:
   `import type { JSX } from "react";`. Verified first with a two form probe,
   both `react` and `react/jsx-runtime` compile.
2. `stdout.columns` and `stdout.rows` in `App.tsx`, 2 errors. Ink 8 does not
   type the streams as TTYs. The size now comes from `useWindowSize()`, which
   reads the size before the first paint and re-renders on `resize`, so the
   manual listener it replaces is gone.
3. `findLast` and `findLastIndex`, 16 errors, plus implicit `any`. **Not caused
   by the migration.** The terminal `tsconfig.json` declares
   `"lib": ["ES2022"]`, which does not contain those methods, yet the main
   checkout typechecked clean. The reason is that `type-fest@0.12.0`, a
   transitive dependency of Ink 4, carries `/// <reference lib="esnext" />`, and
   a triple-slash reference in an included `.d.ts` raises the effective lib for
   the whole program. Ink 8 drops that dependency, the floor disappears, and the
   latent errors surface. The config was never truthful about what the code
   uses; it now says `"lib": ["ES2023"]`, which Node 24 satisfies.

## The defect the migration actually exposed

The render suite in the worktree: **18 files, 59 tests, 52 pass**. The 7
failures are the 3 known palette tests (`notification-ui`, `situation-ui`,
`workspace-ui`), the 3 row-budget failures already failing at the parent commit,
and one PTY test (below). No new failure.

Among the two tests that first appeared new, one was a measurement artifact and
one was real.

Artifact: "a running turn stays stoppable from the narrowest supported size"
captured only the last chunk of the output stream. Ink 8 clears and repaints on
a resize, so that chunk is an erase, not a frame. The layout itself was verified
directly: at 40x14 in the busy state the frame does contain
`Ctrl+C stop · Ctrl+K commands`, the identity and the footer, inside 13 rows.
The test now mounts at 40x14 and reads the last frame that painted the shell, so
it tests the guarantee instead of the engine's chunking.

Real, and the kind of defect this migration exists to surface: Ink 8 can deliver
several keys of one packet **inside a single React batch**. The composer's ref is
re-synced from `props.value` only during render, so a keystroke arriving right
after Return was appended to the text that had just been submitted. Replayed
directly:

```text
before  sent = [..., "BURST_ONE", "BURST_ONEBURST_TWO"]
after   sent = [..., "BURST_ONE", "BURST_TWO"]
```

Fixed in `Composer.tsx` by clearing the ref on submit. A second correction was
required and was found by `product-experience-ui`: with the cursor reset to 0,
an externally restored draft (a refused submission) left the cursor at the
start, so the next character landed in front of the text
(`!Preserve files` instead of `Preserve files!`). The re-sync now places the
cursor at the end when the store fills a field that was empty, and only clamps
it otherwise. Both corrections were attributed by re-running the file with the
previous commit's `Composer.tsx`: it passed, so the regression was the fix, and
the fix was completed rather than reverted.

## What the engine now gives for free

Measured with a direct probe of Ink 8, no transform in the path:

| Sequence | Ink 8 |
|---|---|
| `ESC CR` (Alt+Enter) | meta+return |
| `ESC DEL` / `ESC BS` | meta+backspace |
| `ESC O H` | home, the SS3 form |
| `ESC O F` | end |
| `ESC [1;3D` | meta+left |
| `ESC [1;5C` | ctrl+right |
| `ESC [1;2H` | shift+home |
| `ESC [13;2u` | return+shift, Kitty |
| `ESC [3~` | delete |
| `DEL` | backspace |

Every one of these is hand-reconstructed today in
`apps/terminal/src/terminal-input.ts`, which also carries the mouse wheel and
bracketed paste handling. The engine now provides the keyboard layer natively,
plus `super` modifiers, `eventType` and the Kitty protocol detection that were
unreachable on Ink 4. That is the payoff: the custom layer can be deleted, and
the reachable key set grows instead of shrinking.

The transform is not removed yet. It is a `Transform` in front of Ink's stdin,
it still converts every sequence into bytes Ink 8 understands, and the tests
above pass with it in place. Removing it is a step with its own test per key,
not a side effect of the version bump.

## Open items, in the order they should be taken

1. **PTY: Ctrl+C cancels the model and the same terminal accepts another
   request.** `test/terminal-ux.test.ts`. On Ink 8 it fails, and it fails with
   the previous commit's `Composer.tsx` as well, so it is an engine behaviour
   change and not the batched-keys fix. The interruption itself works
   ("Interrompu" is rendered); the second request never gets its answer. This is
   the one real regression, and it is exactly the interrupt path this chantier
   cares about. Reproduce with a dedicated PTY probe before changing anything.
2. **Decide the fate of `terminal-input.ts`.** Keep it as a compatibility layer,
   or delete it and let Ink 8 parse, key by key, with one test per key. Measured
   evidence says deletion is reachable; it is not free.
3. **The 3 row-budget failures** in `surface-quality.test.ts` are pre-existing,
   not caused here. `contentOffsetY` and `clientHeight` are new in Ink 8 and are
   a plausible way to finally fix them. Opportunity, not obligation.
4. **The other 130 test files** were not run: none of them renders the surface,
   so the engine cannot affect them, but "cannot" is an argument and not a
   measurement. Run them once before any claim that the migration is complete.
5. The worktree is `workspace/worktrees/cuesheet/ink8`, branch
   `chore/ink8-react19-20261016`, first commit `8670c38` on top of `6efd331`.
   Nothing is pushed and the installed runtime is untouched so far.

## Method, and what it cannot say

Measured local evidence beats documentation: the release notes were read, then
every claim was re-checked against the installed packages and against cuesheet
itself. Two of the three typecheck classes were predicted by the notes; the
ES2023 floor and the batched keys were not, and both were found by measuring.

What this cannot say: nothing here claims the migration is complete, that the
surface is faster, or that Ink 8 is better than Ink 4 in the general case. It
says the typecheck is clean, the render suite is at baseline with one open PTY
item, and the keyboard layer the engine now provides is real.

## What this chantier does not authorise

- No change to the surface geometry, the column rule or the master sizes.
- No move of the installed runtime without the owner saying so.
- No commercial, launch or phase decision.
- No replacement of the architecture: same components, same layout, one engine
  generation up.
