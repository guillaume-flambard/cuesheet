# EV-NOTIFICATIONS-PARENT: 2026-10-02

Base `c4af46d`, one commit behind `main` at `f6493f5`. That commit changes only
`src/adapters/state-graph/manifest.ts` (symlink containment in another worker's system),
`test/state-graph-manifest.test.ts` and its evidence file, so it cannot change this packet's
files or the `tsc` baseline; the branch was not fast forwarded because the packet forbids
`git merge` and the projects contract forbids moving a branch pointer without an explicit
request.

Extends [EV-NOTIFICATIONS](../notifications/evidence.md) (H08.3n1a live centre, durable read,
badge, no external call) rather than repeating it. This packet implements the parent H08.3n
projection rules inside the allowlist, `src/adapters/notifications.ts` and
`test/notifications.test.ts`. `docs/harness/NOTIFICATIONS.md` read in full first;
AC-H08.3 and REQ-H08.3 stay PENDING in state.json because `docs/harness/**` is not editable
from this packet.

## Rules implemented

Source. Every `WorkNotification` carries `source` {seq, subject, execution}, the journal event
that proves the fact, beside the `sourceSeq` the producer line and the read marks already use.
The two agree by construction, `sourceSeq` is written from `source.seq` on every insert and on
every correction.

Refusal. An event the journal cannot anchor (no positive integer sequence) or that names no
execution (empty or blank identity) carries no source, so it notifies nothing and its read
marks are ignored. No source, no notification.

Deduplication. The execution is the fact key: one final execution is one fact. A repeat of the
same outcome for that execution collapses into the notification it already produced, keeps the
first recording's `sourceSeq`, so it does not re-surface and does not undo a read mark; a fresh
projection over the same journal yields the same single item, so replay is not a second ping. A
changed outcome for the same execution updates that one notification in place instead of adding
a second, and advances its source so the correction is read again. The correction also takes the
newest slot, so the 50 bound discards it last rather than first. A new execution is a new cause
with its own notification. The 50 bound, the incremental cursor and the replay reset are
unchanged.

Sober. Only the final outcomes in `labels` notify (goal-closed, blocked, failed, limit,
stagnation). Running, continuing and cancelled, tool success, observations, model prose and user
notes produce nothing. No filesystem, no network, no model call, no external dispatch. Owner read
marks still require `author=human` and a `throughSeq` bound to a displayed source.

## Proof

`rtk node --test --test-reporter=spec test/notifications.test.ts` = 9 tests, 9 pass, 0 fail. The
3 H08.3n1a tests are unmodified and still green: none of them ever records two different finals
for one execution, which is the only behaviour this packet changes in their path.

6 new tests cover the required properties and the correction case:

- a notification carries a source reference that resolves back to the journal event (deep
  equality on {seq, subject, execution}, `sourceSeq` equal to `source.seq`, the event at that
  sequence found again in the journal);
- two events describing the same fact yield one notification, live and on fresh replay, and the
  repeat does not undo a read mark already given;
- a notification with no source is refused (an anchorless event alone notifies nothing; a blank
  execution identity is refused while a valid control in the same feed still notifies);
- a low signal feed (running, continuing, cancelled, tool action, model text, observation, user
  note) yields zero items and zero unread, and a later real final cause for the same execution
  still notifies;
- a corrected outcome updates the single notification in place (phase, title, sourceSeq) and
  re-surfaces it unread;
- a correction takes the newest slot, survives the next eviction, and the bound still holds at 50.

Differential guard, so the tests are not tautological. With `src/adapters/notifications.ts`
replaced by the base `c4af46d` version, the source reference, no source refusal and correction
tests fail (5 pass, 3 fail). With only the newest slot line reverted to the base form, exactly
the newest slot test fails (8 pass, 1 fail). The deduplication and low signal tests pass at base
on purpose: they pin rules that already held and must not regress.

`rtk node_modules/.bin/tsc -p tsconfig.build.json 2>&1 | grep -c "error TS"` = 32, the inherited
baseline, none of the 32 in `notifications.ts` (frontier 7, frontier-cli 5, shell 5, cli-run 4,
openrouter 3, cli 2, store, memory, intent, chat, affordances, opencode 1 each).
Consumer check `rtk node_modules/.bin/tsc --noEmit -p apps/terminal/tsconfig.json` reports only
the 3 inherited diagnostics (`src/adapters/shell.ts`, `src/core/memory.ts`,
`src/core/store.ts`), none in `notifications.ts` nor in the producer. The palette still renders
`Exécution : <id> · source #<seq>` from `sourceSeq`. `rtk node --test test/notification-ui.test.ts`
= 1 pass, so the live centre, refresh, scroll and resize still work against the new item shape.
`git diff --check` clean.

Not run, per the packet constraint that six workers share this repo: the full gated suite, and
`test/install.test.ts` with it. That file imports the built `notifications.js` and asserts
`i.phase === 'goal-closed'`; a valid journal carries positive sequences and non-empty execution
ids, and goal-closed stays in `labels`, so by inspection it still passes. Not re-measured, and
not a claim: the full suite result.

## Limits

Parent H08.3n stays open in state.json, which this packet may not edit. Still specification, not
code: the optional local channel (H08.3n4), the question and permission notification routes,
aggregation of common agent causes, and the silent or manual level modes. The centre and badge
remain the only channels, exactly as in H08.3n1a.

A valid journal cannot hold two different finals for one execution
(`projectExecutions` refuses it), so the correction path is a defence against a foreign or
partial feed rather than a path this repo's own terminal producer walks today. The 50 bound
still forgets an execution once evicted, so a duplicate recording of an evicted execution would
notify again; unbounded memory was not worth that risk.

The digest changes because items gained `source`. A consumer that pinned an old digest across an
upgrade gets one stale acknowledgement refusal and recovers on refresh, which the producer
already does. No cryptographic provenance is claimed: the source is the journal reference, and a
journal that lies about a final state is not detected here.

## Manual

Same as EV-NOTIFICATIONS: open the notification palette, confirm each line still shows
`Exécution : <id> · source #<seq>`, M marks the current view read, Escape keeps the draft, and
ongoing tool calls produce no notification.