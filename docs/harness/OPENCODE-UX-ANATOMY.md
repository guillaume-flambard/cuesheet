# OpenCode UX anatomy, and the bounded steps cuesheet takes from it

Status: OPEN, bounded. Owner asked for the comparison on 2026-10-16, then for a
bounded chantier plus a first step. This file is the plan and the evidence for
that work. It is a chantier for the terminal surface only; it does not reopen
the layout, the product direction or the Ink version.

## Method, and what it cannot say

Read the upstream repository, its documentation, its keybind reference and a
captured screenshot, then compare against cuesheet's own canonical direction
(`MASTER-DESIGN-DIRECTION.source.txt`, `08-TERMINAL-UX.md`) and against
cuesheet's measured behaviour. The two products were **not** run side by side on
the same task, so this compares surfaces, not outcomes: no claim here is a
performance or quality ranking.

Provenance: the upstream facts below were recorded from a read of the upstream
repository and docs during the earlier pass on 2026-10-16 (version 2.0.30,
`anomalyco/opencode`, MIT, branch `dev`). They were not re-verified in this
pass, so they are evidence of what the repository showed, not a live guarantee.
Where a fact drove a decision, the decision is stated so a stale fact can be
re-checked against it rather than re-derived from scratch.

The design master already names the failure mode this comparison must avoid:
"OpenCode with more panels" is listed there as an anti-pattern. Nothing here
proposes panels, a mode selector or a second surface.

## What upstream does, and where cuesheet stands

| Area | Upstream | cuesheet today | Reading |
|---|---|---|---|
| Surface | One flow, one composer, one footer line; tools as a one-line-per-action ledger | One column, one composer, one status line, work rows | Same shape. The rejection of panels is already cuesheet's stated direction. |
| Window title | The current task is the terminal window title | Nothing sets a title | Real gap, cheap to close, no geometry. Step 2, done. |
| Footer | Contextual: the interrupt appears only while a turn runs | One line, but below sixty columns the busy branch dropped the interrupt | Real gap, and the missing hint is exactly the one that matters. Step 1, done. |
| Overlays | About twenty-five designed `dialog-*` states, plus explicit `startup-loading`, `reconnecting`, `retry-provider`, `migration-overlay`, `error-component` states | Overlays exist (work, changes, models, sessions, palette, context, situation, help, inspect) | Overlays are not the gap. What to check next is whether each failure and wait is a designed state or a sentence. Step 3. |
| Input sigils | `@` files, `!` shell, `/` commands | `/` commands and a palette | Not a defect. Recorded so the difference is a decision, not an oversight. |
| Keybinds | About a hundred and fifty, configurable in `tui.json`, including `home`/`end`, `shift+home`/`shift+end`, word selection, undo/redo | Home/End, Ctrl+arrow, Ctrl+Backspace, Shift+arrow selection now reach the composer | The reachable set was just widened. Ink 4 cannot carry shift+home or ctrl+shift+arrow; that is an engine limit, not a missing handler. |
| Engine | TypeScript on `@opentui/core` with Solid | Ink 4 with React 18 | **Owner-only decision.** Do not migrate, and do not move the installed runtime, on the strength of a UX comparison. |
| Notifications | Desktop notification when the terminal is blurred | In-app counts and a notifications page; no OS transport | Out of scope here: an OS notification is an external side effect and needs its own decision. |
| Terminal respect | Mouse, cursor style and blinking, a configurable diff style | Mouse wheel is handled in the transform | Partly present. Not scheduled; record only. |

## The bounded chantier

Three steps, in order, none of them touching the geometry of the surface.

### Step 1, done: the interrupt survives a narrow terminal

Below sixty columns the status line showed only the shortcuts, so a running turn
at forty columns had no visible way to stop. The line is now one pure function,
`statusHints`, with the interrupt first and the rest dropped when there is no
room. `StatusBar.tsx` renders it.

- Acceptance: while a turn runs, `Ctrl+C stop` appears at every width.
- Evidence: `test/status-hints.test.ts` (every width, busy and idle, overlay and
  targeted), `test/surface-quality.test.ts` "a running turn stays stoppable from
  the narrowest supported size" (40x14, real render).

### Step 2, done: the window title names the work

The title is built by a pure function, `windowTitle`, from the live intent, then
the project, then the product name, and it is written as an OSC 0 sequence by
`useTerminalTitle` in `App.tsx`. Only a real terminal receives the sequence.

- Acceptance: the title names the current work on a TTY; a pipe or a file
  receives no control bytes; task text cannot smuggle a BEL or an ESC into the
  sequence.
- Evidence: `test/window-title.test.ts` (task, fallback, truncation, injection),
  `test/window-title-ui.test.ts` (real render on a TTY and on a pipe).
- Known limit: the title is not handed back on exit. The write happens during
  Ink's teardown, where it is dropped, so that path was removed rather than left
  unverified. Most shells set their own title in the prompt.

### Step 3, next: state coverage

For every wait and every failure the surface shows a designed state, not a
sentence. The scope is the states already visible today: a provider that is
retrying, a tool that failed, a run that was stopped, an empty project, a
missing key. One state per pass, each with a test.

- Acceptance: a named state renders its own rows and its own one-line footer,
  and does not reuse the generic status sentence.
- Verification: the existing UI render tests, plus one new render per state.
- Not in scope: OS notifications, sounds, desktop delivery.

## What this chantier does not authorise

- No change to the surface geometry, the column rule or the master sizes.
- No Ink or React upgrade, no engine change, no move of the installed runtime.
- No new dependency for any of the three steps; both delivered steps are pure
  functions plus one Ink hook.
- Nothing here is a commercial, launch or phase decision.

## Why the tree moved, honestly

Step 1 and step 2 sit on top of the keyboard work of the same day. That work
also introduced, and this chantier then found and fixed, a regression: the
cell-width base was changed from zero to one, so every wrapped line folded at
half its width and two UI tests failed. It is fixed in `a464fc3`, verified by
differential run against the parent commit `3a0bde1` in a separate worktree. The
six UI failures that remain are exactly the six that fail at `3a0bde1`.
