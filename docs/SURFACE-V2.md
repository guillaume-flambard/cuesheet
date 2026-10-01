# Human Surface V2

Written before the change, so the next agent can tell what was decided and why
rather than reading the diff and guessing.

## WHY

HUMAN SURFACE V1 shipped at `ee625f3`. Its own commit message called the
single-prompt slice "the wiring and not the product", and the code said the rest:

```text
apps/terminal/src/app/state.ts:125
  // The surface has no model yet, so it cannot promise work it has not started.
```

That admission was correct and it is now false. The surface runs a model, so it
can promise work, and the promise has to be kept by running the real loop.

Three structural defects, none of them visual:

1. **No producer.** `runAgentLoop` (`src/core/loop.ts:141`) had exactly one
   caller, `src/chat.ts:197`, behind the demoted `cuesheet chat`. The surface
   could not act, so it did not act.
2. **No context resolution.** `bindProject` (`src/adapters/project-binding.ts`)
   and `snapshotPortfolio` (`src/adapters/frontier.ts`) existed and were exactly
   what automatic context needs. They were imported only by `render.ts`, which
   `App.tsx` and `main.tsx` do not import. A project had to be named by hand.
3. **A router that could not be right.** `readTurn` (`apps/terminal/src/turn.ts`)
   matched five hardcoded French phrase lists by exact string equality, and every
   sentence fell through to `PROJECT_CANDIDATE`. OBS-7 in
   `docs/SURFACE-DOGFOOD.md` records the result: `a toi de me dire` produced
   `I don't know that one.` A closed list makes failure rarer without making it
   different.

The three `Entry` variants `action`, `status` and `failure`
(`apps/terminal/src/app/state.ts:31-35`) were declared and rendered but never
constructed, because there was nothing to construct them from.

## THE REACHABILITY CHECK, before anything was removed

```text
$ grep -rn 'apps/terminal/src' src test apps scripts docs *.md *.json
src/surface-cli.ts:5:      (a comment naming render.ts)
test/human-surface.test.ts:28: import { render, resolve } from "../apps/terminal/src/render.ts";
```

- `slice.tsx` is imported by **nothing**. Not `main.tsx`, not `App.tsx`, not a
  test. Unreachable.
- `render.ts` is imported by **one** file: `test/human-surface.test.ts`, the
  test written for it. No product path reaches it.
- `turn.ts` is imported by `render.ts` and `app/state.ts`, and by no other.

So the V1 slice is a dead subtree kept alive only by its own test. The owner
ruled V1 patching stopped, so it is removed. The OBS-1/2/3 lessons it encoded are
not lost with it: they are re-asserted against the V2 producer in
`test/surface-v2.test.ts`, where they hold structurally rather than by a phrase
list.

## THE DESIGN

### The firewall, and which side each file is on

```text
apps/terminal/src/producer/translate.ts   PURE   core Event -> surface Entry
apps/terminal/src/producer/context.ts     impure env -> Context
apps/terminal/src/producer/index.ts       impure owns the store, runs the loop
apps/terminal/src/producer/runtime.ts     impure real adapters
apps/terminal/src/app/state.ts            PURE   derive(state, control)
apps/terminal/src/app/store.ts            PURE   useSyncExternalStore adapter
apps/terminal/src/components/*            PURE   receive props, emit controls
```

`translate.ts` is the only place core vocabulary becomes surface vocabulary. It
is pure and takes its pending-tool map as a parameter, so it is assertable
without a terminal and without a model.

`app/state.ts` stays pure, and the surface law gets *stronger* under V2: it now
imports nothing at all, not even the core event type. The raw event log lives in
the producer, which hands the Inspect overlay pre-rendered lines. The mechanics
have exactly one home.

### Prompt-first: the router is deleted

`turn.ts` is removed. Every sentence is submitted verbatim. Nothing matches
against a list, because a list over French cannot be right and pretending
otherwise is what OBS-7 recorded.

### Automatic context: binding is advisory, never a gate

`resolveContext` in `producer/context.ts`, in order:

1. The current working directory is inside a portfolio project. That is the
   scope. No question is asked.
2. Otherwise `bindProject(said, identities)`:
   - `bound` -> that project.
   - `unbound` with more than one candidate -> **a choice**, in the timeline.
3. Otherwise **the working directory stands as the scope and the run happens.**

Rule 3 is the whole point. BIND-01 in `src/adapters/project-binding.ts` says an
actionable intention stays an intention when its project is unknown, and OBS-3
says a clarification never constrains the shape of the answer. So a sentence
that names no known project is not a dead end and never becomes the words
"name a project". It runs, in the directory the person is standing in.

### Visible work: five verbs, translated once

`translate.ts` maps a `ToolRequest` to one of `read`, `inspect`, `edit`, `test`,
`verify`, and an observation settles the certainty of the action it belongs to.

Internal log lines never become entries. Tool `output` is never rendered as a
timeline line; it is only ever used to decide `confirmed` or `failed`. The one
exception is deliberate and documented at the function: on failure the first
line of output becomes the `failure` text, because a person who cannot see why a
command failed cannot act, and that is a fact about the world rather than a log
line about the harness.

### Live streaming: the store leaves React

`onEvent` fires from a promise continuation outside React, so state cannot live
in a `useState` reducer. `producer/store.ts` exposes `getSnapshot`/`subscribe`
and `App.tsx` reads it through `useSyncExternalStore`. The producer is the only
writer. No force-update hack, no non-React re-render.

## ACCEPTANCE

1. `npm test` green, plus new tests that drive a fake `ModelAdapter` and a fake
   `ToolRunner` through the producer and assert the resulting `Entry` rows came
   from real tool observations.
2. A free-form sentence naming no project resolves to a scope or produces a
   choice. `name a project`, `not a goal` and `go?` appear nowhere.
3. `cd apps/terminal && ./node_modules/.bin/tsc --noEmit` introduces **zero new**
   errors against the baseline of exactly one, `src/core/memory.ts(234,5)
   TS2322`, which is in a frozen core file and stays.
4. `apps/terminal/src/app/state.ts` observes nothing: no `execFileSync`,
   `spawnSync`, `readFileSync`, `existsSync`, `readdirSync`,
   `snapshotPortfolio`, `Date.now(`, `Math.random(`, and no `from "node:"`.
   This is asserted, as VIEW-01 is for `src/state.ts`.
5. Nothing under `src/core/**` is modified. PORT-01 keeps passing.

### The type-check delta, measured

The baseline was exactly one error. It is now four, and **none of the four is in
a file this change wrote.** The extra three are pre-existing defects in frozen
files that V1 never type-checked, because nothing in `apps/terminal` imported
them:

```text
src/adapters/shell.ts(52,5)  TS2322   pre-existing, hidden: the surface never imported the runner
src/core/loop.ts(132,15)      TS2339   pre-existing, hidden: the surface never imported the loop
src/core/memory.ts(234,5)     TS2322   the known baseline failure
src/core/store.ts(268,22)     TS2698   pre-existing, hidden: the surface never imported the store
```

This was measured, not assumed. A scratch probe importing exactly those three
files and nothing else reproduced all three against otherwise-unmodified V1 code,
so the errors belong to the files and not to the wiring.

**Wiring the loop is what made them visible, and it is not legitimate to call
that "zero new errors."** The honest statement is the one `test/surface-v2.test.ts`
now asserts: zero errors in `apps/terminal/src/**`, and a named, frozen set of
four inherited ones. The names are the gate rather than a count, so a fifth
inherited error fails by path.

None of the four is fixed here, because three of them are in `src/core/**`, which
this owner constraint freezes, and the fourth is in the runner the producer has
to use. Fixing them belongs to whoever owns those files.

### What was observed, and what was not

Observed, in a real pty, driving the real launcher:

```text
  cuesheet              no project            ✓ ready
  no model
  ─────────────────────────────────────────────────────────────────
   ×
  OPENROUTER_API_KEY is not set, so Cuesheet has no model to think with.
  Everything else works: the surface runs, the portfolio resolves,
  nothing can be attempted.
  ─────────────────────────────────────────────────────────────────
  › no model to answer with          ⌘K
  0 read                                ? for help
```

Observed, headless, through the real producer with the real `ShellToolRunner` and
a scripted model: four tool calls produced four settled micro-events, a
`path outside the working directory` refusal, and an honest "still open after 8
steps" from a model that had said "Done." The refusal and the budget line were
both found by running it, not by reasoning about it.

An ambiguity was observed against the real registry: `travaille sur kollio` from
`$HOME` offered `kollio-mac` and `kollio-web`, started nothing, and ran the
original sentence once `kollio-web` was chosen.

**Not observed: a run against a live model.** The real provider answered
`402 insufficient credits`, so the streaming path was exercised with a scripted
model rather than with a real one. The `onEvent` machinery, the store, the
translation and the tool runner are all covered; what a live provider adds is
only latency and token shape. That gap is real and is stated here rather than
implied away.

## NON-GOALS

- No change to the core, the loop, the store, affordances or effects.
- No new dependency. Ink and React are what there is.
- No palette of commands beyond the three overlays that exist.
- No `cuesheet inspect` TUI. The Inspect overlay reads the session's own log;
  building a second machine view is the work this document refuses.
- No `slice.tsx` resurrection under another name.

## STOP

Stop when the four acceptance items hold. The next thing after this is a person
using it for a day, and the evidence for that is a person, not a test.