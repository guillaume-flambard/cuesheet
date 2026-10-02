# UI-01 EXACTLY ONCE - 2026-10-02

Base 2d7261b, branch ui-exactly-once. One assistant reply was seen rendered three
times in a live terminal.

## The diagnosis, checked against the code

All four points of the reported cause confirmed.

1. `apps/terminal/src/app/state.ts` declared `Entry` as a five variant union with
   no identity field: `{kind:"you",text}`, `{kind:"cuesheet",text}`,
   `{kind:"action",...}`, `{kind:"status",...}`, `{kind:"failure",text}`. Confirmed.
2. `derive` handled `case "observed"` as `append(state.entries, control.entries)`
   with no deduplication of any kind, and there was no field by which two
   entries could have been compared at all. Confirmed.
3. `apps/terminal/src/producer/translate.ts:194` built the assistant entry as
   `{entry:{kind:"cuesheet",text}}` from the event's text. `Event.seq` is right
   there in the first parameter and was read by nobody on this side. The header
   comment claimed the file "does not gain the ability to read a seq number",
   which was true of components and was also the reason the one durable fact
   available at the projection boundary never reached the surface. Confirmed.
4. `apps/terminal/src/components/Timeline.tsx:44` rendered
   `entries.map((e,i) => <Line key={i} entry={e} />)`. Confirmed.

## The identity

`Entry` split into `EntryBody` (the five variants, unchanged) and
`Entry = EntryBody & { readonly id: EntryId }`.

Lines built from a core event are named `e:<session>:<seq>` by
`translate.ts:entryId`, from `Event.seq`, which `src/core/store.ts:25` documents
as monotonic within a session and stable forever. The session is in the name
because a sequence is only unique inside one, so a resumed session cannot mistake
its own sequence for another's.

Text hashing was rejected on the evidence in `test/ui-exactly-once.test.ts`: a run
that spends its whole eight step budget on a model that answers "ok" every time
records eight distinct events and the person read eight answers. A name derived
from the words could not tell those eight from one reply delivered eight times,
so it would have to keep one and would then be wrong about eight of the answers.
The test asserts both directions: same words from two events is two lines, one
event delivered twice is one line.

Four controls have the surface author its own lines rather than receive them:
`submit`, `scoped`, `offered`, `choose`, and a new `noted` used by the component
layer and by notices that have no event behind them. Those are named `s:<count>`
from `SurfaceState.minted`, a count the surface carries forward. It has to be
carried in state rather than kept in the producer: a producer count restarts at
nothing on resume and its first name collides with the one the previous process
already used. That collision was observed and fixed during this work, and it is
why the producer's notices go through `noted` rather than minting names of
their own.

`settled` keeps the identity of the row it settles. An action row is one line
told twice over, and a settled form that took a new name would make the renderer
drop the row and draw a stranger in its place.

`SurfaceState.seen` holds every name the surface has ever put on screen,
including names the 400 line cap has scrolled off. Reading the window instead
would let a line re-enter once it had left, so the invariant would weaken with
length of session.

## Deduplication and the key

`derive` drops an `observed` entry whose name is already held, first occurrence
wins, and returns `state` unchanged when a delivery added nothing so a repeated
delivery does not repaint. It stays a pure function of its two arguments: the set
is rebuilt rather than added to, and nothing in `app/state.ts` observes anything.
`Timeline` keys on `entry.id`.

`derive` never deduplicates on content, and never did.

## Non-vacuity

The two behavioural mechanisms were reverted in place (deduplication off, key back
to the index), keeping the plumbing so failures are assertion failures rather
than compile errors. `test/ui-exactly-once.test.ts`: 12 tests, 4 pass, 8 fail.

| case | reverted failure | restored |
|---|---|---|
| duplicated provider event | `one reply, one rendering` actual 3, expected 1 | pass |
| projection replay | actual 2, expected 1 | pass |
| interrupted then resumed | `one reply across the interruption` actual 2, expected 1 | pass |
| model failover | actual 2, expected 1 | pass |
| remount | actual 3, expected 1 | pass |
| the timeline key | `by the name the producer carried` actual `'i'`, expected `'entry.id'` | pass |
| identical text, two events | `one event delivered twice is one line` actual 2, expected 1 | pass |
| rendered terminal, both mounts | `one reply on screen` actual 3, expected 1 | pass |

Four tests pass under the revert by design. They are the guards against deleting
too much: a check the run performed twice stays twice, the same sentence sent
twice stays twice, a settled row keeps its name, and eight identical answers stay
eight lines. A surface that deduplicated on content would fail all four.

## Not claimed

The upstream triple is not explained. No in process path was found that hands the
same event to `onEvent` twice: `src/core/loop.ts:152` funnels every append
through one call site, `WriteThroughStore.append` appends once and fails closed
on a sequence mismatch, and `binary-model.ts` has no provider fallback, it
refuses and records `No fallback was selected`. The fix is placed at the surface
because the surface is the only place that can recognise a repeat regardless of
which upstream path produced it. Where the third rendering came from is open.

A model switch mid run is recorded by `producer/index.ts:563` as no text at all,
so the abandoned step contributes no line to replay. The failover case therefore
needs a redelivery to be non vacuous, and the test states the redelivery
explicitly rather than implying the switch produced it.

`TerminalSession.viewEvents` is a constructor snapshot, so a reconnect within one
process rebuilds nothing. The failover case closes the session and reopens it
from disk, which is the real restart path.

## Verification

12 new tests pass. `test/surface-v2.test.ts` 33 pass. `test/terminal-sessions.test.ts`
8 pass. Every test file importing `apps/terminal`: 295 tests, 288 pass, 0 fail, 7
pre existing skips. Plus the new file: 307 tests, 300 pass, 0 fail, 7 skipped.
Core adjacent files rechecked separately: `state`, `projections`, `work-state`,
`effect-cycle`, `affordances`, `tool-receipts`, `shared-context`, `loop`,
`execution-slices`: 92 tests, 92 pass.

`npx tsc -p apps/terminal/tsconfig.json --noEmit` stays at 3, all inherited and
all outside the surface: `src/adapters/shell.ts(58,5)` TS2322,
`src/core/memory.ts(234,5)` TS2322, `src/core/store.ts(268,22)` TS2698.
`node_modules/.bin/tsc -p tsconfig.build.json` stays at 32. Widening `Entry`
surfaced four errors in `App.tsx`, all three of the same shape, and all four were
closed by giving the component layer the `noted` control instead of letting it
author an identity.

No file under `src/core/**` was touched. No existing file under `docs/harness/**`,
no `docs/harness/state.json`, no `.cuesheet-project/**` and no
`docs/SURFACE-DOGFOOD-2.md` was read into or edited. No push, no merge, no
clean, reset, stash or rebase.

## Words a person reads

Unchanged. Every line that was on screen before is on screen now, in the same
order, with the same text. No runtime status line was removed and nothing was
added.

## Still open

The upstream delivery that produced the third rendering is unidentified. This
work makes the surface incapable of showing one reply twice however it is
delivered; it does not say which delivery happened.